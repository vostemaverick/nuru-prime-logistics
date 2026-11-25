import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db, PRIMARY_OWNER_EMAIL } from './firebase.ts';
import { handleFirestoreError, OperationType } from './firestoreError.ts';
import { generateRecoveryCodeSet, hashSecret, verifySecret } from './crypto.ts';
import type {
  AdminUserRecord,
  BookingRecord,
  Milestone,
  QuoteEstimate,
  QuoteRecord,
  QuoteStatus,
  Shipment,
  ShipmentStatus,
  StaffSecurityDoc,
  Vehicle,
  VehicleStatus,
} from '../types.ts';

export const WHATSAPP_NUMBER = '254116216899';

export const DEFAULT_SHIPMENTS: Shipment[] = [
  {
    trackingNumber: 'NURU123',
    bookingRef: '',
    approved: true,
    service: 'Logistics and Shipping',
    from: 'Nairobi',
    to: 'Mombasa',
    weightKg: 18,
    estimatedPriceKes: 2450,
    status: 'In Transit',
    statusDetail: 'Parcel cleared Nairobi dispatch hub and is en route along the Mombasa corridor.',
    eta: '1-2 business days',
    updatedAtLabel: 'Today, 09:40 EAT',
    milestones: [
      { label: 'Order Received', location: 'Nairobi Hub', time: 'Yesterday, 14:15 EAT', done: true },
      { label: 'Picked Up & Inspected', location: 'Westlands, Nairobi', time: 'Yesterday, 17:05 EAT', done: true },
      { label: 'In Transit', location: 'Mtito Andei Corridor', time: 'Today, 09:40 EAT', done: true },
      { label: 'Out for Delivery', location: 'Mombasa Hub', time: 'Pending', done: false },
    ],
  },
  {
    trackingNumber: 'NURU456',
    bookingRef: '',
    approved: true,
    service: 'Import and Export Support',
    from: 'Dubai (Jebel Ali)',
    to: 'Nairobi ICD',
    weightKg: 120,
    estimatedPriceKes: 48500,
    status: 'Customs Clearance',
    statusDetail: 'Import documentation lodged with customs; inspection and release in progress.',
    eta: '2-3 business days',
    updatedAtLabel: 'Today, 11:10 EAT',
    milestones: [
      { label: 'Supplier Dispatch', location: 'Dubai, UAE', time: '5 days ago', done: true },
      { label: 'Port Arrival', location: 'Mombasa Port', time: '2 days ago', done: true },
      { label: 'Customs Clearance', location: 'Nairobi ICD', time: 'Today, 11:10 EAT', done: true },
      { label: 'Final Door Delivery', location: 'Nairobi CBD', time: 'Pending', done: false },
    ],
  },
  {
    trackingNumber: 'NURU789',
    bookingRef: '',
    approved: true,
    service: 'Supply of Goods',
    from: 'Nairobi',
    to: 'Chuka',
    weightKg: 45,
    estimatedPriceKes: 4100,
    status: 'Delivered',
    statusDetail: 'Shipment delivered and signed off at destination.',
    eta: 'Delivered',
    updatedAtLabel: 'Yesterday, 16:20 EAT',
    milestones: [
      { label: 'Order Received', location: 'Nairobi Warehouse', time: '2 days ago, 08:30 EAT', done: true },
      { label: 'Dispatched', location: 'Thika Highway Hub', time: '2 days ago, 12:15 EAT', done: true },
      { label: 'Arrived Local Hub', location: 'Chuka Town', time: 'Yesterday, 10:00 EAT', done: true },
      { label: 'Delivered', location: 'Chuka Recipient', time: 'Yesterday, 16:20 EAT', done: true },
    ],
  },
];

