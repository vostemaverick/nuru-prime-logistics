import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const WHATSAPP_NUMBER = '254116216899';

const distDir = path.resolve(__dirname, 'dist');
const publicDir = path.resolve(__dirname, 'public');
const dataDir = path.resolve(__dirname, '.data');
const dataFile = path.join(dataDir, 'store.json');

const staticDir =
  process.env.NODE_ENV === 'production' && fs.existsSync(path.join(distDir, 'index.html'))
    ? distDir
    : publicDir;

interface Milestone {
  label: string;
  location: string;
  time: string;
  done: boolean;
}

interface Shipment {
  trackingNumber: string;
  bookingRef?: string;
  approved: boolean;
  service: string;
  from: string;
  to: string;
  weightKg?: number;
  estimatedPriceKes?: number;
  status: string;
  statusDetail: string;
  eta: string;
  updatedAt: string;
  milestones: Milestone[];
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: string;
  price: string;
  mileage: string;
  status: 'Available' | 'Reserved' | 'Sold';
  image: string;
  description: string;
}

interface QuoteRecord {
  quoteRef: string;
  name: string;
  phone: string;
  service: string;
  from: string;
  to: string;
  notes: string;
  estimatedPriceKes?: number;
  quotedPriceKes?: number;
  staffNote?: string;
  status: 'Pending Approval' | 'Quoted' | 'Approved' | 'Converted' | 'Closed';
  convertedTrackingNumber?: string;
  createdAt: string;
}

interface BookingRecord {
  bookingRef: string;
  trackingNumber: string;
  name: string;
  phone: string;
  service: string;
  date: string;
  time: string;
  pickup: string;
  delivery: string;
  notes: string;
  estimatedPriceKes?: number;
  status: 'Pending Approval' | 'Approved' | 'Declined';
  createdAt: string;
}

interface StoreData {
  adminPasswordHash?: string;
  recoveryCodeHashes?: string[];
  shipments: Shipment[];
  vehicles: Vehicle[];
  quotes: QuoteRecord[];
  bookings: BookingRecord[];
}

const DEFAULT_SHIPMENTS: Shipment[] = [
  {
    trackingNumber: 'NURU123',
    approved: true,
    service: 'Logistics and Shipping',
    from: 'Nairobi',
    to: 'Mombasa',
    weightKg: 18,
    estimatedPriceKes: 2450,
    status: 'In Transit',
    statusDetail: 'Parcel cleared Nairobi dispatch hub and is en route along the Mombasa corridor.',
    eta: '1-2 business days',
    updatedAt: 'Today, 09:40 EAT',
    milestones: [
      { label: 'Order Received', location: 'Nairobi Hub', time: 'Yesterday, 14:15 EAT', done: true },
      { label: 'Picked Up & Inspected', location: 'Westlands, Nairobi', time: 'Yesterday, 17:05 EAT', done: true },
      { label: 'In Transit', location: 'Mtito Andei Corridor', time: 'Today, 09:40 EAT', done: true },
      { label: 'Out for Delivery', location: 'Mombasa Hub', time: 'Pending', done: false },
    ],
  },
  {
    trackingNumber: 'NURU456',
    approved: true,
    service: 'Import and Export Support',
    from: 'Dubai (Jebel Ali)',
    to: 'Nairobi ICD',
    weightKg: 120,
    estimatedPriceKes: 48500,
    status: 'Customs Clearance',
    statusDetail: 'Import documentation lodged with customs; inspection and release in progress.',
    eta: '2-3 business days',
    updatedAt: 'Today, 11:10 EAT',
    milestones: [
      { label: 'Supplier Dispatch', location: 'Dubai, UAE', time: '5 days ago', done: true },
      { label: 'Port Arrival', location: 'Mombasa Port', time: '2 days ago', done: true },
      { label: 'Customs Clearance', location: 'Nairobi ICD', time: 'Today, 11:10 EAT', done: true },
      { label: 'Final Door Delivery', location: 'Nairobi CBD', time: 'Pending', done: false },
    ],
  },
  {
    trackingNumber: 'NURU789',
    approved: true,
    service: 'Supply of Goods',
    from: 'Nairobi',
    to: 'Chuka',
    weightKg: 45,
    estimatedPriceKes: 4100,
    status: 'Delivered',
    statusDetail: 'Shipment delivered and signed off at destination.',
    eta: 'Delivered',
    updatedAt: 'Yesterday, 16:20 EAT',
    milestones: [
      { label: 'Order Received', location: 'Nairobi Warehouse', time: '2 days ago, 08:30 EAT', done: true },
      { label: 'Dispatched', location: 'Thika Highway Hub', time: '2 days ago, 12:15 EAT', done: true },
      { label: 'Arrived Local Hub', location: 'Chuka Town', time: 'Yesterday, 10:00 EAT', done: true },
      { label: 'Delivered', location: 'Chuka Recipient', time: 'Yesterday, 16:20 EAT', done: true },
    ],
  },
];

