import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { OperationsPortal } from './components/OperationsPortal.tsx';
import { auth, db, firebaseConfigStatus } from './lib/firebase.ts';
import {
  calculateLocalEstimate,
  checkUserIsAdmin,
  createCustomerBooking,
  createCustomerQuote,
  DEFAULT_VEHICLES,
  deleteVehicleFromFirestore,
  saveVehicleToFirestore,
  seedInitialCatalogForAdmin,
  subscribeToVehicles,
  trackShipmentByCode,
} from './lib/logisticsDb.ts';
import type { QuoteEstimate, Shipment, Vehicle, VehicleStatus } from './types.ts';

const VEHICLE_FALLBACK_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect width="800" height="500" fill="#0B2A4A"/><text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" fill="#FFB400" font-family="Arial,sans-serif" font-size="32" font-weight="bold">NURU PRIME LOGISTICS</text><text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" fill="#c3cee0" font-family="Arial,sans-serif" font-size="20">Vehicle Sourcing &amp; Inspection</text></svg>'
  );

const CITIES_ORIGIN = [
  'Nairobi',
  'Mombasa',
  'Kisumu',
  'Nakuru',
  'Eldoret',
  'Chuka',
  'Meru',
  'China (Guangzhou/Yiwu)',
  'Dubai (UAE)',
];

const CITIES_DEST = [
  'Mombasa',
  'Nairobi',
  'Kisumu',
  'Nakuru',
  'Eldoret',
  'Chuka',
  'Meru',
  'China (Guangzhou/Yiwu)',
  'Dubai (UAE)',
];

const SERVICES = [
  'Logistics and Shipping',
  'Sourcing and Procurement',
  'Import and Export Support',
  'Vehicle Sourcing',
  'Supply of Goods',
  'Business Consultancy',
];

const FAQ_ITEMS = [
  {
    q: 'How long does delivery take?',
    a: 'Within Nairobi: Same day / Next day. Upcountry: 1-3 days. International: Depends on destination and freight mode.',
  },
  {
    q: 'How much does shipping cost?',
    a: 'It depends on route, weight, speed, and cargo type. Use our Instant Quote Calculator above or send a formal quote request.',
  },
  {
    q: 'Do you help with import from China / Dubai?',
    a: 'Yes. We handle supplier sourcing, shipping, customs clearance and delivery to your door.',
  },
  {
    q: 'Can I track my parcel?',
    a: 'Yes. Use the Tracking section above with sample codes like NURU123, NURU456, or the live tracking number created when you book a pickup.',
  },
  {
    q: 'How do I pay?',
    a: 'We accept M-Pesa, bank transfer and cash on delivery for selected services.',
  },
];