export const DEFAULT_VEHICLES: Vehicle[] = [
  {
    id: 'veh-rav4-2019',
    make: 'Toyota',
    model: 'RAV4 Hybrid',
    year: '2019',
    price: '3650000',
    mileage: '54000',
    status: 'Available',
    image: 'https://images.unsplash.com/photo-1568844293986-8d0400bd4745?w=800&q=80',
    description: 'Clean unit with verified inspection report, full service history, and duty-paid Nairobi clearance.',
  },
  {
    id: 'veh-forester-2018',
    make: 'Subaru',
    model: 'Forester XT',
    year: '2018',
    price: '2850000',
    mileage: '68000',
    status: 'Available',
    image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&q=80',
    description: 'AWD SUV ideal for upcountry and highway travel. Available for immediate viewing in Nairobi.',
  },
  {
    id: 'veh-cx5-2020',
    make: 'Mazda',
    model: 'CX-5 Touring',
    year: '2020',
    price: '3200000',
    mileage: '42000',
    status: 'Reserved',
    image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80',
    description: 'Sourced directly via our import desk with full port clearance and inspection verification.',
  },
];

export function cleanStr(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

export function safeImageUrl(value: unknown): string {
  const raw = cleanStr(value, 500);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

export function formatWaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    return '254' + digits.slice(1);
  }
  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) {
    return '254' + digits;
  }
  if (digits.startsWith('254')) return digits;
  return digits || WHATSAPP_NUMBER;
}

export function nowEatLabel(): string {
  return (
    'Today, ' +
    new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) +
    ' EAT'
  ).slice(0, 60);
}

function generateCode(prefix: string): string {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const num = 1000 + (((bytes[0] << 8) | bytes[1]) % 9000);
  return `${prefix}${num}`;
}

export function buildCustomerQuoteWhatsAppUrl(q: QuoteRecord): string {
  const waText = [
    `Hi ${q.name}, regarding your Nuru Logistics quote request (${q.quoteRef}) for ${q.service}:`,
    q.quotedPriceKes > 0 ? `Quoted Price: Ksh ${q.quotedPriceKes.toLocaleString()}` : '',
    q.staffNote ? q.staffNote : 'We are reviewing your request.',
  ]
    .filter(Boolean)
    .join(' ');
  return `https://wa.me/${formatWaPhone(q.phone)}?text=${encodeURIComponent(waText)}`;
}

/* ---------- Quote Calculator ---------- */
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  Nairobi: { lat: -1.2921, lon: 36.8219 },
  Mombasa: { lat: -4.0435, lon: 39.6682 },
  Kisumu: { lat: -0.0917, lon: 34.768 },
  Nakuru: { lat: -0.3031, lon: 36.08 },
  Eldoret: { lat: 0.5143, lon: 35.2698 },
  Chuka: { lat: -0.3333, lon: 37.65 },
  Meru: { lat: 0.0463, lon: 37.6559 },
};

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function calculateLocalEstimate(
  from: string,
  to: string,
  weightInput: number,
  speed: string
): QuoteEstimate {
  const weightKg = Math.max(1, Math.min(50000, Number.isFinite(weightInput) ? weightInput : 10));
  const isExpress = speed === 'Express';
  const fromKey = Object.keys(CITY_COORDS).find((c) => c.toLowerCase() === from.trim().toLowerCase());
  const toKey = Object.keys(CITY_COORDS).find((c) => c.toLowerCase() === to.trim().toLowerCase());

  if (from.includes('China') || from.includes('Dubai') || to.includes('China') || to.includes('Dubai')) {
    const base = 6500;
    const ratePerKg = isExpress ? 1450 : 950;
    const estimatedPriceKes = Math.round(base + weightKg * ratePerKg);
    return {
      from,
      to,
      weightKg,
      speed: isExpress ? 'Express Air Freight' : 'Standard Cargo',
      estimatedPriceKes,
      eta: isExpress ? '4-7 business days' : '12-21 business days (sea/consolidated)',
      corridor: 'International Import/Export Corridor',
    };
  }

  const origin = fromKey ? CITY_COORDS[fromKey] : CITY_COORDS.Nairobi;
  const dest = toKey ? CITY_COORDS[toKey] : CITY_COORDS.Mombasa;
  const sameCity = (fromKey || from) === (toKey || to);
  const distanceKm = sameCity ? 15 : Math.round(haversineKm(origin, dest) * 1.25);

  const baseFee = sameCity ? 250 : distanceKm < 180 ? 450 : 650;
  const perKgRate = sameCity ? 45 : distanceKm < 180 ? 70 : 95;
  const expressMultiplier = isExpress ? 1.35 : 1;
  const estimatedPriceKes = Math.round((baseFee + weightKg * perKgRate) * expressMultiplier);

  let eta = '1-2 business days';
  if (sameCity) {
    eta = isExpress ? 'Same day (2-4 hours)' : 'Same day / Next day';
  } else if (distanceKm < 220) {
    eta = isExpress ? 'Next morning' : '1 business day';
  } else {
    eta = isExpress ? '1 business day (priority)' : '1-3 business days';
  }

  return {
    from: fromKey || from,
    to: toKey || to,
    weightKg,
    speed: isExpress ? 'Express' : 'Standard',
    distanceKm,
    estimatedPriceKes,
    eta,
    corridor: sameCity ? `${fromKey || from} Intra-City` : `${fromKey || from} → ${toKey || to} Corridor`,
  };
}

