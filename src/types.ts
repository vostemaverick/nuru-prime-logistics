export interface Milestone {
  label: string;
  location: string;
  time: string;
  done: boolean;
}

export type ShipmentStatus =
  | 'Pending Approval'
  | 'Order Received'
  | 'Picked Up'
  | 'In Transit'
  | 'Customs Clearance'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Declined';

export interface Shipment {
  trackingNumber: string;
  bookingRef: string;
  approved: boolean;
  service: string;
  from: string;
  to: string;
  weightKg: number;
  estimatedPriceKes: number;
  status: ShipmentStatus;
  statusDetail: string;
  eta: string;
  updatedAtLabel: string;
  milestones: Milestone[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type VehicleStatus = 'Available' | 'Reserved' | 'Sold';

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: string;
  price: string;
  mileage: string;
  status: VehicleStatus;
  image: string;
  description: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type QuoteStatus = 'Pending Approval' | 'Quoted' | 'Approved' | 'Converted' | 'Closed';

export interface QuoteRecord {
  quoteRef: string;
  authorUid: string;
  name: string;
  phone: string;
  service: string;
  from: string;
  to: string;
  notes: string;
  estimatedPriceKes: number;
  quotedPriceKes: number;
  staffNote: string;
  status: QuoteStatus;
  convertedTrackingNumber: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type BookingStatus = 'Pending Approval' | 'Approved' | 'Declined';

export interface BookingRecord {
  bookingRef: string;
  trackingNumber: string;
  authorUid: string;
  name: string;
  phone: string;
  service: string;
  date: string;
  time: string;
  pickup: string;
  delivery: string;
  notes: string;
  estimatedPriceKes: number;
  status: BookingStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StaffSecurityDoc {
  passwordHash: string;
  recoveryCodeHashes: string[];
  updatedBy: string;
  updatedAt?: unknown;
}

export interface AdminUserRecord {
  uid: string;
  email: string;
  addedBy: string;
  createdAt?: unknown;
}

export interface QuoteEstimate {
  from: string;
  to: string;
  weightKg: number;
  speed: string;
  distanceKm?: number;
  estimatedPriceKes: number;
  eta: string;
  corridor: string;
}