export default function App() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState('');

  // Vehicles state
  const [vehiclesFromDb, setVehiclesFromDb] = useState<Vehicle[]>([]);
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState<'All' | VehicleStatus>('All');
  const [vehicleManagerOpen, setVehicleManagerOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehMake, setVehMake] = useState('');
  const [vehModel, setVehModel] = useState('');
  const [vehYear, setVehYear] = useState('');
  const [vehPrice, setVehPrice] = useState('');
  const [vehMileage, setVehMileage] = useState('');
  const [vehStatus, setVehStatus] = useState<VehicleStatus>('Available');
  const [vehImage, setVehImage] = useState('');
  const [vehDesc, setVehDesc] = useState('');
  const [vehSaving, setVehSaving] = useState(false);
  const [vehNotice, setVehNotice] = useState<{ text: string; isError: boolean } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const deleteTimerRef = useRef<number | null>(null);

  // Tracking state
  const [trackInput, setTrackInput] = useState('');
  const [trackChips, setTrackChips] = useState<string[]>(['NURU123', 'NURU456', 'NURU789']);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackedShipment, setTrackedShipment] = useState<Shipment | null>(null);
  const [trackError, setTrackError] = useState('');

  // Calculator state
  const [fromLoc, setFromLoc] = useState('Nairobi');
  const [toLoc, setToLoc] = useState('Mombasa');
  const [weight, setWeight] = useState('10');
  const [calcSpeed, setCalcSpeed] = useState<'Standard' | 'Express'>('Standard');
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcResult, setCalcResult] = useState<QuoteEstimate | null>(null);

  // Booking form state
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [bkName, setBkName] = useState('');
  const [bkPhone, setBkPhone] = useState('');
  const [bkService, setBkService] = useState('');
  const [bkDate, setBkDate] = useState(todayStr);
  const [bkTime, setBkTime] = useState('10:00');
  const [bkPickup, setBkPickup] = useState('');
  const [bkDelivery, setBkDelivery] = useState('');
  const [bkNotes, setBkNotes] = useState('');
  const [bookingLinkedEst, setBookingLinkedEst] = useState<QuoteEstimate | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState<{
    ok: boolean;
    title: string;
    msg: string;
    trackingNumber?: string;
    whatsappUrl?: string;
  } | null>(null);

  // Quote form state
  const [qtName, setQtName] = useState('');
  const [qtPhone, setQtPhone] = useState('');
  const [qtService, setQtService] = useState('');
  const [qtFrom, setQtFrom] = useState('');
  const [qtTo, setQtTo] = useState('');
  const [qtNotes, setQtNotes] = useState('');
  const [quoteLinkedEst, setQuoteLinkedEst] = useState<QuoteEstimate | null>(null);
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [lastQuoteDraft, setLastQuoteDraft] = useState<{
    name: string;
    phone: string;
    service: string;
    from: string;
    to: string;
    notes: string;
  } | null>(null);
  const [quoteResult, setQuoteResult] = useState<{
    ok: boolean;
    title: string;
    msg: string;
    whatsappUrl?: string;
  } | null>(null);

  // Blog & FAQ toggles
  const [openBlogs, setOpenBlogs] = useState<Record<number, boolean>>({});
  const [openFaqs, setOpenFaqs] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!firebaseConfigStatus.ok || !auth || !db) {
      setAuthReady(true);
      setVehiclesLoaded(true);
      return;
    }

    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const adminFlag = await checkUserIsAdmin(nextUser);
          setIsAdmin(adminFlag);
          if (adminFlag) {
            await seedInitialCatalogForAdmin();
          }
        } catch {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
        setVehicleManagerOpen(false);
      }
      setAuthReady(true);
    });

    const unsubVehicles = subscribeToVehicles(
      (list) => {
        setVehiclesFromDb(list);
        setVehiclesLoaded(true);
      },
      () => {
        setVehiclesLoaded(true);
      }
    );

    return () => {
      unsubAuth();
      unsubVehicles();
    };
  }, []);

  async function handleRefreshAuth() {
    if (!auth?.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const refreshedUser = auth.currentUser;
    setUser(refreshedUser);
    if (refreshedUser) {
      try {
        const adminFlag = await checkUserIsAdmin(refreshedUser);
        setIsAdmin(adminFlag);
        if (adminFlag) {
          await seedInitialCatalogForAdmin();
        }
      } catch {
        setIsAdmin(false);
      }
    }
  }

  const displayedVehicles = useMemo(() => {
    const source = vehiclesFromDb.length > 0 || vehiclesLoaded && isAdmin ? vehiclesFromDb : vehiclesFromDb.length > 0 ? vehiclesFromDb : DEFAULT_VEHICLES;
    return vehicleFilter === 'All' ? source : source.filter((v) => v.status === vehicleFilter);
  }, [vehiclesFromDb, vehiclesLoaded, isAdmin, vehicleFilter]);

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  function addRecentTrackingChip(code: string) {
    if (!code) return;
    setTrackChips((prev) => (prev.includes(code) ? prev : [...prev, code]));
  }

  async function runTrack(rawCode?: string) {
    const code = (rawCode ?? trackInput).trim().toUpperCase();
    if (rawCode !== undefined) setTrackInput(code);
    setTrackedShipment(null);
    setTrackError('');

    if (!code) {
      setTrackError('Please enter a tracking number such as NURU123, or book a pickup to generate a live code.');
      return;
    }

    setTrackingLoading(true);
    try {
      const shipment = await trackShipmentByCode(code);
      if (!shipment) {
        setTrackError(
          `No shipment found for tracking number "${code}". Try NURU123, NURU456, NURU789, or book a pickup below to generate a live tracking reference.`
        );
      } else {
        setTrackedShipment(shipment);
      }
    } catch (err) {
      setTrackError(err instanceof Error ? err.message : 'Unable to reach tracking service.');
    } finally {
      setTrackingLoading(false);
    }
  }

  async function handleCalculateQuote() {
    setCalcLoading(true);
    const weightNum = parseFloat(weight) || 10;
    try {
      const res = await fetch('/api/calculate-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromLoc, to: toLoc, weight: weightNum, speed: calcSpeed }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = (await res.json()) as QuoteEstimate;
        setCalcResult(data);
        return;
      }
      setCalcResult(calculateLocalEstimate(fromLoc, toLoc, weightNum, calcSpeed));
    } catch {
      setCalcResult(calculateLocalEstimate(fromLoc, toLoc, weightNum, calcSpeed));
    } finally {
      setCalcLoading(false);
    }
  }

  function applyEstimateToBooking() {
    if (!calcResult) return;
    setBookingLinkedEst(calcResult);
    const isIntl =
      calcResult.from.includes('China') ||
      calcResult.from.includes('Dubai') ||
      calcResult.to.includes('China') ||
      calcResult.to.includes('Dubai');
    setBkService(isIntl ? 'Import and Export Support' : 'Logistics and Shipping');
    setBkPickup(calcResult.from);
    setBkDelivery(calcResult.to);
    setBkNotes(
      `Calculator estimate: Ksh ${calcResult.estimatedPriceKes.toLocaleString()} for ${calcResult.weightKg} KG (${calcResult.speed}).`
    );
    scrollToSection('booking');
  }

  function applyEstimateToQuote() {
    if (!calcResult) return;
    setQuoteLinkedEst(calcResult);
    const isIntl =
      calcResult.from.includes('China') ||
      calcResult.from.includes('Dubai') ||
      calcResult.to.includes('China') ||
      calcResult.to.includes('Dubai');
    setQtService(isIntl ? 'Import and Export Support' : 'Logistics and Shipping');
    setQtFrom(calcResult.from);
    setQtTo(calcResult.to);
    setQtNotes(
      `Calculator estimate: Ksh ${calcResult.estimatedPriceKes.toLocaleString()} for ${calcResult.weightKg} KG (${calcResult.speed}, ETA: ${calcResult.eta}). Please confirm final quote.`
    );
    scrollToSection('quote');
  }

  function selectServiceForQuote(serviceName: string, presetNote?: string) {
    setQtService(serviceName);
    if (presetNote) setQtNotes(presetNote);
    scrollToSection('quote');
  }

  async function handleBookPickup(e: React.FormEvent) {
    e.preventDefault();
    setBookingSubmitting(true);
    try {
      const out = await createCustomerBooking({
        name: bkName,
        phone: bkPhone,
        service: bkService,
        date: bkDate,
        time: bkTime,
        pickup: bkPickup,
        delivery: bkDelivery,
        notes: bkNotes,
        weightKg: bookingLinkedEst?.weightKg,
        estimatedPriceKes: bookingLinkedEst?.estimatedPriceKes,
      });
      addRecentTrackingChip(out.trackingNumber);
      setBookingResult({
        ok: true,
        title: '⏳ Booking Submitted — Pending Approval',
        msg: `Thank you ${bkName}! Booking Ref: ${out.bookingRef} | Tracking Code: ${out.trackingNumber} (Pending Staff Approval). Requested pickup: ${bkDate} at ${bkTime} (${bkPickup} → ${bkDelivery}). Dispatch begins once approved by our team.`,
        trackingNumber: out.trackingNumber,
        whatsappUrl: out.whatsappUrl,
      });
    } catch (err) {
      setBookingResult({
        ok: false,
        title: '⚠️ Please Check Booking',
        msg: err instanceof Error ? err.message : 'Could not submit booking request.',
      });
    } finally {
      setBookingSubmitting(false);
    }
  }

  async function handleSubmitQuote(e: React.FormEvent) {
    e.preventDefault();
    setQuoteSubmitting(true);
    try {
      const out = await createCustomerQuote({
        name: qtName,
        phone: qtPhone,
        service: qtService,
        from: qtFrom,
        to: qtTo,
        notes: qtNotes,
        estimatedPriceKes: quoteLinkedEst?.estimatedPriceKes,
      });
      setLastQuoteDraft({
        name: qtName,
        phone: qtPhone,
        service: qtService,
        from: qtFrom,
        to: qtTo,
        notes: qtNotes,
      });
      setQuoteResult({
        ok: true,
        title: `✅ Quote Request Received (${out.quoteRef})`,
        msg: `Thank you ${qtName}! Our team has logged your ${qtService} request and will respond shortly.`,
        whatsappUrl: out.whatsappUrl,
      });
    } catch (err) {
      setQuoteResult({
        ok: false,
        title: '⚠️ Please Check Form',
        msg: err instanceof Error ? err.message : 'Could not submit quote request.',
      });
    } finally {
      setQuoteSubmitting(false);
    }
  }

  function handleConvertQuoteDraftToBooking() {
    if (!lastQuoteDraft) return;
    setBkName(lastQuoteDraft.name);
    setBkPhone(lastQuoteDraft.phone);
    setBkService(lastQuoteDraft.service);
    if (lastQuoteDraft.from) setBkPickup(lastQuoteDraft.from);
    if (lastQuoteDraft.to) setBkDelivery(lastQuoteDraft.to);
    if (lastQuoteDraft.notes) setBkNotes(lastQuoteDraft.notes);
    setBookingResult(null);
    scrollToSection('booking');
  }

  function handleToggleVehicleManager() {
    if (!isAdmin) {
      setAuthNotice('Sign in as authorized staff below to add, edit, or remove vehicles.');
      scrollToSection('operations-portal');
      return;
    }
    setVehicleManagerOpen((prev) => !prev);
  }

  function resetVehicleForm() {
    setEditingVehicleId(null);
    setVehMake('');
    setVehModel('');
    setVehYear('');
    setVehPrice('');
    setVehMileage('');
    setVehStatus('Available');
    setVehImage('');
    setVehDesc('');
  }

  async function handleSaveVehicle(e: React.FormEvent) {
    e.preventDefault();
    setVehSaving(true);
    setVehNotice(null);
    try {
      await saveVehicleToFirestore({
        id: editingVehicleId,
        make: vehMake,
        model: vehModel,
        year: vehYear,
        price: vehPrice,
        mileage: vehMileage,
        status: vehStatus,
        image: vehImage,
        description: vehDesc,
      });
      const wasUpdate = Boolean(editingVehicleId);
      resetVehicleForm();
      setVehNotice({ text: wasUpdate ? 'Vehicle updated.' : 'Vehicle added.', isError: false });
    } catch (err) {
      setVehNotice({
        text: err instanceof Error ? err.message : 'Could not save vehicle.',
        isError: true,
      });
    } finally {
      setVehSaving(false);
    }
  }

  function handleEditVehicle(v: Vehicle) {
    setEditingVehicleId(v.id);
    setVehMake(v.make);
    setVehModel(v.model);
    setVehYear(v.year);
    setVehPrice(v.price);
    setVehMileage(v.mileage);
    setVehStatus(v.status);
    setVehImage(v.image);
    setVehDesc(v.description);
    setVehicleManagerOpen(true);
    scrollToSection('vehicles');
  }

  async function handleDeleteVehicle(id: string) {
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id);
      if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = window.setTimeout(() => setPendingDeleteId(null), 3500);
      return;
    }
    if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
    setPendingDeleteId(null);
    try {
      await deleteVehicleFromFirestore(id);
      if (editingVehicleId === id) resetVehicleForm();
    } catch (err) {
      setVehNotice({
        text: err instanceof Error ? err.message : 'Could not delete vehicle.',
        isError: true,
      });
    }
  }

  const trackBadgeColors = useMemo(() => {
    if (!trackedShipment) return { border: '#FFB400', bg: '#e8f1ff', fg: '#0B2A4A' };
    if (trackedShipment.status === 'Delivered') {
      return { border: '#25D366', bg: '#e8f5e9', fg: '#1b5e20' };
    }
    if (trackedShipment.status === 'Declined') {
      return { border: '#b42318', bg: '#fdecea', fg: '#b42318' };
    }
    if (trackedShipment.status === 'Pending Approval') {
      return { border: '#f59e0b', bg: '#fff4db', fg: '#8a5300' };
    }
    return { border: '#FFB400', bg: '#e8f1ff', fg: '#0B2A4A' };
  }, [trackedShipment]);

  return (
    <>
      <header>
        <a href="#" aria-label="Nuru Prime Logistics home">
          <img className="brand-logo" src="/nuru-logo-transparent.png" alt="" />
          <span className="brand-name">
            NURU PRIME<small>LOGISTICS</small>
          </span>
        </a>
        <nav>
          <a href="#services">Services</a>
          <a href="#about">About Us</a>
          <a href="#vehicles">Cars</a>
          <a href="#quote">Get Quote</a>
          <a href="#track">Track Shipment</a>
          <a href="#blog">Blog</a>
          <a href="#operations-portal">Operations</a>
          <a href="#contact">Contact Us</a>
        </nav>
        <button
          type="button"
          className="nav-toggle"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((prev) => !prev)}
        >
          ☰
        </button>
      </header>

      <div className={`mobile-nav ${mobileNavOpen ? 'open' : ''}`}>
        {[
          ['#services', 'Services'],
          ['#about', 'About Us'],
          ['#vehicles', 'Cars for Sale'],
          ['#calculator', 'Quote Calculator'],
          ['#booking', 'Book a Pickup'],
          ['#quote', 'Get Quote'],
          ['#track', 'Track Shipment'],
          ['#blog', 'Blog'],
          ['#operations-portal', 'Operations Portal'],
          ['#contact', 'Contact Us'],
        ].map(([href, label]) => (
          <a key={href} href={href} onClick={() => setMobileNavOpen(false)}>
            {label}
          </a>
        ))}
      </div>

      <div className="hero">
        <div className="hero-content">
          <div className="hero-badge">✦ &nbsp; Logistics across Kenya and beyond</div>
          <h1>
            Logistics That Move<span>Your Business Forward</span>
          </h1>
          <p>
            Your trusted partner for shipping, sourcing and vehicle logistics. Get a clear quote, dependable delivery and support from pickup to destination.
          </p>
          <div className="hero-actions">
            <a className="btn" href="#calculator">
              Get Instant Quote &nbsp; →
            </a>
            <a className="btn2" href="#track">
              Track Shipment
            </a>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" />
                <path d="m3 7 9 5 9-5M12 12v9" />
              </svg>
              <strong>6 Core Services</strong>
              <span>Shipping, sourcing and more</span>
            </div>
            <div className="hero-stat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
              </svg>
              <strong>Kenya &amp; Beyond</strong>
              <span>Local and international support</span>
            </div>
            <div className="hero-stat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="m3 17 6-6 4 4 8-9" />
                <path d="M15 6h6v6" />
              </svg>
              <strong>End-to-End</strong>
              <span>From sourcing to delivery</span>
            </div>
            <div className="hero-stat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 3 4 13h7l-1 8 10-12h-7l-1-6Z" />
              </svg>
              <strong>Reliable Support</strong>
              <span>Clear updates along the way</span>
            </div>
          </div>
        </div>
      </div>

      <section id="operations">
        <h2>Logistics in Action</h2>
        <p className="sub">From planning and shipping to careful warehouse handling.</p>
        <div className="operations-grid">
          <figure className="operations-card">
            <img
              src="/WhatsApp Image 2026-11-21 at 19.43.53.jpeg"
              alt="Nuru Prime Logistics team coordinating operations beside company trucks"
              loading="lazy"
            />
            <figcaption>Planning &amp; Coordination</figcaption>
          </figure>
          <figure className="operations-card">
            <img
              src="/WhatsApp Image 2026-11-21 at 19.43.54.jpeg"
              alt="Nuru Prime Logistics team preparing cargo for delivery"
              loading="lazy"
            />
            <figcaption>Shipping &amp; Delivery</figcaption>
          </figure>
          <figure className="operations-card">
            <img
              src="/WhatsApp Image 2026-11-21 at 19.43.55.jpeg"
              alt="Warehouse operator moving palletized cargo with a forklift"
              loading="lazy"
            />
            <figcaption>Warehouse Handling</figcaption>
          </figure>
        </div>
      </section>

      <section id="about">
        <h2>About Nuru Prime Logistics</h2>
        <p className="sub">Moving Business Forward Through Reliable Solutions.</p>
        <div className="about-lead">
          <h3>Company Introduction</h3>
          <p>
            Nuru Prime Logistics &amp; Consultancy is a logistics, sourcing, procurement and business consultancy company committed to providing practical, reliable and professionally coordinated solutions to individuals, businesses and organisations.
          </p>
          <p>
            We specialise in connecting clients with suitable suppliers, facilitating procurement processes and coordinating logistics solutions that support business operations locally and internationally.
          </p>
          <p>
            Our focus is to simplify business processes, create value and establish lasting partnerships through professionalism, transparency and accountability.
          </p>
        </div>
        <div className="about-columns">
          <article className="about-card">
            <h3>Who We Are</h3>
            <p>
              We are a client-focused business solutions company bringing together logistics coordination, international sourcing, procurement and consultancy services under one professional platform.
            </p>
            <p>
              We understand the importance of reliable partnerships, informed purchasing decisions and efficient supply chain coordination. We work with clients to identify solutions that meet their specifications and business objectives.
            </p>
            <p>We aim to be a dependable partner throughout every stage of the engagement.</p>
          </article>
          <article className="about-card">
            <h3>Our Mission</h3>
            <p>
              To provide reliable, efficient and customer-focused logistics, sourcing, procurement and consultancy solutions that simplify business operations, create value and support the growth of our clients.
            </p>
          </article>
          <article className="about-card">
            <h3>Our Vision</h3>
            <p>
              To become a respected and recognised international business solutions company, known for professionalism, reliability, innovation and excellence in logistics, sourcing and procurement.
            </p>
          </article>
        </div>
        <h3 className="values-title">Our Core Values</h3>
        <div className="values-grid">
          <article className="value-card">
            <h3>Integrity</h3>
            <p>Conducting business with honesty, transparency and accountability.</p>
          </article>
          <article className="value-card">
            <h3>Professionalism</h3>
            <p>Maintaining high standards in communication, service delivery and business relationships.</p>
          </article>
          <article className="value-card">
            <h3>Reliability</h3>
            <p>Taking responsibility for our commitments and striving for consistent service delivery.</p>
          </article>
          <article className="value-card">
            <h3>Customer Focus</h3>
            <p>Putting our clients&apos; requirements and expectations at the centre of our operations.</p>
          </article>
          <article className="value-card">
            <h3>Excellence</h3>
            <p>Continuously improving our processes and the quality of our services.</p>
          </article>
          <article className="value-card">
            <h3>Innovation</h3>
            <p>Embracing better approaches, technology and opportunities to improve business solutions.</p>
          </article>
          <article className="value-card">
            <h3>Partnership</h3>
            <p>Building meaningful, long-term relationships with clients, suppliers and business partners.</p>
          </article>
        </div>
        <div className="commitment">
          <h3>Our Commitment to Clients</h3>
          <p>
            Every client engagement is an opportunity to demonstrate our commitment to professional service and dependable business partnerships. We are committed to:
          </p>
          <ul>
            <li>Understanding and respecting our clients&apos; specific requirements.</li>
            <li>Providing clear and transparent communication.</li>
            <li>Identifying suitable sourcing and procurement opportunities.</li>
            <li>Coordinating logistics processes with attention to detail.</li>
            <li>Maintaining accountability throughout our engagements.</li>
            <li>Treating every assignment with professionalism and care.</li>
            <li>Building relationships founded on trust, mutual respect and long-term value.</li>
          </ul>
        </div>
      </section>

      <section id="services">
        <h2>Our Services</h2>
        <p className="sub">Everything your business needs to source, ship and grow.</p>
        <div className="grid">
          <div className="card">
            <div>
              <h3>1. Logistics &amp; Shipping</h3>
              <p>Local and international shipping, parcel delivery, cargo handling and door-to-door logistics.</p>
            </div>
            <button
              type="button"
              className="card-action"
              onClick={() => selectServiceForQuote('Logistics and Shipping')}
            >
              Request Logistics Quote →
            </button>
          </div>
          <div className="card">
            <div>
              <h3>2. Sourcing &amp; Procurement</h3>
              <p>We find reliable suppliers, negotiate best prices and procure quality goods.</p>
            </div>
            <button
              type="button"
              className="card-action"
              onClick={() => selectServiceForQuote('Sourcing and Procurement')}
            >
              Request Sourcing Quote →
            </button>
          </div>
          <div className="card">
            <div>
              <h3>3. Import &amp; Export Support</h3>
              <p>Customs clearance, documentation, freight forwarding and full import/export support.</p>
            </div>
            <button
              type="button"
              className="card-action"
              onClick={() => selectServiceForQuote('Import and Export Support')}
            >
              Request Import/Export Quote →
            </button>
          </div>
          <div className="card">
            <div>
              <h3>4. Vehicle Sourcing</h3>
              <p>We help you source quality vehicles locally and abroad — inspection, purchase and shipping handled.</p>
            </div>
            <button
              type="button"
              className="card-action"
              onClick={() => selectServiceForQuote('Vehicle Sourcing')}
            >
              Request Vehicle Sourcing →
            </button>
          </div>
          <div className="card">
            <div>
              <h3>5. Supply of Goods</h3>
              <p>Wholesale and retail supply of goods for businesses, schools, offices and organisations.</p>
            </div>
            <button
              type="button"
              className="card-action"
              onClick={() => selectServiceForQuote('Supply of Goods')}
            >
              Request Supply Quote →
            </button>
          </div>
          <div className="card">
            <div>
              <h3>6. Business Consultancy</h3>
              <p>Practical advice on starting, growing and running your business.</p>
            </div>
            <button
              type="button"
              className="card-action"
              onClick={() => selectServiceForQuote('Business Consultancy')}
            >
              Book Consultancy →
            </button>
          </div>
        </div>
      </section>

      <section id="vehicles">
        <h2>Cars for Sale</h2>
        <p className="sub">Browse available vehicles or ask us to source one for you.</p>
        <div className="vehicle-controls">
          {(['All', 'Available', 'Reserved', 'Sold'] as const).map((st) => (
            <button
              key={st}
              type="button"
              className={`filter-btn ${vehicleFilter === st ? 'active' : ''}`}
              onClick={() => setVehicleFilter(st)}
            >
              {st === 'All' ? 'All Vehicles' : st}
            </button>
          ))}
          <button type="button" className="manage-btn" onClick={handleToggleVehicleManager}>
            Manage Vehicles
          </button>
        </div>

        {vehicleManagerOpen && isAdmin && (
          <div className="vehicle-manager">
            <div className="manager-head">
              <h3>{editingVehicleId ? 'Update Vehicle' : 'Add a Vehicle'}</h3>
              <button
                type="button"
                className="cancel-edit"
                style={{ maxWidth: '120px' }}
                onClick={() => {
                  setVehicleManagerOpen(false);
                  resetVehicleForm();
                }}
              >
                Close
              </button>
            </div>
            <form className="vehicle-form" onSubmit={handleSaveVehicle}>
              <input
                className="nuru-input"
                placeholder="Make / Brand (e.g. Toyota)"
                value={vehMake}
                onChange={(e) => setVehMake(e.target.value)}
                required
              />
              <input
                className="nuru-input"
                placeholder="Model (e.g. RAV4)"
                value={vehModel}
                onChange={(e) => setVehModel(e.target.value)}
                required
              />
              <input
                className="nuru-input"
                type="number"
                min="1950"
                max="2100"
                placeholder="Year"
                value={vehYear}
                onChange={(e) => setVehYear(e.target.value)}
                required
              />
              <input
                className="nuru-input"
                type="number"
                min="0"
                placeholder="Price in KES"
                value={vehPrice}
                onChange={(e) => setVehPrice(e.target.value)}
                required
              />
              <input
                className="nuru-input"
                type="number"
                min="0"
                placeholder="Mileage in KM"
                value={vehMileage}
                onChange={(e) => setVehMileage(e.target.value)}
              />
              <select
                className="nuru-input"
                value={vehStatus}
                onChange={(e) => setVehStatus(e.target.value as VehicleStatus)}
              >
                <option value="Available">Available</option>
                <option value="Reserved">Reserved</option>
                <option value="Sold">Sold</option>
              </select>
              <input
                className="nuru-input full"
                type="url"
                placeholder="Vehicle image URL (https://...)"
                value={vehImage}
                onChange={(e) => setVehImage(e.target.value)}
              />
              <textarea
                className="nuru-input"
                rows={3}
                placeholder="Condition, features, location and other details"
                value={vehDesc}
                onChange={(e) => setVehDesc(e.target.value)}
              />
              <div className="form-actions">
                <button type="submit" className="nuru-btn" disabled={vehSaving}>
                  {vehSaving ? 'Saving...' : editingVehicleId ? 'Save Changes' : 'Add Vehicle'}
                </button>
                {editingVehicleId && (
                  <button type="button" className="cancel-edit" onClick={resetVehicleForm}>
                    Cancel Edit
                  </button>
                )}
              </div>
              {vehNotice && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    background: vehNotice.isError ? '#fdecea' : '#E8F5E9',
                    color: vehNotice.isError ? '#b42318' : '#1b5e20',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                  }}
                >
                  {vehNotice.text}
                </div>
              )}
            </form>
          </div>
        )}

        <div className="grid">
          {displayedVehicles.length === 0 ? (
            <div className="empty-vehicles">
              {vehicleFilter === 'All'
                ? 'No vehicles listed yet.'
                : `No vehicles currently marked as ${vehicleFilter}.`}
            </div>
          ) : (
            displayedVehicles.map((vehicle) => {
              const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim();
              const priceText = `Ksh ${Number(vehicle.price || 0).toLocaleString()}`;
              return (
                <article key={vehicle.id} className="vehicle-card">
                  <img
                    src={vehicle.image || VEHICLE_FALLBACK_SVG}
                    alt={`${vehicle.make} ${vehicle.model}`.trim()}
                    loading="lazy"
                    onError={(e) => {
                      if (e.currentTarget.src !== VEHICLE_FALLBACK_SVG) {
                        e.currentTarget.src = VEHICLE_FALLBACK_SVG;
                      }
                    }}
                  />
                  <div className="info">
                    <h3>{title}</h3>
                    <div className="vehicle-price">{priceText}</div>
                    <span className={`vehicle-status ${vehicle.status}`}>
                      {vehicle.status}
                      {vehicle.mileage ? ` • ${Number(vehicle.mileage).toLocaleString()} KM` : ''}
                    </span>
                    <p>{vehicle.description || 'Contact us for inspection report and details.'}</p>
                    <div className="vehicle-cta-row">
                      <a
                        className="btn"
                        href={`https://wa.me/254116216899?text=${encodeURIComponent(
                          `Hi Nuru Logistics, I am interested in the ${title} (${priceText}).`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        WhatsApp
                      </a>
                      <button
                        type="button"
                        className="quote-btn"
                        onClick={() =>
                          selectServiceForQuote(
                            'Vehicle Sourcing',
                            `Vehicle inquiry: ${title} (${priceText}, Status: ${vehicle.status}). Please share inspection details and availability.`
                          )
                        }
                      >
                        Request Quote
                      </button>
                    </div>
                    {isAdmin && (
                      <div className="vehicle-actions">
                        <button type="button" onClick={() => handleEditVehicle(vehicle)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="delete"
                          onClick={() => handleDeleteVehicle(vehicle.id)}
                        >
                          {pendingDeleteId === vehicle.id ? 'Confirm Remove?' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section id="track">
        <h2>Track Your Shipment</h2>
        <p className="sub">Enter your tracking number (or book a pickup below to get a live tracking code).</p>
        <div className="box">
          <input
            className="nuru-input"
            placeholder="Enter Tracking Number e.g. NURU123"
            value={trackInput}
            onChange={(e) => setTrackInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runTrack();
              }
            }}
          />
          <div className="quick-chips">
            <span>Sample shipments:</span>
            {trackChips.map((code) => (
              <button
                key={code}
                type="button"
                className="chip-btn"
                onClick={() => void runTrack(code)}
              >
                {code}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="nuru-btn"
            disabled={trackingLoading}
            onClick={() => void runTrack()}
          >
            {trackingLoading ? 'Checking...' : 'Track Now'}
          </button>

          {(trackError || trackedShipment) && (
            <div className="track-card" style={{ borderLeftColor: trackError ? '#b42318' : trackBadgeColors.border }}>
              {trackError ? (
                <div className="track-head">
                  <div>
                    <b style={{ color: '#0B2A4A', fontSize: '16px' }}>Shipment Not Found</b>
                    <p style={{ fontSize: '14px', color: '#555', marginTop: '4px' }}>{trackError}</p>
                  </div>
                </div>
              ) : (
                trackedShipment && (
                  <>
                    <div className="track-head">
                      <div>
                        <b style={{ color: '#0B2A4A', fontSize: '16px' }}>
                          {trackedShipment.trackingNumber} — {trackedShipment.status}
                        </b>
                        <p style={{ fontSize: '14px', color: '#555', marginTop: '4px' }}>
                          {trackedShipment.statusDetail}
                        </p>
                      </div>
                      <span
                        className="track-badge"
                        style={{ background: trackBadgeColors.bg, color: trackBadgeColors.fg }}
                      >
                        {trackedShipment.status}
                      </span>
                    </div>
                    <div className="track-meta">
                      {[
                        `Route: ${trackedShipment.from} → ${trackedShipment.to}`,
                        `Service: ${trackedShipment.service}`,
                        `ETA: ${trackedShipment.eta}`,
                        `Updated: ${trackedShipment.updatedAtLabel}`,
                        trackedShipment.weightKg > 0 ? `Weight: ${trackedShipment.weightKg} KG` : '',
                      ]
                        .filter(Boolean)
                        .join('  •  ')}
                    </div>
                    <div className="timeline">
                      {trackedShipment.milestones.map((m, idx) => (
                        <div key={`${m.label}-${idx}`} className={`milestone ${m.done ? 'done' : ''}`}>
                          <span className="milestone-dot" />
                          <div className="milestone-body">
                            <strong>{m.label}</strong>
                            <span>
                              {m.location} • {m.time}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '12px' }}>
                      <a
                        className="wa-btn"
                        href={`https://wa.me/254116216899?text=${encodeURIComponent(
                          `Hi Nuru Logistics, please share an update on shipment ${trackedShipment.trackingNumber} (${trackedShipment.from} to ${trackedShipment.to}).`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ask Update on WhatsApp
                      </a>
                    </div>
                  </>
                )
              )}
            </div>
          )}
        </div>
      </section>

      <section id="calculator">
        <h2>Instant Quote Calculator</h2>
        <p className="sub">Get a route-based estimate in seconds, then book or request a formal quote directly.</p>
        <div className="box">
          <div className="calc-grid">
            <div>
              <label htmlFor="fromLoc" style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '5px' }}>
                Origin
              </label>
              <select
                id="fromLoc"
                className="nuru-input"
                value={fromLoc}
                onChange={(e) => setFromLoc(e.target.value)}
              >
                {CITIES_ORIGIN.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="toLoc" style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '5px' }}>
                Destination
              </label>
              <select
                id="toLoc"
                className="nuru-input"
                value={toLoc}
                onChange={(e) => setToLoc(e.target.value)}
              >
                {CITIES_DEST.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="weight" style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '5px' }}>
                Weight (KG)
              </label>
              <input
                id="weight"
                className="nuru-input"
                type="number"
                min="1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="Weight in KG e.g. 10"
              />
            </div>
            <div>
              <label htmlFor="calcSpeed" style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '5px' }}>
                Delivery Speed
              </label>
              <select
                id="calcSpeed"
                className="nuru-input"
                value={calcSpeed}
                onChange={(e) => setCalcSpeed(e.target.value as 'Standard' | 'Express')}
              >
                <option value="Standard">Standard Delivery</option>
                <option value="Express">Express Priority</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            className="nuru-btn"
            disabled={calcLoading}
            onClick={handleCalculateQuote}
          >
            {calcLoading ? 'Calculating...' : 'Calculate Price'}
          </button>

          {calcResult && (
            <div className="calc-result">
              <b style={{ fontSize: '20px' }}>
                Estimated Price: Ksh {calcResult.estimatedPriceKes.toLocaleString()} ({calcResult.weightKg} KG)
              </b>
              <div className="calc-meta">
                {calcResult.corridor} • {calcResult.speed} • Est. Transit: {calcResult.eta}
              </div>
              <div className="result-actions">
                <button type="button" className="btn-gold" onClick={applyEstimateToBooking}>
                  Book Pickup With Estimate →
                </button>
                <button type="button" className="btn-light" onClick={applyEstimateToQuote}>
                  Request Formal Quote →
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section id="booking">
        <h2>Book a Pickup</h2>
        <p className="sub">Book your pickup in 1 minute. You will receive an instant tracking number and WhatsApp confirmation.</p>
        <form className="nuru-form" onSubmit={handleBookPickup}>
          {bookingLinkedEst && (
            <div className="linked-banner show">
              <span>
                Linked Estimate: Ksh {bookingLinkedEst.estimatedPriceKes.toLocaleString()} ({bookingLinkedEst.from} →{' '}
                {bookingLinkedEst.to}, {bookingLinkedEst.weightKg} KG)
              </span>
              <button type="button" onClick={() => setBookingLinkedEst(null)}>
                Clear estimate
              </button>
            </div>
          )}
          <input
            className="nuru-input"
            placeholder="Your Full Name"
            value={bkName}
            onChange={(e) => setBkName(e.target.value)}
            required
          />
          <input
            className="nuru-input"
            placeholder="Phone / WhatsApp Number"
            value={bkPhone}
            onChange={(e) => setBkPhone(e.target.value)}
            required
          />
          <select
            className="nuru-input"
            value={bkService}
            onChange={(e) => setBkService(e.target.value)}
            required
          >
            <option value="">Select Service</option>
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label htmlFor="bkDate" style={{ fontSize: '15px', color: '#555' }}>
            Pickup Date
          </label>
          <input
            id="bkDate"
            className="nuru-input"
            type="date"
            min={todayStr}
            value={bkDate}
            onChange={(e) => setBkDate(e.target.value)}
            required
          />
          <label htmlFor="bkTime" style={{ fontSize: '15px', color: '#555' }}>
            Pickup Time
          </label>
          <input
            id="bkTime"
            className="nuru-input"
            type="time"
            value={bkTime}
            onChange={(e) => setBkTime(e.target.value)}
            required
          />
          <input
            className="nuru-input"
            placeholder="Pickup Location e.g. Nairobi, Westlands"
            value={bkPickup}
            onChange={(e) => setBkPickup(e.target.value)}
            required
          />
          <input
            className="nuru-input"
            placeholder="Delivery Location e.g. Chuka"
            value={bkDelivery}
            onChange={(e) => setBkDelivery(e.target.value)}
            required
          />
          <textarea
            className="nuru-input"
            rows={2}
            placeholder="Any special notes?"
            value={bkNotes}
            onChange={(e) => setBkNotes(e.target.value)}
          />
          <button type="submit" className="nuru-btn" disabled={bookingSubmitting}>
            {bookingSubmitting ? 'Confirming...' : 'Submit Booking Request →'}
          </button>

          {bookingResult && (
            <div className="success-box">
              <b>{bookingResult.title}</b>
              <p>{bookingResult.msg}</p>
              {bookingResult.ok && (
                <div className="result-actions" style={{ marginTop: '12px' }}>
                  {bookingResult.trackingNumber && (
                    <button
                      type="button"
                      style={{ background: '#0B2A4A', color: '#fff' }}
                      onClick={() => {
                        scrollToSection('track');
                        void runTrack(bookingResult.trackingNumber);
                      }}
                    >
                      Check Tracking Status →
                    </button>
                  )}
                  {bookingResult.whatsappUrl && (
                    <a
                      className="wa-btn"
                      style={{ marginTop: 0 }}
                      href={bookingResult.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Send Booking via WhatsApp
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </form>
      </section>

      <section>
        <div className="why">
          <h2>Why Choose Nuru Logistics?</h2>
          <div className="steps">
            <div className="step">
              <b>Transparent communication</b>
            </div>
            <div className="step">
              <b>Regular progress updates</b>
            </div>
            <div className="step">
              <b>Clear and upfront quotations</b>
            </div>
          </div>
        </div>
      </section>

      <section id="quote">
        <h2>Get a Free Quote</h2>
        <p className="sub">Tell us what you need and we will reply within a few hours.</p>
        <form className="nuru-form" onSubmit={handleSubmitQuote}>
          {quoteLinkedEst && (
            <div className="linked-banner show">
              <span>
                Linked Estimate: Ksh {quoteLinkedEst.estimatedPriceKes.toLocaleString()} ({quoteLinkedEst.from} →{' '}
                {quoteLinkedEst.to}, {quoteLinkedEst.weightKg} KG)
              </span>
              <button type="button" onClick={() => setQuoteLinkedEst(null)}>
                Clear estimate
              </button>
            </div>
          )}
          <input
            className="nuru-input"
            placeholder="Your Full Name"
            value={qtName}
            onChange={(e) => setQtName(e.target.value)}
            required
          />
          <input
            className="nuru-input"
            placeholder="Phone / WhatsApp Number"
            value={qtPhone}
            onChange={(e) => setQtPhone(e.target.value)}
            required
          />
          <select
            className="nuru-input"
            value={qtService}
            onChange={(e) => setQtService(e.target.value)}
            required
          >
            <option value="">Select Service Needed</option>
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            className="nuru-input"
            placeholder="From (Location)"
            value={qtFrom}
            onChange={(e) => setQtFrom(e.target.value)}
          />
          <input
            className="nuru-input"
            placeholder="To (Destination)"
            value={qtTo}
            onChange={(e) => setQtTo(e.target.value)}
          />
          <textarea
            className="nuru-input"
            rows={3}
            placeholder="Describe what you need..."
            value={qtNotes}
            onChange={(e) => setQtNotes(e.target.value)}
          />
          <button type="submit" className="nuru-btn" disabled={quoteSubmitting}>
            {quoteSubmitting ? 'Sending...' : 'Request Quote →'}
          </button>

          {quoteResult && (
            <div className="success-box">
              <b>{quoteResult.title}</b>
              <p>{quoteResult.msg}</p>
              {quoteResult.ok && (
                <div className="result-actions" style={{ marginTop: '12px' }}>
                  {quoteResult.whatsappUrl && (
                    <a
                      className="wa-btn"
                      style={{ marginTop: 0 }}
                      href={quoteResult.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Send Quote on WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    style={{ background: '#0B2A4A', color: '#fff' }}
                    onClick={handleConvertQuoteDraftToBooking}
                  >
                    Book Pickup Instead →
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
      </section>

      <section id="blog">
        <h2>Logistics &amp; Sourcing Insights</h2>
        <p className="sub">Practical guides on shipping, customs clearance, and supplier procurement.</p>
        <div className="grid">
          <article className="blog-card">
            <img
              src="/WhatsApp Image 2026-11-21 at 19.43.53.jpeg"
              alt="Nuru Prime Logistics planning operations"
              loading="lazy"
            />
            <div className="info">
              <h3>How to Plan Smooth Upcountry Cargo Deliveries in Kenya</h3>
              <p>
                Learn how proper packaging, weight declarations, and dispatch scheduling keep Nairobi-to-upcountry deliveries on time.
              </p>
              {openBlogs[0] && (
                <div className="blog-more">
                  Consolidated corridor dispatches leave Nairobi daily for Mombasa, Nakuru, Eldoret, Kisumu, Chuka, and Meru. Book before 11:00 AM EAT for same-day hub processing.
                </div>
              )}
              <div className="blog-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setOpenBlogs((p) => ({ ...p, 0: !p[0] }))}
                >
                  {openBlogs[0] ? 'Hide Summary' : 'Read Summary'}
                </button>
                <button
                  type="button"
                  onClick={() => selectServiceForQuote('Logistics and Shipping', 'Upcountry cargo delivery inquiry')}
                >
                  Get Quote →
                </button>
              </div>
            </div>
          </article>

          <article className="blog-card">
            <img
              src="/WhatsApp Image 2026-11-21 at 19.43.54.jpeg"
              alt="Nuru Prime Logistics shipping and delivery preparation"
              loading="lazy"
            />
            <div className="info">
              <h3>Importing From China or Dubai: Documents &amp; Customs Checklist</h3>
              <p>
                Avoid port delays with verified commercial invoices, packing lists, IDF filings, and pre-shipment inspection.
              </p>
              {openBlogs[1] && (
                <div className="blog-more">
                  We coordinate supplier verification, sea or air freight consolidation, KRA customs clearance at Mombasa Port or JKIA/Nairobi ICD, and final door delivery.
                </div>
              )}
              <div className="blog-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setOpenBlogs((p) => ({ ...p, 1: !p[1] }))}
                >
                  {openBlogs[1] ? 'Hide Summary' : 'Read Summary'}
                </button>
                <button
                  type="button"
                  onClick={() => selectServiceForQuote('Import and Export Support', 'Import from China / Dubai inquiry')}
                >
                  Request Import Help →
                </button>
              </div>
            </div>
          </article>

          <article className="blog-card">
            <img
              src="/WhatsApp Image 2026-11-21 at 19.43.55.jpeg"
              alt="Nuru Prime Logistics warehouse cargo handling"
              loading="lazy"
            />
            <div className="info">
              <h3>What to Check Before Sourcing a Vehicle Locally or Abroad</h3>
              <p>
                From auction sheets and mileage verification to duty estimation and registration, see how our inspection workflow protects buyers.
              </p>
              {openBlogs[2] && (
                <div className="blog-more">
                  Every vehicle sourced through Nuru Prime undergoes pre-purchase mechanical inspection, transparent landed-cost quotation in KES, and end-to-end clearing.
                </div>
              )}
              <div className="blog-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setOpenBlogs((p) => ({ ...p, 2: !p[2] }))}
                >
                  {openBlogs[2] ? 'Hide Summary' : 'Read Summary'}
                </button>
                <button
                  type="button"
                  onClick={() => selectServiceForQuote('Vehicle Sourcing', 'Vehicle inspection and sourcing inquiry')}
                >
                  Source a Vehicle →
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section id="faq">
        <h2>Frequently Asked Questions</h2>
        <p className="sub">Tap a question to see the answer.</p>
        {FAQ_ITEMS.map((item, idx) => (
          <div
            key={item.q}
            className={`faq-item ${openFaqs[idx] ? 'open' : ''}`}
            onClick={() => setOpenFaqs((p) => ({ ...p, [idx]: !p[idx] }))}
          >
            <b>{item.q}</b>
            {openFaqs[idx] && <p>{item.a}</p>}
          </div>
        ))}
      </section>

      <section id="contact" style={{ textAlign: 'center' }}>
        <h2>Contact Us</h2>
        <p>
          Location: Nairobi, Kenya
          <br />
          Phone / WhatsApp: 0116216899
          <br />
          Email: nuruprimelogistics@gmail.com
        </p>
        <br />
        <a
          className="btn"
          href="https://wa.me/254116216899?text=Hi%20Nuru%20Logistics"
          target="_blank"
          rel="noopener noreferrer"
        >
          Chat on WhatsApp
        </a>
      </section>

      <OperationsPortal
        user={user}
        isAdmin={isAdmin}
        authReady={authReady}
        vehicles={displayedVehicles}
        onQuickTrack={(code) => {
          scrollToSection('track');
          void runTrack(code);
        }}
        onAddRecentTrack={addRecentTrackingChip}
        onOpenVehicleManager={() => {
          setVehicleManagerOpen(true);
          scrollToSection('vehicles');
        }}
        authNotice={authNotice}
        onClearAuthNotice={() => setAuthNotice('')}
        onRefreshAuth={handleRefreshAuth}
      />

      <footer>
        <b>NURU LOGISTICS</b>
        <br />
        Logistics • Sourcing • Import &amp; Export • Supply • Consultancy
        <br />© 2026 Nuru Logistics. All rights reserved.
        <div className="footer-links">
          <button type="button" onClick={() => scrollToSection('operations-portal')}>
            Staff Operations Portal
          </button>
        </div>
      </footer>

      <a
        className="whatsapp"
        href="https://wa.me/254116216899?text=Hi%20Nuru%20Logistics%2C%20I%20need%20a%20quote"
        target="_blank"
        rel="noopener noreferrer"
      >
        💬 WhatsApp
      </a>
    </>
  );
}