/* ---------- Admin Check & Initial Seed ---------- */
export async function checkUserIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email === PRIMARY_OWNER_EMAIL) return true;
  const path = `admins/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function seedInitialCatalogForAdmin(): Promise<void> {
  try {
    const vehQuery = query(
      collection(db, 'vehicles'),
      where('status', 'in', ['Available', 'Reserved', 'Sold'])
    );
    const vehSnap = await getDocs(vehQuery);
    if (vehSnap.empty) {
      const batch = writeBatch(db);
      for (const v of DEFAULT_VEHICLES) {
        batch.set(doc(db, 'vehicles', v.id), {
          id: v.id,
          make: v.make,
          model: v.model,
          year: v.year,
          price: v.price,
          mileage: v.mileage,
          status: v.status,
          image: v.image,
          description: v.description,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    for (const s of DEFAULT_SHIPMENTS) {
      const ref = doc(db, 'shipments', s.trackingNumber);
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        await setDoc(ref, {
          trackingNumber: s.trackingNumber,
          bookingRef: s.bookingRef,
          approved: s.approved,
          service: s.service,
          from: s.from,
          to: s.to,
          weightKg: s.weightKg,
          estimatedPriceKes: s.estimatedPriceKes,
          status: s.status,
          statusDetail: s.statusDetail,
          eta: s.eta,
          updatedAtLabel: s.updatedAtLabel,
          milestones: s.milestones,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'vehicles|shipments');
  }
}

/* ---------- Vehicles Subscription & CRUD ---------- */
export function subscribeToVehicles(
  onData: (vehicles: Vehicle[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'vehicles';
  const q = query(
    collection(db, path),
    where('status', 'in', ['Available', 'Reserved', 'Sold'])
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Vehicle[] = snapshot.docs.map((d) => d.data() as Vehicle);
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function saveVehicleToFirestore(input: {
  id?: string | null;
  make: string;
  model: string;
  year: string;
  price: string;
  mileage: string;
  status: VehicleStatus;
  image: string;
  description: string;
}): Promise<void> {
  const make = cleanStr(input.make, 60);
  const model = cleanStr(input.model, 80);
  const yearNum = Number(input.year);
  const priceNum = Number(input.price);
  const mileageNum = input.mileage.trim() !== '' ? Number(input.mileage) : NaN;

  const year =
    Number.isFinite(yearNum) && yearNum >= 1950 && yearNum <= 2100 ? String(Math.round(yearNum)) : '';
  const price =
    Number.isFinite(priceNum) && priceNum >= 0 ? String(Math.round(priceNum)) : '';
  const mileage =
    Number.isFinite(mileageNum) && mileageNum >= 0 ? String(Math.round(mileageNum)) : '';

  if (!make || !model || !year || !price) {
    throw new Error('Valid make, model, year (1950-2100), and non-negative price are required.');
  }

  const status: VehicleStatus =
    input.status === 'Reserved' || input.status === 'Sold' ? input.status : 'Available';
  const image = safeImageUrl(input.image);
  const description = cleanStr(input.description, 500);
  const vehicleId = input.id ? cleanStr(input.id, 80) : `veh-${Date.now()}`;
  const path = `vehicles/${vehicleId}`;

  try {
    if (input.id) {
      await updateDoc(doc(db, 'vehicles', vehicleId), {
        make,
        model,
        year,
        price,
        mileage,
        status,
        image,
        description,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'vehicles', vehicleId), {
        id: vehicleId,
        make,
        model,
        year,
        price,
        mileage,
        status,
        image,
        description,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, input.id ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteVehicleFromFirestore(id: string): Promise<void> {
  const vehicleId = cleanStr(id, 80);
  const path = `vehicles/${vehicleId}`;
  try {
    await deleteDoc(doc(db, 'vehicles', vehicleId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/* ---------- Public Tracking & Customer Intake ---------- */
export async function trackShipmentByCode(rawCode: string): Promise<Shipment | null> {
  const code = cleanStr(rawCode, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!code) return null;
  const path = `shipments/${code}`;
  try {
    const snap = await getDoc(doc(db, 'shipments', code));
    if (snap.exists()) {
      return snap.data() as Shipment;
    }
    const fallback = DEFAULT_SHIPMENTS.find((s) => s.trackingNumber === code);
    return fallback || null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error || '');
    const errCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
    if (msg.includes('client is offline') || errCode === 'unavailable') {
      const fallback = DEFAULT_SHIPMENTS.find((s) => s.trackingNumber === code);
      if (fallback) return fallback;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createCustomerQuote(input: {
  name: string;
  phone: string;
  service: string;
  from: string;
  to: string;
  notes: string;
  estimatedPriceKes?: number;
}): Promise<{ quoteRef: string; whatsappUrl: string }> {
  const name = cleanStr(input.name, 120);
  const phone = cleanStr(input.phone, 40);
  const service = cleanStr(input.service, 100);
  const from = cleanStr(input.from, 120);
  const to = cleanStr(input.to, 120);
  const notes = cleanStr(input.notes, 600);
  const estRaw = Number(input.estimatedPriceKes);
  const estimatedPriceKes = Number.isFinite(estRaw) && estRaw > 0 ? Math.round(estRaw) : 0;

  if (!name || phone.length < 3 || !service) {
    throw new Error('Please provide your name, phone number, and service needed.');
  }

  const quoteRef = generateCode('QT-');
  const authorUid =
    auth.currentUser && auth.currentUser.emailVerified ? auth.currentUser.uid : '';
  const path = `quotes/${quoteRef}`;

  const payload: QuoteRecord = {
    quoteRef,
    authorUid,
    name,
    phone,
    service,
    from,
    to,
    notes,
    estimatedPriceKes,
    quotedPriceKes: 0,
    staffNote: '',
    status: 'Pending Approval',
    convertedTrackingNumber: '',
  };

  try {
    await setDoc(doc(db, 'quotes', quoteRef), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  const waLines = [
    `Hi Nuru Logistics, I requested a quote (Ref: ${quoteRef}).`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Service: ${service}`,
  ];
  if (from) waLines.push(`From: ${from}`);
  if (to) waLines.push(`To: ${to}`);
  if (estimatedPriceKes > 0) waLines.push(`Calculator Estimate: Ksh ${estimatedPriceKes.toLocaleString()}`);
  if (notes) waLines.push(`Details: ${notes}`);

  return {
    quoteRef,
    whatsappUrl: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waLines.join('\n'))}`,
  };
}

export async function createCustomerBooking(input: {
  name: string;
  phone: string;
  service: string;
  date: string;
  time: string;
  pickup: string;
  delivery: string;
  notes: string;
  weightKg?: number;
  estimatedPriceKes?: number;
}): Promise<{ bookingRef: string; trackingNumber: string; whatsappUrl: string }> {
  const name = cleanStr(input.name, 120);
  const phone = cleanStr(input.phone, 40);
  const service = cleanStr(input.service, 100);
  const date = cleanStr(input.date, 30);
  const time = cleanStr(input.time, 30);
  const pickup = cleanStr(input.pickup, 160);
  const delivery = cleanStr(input.delivery, 160);
  const notes = cleanStr(input.notes, 500);
  const weightRaw = Number(input.weightKg);
  const estRaw = Number(input.estimatedPriceKes);
  const weightKg = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 0;
  const estimatedPriceKes = Number.isFinite(estRaw) && estRaw > 0 ? Math.round(estRaw) : 0;

  if (!name || phone.length < 3 || !service || !date || !time || !pickup || !delivery) {
    throw new Error('Please complete all required booking fields.');
  }

  const trackingNumber = generateCode('NURU');
  const bookingRef = generateCode('BK-');
  const updatedAtLabel = nowEatLabel();
  const authorUid =
    auth.currentUser && auth.currentUser.emailVerified ? auth.currentUser.uid : '';

  const shipmentPayload: Shipment = {
    trackingNumber,
    bookingRef,
    approved: false,
    service,
    from: pickup,
    to: delivery,
    weightKg,
    estimatedPriceKes,
    status: 'Pending Approval',
    statusDetail: `Booking ${bookingRef} submitted for ${date} at ${time} (${pickup} → ${delivery}). Waiting for staff approval before dispatch begins.`.slice(
      0,
      400
    ),
    eta: 'Awaiting staff approval',
    updatedAtLabel,
    milestones: [
      { label: 'Booking Submitted (Awaiting Approval)', location: pickup, time: updatedAtLabel, done: false },
      { label: 'Order Approved & Received', location: 'Dispatch Desk', time: 'Pending approval', done: false },
      { label: 'In Transit', location: `${pickup} → ${delivery}`, time: 'Pending', done: false },
      { label: 'Delivered', location: delivery, time: 'Pending', done: false },
    ],
  };

  const bookingPayload: BookingRecord = {
    bookingRef,
    trackingNumber,
    authorUid,
    name,
    phone,
    service,
    date,
    time,
    pickup,
    delivery,
    notes,
    estimatedPriceKes,
    status: 'Pending Approval',
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'shipments', trackingNumber), {
      ...shipmentPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'bookings', bookingRef), {
      ...bookingPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `bookings/${bookingRef}+shipments/${trackingNumber}`);
  }

  const waLines = [
    `Hi Nuru Logistics, I submitted a pickup booking for approval (Ref: ${bookingRef} | Tracking: ${trackingNumber}).`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Service: ${service}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Pickup: ${pickup}`,
    `Delivery: ${delivery}`,
  ];
  if (estimatedPriceKes > 0) waLines.push(`Calculator Estimate: Ksh ${estimatedPriceKes.toLocaleString()}`);
  if (notes) waLines.push(`Notes: ${notes}`);

  return {
    bookingRef,
    trackingNumber,
    whatsappUrl: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waLines.join('\n'))}`,
  };
}

/* ---------- Admin Operations Listeners & Mutations ---------- */
export function subscribeAdminQuotes(
  onData: (quotes: QuoteRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'quotes'),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as QuoteRecord);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'quotes');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeAdminBookings(
  onData: (bookings: BookingRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'bookings'),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as BookingRecord);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'bookings');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeAdminShipments(
  onData: (shipments: Shipment[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'shipments'),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as Shipment);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'shipments');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function updateQuoteAdmin(
  quoteRef: string,
  updates: { status: QuoteStatus; quotedPriceKes: number; staffNote: string }
): Promise<void> {
  const path = `quotes/${quoteRef}`;
  try {
    await updateDoc(doc(db, 'quotes', quoteRef), {
      status: updates.status,
      quotedPriceKes: Math.max(0, Math.round(updates.quotedPriceKes || 0)),
      staffNote: cleanStr(updates.staffNote, 400),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function convertQuoteToShipmentAdmin(q: QuoteRecord): Promise<string> {
  if (q.convertedTrackingNumber) return q.convertedTrackingNumber;

  const trackingNumber = generateCode('NURU');
  const bookingRef = generateCode('BK-');
  const updatedAtLabel = nowEatLabel();
  const from = q.from || 'Nairobi';
  const to = q.to || 'Destination TBD';
  const agreedPrice = q.quotedPriceKes > 0 ? q.quotedPriceKes : q.estimatedPriceKes || 0;

  const shipmentPayload: Shipment = {
    trackingNumber,
    bookingRef,
    approved: true,
    service: q.service,
    from,
    to,
    weightKg: 0,
    estimatedPriceKes: agreedPrice,
    status: 'Order Received',
    statusDetail: `Quote ${q.quoteRef} approved by staff. Dispatch team is coordinating pickup from ${from}.`.slice(
      0,
      400
    ),
    eta: '1-3 business days',
    updatedAtLabel,
    milestones: [
      { label: `Quote Approved (${q.quoteRef})`, location: from, time: updatedAtLabel, done: true },
      { label: 'Pickup & Dispatch', location: from, time: 'Scheduled', done: false },
      { label: 'In Transit', location: `${from} → ${to}`, time: 'Pending', done: false },
      { label: 'Delivered', location: to, time: 'Pending', done: false },
    ],
  };

  const bookingPayload: BookingRecord = {
    bookingRef,
    trackingNumber,
    authorUid: q.authorUid || '',
    name: q.name,
    phone: q.phone,
    service: q.service,
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    pickup: from,
    delivery: to,
    notes: cleanStr(q.staffNote || q.notes || `Converted from ${q.quoteRef}`, 500),
    estimatedPriceKes: agreedPrice,
    status: 'Approved',
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'shipments', trackingNumber), {
      ...shipmentPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'bookings', bookingRef), {
      ...bookingPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'quotes', q.quoteRef), {
      status: 'Converted',
      convertedTrackingNumber: trackingNumber,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `quotes/${q.quoteRef}/convert`);
  }

  return trackingNumber;
}

export async function approveBookingAdmin(booking: BookingRecord): Promise<void> {
  const timeLabel = nowEatLabel();
  const milestones: Milestone[] = [
    { label: 'Booking Submitted', location: booking.pickup, time: timeLabel, done: true },
    { label: 'Order Approved & Received', location: 'Dispatch Desk', time: timeLabel, done: true },
    {
      label: 'Driver Pickup Scheduled',
      location: `${booking.pickup} (${booking.date} ${booking.time})`,
      time: 'Upcoming',
      done: false,
    },
    { label: 'In Transit', location: `${booking.pickup} → ${booking.delivery}`, time: 'Pending', done: false },
    { label: 'Delivered', location: booking.delivery, time: 'Pending', done: false },
  ];

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'bookings', booking.bookingRef), {
      status: 'Approved',
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'shipments', booking.trackingNumber), {
      approved: true,
      status: 'Order Received',
      updatedAtLabel: timeLabel,
      eta: `Scheduled pickup: ${booking.date} (${booking.time})`.slice(0, 80),
      statusDetail: `Booking ${booking.bookingRef} approved by staff. Driver pickup scheduled for ${booking.date} at ${booking.time}.`.slice(
        0,
        400
      ),
      milestones,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.bookingRef}/approve`);
  }
}