const DEFAULT_VEHICLES: Vehicle[] = [
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

function createDefaultStore(): StoreData {
  return {
    shipments: [...DEFAULT_SHIPMENTS],
    vehicles: [...DEFAULT_VEHICLES],
    quotes: [],
    bookings: [],
  };
}

function loadStore(): StoreData {
  try {
    if (fs.existsSync(dataFile)) {
      const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf-8')) as Partial<StoreData>;
      const defaults = createDefaultStore();
      return {
        adminPasswordHash: typeof parsed.adminPasswordHash === 'string' ? parsed.adminPasswordHash : undefined,
        recoveryCodeHashes: Array.isArray(parsed.recoveryCodeHashes)
          ? parsed.recoveryCodeHashes.filter((h): h is string => typeof h === 'string')
          : [],
        shipments:
          Array.isArray(parsed.shipments) && parsed.shipments.length > 0
            ? parsed.shipments.map((s) => ({
                ...s,
                approved: typeof s.approved === 'boolean' ? s.approved : s.status !== 'Pending Approval' && s.status !== 'Declined',
              }))
            : defaults.shipments,
        vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : defaults.vehicles,
        quotes: Array.isArray(parsed.quotes)
          ? parsed.quotes.map((q) => ({ ...q, status: q.status || 'Pending Approval' }))
          : [],
        bookings: Array.isArray(parsed.bookings)
          ? parsed.bookings.map((b) => ({ ...b, status: b.status || 'Pending Approval' }))
          : [],
      };
    }
  } catch (err) {
    console.warn('Could not load persisted store, using defaults:', err);
  }
  return createDefaultStore();
}

const store: StoreData = loadStore();

function persistStore(): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist store to disk:', err);
  }
}

/* ---------- Admin Auth (scrypt + Bearer token in memory) ---------- */
const adminSessions = new Map<string, number>();
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const AUTH_WINDOW_MS = 1000 * 60 * 15;
const MAX_AUTH_FAILURES = 8;

function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    return true;
  }
  return entry.count < MAX_AUTH_FAILURES;
}

