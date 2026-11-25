# Nuru Prime Logistics — Firestore Security Specification

## 1. Data Invariants
1. **Admin Authority (`admins`, `staff_security`)**: Only the verified primary owner (`vostematire@gmail.com`) can register or remove staff admins in `/admins/{uid}`. Only verified admins (`isAdmin()`) can read or mutate `/staff_security/{docId}`. Password hashes and recovery code hashes are salted PBKDF2 hashes—never plain text.
2. **Public Vehicle Catalog (`vehicles`)**: Vehicle listings are public to browse (`Available`, `Reserved`, `Sold`), while creation, updates, and deletion are strictly limited to verified admins (`isAdmin()`). Image URLs are restricted to `http://`, `https://`, or empty string.
3. **Approval-Gated Dispatch (`bookings`, `shipments`)**: Public pickup bookings must always enter as `status: "Pending Approval"` and their linked shipment must atomically be created with `approved: false` and `status: "Pending Approval"` via batched write (`existsAfter`). Unapproved shipments cannot transition into transit milestones unless approved by an admin.
4. **PII Isolation (`quotes`, `bookings`)**: Customer names and phone numbers in `/quotes` and `/bookings` are never readable or listable by unauthenticated visitors or other customers; only verified admins (or the verified creator matching `authorUid`) may read them.
5. **Immutable Audit Fields & Server Timestamps**: `createdAt` must equal `request.time` on creation and remain immutable on updates; `updatedAt` must equal `request.time` on every write.

## 2. The "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. **Privilege Escalation on `admins`**: Unauthenticated or non-owner user attempts `setDoc(doc(db, 'admins', myUid), { uid: myUid, email: 'attacker@example.com', addedBy: myUid, createdAt: serverTimestamp() })`.
2. **Ghost Field Injection on `quotes`**: Visitor creates a quote including an extra field `{ ..., isAdminApproved: true }`. Rejected by `keys().hasOnly(...)`.
3. **Pre-Approved Quote Tampering**: Visitor creates a quote with `status: 'Approved'` or `quotedPriceKes: 1`. Rejected because public creation enforces `status == 'Pending Approval'` and `quotedPriceKes == 0`.
4. **Unpaired / Pre-Approved Shipment Forgery**: Visitor creates `/shipments/FAKE999` with `approved: true` or `status: 'Delivered'` or without a matching `/bookings/{bookingRef}`. Rejected by `approved == false`, `status == 'Pending Approval'`, and `existsAfter`.
5. **PII Scraping (`list` on `quotes`)**: Non-admin authenticated user runs `getDocs(collection(db, 'quotes'))` without matching `authorUid`. Rejected by `allow list: if isAdmin() || (isVerifiedSignedIn() && resource.data.authorUid == request.auth.uid)`.
6. **Direct `get` of Another User's Booking**: Non-admin user tries `getDoc(doc(db, 'bookings', 'BK-1001'))`. Rejected because `authorUid != request.auth.uid`.
7. **ID Poisoning**: Attacker writes to `/shipments/${'A'.repeat(500)}` or `/quotes/bad$id`. Rejected by `isValidId()` regex + length guard.
8. **Type / Size Poisoning on `vehicles`**: Admin or non-admin submits `description` > 500 chars or `status: 'Free'`. Rejected by `isValidVehicle()`.
9. **Unverified Email Admin Spoof**: Attacker signs in with an unverified email token matching owner email (`email_verified == false`). Rejected by `isVerifiedSignedIn()`.
10. **Client-Forged Timestamp**: Client submits `createdAt: new Date(2020, 1, 1)` instead of `serverTimestamp()`. Rejected by `incoming().createdAt == request.time`.
11. **Mutating Immutable `createdAt` on Update**: Update omits or alters `createdAt` or `trackingNumber`. Rejected by `incoming().createdAt == existing().createdAt`.
12. **Reading Staff Security Secrets**: Non-admin user attempts `getDoc(doc(db, 'staff_security', 'portal'))` or `list` on `staff_security`. Rejected by `isAdmin()` and `allow list: if false`.