export async function declineBookingAdmin(booking: BookingRecord, reason?: string): Promise<void> {
  const timeLabel = nowEatLabel();
  const milestones: Milestone[] = [
    { label: 'Booking Submitted', location: booking.pickup, time: timeLabel, done: true },
    { label: 'Booking Declined', location: 'Dispatch Desk', time: timeLabel, done: false },
  ];

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'bookings', booking.bookingRef), {
      status: 'Declined',
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'shipments', booking.trackingNumber), {
      approved: false,
      status: 'Declined',
      updatedAtLabel: timeLabel,
      eta: 'Cancelled',
      statusDetail: cleanStr(reason || `Booking ${booking.bookingRef} was declined by staff.`, 400),
      milestones,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `bookings/${booking.bookingRef}/decline`);
  }
}

const STAGE_ORDER: Record<string, number> = {
  'Order Received': 1,
  'Picked Up': 2,
  'In Transit': 3,
  'Customs Clearance': 4,
  'Out for Delivery': 5,
  Delivered: 6,
};

function getMilestoneStage(label: string): number {
  const lower = label.toLowerCase();
  if (
    lower.includes('quote approved') ||
    lower.includes('order received') ||
    lower.includes('order approved') ||
    lower.includes('booking submitted') ||
    lower.includes('supplier dispatch')
  ) {
    return 1;
  }
  if (lower.includes('picked up') || lower.includes('pickup') || lower.includes('port arrival')) return 2;
  if (lower.includes('in transit') || lower.includes('dispatched')) return 3;
  if (lower.includes('customs')) return 4;
  if (lower.includes('out for delivery') || lower.includes('arrived local hub')) return 5;
  if (lower.includes('delivered') || lower.includes('final door delivery')) return 6;
  return 0;
}