function recordAuthFailure(ip: string): void {
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearAuthFailures(ip: string): void {
  authAttempts.delete(ip);
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasswordHash(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function getEnvPasscode(): string {
  return typeof process.env.ADMIN_PASSCODE === 'string' ? process.env.ADMIN_PASSCODE.trim() : '';
}

function getEnvRecoveryKey(): string {
  return typeof process.env.ADMIN_RECOVERY_KEY === 'string' ? process.env.ADMIN_RECOVERY_KEY.trim() : '';
}

function verifyEnvSecret(candidate: string, expected: string): boolean {
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function verifyEnvPasscode(candidate: string): boolean {
  return verifyEnvSecret(candidate, getEnvPasscode());
}

function isAdminConfigured(): boolean {
  return Boolean(getEnvPasscode() || store.adminPasswordHash);
}

function generateRecoveryCodes(): { plaintext: string[]; hashes: string[] } {
  const plaintext: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < 6; i++) {
    const partA = crypto.randomBytes(2).toString('hex').toUpperCase();
    const partB = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `NR-${partA}-${partB}`;
    plaintext.push(code);
    hashes.push(hashPassword(code));
  }
  return { plaintext, hashes };
}

function issueSessionToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function invalidateOtherSessions(keepToken?: string): void {
  for (const key of Array.from(adminSessions.keys())) {
    if (key !== keepToken) {
      adminSessions.delete(key);
    }
  }
}

function extractBearerToken(req: Request): string {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return '';
  return auth.slice(7).trim();
}

function isSessionValid(token: string): boolean {
  if (!token) return false;
  const expiresAt = adminSessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!isSessionValid(token)) {
    res.status(401).json({ error: 'Staff authentication required.' });
    return;
  }
  next();
}

/* ---------- Helpers ---------- */
const CITY_COORDS: Record<string, { zone: string; lat: number; lon: number }> = {
  Nairobi: { zone: 'Central Hub', lat: -1.2921, lon: 36.8219 },
  Mombasa: { zone: 'Coastal Hub', lat: -4.0435, lon: 39.6682 },
  Kisumu: { zone: 'Western Hub', lat: -0.0917, lon: 34.768 },
  Nakuru: { zone: 'Rift Hub', lat: -0.3031, lon: 36.08 },
  Eldoret: { zone: 'North Rift Hub', lat: 0.5143, lon: 35.2698 },
  Chuka: { zone: 'Mt. Kenya East', lat: -0.3333, lon: 37.65 },
  Meru: { zone: 'Mt. Kenya North', lat: 0.0463, lon: 37.6559 },
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

function calculateQuoteBreakdown(from: string, to: string, weightInput: number, speed: string) {
  const weightKg = Math.max(1, Math.min(50000, Number.isFinite(weightInput) ? weightInput : 10));
  const isExpress = speed === 'Express';
  const fromKey = Object.keys(CITY_COORDS).find((c) => c.toLowerCase() === from.trim().toLowerCase());
  const toKey = Object.keys(CITY_COORDS).find((c) => c.toLowerCase() === to.trim().toLowerCase());

  if (from.includes('China') || from.includes('Dubai') || to.includes('China') || to.includes('Dubai')) {
    const base = 6500;
    const ratePerKg = isExpress ? 1450 : 950;
    const total = Math.round(base + weightKg * ratePerKg);
    return {
      from,
      to,
      weightKg,
      speed: isExpress ? 'Express Air Freight' : 'Standard Cargo',
      estimatedPriceKes: total,
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

function cleanStr(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function safeImageUrl(value: unknown): string {
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

function generateCode(prefix: string): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${num}`;
}

function nowEatLabel(): string {
  return 'Today, ' + new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) + ' EAT';
}

function formatWaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    return '254' + digits.slice(1);
  }
  if (digits.startsWith('254')) return digits;
  return digits || WHATSAPP_NUMBER;
}

app.use(express.json({ limit: '1mb' }));

/* ---------- Public API Routes ---------- */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/calculate-quote', (req, res) => {
  const from = cleanStr(req.body?.from, 80) || 'Nairobi';
  const to = cleanStr(req.body?.to, 80) || 'Mombasa';
  const weight = Number(req.body?.weight);
  const speed = cleanStr(req.body?.speed, 30) === 'Express' ? 'Express' : 'Standard';
  res.json(calculateQuoteBreakdown(from, to, weight, speed));
});

app.get('/api/shipments', (_req, res) => {
  const recent = store.shipments.slice(0, 8).map((s) => ({
    trackingNumber: s.trackingNumber,
    service: s.service,
    from: s.from,
    to: s.to,
    status: s.status,
    approved: s.approved,
    eta: s.eta,
  }));
  res.json({ shipments: recent });
});

app.get('/api/shipments/:trackingNumber', (req, res) => {
  const code = cleanStr(req.params.trackingNumber, 40).toUpperCase();
  if (!code) {
    res.status(400).json({ error: 'Please enter a tracking number.' });
    return;
  }

  const found = store.shipments.find((item) => item.trackingNumber.toUpperCase() === code);
  if (!found) {
    res.status(404).json({
      error: `No shipment found for tracking number "${code}". Try NURU123, NURU456, NURU789, or book a pickup below to generate a tracking reference.`,
    });
    return;
  }

  res.json({ shipment: found });
});

app.post('/api/bookings', (req, res) => {
  const name = cleanStr(req.body?.name, 120);
  const phone = cleanStr(req.body?.phone, 40);
  const service = cleanStr(req.body?.service, 100);
  const date = cleanStr(req.body?.date, 30);
  const time = cleanStr(req.body?.time, 30);
  const pickup = cleanStr(req.body?.pickup, 160);
  const delivery = cleanStr(req.body?.delivery, 160);
  const notes = cleanStr(req.body?.notes, 500);
  const weightKgRaw = Number(req.body?.weightKg);
  const estimatedPriceRaw = Number(req.body?.estimatedPriceKes);

  if (!name || !phone || !service || !date || !time || !pickup || !delivery) {
    res.status(400).json({ error: 'Please complete all required booking fields.' });
    return;
  }

  let trackingNumber = generateCode('NURU');
  while (store.shipments.some((s) => s.trackingNumber === trackingNumber)) {
    trackingNumber = generateCode('NURU');
  }
  const bookingRef = generateCode('BK-');
  const updatedAt = nowEatLabel();

  const shipment: Shipment = {
    trackingNumber,
    bookingRef,
    approved: false,
    service,
    from: pickup,
    to: delivery,
    weightKg: Number.isFinite(weightKgRaw) && weightKgRaw > 0 ? weightKgRaw : undefined,
    estimatedPriceKes: Number.isFinite(estimatedPriceRaw) && estimatedPriceRaw > 0 ? estimatedPriceRaw : undefined,
    status: 'Pending Approval',
    statusDetail: `Booking ${bookingRef} submitted for ${date} at ${time} (${pickup} → ${delivery}). Waiting for staff approval before dispatch begins.`,
    eta: 'Awaiting staff approval',
    updatedAt,
    milestones: [
      { label: 'Booking Submitted (Awaiting Approval)', location: pickup, time: updatedAt, done: false },
      { label: 'Order Approved & Received', location: 'Dispatch Desk', time: 'Pending approval', done: false },
      { label: 'In Transit', location: `${pickup} → ${delivery}`, time: 'Pending', done: false },
      { label: 'Delivered', location: delivery, time: 'Pending', done: false },
    ],
  };

  const booking: BookingRecord = {
    bookingRef,
    trackingNumber,
    name,
    phone,
    service,
    date,
    time,
    pickup,
    delivery,
    notes,
    estimatedPriceKes: shipment.estimatedPriceKes,
    status: 'Pending Approval',
    createdAt: new Date().toISOString(),
  };

  store.shipments.unshift(shipment);
  store.bookings.unshift(booking);
  persistStore();

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
  if (shipment.estimatedPriceKes) {
    waLines.push(`Calculator Estimate: Ksh ${shipment.estimatedPriceKes.toLocaleString()}`);
  }
  if (notes) {
    waLines.push(`Notes: ${notes}`);
  }

  res.status(201).json({
    bookingRef,
    trackingNumber,
    shipment,
    whatsappUrl: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waLines.join('\n'))}`,
  });
});

app.post('/api/quotes', (req, res) => {
  const name = cleanStr(req.body?.name, 120);
  const phone = cleanStr(req.body?.phone, 40);
  const service = cleanStr(req.body?.service, 100);
  const from = cleanStr(req.body?.from, 120);
  const to = cleanStr(req.body?.to, 120);
  const notes = cleanStr(req.body?.notes, 600);
  const estimatedPriceRaw = Number(req.body?.estimatedPriceKes);

  if (!name || !phone || !service) {
    res.status(400).json({ error: 'Please provide your name, phone number, and service needed.' });
    return;
  }

  const quoteRef = generateCode('QT-');
  const record: QuoteRecord = {
    quoteRef,
    name,
    phone,
    service,
    from,
    to,
    notes,
    estimatedPriceKes: Number.isFinite(estimatedPriceRaw) && estimatedPriceRaw > 0 ? estimatedPriceRaw : undefined,
    status: 'Pending Approval',
    createdAt: new Date().toISOString(),
  };

  store.quotes.unshift(record);
  persistStore();

  const waLines = [
    `Hi Nuru Logistics, I requested a quote (Ref: ${quoteRef}).`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Service: ${service}`,
  ];
  if (from) waLines.push(`From: ${from}`);
  if (to) waLines.push(`To: ${to}`);
  if (record.estimatedPriceKes) waLines.push(`Calculator Estimate: Ksh ${record.estimatedPriceKes.toLocaleString()}`);
  if (notes) waLines.push(`Details: ${notes}`);

  res.status(201).json({
    quoteRef,
    quote: record,
    whatsappUrl: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waLines.join('\n'))}`,
  });
});

app.get('/api/vehicles', (_req, res) => {
  res.json({ vehicles: store.vehicles });
});

/* ---------- Admin Auth & Protected Operations Routes ---------- */
app.get('/api/admin/status', (req, res) => {
  const token = extractBearerToken(req);
  res.json({
    configured: isAdminConfigured(),
    envConfigured: Boolean(getEnvPasscode()),
    recoveryKeyConfigured: Boolean(getEnvRecoveryKey()),
    recoveryCodesRemaining: Array.isArray(store.recoveryCodeHashes) ? store.recoveryCodeHashes.length : 0,
    authenticated: isSessionValid(token),
  });
});

app.post('/api/admin/setup', (req, res) => {
  if (isAdminConfigured()) {
    res.status(409).json({ error: 'Admin access is already configured. Please sign in.' });
    return;
  }
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  if (password.length < 6 || password.length > 128) {
    res.status(400).json({ error: 'Please choose an admin password between 6 and 128 characters.' });
    return;
  }
  const { plaintext, hashes } = generateRecoveryCodes();
  store.adminPasswordHash = hashPassword(password);
  store.recoveryCodeHashes = hashes;
  persistStore();
  const token = issueSessionToken();
  res.status(201).json({
    token,
    configured: true,
    recoveryCodes: plaintext,
    recoveryCodesRemaining: hashes.length,
  });
});

app.post('/api/admin/login', (req, res) => {
  const clientIp = req.ip || 'local';
  if (!checkAuthRateLimit(clientIp)) {
    res.status(429).json({ error: 'Too many failed attempts. Please wait 15 minutes or use a recovery code.' });
    return;
  }

  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  if (!password) {
    res.status(400).json({ error: 'Password is required.' });
    return;
  }
  if (!isAdminConfigured()) {
    res.status(409).json({ error: 'Admin password has not been set up yet.' });
    return;
  }

  let valid = false;
  if (getEnvPasscode()) {
    valid = verifyEnvPasscode(password);
  } else if (store.adminPasswordHash) {
    valid = verifyPasswordHash(password, store.adminPasswordHash);
  }

  if (!valid) {
    recordAuthFailure(clientIp);
    res.status(401).json({ error: 'Invalid admin password.' });
    return;
  }

  clearAuthFailures(clientIp);
  const token = issueSessionToken();
  res.json({
    token,
    envConfigured: Boolean(getEnvPasscode()),
    recoveryCodesRemaining: Array.isArray(store.recoveryCodeHashes) ? store.recoveryCodeHashes.length : 0,
  });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  if (getEnvPasscode()) {
    res.status(400).json({
      error: 'Admin passcode is currently controlled by the ADMIN_PASSCODE secret. Update ADMIN_PASSCODE in Settings > Secrets.',
    });
    return;
  }

  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword.trim() : '';

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required.' });
    return;
  }
  if (newPassword.length < 6 || newPassword.length > 128) {
    res.status(400).json({ error: 'New password must be between 6 and 128 characters.' });
    return;
  }
  if (currentPassword === newPassword) {
    res.status(400).json({ error: 'New password must be different from your current password.' });
    return;
  }
  if (!store.adminPasswordHash || !verifyPasswordHash(currentPassword, store.adminPasswordHash)) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  store.adminPasswordHash = hashPassword(newPassword);
  persistStore();
  const nextToken = issueSessionToken();
  invalidateOtherSessions(nextToken);

  res.json({
    token: nextToken,
    message: 'Staff password updated successfully.',
  });
});

app.post('/api/admin/recover', (req, res) => {
  const clientIp = req.ip || 'local';
  if (!checkAuthRateLimit(clientIp)) {
    res.status(429).json({ error: 'Too many failed recovery attempts. Please wait 15 minutes before trying again.' });
    return;
  }

  if (getEnvPasscode()) {
    res.status(400).json({
      error: 'Admin passcode is currently controlled by the ADMIN_PASSCODE secret. Update ADMIN_PASSCODE in Settings > Secrets.',
    });
    return;
  }

  if (!store.adminPasswordHash) {
    res.status(409).json({ error: 'No admin password has been set up yet. Use the First-Run Admin Setup form.' });
    return;
  }

  const recoveryCode = typeof req.body?.recoveryCode === 'string' ? req.body.recoveryCode.trim().toUpperCase() : '';
  const rawRecoveryInput = typeof req.body?.recoveryCode === 'string' ? req.body.recoveryCode.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword.trim() : '';

  if (!rawRecoveryInput || !newPassword) {
    res.status(400).json({ error: 'Recovery code and new password are required.' });
    return;
  }
  if (newPassword.length < 6 || newPassword.length > 128) {
    res.status(400).json({ error: 'New password must be between 6 and 128 characters.' });
    return;
  }

  let matched = false;
  const envRecoveryKey = getEnvRecoveryKey();
  if (envRecoveryKey && verifyEnvSecret(rawRecoveryInput, envRecoveryKey)) {
    matched = true;
  }

  if (!matched && Array.isArray(store.recoveryCodeHashes) && store.recoveryCodeHashes.length > 0) {
    const idx = store.recoveryCodeHashes.findIndex((h) => verifyPasswordHash(recoveryCode, h));
    if (idx >= 0) {
      matched = true;
      store.recoveryCodeHashes.splice(idx, 1);
    }
  }

  if (!matched) {
    recordAuthFailure(clientIp);
    res.status(401).json({ error: 'Invalid or already-used recovery code.' });
    return;
  }

  clearAuthFailures(clientIp);
  store.adminPasswordHash = hashPassword(newPassword);
  persistStore();
  const token = issueSessionToken();
  invalidateOtherSessions(token);

  res.json({
    token,
    recoveryCodesRemaining: Array.isArray(store.recoveryCodeHashes) ? store.recoveryCodeHashes.length : 0,
    message: 'Password reset successfully.',
  });
});

app.post('/api/admin/recovery-codes/regenerate', requireAdmin, (req, res) => {
  if (getEnvPasscode()) {
    res.status(400).json({
      error: 'Admin passcode is managed via ADMIN_PASSCODE in Settings > Secrets.',
    });
    return;
  }

  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword.trim() : '';
  if (!currentPassword || !store.adminPasswordHash || !verifyPasswordHash(currentPassword, store.adminPasswordHash)) {
    res.status(401).json({ error: 'Please enter your current password to regenerate recovery codes.' });
    return;
  }

  const { plaintext, hashes } = generateRecoveryCodes();
  store.recoveryCodeHashes = hashes;
  persistStore();

  res.json({
    recoveryCodes: plaintext,
    recoveryCodesRemaining: hashes.length,
  });
});

app.post('/api/admin/logout', (req, res) => {
  const token = extractBearerToken(req);
  if (token) adminSessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const quotes = store.quotes.map((q) => {
    const waText = [
      `Hi ${q.name}, regarding your Nuru Logistics quote request (${q.quoteRef}) for ${q.service}:`,
      q.quotedPriceKes ? `Quoted Price: Ksh ${q.quotedPriceKes.toLocaleString()}` : '',
      q.staffNote ? q.staffNote : 'We are reviewing your request.',
    ]
      .filter(Boolean)
      .join(' ');
    return {
      ...q,
      customerWhatsappUrl: `https://wa.me/${formatWaPhone(q.phone)}?text=${encodeURIComponent(waText)}`,
    };
  });

  res.json({
    quotes,
    bookings: store.bookings,
    shipments: store.shipments,
    vehicles: store.vehicles,
    stats: {
      pendingQuotes: store.quotes.filter((q) => q.status === 'Pending Approval').length,
      pendingBookings: store.bookings.filter((b) => b.status === 'Pending Approval').length,
      activeShipments: store.shipments.filter((s) => s.approved && s.status !== 'Delivered').length,
      totalBookings: store.bookings.length,
      availableVehicles: store.vehicles.filter((v) => v.status === 'Available').length,
    },
  });
});

app.patch('/api/admin/quotes/:quoteRef', requireAdmin, (req, res) => {
  const quoteRef = cleanStr(req.params.quoteRef, 30).toUpperCase();
  const quote = store.quotes.find((q) => q.quoteRef.toUpperCase() === quoteRef);
  if (!quote) {
    res.status(404).json({ error: 'Quote request not found.' });
    return;
  }

  const rawStatus = cleanStr(req.body?.status, 30);
  if (
    rawStatus === 'Pending Approval' ||
    rawStatus === 'Quoted' ||
    rawStatus === 'Approved' ||
    rawStatus === 'Converted' ||
    rawStatus === 'Closed'
  ) {
    quote.status = rawStatus;
  }
  if (req.body?.quotedPriceKes !== undefined && req.body?.quotedPriceKes !== '') {
    const qp = Number(req.body.quotedPriceKes);
    if (Number.isFinite(qp) && qp >= 0) {
      quote.quotedPriceKes = Math.round(qp);
    }
  }
  if (typeof req.body?.staffNote === 'string') {
    quote.staffNote = cleanStr(req.body.staffNote, 400);
  }

  persistStore();
  res.json({ quote });
});

app.post('/api/admin/quotes/:quoteRef/convert', requireAdmin, (req, res) => {
  const quoteRef = cleanStr(req.params.quoteRef, 30).toUpperCase();
  const quote = store.quotes.find((q) => q.quoteRef.toUpperCase() === quoteRef);
  if (!quote) {
    res.status(404).json({ error: 'Quote request not found.' });
    return;
  }
  if (quote.convertedTrackingNumber) {
    res.json({ quote, trackingNumber: quote.convertedTrackingNumber });
    return;
  }

  let trackingNumber = generateCode('NURU');
  while (store.shipments.some((s) => s.trackingNumber === trackingNumber)) {
    trackingNumber = generateCode('NURU');
  }
  const bookingRef = generateCode('BK-');
  const updatedAt = nowEatLabel();
  const from = quote.from || 'Nairobi';
  const to = quote.to || 'Destination TBD';
  const agreedPrice = quote.quotedPriceKes ?? quote.estimatedPriceKes;

  const shipment: Shipment = {
    trackingNumber,
    bookingRef,
    approved: true,
    service: quote.service,
    from,
    to,
    estimatedPriceKes: agreedPrice,
    status: 'Order Received',
    statusDetail: `Quote ${quote.quoteRef} approved by staff. Dispatch team is coordinating pickup from ${from}.`,
    eta: '1-3 business days',
    updatedAt,
    milestones: [
      { label: `Quote Approved (${quote.quoteRef})`, location: from, time: updatedAt, done: true },
      { label: 'Pickup & Dispatch', location: from, time: 'Scheduled', done: false },
      { label: 'In Transit', location: `${from} → ${to}`, time: 'Pending', done: false },
      { label: 'Delivered', location: to, time: 'Pending', done: false },
    ],
  };

  const booking: BookingRecord = {
    bookingRef,
    trackingNumber,
    name: quote.name,
    phone: quote.phone,
    service: quote.service,
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    pickup: from,
    delivery: to,
    notes: quote.staffNote || quote.notes || `Converted from ${quote.quoteRef}`,
    estimatedPriceKes: agreedPrice,
    status: 'Approved',
    createdAt: new Date().toISOString(),
  };

  quote.status = 'Converted';
  quote.convertedTrackingNumber = trackingNumber;
  store.shipments.unshift(shipment);
  store.bookings.unshift(booking);
  persistStore();

  res.status(201).json({ quote, booking, shipment, trackingNumber });
});

app.post('/api/admin/bookings/:bookingRef/approve', requireAdmin, (req, res) => {
  const bookingRef = cleanStr(req.params.bookingRef, 30).toUpperCase();
  const booking = store.bookings.find((b) => b.bookingRef.toUpperCase() === bookingRef);
  if (!booking) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }

  const shipment = store.shipments.find((s) => s.trackingNumber === booking.trackingNumber);
  if (!shipment) {
    res.status(404).json({ error: 'Linked shipment not found.' });
    return;
  }

  const timeLabel = nowEatLabel();
  booking.status = 'Approved';
  shipment.approved = true;
  shipment.status = 'Order Received';
  shipment.updatedAt = timeLabel;
  shipment.eta = `Scheduled pickup: ${booking.date} (${booking.time})`;
  shipment.statusDetail = `Booking ${booking.bookingRef} approved by staff. Driver pickup scheduled for ${booking.date} at ${booking.time}.`;
  shipment.milestones = [
    { label: 'Booking Submitted', location: booking.pickup, time: timeLabel, done: true },
    { label: 'Order Approved & Received', location: 'Dispatch Desk', time: timeLabel, done: true },
    { label: 'Driver Pickup Scheduled', location: `${booking.pickup} (${booking.date} ${booking.time})`, time: 'Upcoming', done: false },
    { label: 'In Transit', location: `${booking.pickup} → ${booking.delivery}`, time: 'Pending', done: false },
    { label: 'Delivered', location: booking.delivery, time: 'Pending', done: false },
  ];

  persistStore();
  res.json({ booking, shipment });
});

app.post('/api/admin/bookings/:bookingRef/decline', requireAdmin, (req, res) => {
  const bookingRef = cleanStr(req.params.bookingRef, 30).toUpperCase();
  const booking = store.bookings.find((b) => b.bookingRef.toUpperCase() === bookingRef);
  if (!booking) {
    res.status(404).json({ error: 'Booking not found.' });
    return;
  }

  const shipment = store.shipments.find((s) => s.trackingNumber === booking.trackingNumber);
  const reason = cleanStr(req.body?.reason, 300);
  const timeLabel = nowEatLabel();

  booking.status = 'Declined';
  if (shipment) {
    shipment.approved = false;
    shipment.status = 'Declined';
    shipment.updatedAt = timeLabel;
    shipment.eta = 'Cancelled';
    shipment.statusDetail = reason || `Booking ${booking.bookingRef} was declined by staff.`;
    shipment.milestones = [
      { label: 'Booking Submitted', location: booking.pickup, time: timeLabel, done: true },
      { label: 'Booking Declined', location: 'Dispatch Desk', time: timeLabel, done: false },
    ];
  }

  persistStore();
  res.json({ booking, shipment });
});

app.patch('/api/admin/shipments/:trackingNumber', requireAdmin, (req, res) => {
  const code = cleanStr(req.params.trackingNumber, 40).toUpperCase();
  const shipment = store.shipments.find((s) => s.trackingNumber.toUpperCase() === code);
  if (!shipment) {
    res.status(404).json({ error: 'Shipment not found.' });
    return;
  }

  if (!shipment.approved) {
    res.status(409).json({
      error: 'This shipment is awaiting staff approval. Approve the booking before updating transit status.',
    });
    return;
  }

  const allowedStatuses = [
    'Order Received',
    'Picked Up',
    'In Transit',
    'Customs Clearance',
    'Out for Delivery',
    'Delivered',
  ];
  const nextStatus = cleanStr(req.body?.status, 40);
  const location = cleanStr(req.body?.location, 120) || shipment.to;
  const note = cleanStr(req.body?.statusDetail, 300);
  const eta = cleanStr(req.body?.eta, 60);

  if (!allowedStatuses.includes(nextStatus)) {
    res.status(400).json({ error: 'Invalid shipment status.' });
    return;
  }

  const timeLabel = nowEatLabel();
  shipment.status = nextStatus;
  shipment.updatedAt = timeLabel;
  if (eta) {
    shipment.eta = eta;
  } else if (nextStatus === 'Delivered') {
    shipment.eta = 'Delivered';
  }
  shipment.statusDetail = note || `Status updated to ${nextStatus} at ${location}.`;

  const existingIdx = shipment.milestones.findIndex(
    (m) => m.label.toLowerCase() === nextStatus.toLowerCase()
  );
  if (existingIdx >= 0) {
    for (let i = 0; i <= existingIdx; i++) {
      shipment.milestones[i].done = true;
    }
    shipment.milestones[existingIdx].location = location;
    shipment.milestones[existingIdx].time = timeLabel;
  } else {
    shipment.milestones.push({
      label: nextStatus,
      location,
      time: timeLabel,
      done: true,
    });
  }

  persistStore();
  res.json({ shipment });
});

app.post('/api/vehicles', requireAdmin, (req, res) => {
  const make = cleanStr(req.body?.make, 60);
  const model = cleanStr(req.body?.model, 80);
  const year = cleanStr(String(req.body?.year ?? ''), 10);
  const price = cleanStr(String(req.body?.price ?? ''), 20);
  const mileage = cleanStr(String(req.body?.mileage ?? ''), 20);
  const rawStatus = cleanStr(req.body?.status, 20);
  const status: Vehicle['status'] =
    rawStatus === 'Reserved' || rawStatus === 'Sold' ? rawStatus : 'Available';
  const image = safeImageUrl(req.body?.image);
  const description = cleanStr(req.body?.description, 500);

  if (!make || !model || !year || !price) {
    res.status(400).json({ error: 'Make, model, year, and price are required.' });
    return;
  }

  const vehicle: Vehicle = {
    id: `veh-${Date.now()}`,
    make,
    model,
    year,
    price,
    mileage,
    status,
    image,
    description,
  };

  store.vehicles.unshift(vehicle);
  persistStore();
  res.status(201).json({ vehicle });
});

app.put('/api/vehicles/:id', requireAdmin, (req, res) => {
  const id = cleanStr(req.params.id, 80);
  const idx = store.vehicles.findIndex((v) => v.id === id);
  if (idx === -1) {
    res.status(404).json({ error: 'Vehicle not found.' });
    return;
  }

  const make = cleanStr(req.body?.make, 60);
  const model = cleanStr(req.body?.model, 80);
  const year = cleanStr(String(req.body?.year ?? ''), 10);
  const price = cleanStr(String(req.body?.price ?? ''), 20);
  const mileage = cleanStr(String(req.body?.mileage ?? ''), 20);
  const rawStatus = cleanStr(req.body?.status, 20);
  const status: Vehicle['status'] =
    rawStatus === 'Reserved' || rawStatus === 'Sold' ? rawStatus : 'Available';
  const image = safeImageUrl(req.body?.image);
  const description = cleanStr(req.body?.description, 500);

  if (!make || !model || !year || !price) {
    res.status(400).json({ error: 'Make, model, year, and price are required.' });
    return;
  }

  const updated: Vehicle = {
    id,
    make,
    model,
    year,
    price,
    mileage,
    status,
    image,
    description,
  };
  store.vehicles[idx] = updated;
  persistStore();
  res.json({ vehicle: updated });
});

app.delete('/api/vehicles/:id', requireAdmin, (req, res) => {
  const id = cleanStr(req.params.id, 80);
  const before = store.vehicles.length;
  store.vehicles = store.vehicles.filter((v) => v.id !== id);
  if (store.vehicles.length === before) {
    res.status(404).json({ error: 'Vehicle not found.' });
    return;
  }
  persistStore();
  res.json({ ok: true });
});

app.use(express.static(staticDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Nuru Prime Logistics running at http://${HOST}:${PORT}`);
});