export async function updateShipmentMilestoneAdmin(
  shipment: Shipment,
  input: { status: ShipmentStatus; location: string; eta: string; statusDetail: string }
): Promise<void> {
  if (!shipment.approved) {
    throw new Error('This shipment is awaiting staff approval. Approve the booking before updating transit status.');
  }

  const nextStatus = input.status;
  const location = cleanStr(input.location, 120) || shipment.to;
  const timeLabel = nowEatLabel();
  const nextEta =
    cleanStr(input.eta, 80) || (nextStatus === 'Delivered' ? 'Delivered' : shipment.eta);
  const nextDetail =
    cleanStr(input.statusDetail, 400) || `Status updated to ${nextStatus} at ${location}.`;

  const milestones: Milestone[] = shipment.milestones.map((m) => ({ ...m }));
  const targetStage = STAGE_ORDER[nextStatus] || 0;
  let matchedIdx = milestones.findIndex((m) => m.label.toLowerCase() === nextStatus.toLowerCase());
  if (matchedIdx < 0 && targetStage > 0) {
    matchedIdx = milestones.findIndex((m) => getMilestoneStage(m.label) === targetStage);
  }

  if (matchedIdx >= 0) {
    milestones[matchedIdx].label = nextStatus;
    milestones[matchedIdx].location = location;
    milestones[matchedIdx].time = timeLabel;
    milestones.forEach((m, idx) => {
      if (idx <= matchedIdx) {
        m.done = true;
      } else {
        m.done = false;
        if (m.time !== 'Pending' && m.time !== 'Upcoming' && m.time !== 'Scheduled') {
          m.time = 'Pending';
        }
      }
    });
  } else {
    const insertIdx = milestones.findIndex((m) => getMilestoneStage(m.label) > targetStage);
    const newMilestone: Milestone = {
      label: nextStatus,
      location,
      time: timeLabel,
      done: true,
    };
    const finalIdx = insertIdx >= 0 ? insertIdx : milestones.length;
    milestones.splice(finalIdx, 0, newMilestone);
    milestones.forEach((m, idx) => {
      m.done = idx <= finalIdx;
    });
  }

  const path = `shipments/${shipment.trackingNumber}`;
  try {
    await updateDoc(doc(db, 'shipments', shipment.trackingNumber), {
      approved: true,
      status: nextStatus,
      statusDetail: nextDetail,
      eta: nextEta,
      updatedAtLabel: timeLabel,
      milestones: milestones.slice(0, 12),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* ---------- Staff Security Vault (/staff_security/portal) & Admins Registry ---------- */
const SECURITY_DOC_PATH = 'staff_security/portal';

export async function getStaffSecurityDoc(): Promise<StaffSecurityDoc | null> {
  try {
    const snap = await getDoc(doc(db, 'staff_security', 'portal'));
    return snap.exists() ? (snap.data() as StaffSecurityDoc) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, SECURITY_DOC_PATH);
  }
}

export async function setupStaffPasscodeInFirestore(password: string): Promise<string[]> {
  if (!auth.currentUser) throw new Error('Sign in required.');
  if (password.length < 6 || password.length > 128) {
    throw new Error('Staff passcode must be between 6 and 128 characters.');
  }
  const passwordHash = await hashSecret(password);
  const { plaintext, hashes } = await generateRecoveryCodeSet();
  try {
    await setDoc(doc(db, 'staff_security', 'portal'), {
      passwordHash,
      recoveryCodeHashes: hashes,
      updatedBy: auth.currentUser.uid,
      updatedAt: serverTimestamp(),
    });
    return plaintext;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, SECURITY_DOC_PATH);
  }
}

export async function changeStaffPasscodeInFirestore(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in required.');
  if (newPassword.length < 6 || newPassword.length > 128) {
    throw new Error('New passcode must be between 6 and 128 characters.');
  }
  const existingDoc = await getStaffSecurityDoc();
  if (!existingDoc) {
    throw new Error('No staff passcode configured yet.');
  }
  const ok = await verifySecret(currentPassword, existingDoc.passwordHash);
  if (!ok) {
    throw new Error('Current passcode is incorrect.');
  }
  const nextHash = await hashSecret(newPassword);
  try {
    await updateDoc(doc(db, 'staff_security', 'portal'), {
      passwordHash: nextHash,
      recoveryCodeHashes: existingDoc.recoveryCodeHashes,
      updatedBy: auth.currentUser.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, SECURITY_DOC_PATH);
  }
}

export async function recoverStaffPasscodeWithCodeInFirestore(
  recoveryCodeInput: string,
  newPassword: string
): Promise<number> {
  if (!auth.currentUser) throw new Error('Sign in required.');
  if (newPassword.length < 6 || newPassword.length > 128) {
    throw new Error('New passcode must be between 6 and 128 characters.');
  }
  const normalized = recoveryCodeInput.trim().toUpperCase();
  const existingDoc = await getStaffSecurityDoc();
  if (!existingDoc || !existingDoc.recoveryCodeHashes.length) {
    throw new Error('No unused recovery codes found.');
  }

  let matchIndex = -1;
  for (let i = 0; i < existingDoc.recoveryCodeHashes.length; i++) {
    if (await verifySecret(normalized, existingDoc.recoveryCodeHashes[i])) {
      matchIndex = i;
      break;
    }
  }
  if (matchIndex < 0) {
    throw new Error('Invalid or already-used recovery code.');
  }

  const remainingHashes = existingDoc.recoveryCodeHashes.filter((_, idx) => idx !== matchIndex);
  const nextHash = await hashSecret(newPassword);

  try {
    await updateDoc(doc(db, 'staff_security', 'portal'), {
      passwordHash: nextHash,
      recoveryCodeHashes: remainingHashes,
      updatedBy: auth.currentUser.uid,
      updatedAt: serverTimestamp(),
    });
    return remainingHashes.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, SECURITY_DOC_PATH);
  }
}

export async function regenerateStaffRecoveryCodesInFirestore(
  currentPassword: string
): Promise<string[]> {
  if (!auth.currentUser) throw new Error('Sign in required.');
  const existingDoc = await getStaffSecurityDoc();
  if (!existingDoc) {
    throw new Error('Set a staff passcode first.');
  }
  const ok = await verifySecret(currentPassword, existingDoc.passwordHash);
  if (!ok) {
    throw new Error('Current passcode is incorrect.');
  }
  const { plaintext, hashes } = await generateRecoveryCodeSet();
  try {
    await updateDoc(doc(db, 'staff_security', 'portal'), {
      passwordHash: existingDoc.passwordHash,
      recoveryCodeHashes: hashes,
      updatedBy: auth.currentUser.uid,
      updatedAt: serverTimestamp(),
    });
    return plaintext;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, SECURITY_DOC_PATH);
  }
}

export async function listStaffAdmins(): Promise<AdminUserRecord[]> {
  const path = 'admins';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => d.data() as AdminUserRecord);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function addStaffAdmin(uidInput: string, emailInput: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in required.');
  const uid = cleanStr(uidInput, 128);
  const email = cleanStr(emailInput, 200);
  if (!uid || !/^[a-zA-Z0-9_-]+$/.test(uid)) {
    throw new Error('Valid Firebase UID is required.');
  }
  if (!email || !email.includes('@')) {
    throw new Error('Valid email address is required.');
  }
  const path = `admins/${uid}`;
  try {
    await setDoc(doc(db, 'admins', uid), {
      uid,
      email,
      addedBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeStaffAdmin(uid: string): Promise<void> {
  const path = `admins/${uid}`;
  try {
    await deleteDoc(doc(db, 'admins', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
