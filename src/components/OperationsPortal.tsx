import React, { useEffect, useMemo, useState } from 'react';
import {
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  auth,
  firebaseConfigStatus,
  formatFirebaseAuthError,
  googleAuthProvider,
  PRIMARY_OWNER_EMAIL,
} from '../lib/firebase.ts';
import {
  addStaffAdmin,
  approveBookingAdmin,
  buildCustomerQuoteWhatsAppUrl,
  changeStaffPasscodeInFirestore,
  convertQuoteToShipmentAdmin,
  declineBookingAdmin,
  getStaffSecurityDoc,
  listStaffAdmins,
  recoverStaffPasscodeWithCodeInFirestore,
  regenerateStaffRecoveryCodesInFirestore,
  removeStaffAdmin,
  setupStaffPasscodeInFirestore,
  subscribeAdminBookings,
  subscribeAdminQuotes,
  subscribeAdminShipments,
  updateQuoteAdmin,
  updateShipmentMilestoneAdmin,
} from '../lib/logisticsDb.ts';
import type {
  AdminUserRecord,
  BookingRecord,
  QuoteRecord,
  QuoteStatus,
  Shipment,
  ShipmentStatus,
  StaffSecurityDoc,
  Vehicle,
} from '../types.ts';

interface OperationsPortalProps {
  user: User | null;
  isAdmin: boolean;
  authReady: boolean;
  vehicles: Vehicle[];
  onQuickTrack: (code: string) => void;
  onAddRecentTrack: (code: string) => void;
  onOpenVehicleManager: () => void;
  authNotice: string;
  onClearAuthNotice: () => void;
  onRefreshAuth?: () => Promise<void>;
}

type OpsTab = 'quotes' | 'shipments' | 'vehicles' | 'security';

const QUOTE_STATUSES: QuoteStatus[] = ['Pending Approval', 'Quoted', 'Approved', 'Converted', 'Closed'];
const SHIPMENT_STATUSES: ShipmentStatus[] = [
  'Order Received',
  'Picked Up',
  'In Transit',
  'Customs Clearance',
  'Out for Delivery',
  'Delivered',
];

export function OperationsPortal({
  user,
  isAdmin,
  authReady,
  vehicles,
  onQuickTrack,
  onAddRecentTrack,
  onOpenVehicleManager,
  authNotice,
  onClearAuthNotice,
  onRefreshAuth,
}: OperationsPortalProps) {
  const [activeTab, setActiveTab] = useState<OpsTab>('quotes');
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);

  const [authMode, setAuthMode] = useState<'google' | 'email' | 'reset'>('google');
  const [authAction, setAuthAction] = useState<'google' | 'email' | 'reset' | 'verify' | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const [opsNotice, setOpsNotice] = useState('');
  const [busyKey, setBusyKey] = useState('');

  // Local editable drafts per quote / shipment
  const [quoteDrafts, setQuoteDrafts] = useState<
    Record<string, { status: QuoteStatus; quotedPriceKes: string; staffNote: string }>
  >({});
  const [shipDrafts, setShipDrafts] = useState<
    Record<string, { status: ShipmentStatus; location: string; eta: string; statusDetail: string }>
  >({});

  // Staff Security Vault state (/staff_security/portal)
  const [securityDoc, setSecurityDoc] = useState<StaffSecurityDoc | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [visibleRecoveryCodes, setVisibleRecoveryCodes] = useState<string[]>([]);
  const [setupPass, setSetupPass] = useState('');
  const [setupPassConf, setSetupPassConf] = useState('');
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPassConf, setNewPassConf] = useState('');
  const [recoverCode, setRecoverCode] = useState('');
  const [recoverNewPass, setRecoverNewPass] = useState('');
  const [recoverNewPassConf, setRecoverNewPassConf] = useState('');
  const [regenPass, setRegenPass] = useState('');
  const [securityErr, setSecurityErr] = useState('');

  // Staff Admins Registry
  const [staffAdmins, setStaffAdmins] = useState<AdminUserRecord[]>([]);
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');

  const isOwner = Boolean(user?.emailVerified && user.email === PRIMARY_OWNER_EMAIL);

  function flashNotice(text: string) {
    setOpsNotice(text);
    setTimeout(() => {
      setOpsNotice((prev) => (prev === text ? '' : prev));
    }, 4500);
  }

  useEffect(() => {
    if (!isAdmin) {
      setQuotes([]);
      setBookings([]);
      setShipments([]);
      setSecurityDoc(null);
      setVisibleRecoveryCodes([]);
      return;
    }

    const unsubQuotes = subscribeAdminQuotes(setQuotes, (err) => flashNotice(err.message));
    const unsubBookings = subscribeAdminBookings(setBookings, (err) => flashNotice(err.message));
    const unsubShipments = subscribeAdminShipments(setShipments, (err) => flashNotice(err.message));

    setSecurityLoading(true);
    getStaffSecurityDoc()
      .then((docData) => setSecurityDoc(docData))
      .catch((err) => flashNotice(err instanceof Error ? err.message : 'Could not load security settings.'))
      .finally(() => setSecurityLoading(false));

    if (isOwner) {
      listStaffAdmins()
        .then(setStaffAdmins)
        .catch(() => {});
    }

    return () => {
      unsubQuotes();
      unsubBookings();
      unsubShipments();
    };
  }, [isAdmin, isOwner]);

  const bookingsByTrack = useMemo(() => {
    const map = new Map<string, BookingRecord>();
    bookings.forEach((b) => map.set(b.trackingNumber, b));
    return map;
  }, [bookings]);

  const stats = useMemo(
    () => ({
      pendingQuotes: quotes.filter((q) => q.status === 'Pending Approval').length,
      pendingBookings: bookings.filter((b) => b.status === 'Pending Approval').length,
      activeShipments: shipments.filter((s) => s.approved && s.status !== 'Delivered').length,
      totalBookings: bookings.length,
      availableVehicles: vehicles.filter((v) => v.status === 'Available').length,
    }),
    [quotes, bookings, shipments, vehicles]
  );

  function ensureAuthClientReady(): boolean {
    if (!firebaseConfigStatus.ok || !auth) {
      setAuthError(
        firebaseConfigStatus.error ||
          `Missing Firebase configuration (${firebaseConfigStatus.missingFields.join(', ')}). Check Vercel Environment Variables or firebase-applet-config.json.`
      );
      return false;
    }
    if (!authReady) {
      setAuthError('Auth client is still initializing. Wait a moment and try again.');
      return false;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setAuthError('No internet connection detected. Check your network and try again.');
      return false;
    }
    return true;
  }

  async function handleGoogleSignIn() {
    setAuthError('');
    setAuthSuccess('');
    onClearAuthNotice();
    if (!ensureAuthClientReady()) return;
    setAuthBusy(true);
    setAuthAction('google');
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
      setAuthAction(null);
    }
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    onClearAuthNotice();
    if (!ensureAuthClientReady()) return;
    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail || !passInput) {
      setAuthError('Enter both your staff email address and password.');
      return;
    }
    setAuthBusy(true);
    setAuthAction('email');
    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, passInput);
      setPassInput('');
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
      setAuthAction(null);
    }
  }

  async function handlePasswordResetEmail(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    onClearAuthNotice();
    if (!ensureAuthClientReady()) return;
    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail) {
      setAuthError('Please enter your staff email address to receive a password reset link.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setAuthError('Please enter a valid staff email address (auth/invalid-email).');
      return;
    }
    setAuthBusy(true);
    setAuthAction('reset');
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setAuthSuccess(
        `Password reset link sent to ${trimmedEmail}. Check your inbox and spam folder, then sign in with your new password.`
      );
      setPassInput('');
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
      setAuthAction(null);
    }
  }

  async function handleSendVerificationEmail() {
    if (!user) return;
    setAuthError('');
    setAuthSuccess('');
    setAuthBusy(true);
    setAuthAction('verify');
    try {
      await sendEmailVerification(user);
      setAuthSuccess(`Verification link sent to ${user.email}. Click the link in your inbox, then click Refresh Access.`);
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
      setAuthAction(null);
    }
  }

  async function handleRefreshVerification() {
    setAuthError('');
    setAuthSuccess('');
    setAuthBusy(true);
    setAuthAction('verify');
    try {
      if (onRefreshAuth) {
        await onRefreshAuth();
      }
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
      setAuthAction(null);
    }
  }

  async function handleSignOut() {
    if (auth) {
      await signOut(auth);
    }
    setActiveTab('quotes');
    setVisibleRecoveryCodes([]);
    setAuthError('');
    setAuthSuccess('');
  }

  async function refreshSecurityDoc() {
    const docData = await getStaffSecurityDoc();
    setSecurityDoc(docData);
  }

  async function handleSetupPasscode(e: React.FormEvent) {
    e.preventDefault();
    setSecurityErr('');
    if (setupPass.trim() !== setupPassConf.trim()) {
      setSecurityErr('Passcodes do not match.');
      return;
    }
    setBusyKey('setup-pass');
    try {
      const codes = await setupStaffPasscodeInFirestore(setupPass.trim());
      setVisibleRecoveryCodes(codes);
      setSetupPass('');
      setSetupPassConf('');
      await refreshSecurityDoc();
      flashNotice('Staff passcode saved to Firestore! Store your 6 single-use recovery codes safely.');
    } catch (err) {
      setSecurityErr(err instanceof Error ? err.message : 'Failed to save staff passcode.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleChangePasscode(e: React.FormEvent) {
    e.preventDefault();
    setSecurityErr('');
    if (newPass.trim() !== newPassConf.trim()) {
      setSecurityErr('New passcodes do not match.');
      return;
    }
    setBusyKey('change-pass');
    try {
      await changeStaffPasscodeInFirestore(curPass.trim(), newPass.trim());
      setCurPass('');
      setNewPass('');
      setNewPassConf('');
      await refreshSecurityDoc();
      flashNotice('Staff passcode updated in Firestore.');
    } catch (err) {
      setSecurityErr(err instanceof Error ? err.message : 'Failed to change passcode.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleRecoverPasscode(e: React.FormEvent) {
    e.preventDefault();
    setSecurityErr('');
    if (recoverNewPass.trim() !== recoverNewPassConf.trim()) {
      setSecurityErr('New passcodes do not match.');
      return;
    }
    setBusyKey('recover-pass');
    try {
      const remaining = await recoverStaffPasscodeWithCodeInFirestore(
        recoverCode.trim(),
        recoverNewPass.trim()
      );
      setRecoverCode('');
      setRecoverNewPass('');
      setRecoverNewPassConf('');
      await refreshSecurityDoc();
      flashNotice(`Staff passcode reset! Remaining unused recovery codes: ${remaining}.`);
    } catch (err) {
      setSecurityErr(err instanceof Error ? err.message : 'Recovery code check failed.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleRegenerateCodes(e: React.FormEvent) {
    e.preventDefault();
    setSecurityErr('');
    setBusyKey('regen-codes');
    try {
      const codes = await regenerateStaffRecoveryCodesInFirestore(regenPass.trim());
      setVisibleRecoveryCodes(codes);
      setRegenPass('');
      await refreshSecurityDoc();
      flashNotice('Generated 6 new single-use recovery codes.');
    } catch (err) {
      setSecurityErr(err instanceof Error ? err.message : 'Could not regenerate recovery codes.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleCopyRecoveryCodes() {
    if (!visibleRecoveryCodes.length) return;
    try {
      await navigator.clipboard.writeText(visibleRecoveryCodes.join('\n'));
      flashNotice('Recovery codes copied to clipboard.');
    } catch {
      flashNotice('Copy failed — please record the codes displayed above.');
    }
  }

  async function handleSendAuthReset() {
    if (!user?.email) return;
    setSecurityErr('');
    setBusyKey('auth-reset');
    try {
      await sendPasswordResetEmail(auth, user.email);
      flashNotice(`Password reset email sent to ${user.email}.`);
    } catch (err) {
      setSecurityErr(formatFirebaseAuthError(err));
    } finally {
      setBusyKey('');
    }
  }

  async function handleAddStaffAdmin(e: React.FormEvent) {
    e.preventDefault();
    setSecurityErr('');
    setBusyKey('add-admin');
    try {
      await addStaffAdmin(newAdminUid, newAdminEmail);
      setNewAdminUid('');
      setNewAdminEmail('');
      setStaffAdmins(await listStaffAdmins());
      flashNotice('Added staff administrator.');
    } catch (err) {
      setSecurityErr(err instanceof Error ? err.message : 'Could not add staff admin.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleRemoveStaffAdmin(uid: string) {
    setBusyKey(`rm-admin-${uid}`);
    try {
      await removeStaffAdmin(uid);
      setStaffAdmins(await listStaffAdmins());
      flashNotice('Removed staff administrator.');
    } catch (err) {
      setSecurityErr(err instanceof Error ? err.message : 'Could not remove staff admin.');
    } finally {
      setBusyKey('');
    }
  }

  return (
    <section id="operations-portal" className="ops-wrap" style={{ maxWidth: 'none' }}>
      <div className="ops-inner">
        <h2>Staff Operations Portal</h2>
        <p className="sub">
          Manage incoming quote requests, convert quotes into live tracking numbers, approve pickup bookings, and manage staff security.
        </p>

        <div className="ops-card">
          {!authReady ? (
            <div className="ops-auth">
              <p>Checking staff authentication...</p>
            </div>
          ) : !user ? (
            <div className="ops-auth">
              <h3>Staff Sign In</h3>
              <p>
                Sign in with your authorized Google account to review customer quotes, approve pickup bookings, update shipment milestones, and manage vehicles.
              </p>

              {!firebaseConfigStatus.ok && (
                <div className="ops-error">
                  {firebaseConfigStatus.error ||
                    `Missing Firebase configuration: ${firebaseConfigStatus.missingFields.join(', ')}.`}
                </div>
              )}
              {(authError || authNotice) && (
                <div className="ops-error">{authError || authNotice}</div>
              )}
              {authSuccess && (
                <div className="success-box" style={{ textAlign: 'left' }}>
                  <p style={{ marginTop: 0 }}>{authSuccess}</p>
                </div>
              )}

              <button
                type="button"
                className="nuru-btn"
                disabled={authBusy}
                onClick={handleGoogleSignIn}
              >
                {authBusy && authAction === 'google' ? 'Signing in...' : 'Sign in with Google'}
              </button>

              <div className="ops-btn-row" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="ops-link-btn"
                  onClick={() => {
                    setAuthError('');
                    setAuthSuccess('');
                    setAuthMode(authMode === 'email' ? 'google' : 'email');
                  }}
                >
                  {authMode === 'email' ? 'Hide Email Sign In' : 'Use Email & Password'}
                </button>
                <button
                  type="button"
                  className="ops-link-btn"
                  onClick={() => {
                    setAuthError('');
                    setAuthSuccess('');
                    setAuthMode(authMode === 'reset' ? 'google' : 'reset');
                  }}
                >
                  {authMode === 'reset' ? 'Back to Sign In Options' : 'Forgot Password?'}
                </button>
              </div>

              {authMode === 'email' && (
                <form className="nuru-form" onSubmit={handleEmailSignIn} style={{ padding: 0, background: 'none' }}>
                  <input
                    className="nuru-input"
                    type="email"
                    placeholder="Staff email address"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    required
                  />
                  <input
                    className="nuru-input"
                    type="password"
                    placeholder="Password"
                    value={passInput}
                    onChange={(e) => setPassInput(e.target.value)}
                    required
                  />
                  <div className="ops-btn-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="submit" className="nuru-btn" disabled={authBusy} style={{ flex: 1 }}>
                      {authBusy && authAction === 'email' ? 'Signing in...' : 'Sign In with Email'}
                    </button>
                  </div>
                  <div style={{ textAlign: 'right', marginTop: '4px' }}>
                    <button
                      type="button"
                      className="ops-link-btn"
                      onClick={() => {
                        setAuthError('');
                        setAuthSuccess('');
                        setAuthMode('reset');
                      }}
                    >
                      Forgot Password? Reset via email
                    </button>
                  </div>
                </form>
              )}

              {authMode === 'reset' && (
                <section
                  id="forgot-password-section"
                  aria-labelledby="forgot-password-heading"
                  className="ops-item"
                  style={{ textAlign: 'left', marginTop: '8px' }}
                >
                  <div id="forgot-password-heading" className="ops-item-title">
                    Forgot Password
                  </div>
                  <p className="ops-meta" style={{ margin: '4px 0 10px' }}>
                    Enter the email address for your staff Email &amp; Password account and we will send a Firebase password reset link to your inbox. (Google Sign-In accounts use your Google account password.)
                  </p>
                  <form
                    className="nuru-form"
                    noValidate
                    onSubmit={handlePasswordResetEmail}
                    style={{ padding: 0, background: 'none' }}
                  >
                    <label htmlFor="reset-staff-email" className="ops-meta" style={{ fontWeight: 600 }}>
                      Staff Email Address
                    </label>
                    <input
                      id="reset-staff-email"
                      className="nuru-input"
                      type="email"
                      autoComplete="email"
                      placeholder="Enter your staff email address"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      required
                    />
                    <button type="submit" className="nuru-btn" disabled={authBusy}>
                      {authBusy && authAction === 'reset' ? 'Sending Reset Email...' : 'Send Password Reset Email'}
                    </button>
                    <div className="ops-btn-row" style={{ justifyContent: 'space-between' }}>
                      <button
                        type="button"
                        className="ops-link-btn"
                        onClick={() => {
                          setAuthError('');
                          setAuthSuccess('');
                          setAuthMode('email');
                        }}
                      >
                        ← Back to Email Sign In
                      </button>
                      <button
                        type="button"
                        className="ops-link-btn"
                        onClick={() => {
                          setAuthError('');
                          setAuthSuccess('');
                          setAuthMode('google');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </div>
          ) : !isAdmin ? (
            <div className="ops-auth">
              <h3>{user.emailVerified ? 'Staff Authorization Required' : 'Email Verification Required'}</h3>
              <p>
                {user.emailVerified ? (
                  <>
                    Signed in as <b>{user.email}</b>, which does not currently have staff administrator access.
                  </>
                ) : (
                  <>
                    Signed in as <b>{user.email}</b>, but your email is not verified yet. Staff portal access requires a verified email address.
                  </>
                )}
              </p>
              {authError && <div className="ops-error">{authError}</div>}
              {authSuccess && (
                <div className="success-box" style={{ textAlign: 'left' }}>
                  <p style={{ marginTop: 0 }}>{authSuccess}</p>
                </div>
              )}
              {!user.emailVerified && (
                <div className="ops-btn-row">
                  <button
                    type="button"
                    className="ops-btn-primary"
                    disabled={authBusy}
                    onClick={handleSendVerificationEmail}
                  >
                    {authBusy && authAction === 'verify' ? 'Working...' : 'Send Verification Email'}
                  </button>
                  <button
                    type="button"
                    className="ops-btn-gold"
                    disabled={authBusy}
                    onClick={handleRefreshVerification}
                  >
                    I Verified — Refresh Access
                  </button>
                </div>
              )}
              <div className="ops-item">
                <span className="ops-meta">
                  Your User ID (share with the site owner if you should be added as staff):
                </span>
                <code style={{ fontSize: '12px', wordBreak: 'break-all', color: '#0B2A4A' }}>
                  {user.uid}
                </code>
              </div>
              <button type="button" className="nuru-btn" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          ) : (
            <div>
              <div className="ops-topbar">
                <div>
                  <h3>Operations Dashboard</h3>
                  <span className="ops-meta">Signed in as {user.email}</span>
                </div>
                <div className="ops-topbar-actions">
                  <button type="button" className="ops-btn-secondary" onClick={handleSignOut}>
                    Sign Out
                  </button>
                </div>
              </div>

              {visibleRecoveryCodes.length > 0 && (
                <div className="recovery-banner">
                  <h4>Save Your One-Time Recovery Codes</h4>
                  <p>
                    Store these single-use codes safely. If you ever forget your staff passcode, any unused code lets you reset it.
                  </p>
                  <div className="recovery-codes-grid">
                    {visibleRecoveryCodes.map((code) => (
                      <div key={code} className="recovery-code-pill">
                        {code}
                      </div>
                    ))}
                  </div>
                  <div className="ops-btn-row">
                    <button type="button" className="ops-btn-gold" onClick={handleCopyRecoveryCodes}>
                      Copy All Codes
                    </button>
                    <button
                      type="button"
                      className="ops-btn-secondary"
                      onClick={() => setVisibleRecoveryCodes([])}
                    >
                      I Saved Them
                    </button>
                  </div>
                </div>
              )}

              <div className="ops-kpis">
                <div className="ops-kpi">
                  <strong>{stats.pendingQuotes}</strong>
                  <span>Pending Quotes</span>
                </div>
                <div className="ops-kpi">
                  <strong>{stats.pendingBookings}</strong>
                  <span>Pending Bookings</span>
                </div>
                <div className="ops-kpi">
                  <strong>{stats.activeShipments}</strong>
                  <span>Approved Active</span>
                </div>
                <div className="ops-kpi">
                  <strong>{stats.totalBookings}</strong>
                  <span>Total Bookings</span>
                </div>
                <div className="ops-kpi">
                  <strong>{stats.availableVehicles}</strong>
                  <span>Available Vehicles</span>
                </div>
              </div>

              <div className="ops-tabs">
                <button
                  type="button"
                  className={`ops-tab ${activeTab === 'quotes' ? 'active' : ''}`}
                  onClick={() => setActiveTab('quotes')}
                >
                  Quote Requests
                </button>
                <button
                  type="button"
                  className={`ops-tab ${activeTab === 'shipments' ? 'active' : ''}`}
                  onClick={() => setActiveTab('shipments')}
                >
                  Shipments &amp; Bookings
                </button>
                <button
                  type="button"
                  className={`ops-tab ${activeTab === 'vehicles' ? 'active' : ''}`}
                  onClick={() => setActiveTab('vehicles')}
                >
                  Vehicle Inventory
                </button>
                <button
                  type="button"
                  className={`ops-tab ${activeTab === 'security' ? 'active' : ''}`}
                  onClick={() => setActiveTab('security')}
                >
                  Password &amp; Recovery
                </button>
              </div>

              {opsNotice && (
                <div className="success-box" style={{ marginBottom: '14px', textAlign: 'left' }}>
                  <p style={{ marginTop: 0 }}>{opsNotice}</p>
                </div>
              )}

              {activeTab === 'quotes' && (
                <div className="ops-list">
                  {quotes.length === 0 ? (
                    <p style={{ color: '#666' }}>
                      No quote requests yet. Submit one in &quot;Get a Free Quote&quot; above to see it here.
                    </p>
                  ) : (
                    quotes.map((q) => {
                      const draft = quoteDrafts[q.quoteRef] || {
                        status: q.status,
                        quotedPriceKes: q.quotedPriceKes > 0 ? String(q.quotedPriceKes) : '',
                        staffNote: q.staffNote || '',
                      };
                      const statusClass = q.status.replace(/\s+/g, '');
                      return (
                        <div key={q.quoteRef} className="ops-item">
                          <div className="ops-item-head">
                            <div className="ops-item-title">
                              {q.quoteRef} • {q.name} ({q.phone})
                            </div>
                            <span className={`ops-status ${statusClass}`}>{q.status}</span>
                          </div>
                          <div className="ops-meta">
                            {[
                              q.service,
                              q.from || q.to ? `${q.from || 'Origin TBD'} → ${q.to || 'Destination TBD'}` : '',
                              q.estimatedPriceKes > 0
                                ? `Calc Est: Ksh ${q.estimatedPriceKes.toLocaleString()}`
                                : '',
                              q.convertedTrackingNumber ? `Tracking: ${q.convertedTrackingNumber}` : '',
                            ]
                              .filter(Boolean)
                              .join('  •  ')}
                          </div>
                          <div className="ops-meta">
                            {q.notes ? `Client notes: ${q.notes}` : 'No additional client notes.'}
                          </div>

                          <div className="ops-controls">
                            <select
                              className="nuru-input"
                              value={draft.status}
                              onChange={(e) =>
                                setQuoteDrafts((prev) => ({
                                  ...prev,
                                  [q.quoteRef]: { ...draft, status: e.target.value as QuoteStatus },
                                }))
                              }
                            >
                              {QUOTE_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                            <input
                              className="nuru-input"
                              type="number"
                              min="0"
                              placeholder="Quoted price (KES)"
                              value={draft.quotedPriceKes}
                              onChange={(e) =>
                                setQuoteDrafts((prev) => ({
                                  ...prev,
                                  [q.quoteRef]: { ...draft, quotedPriceKes: e.target.value },
                                }))
                              }
                            />
                            <input
                              className="nuru-input"
                              type="text"
                              placeholder="Staff note / quote terms"
                              value={draft.staffNote}
                              onChange={(e) =>
                                setQuoteDrafts((prev) => ({
                                  ...prev,
                                  [q.quoteRef]: { ...draft, staffNote: e.target.value },
                                }))
                              }
                            />
                          </div>

                          <div className="ops-btn-row">
                            <button
                              type="button"
                              className="ops-btn-primary"
                              disabled={busyKey === `save-qt-${q.quoteRef}`}
                              onClick={async () => {
                                setBusyKey(`save-qt-${q.quoteRef}`);
                                try {
                                  await updateQuoteAdmin(q.quoteRef, {
                                    status: draft.status,
                                    quotedPriceKes: Number(draft.quotedPriceKes || 0),
                                    staffNote: draft.staffNote,
                                  });
                                  flashNotice(`Updated ${q.quoteRef}.`);
                                } catch (err) {
                                  flashNotice(err instanceof Error ? err.message : 'Could not update quote.');
                                } finally {
                                  setBusyKey('');
                                }
                              }}
                            >
                              Save Quote Update
                            </button>
                            <a
                              className="wa-btn"
                              style={{ marginTop: 0 }}
                              href={buildCustomerQuoteWhatsAppUrl({
                                ...q,
                                quotedPriceKes: Number(draft.quotedPriceKes || q.quotedPriceKes || 0),
                                staffNote: draft.staffNote,
                              })}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              WhatsApp Customer
                            </a>
                            {!q.convertedTrackingNumber ? (
                              <button
                                type="button"
                                className="ops-btn-gold"
                                disabled={busyKey === `conv-qt-${q.quoteRef}`}
                                onClick={async () => {
                                  setBusyKey(`conv-qt-${q.quoteRef}`);
                                  try {
                                    const code = await convertQuoteToShipmentAdmin(q);
                                    onAddRecentTrack(code);
                                    flashNotice(`Approved ${q.quoteRef} and created shipment ${code}.`);
                                  } catch (err) {
                                    flashNotice(err instanceof Error ? err.message : 'Could not convert quote.');
                                  } finally {
                                    setBusyKey('');
                                  }
                                }}
                              >
                                Approve &amp; Convert to Tracking
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="ops-btn-secondary"
                                onClick={() => onQuickTrack(q.convertedTrackingNumber)}
                              >
                                View Tracking ({q.convertedTrackingNumber})
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === 'shipments' && (
                <div className="ops-list">
                  {shipments.length === 0 ? (
                    <p style={{ color: '#666' }}>No shipments recorded yet.</p>
                  ) : (
                    shipments.map((s) => {
                      const bk = bookingsByTrack.get(s.trackingNumber);
                      const draft = shipDrafts[s.trackingNumber] || {
                        status: s.approved && SHIPMENT_STATUSES.includes(s.status) ? s.status : 'Order Received',
                        location: s.to,
                        eta: s.eta,
                        statusDetail: '',
                      };
                      return (
                        <div key={s.trackingNumber} className="ops-item">
                          <div className="ops-item-head">
                            <div className="ops-item-title">
                              {s.trackingNumber} • {s.from} → {s.to}
                            </div>
                            <span className={`ops-status ${s.status.replace(/\s+/g, '')}`}>
                              {s.status}
                            </span>
                          </div>
                          <div className="ops-meta">
                            {[
                              bk ? `Booking ${bk.bookingRef} • ${bk.name} (${bk.phone})` : '',
                              s.service,
                              `ETA: ${s.eta}`,
                              `Updated: ${s.updatedAtLabel}`,
                            ]
                              .filter(Boolean)
                              .join('  •  ')}
                          </div>
                          <div className="ops-meta">{s.statusDetail}</div>

                          {!s.approved && s.status === 'Pending Approval' && bk ? (
                            <div className="ops-btn-row">
                              <button
                                type="button"
                                className="ops-btn-gold"
                                disabled={busyKey === `app-${bk.bookingRef}`}
                                onClick={async () => {
                                  setBusyKey(`app-${bk.bookingRef}`);
                                  try {
                                    await approveBookingAdmin(bk);
                                    flashNotice(
                                      `Approved ${bk.bookingRef} (${s.trackingNumber}). Shipment is now Order Received.`
                                    );
                                  } catch (err) {
                                    flashNotice(err instanceof Error ? err.message : 'Could not approve booking.');
                                  } finally {
                                    setBusyKey('');
                                  }
                                }}
                              >
                                Approve Booking
                              </button>
                              <button
                                type="button"
                                className="ops-btn-danger"
                                disabled={busyKey === `dec-${bk.bookingRef}`}
                                onClick={async () => {
                                  setBusyKey(`dec-${bk.bookingRef}`);
                                  try {
                                    await declineBookingAdmin(bk, 'Declined during staff review.');
                                    flashNotice(`Declined ${bk.bookingRef}.`);
                                  } catch (err) {
                                    flashNotice(err instanceof Error ? err.message : 'Could not decline booking.');
                                  } finally {
                                    setBusyKey('');
                                  }
                                }}
                              >
                                Decline Booking
                              </button>
                              <button
                                type="button"
                                className="ops-btn-secondary"
                                onClick={() => onQuickTrack(s.trackingNumber)}
                              >
                                Preview in Tracker →
                              </button>
                            </div>
                          ) : s.approved ? (
                            <>
                              <div className="ops-controls">
                                <select
                                  className="nuru-input"
                                  value={draft.status}
                                  onChange={(e) =>
                                    setShipDrafts((prev) => ({
                                      ...prev,
                                      [s.trackingNumber]: {
                                        ...draft,
                                        status: e.target.value as ShipmentStatus,
                                      },
                                    }))
                                  }
                                >
                                  {SHIPMENT_STATUSES.map((st) => (
                                    <option key={st} value={st}>
                                      {st}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  className="nuru-input"
                                  type="text"
                                  placeholder="Current hub / location"
                                  value={draft.location}
                                  onChange={(e) =>
                                    setShipDrafts((prev) => ({
                                      ...prev,
                                      [s.trackingNumber]: { ...draft, location: e.target.value },
                                    }))
                                  }
                                />
                                <input
                                  className="nuru-input"
                                  type="text"
                                  placeholder="ETA (e.g. Tomorrow 2 PM)"
                                  value={draft.eta}
                                  onChange={(e) =>
                                    setShipDrafts((prev) => ({
                                      ...prev,
                                      [s.trackingNumber]: { ...draft, eta: e.target.value },
                                    }))
                                  }
                                />
                                <input
                                  className="nuru-input"
                                  type="text"
                                  placeholder="Milestone update note"
                                  value={draft.statusDetail}
                                  onChange={(e) =>
                                    setShipDrafts((prev) => ({
                                      ...prev,
                                      [s.trackingNumber]: { ...draft, statusDetail: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                              <div className="ops-btn-row">
                                <button
                                  type="button"
                                  className="ops-btn-primary"
                                  disabled={busyKey === `ship-${s.trackingNumber}`}
                                  onClick={async () => {
                                    setBusyKey(`ship-${s.trackingNumber}`);
                                    try {
                                      await updateShipmentMilestoneAdmin(s, draft);
                                      setShipDrafts((prev) => ({
                                        ...prev,
                                        [s.trackingNumber]: { ...draft, statusDetail: '' },
                                      }));
                                      flashNotice(`Updated tracking milestone for ${s.trackingNumber}.`);
                                    } catch (err) {
                                      flashNotice(
                                        err instanceof Error ? err.message : 'Could not update shipment.'
                                      );
                                    } finally {
                                      setBusyKey('');
                                    }
                                  }}
                                >
                                  Update Shipment
                                </button>
                                <button
                                  type="button"
                                  className="ops-btn-secondary"
                                  onClick={() => onQuickTrack(s.trackingNumber)}
                                >
                                  Preview in Tracker →
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="ops-btn-row">
                              <button
                                type="button"
                                className="ops-btn-secondary"
                                onClick={() => onQuickTrack(s.trackingNumber)}
                              >
                                Preview in Tracker →
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === 'vehicles' && (
                <div className="ops-list">
                  <div className="ops-item">
                    <p className="ops-meta">
                      Vehicle management is unlocked! You can add new vehicles or use Edit / Delete directly on any card in the Cars for Sale section.
                    </p>
                    <div className="ops-btn-row">
                      <button
                        type="button"
                        className="ops-btn-primary"
                        onClick={onOpenVehicleManager}
                      >
                        Open Add / Edit Vehicle Form →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="ops-list">
                  {securityErr && <div className="ops-error">{securityErr}</div>}

                  {securityLoading ? (
                    <div className="ops-item">
                      <span className="ops-meta">Loading security settings...</span>
                    </div>
                  ) : !securityDoc ? (
                    <div className="ops-item">
                      <div className="ops-item-title">Set Staff Dispatch Passcode &amp; Recovery Codes</div>
                      <p className="ops-meta">
                        Store a salted cryptographic hash of your secondary staff passcode and 6 one-time recovery codes in your cloud database.
                      </p>
                      <form
                        className="nuru-form"
                        onSubmit={handleSetupPasscode}
                        style={{ padding: 0, background: 'none' }}
                      >
                        <input
                          className="nuru-input"
                          type="password"
                          placeholder="Create staff passcode (min 6 chars)"
                          value={setupPass}
                          onChange={(e) => setSetupPass(e.target.value)}
                          required
                        />
                        <input
                          className="nuru-input"
                          type="password"
                          placeholder="Confirm staff passcode"
                          value={setupPassConf}
                          onChange={(e) => setSetupPassConf(e.target.value)}
                          required
                        />
                        <div className="ops-btn-row">
                          <button
                            type="submit"
                            className="ops-btn-primary"
                            disabled={busyKey === 'setup-pass'}
                          >
                            Save Passcode &amp; Generate Codes
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <>
                      <div className="ops-item">
                        <div className="ops-item-title">Change Staff Passcode</div>
                        <form
                          className="nuru-form"
                          onSubmit={handleChangePasscode}
                          style={{ padding: 0, background: 'none' }}
                        >
                          <input
                            className="nuru-input"
                            type="password"
                            placeholder="Current passcode"
                            value={curPass}
                            onChange={(e) => setCurPass(e.target.value)}
                            required
                          />
                          <input
                            className="nuru-input"
                            type="password"
                            placeholder="New passcode (min 6 chars)"
                            value={newPass}
                            onChange={(e) => setNewPass(e.target.value)}
                            required
                          />
                          <input
                            className="nuru-input"
                            type="password"
                            placeholder="Confirm new passcode"
                            value={newPassConf}
                            onChange={(e) => setNewPassConf(e.target.value)}
                            required
                          />
                          <div className="ops-btn-row">
                            <button
                              type="submit"
                              className="ops-btn-primary"
                              disabled={busyKey === 'change-pass'}
                            >
                              Update Passcode
                            </button>
                          </div>
                        </form>
                      </div>

                      <div className="ops-item">
                        <div className="ops-item-title">
                          Recover Forgotten Passcode ({securityDoc.recoveryCodeHashes.length} unused codes)
                        </div>
                        <p className="ops-meta">
                          Forgot your current passcode? Enter one of your saved single-use recovery codes (e.g. NR-A1B2-C3D4) to set a new passcode.
                        </p>
                        <form
                          className="nuru-form"
                          onSubmit={handleRecoverPasscode}
                          style={{ padding: 0, background: 'none' }}
                        >
                          <input
                            className="nuru-input"
                            type="text"
                            placeholder="One-time recovery code (NR-XXXX-XXXX)"
                            value={recoverCode}
                            onChange={(e) => setRecoverCode(e.target.value)}
                            required
                          />
                          <input
                            className="nuru-input"
                            type="password"
                            placeholder="New passcode (min 6 chars)"
                            value={recoverNewPass}
                            onChange={(e) => setRecoverNewPass(e.target.value)}
                            required
                          />
                          <input
                            className="nuru-input"
                            type="password"
                            placeholder="Confirm new passcode"
                            value={recoverNewPassConf}
                            onChange={(e) => setRecoverNewPassConf(e.target.value)}
                            required
                          />
                          <div className="ops-btn-row">
                            <button
                              type="submit"
                              className="ops-btn-gold"
                              disabled={busyKey === 'recover-pass'}
                            >
                              Reset Passcode Using Recovery Code
                            </button>
                          </div>
                        </form>
                      </div>

                      <div className="ops-item">
                        <div className="ops-item-title">Generate Fresh Recovery Codes</div>
                        <p className="ops-meta">
                          Replaces all remaining codes with 6 new single-use codes. Confirm with your current passcode.
                        </p>
                        <form
                          className="nuru-form"
                          onSubmit={handleRegenerateCodes}
                          style={{ padding: 0, background: 'none' }}
                        >
                          <input
                            className="nuru-input"
                            type="password"
                            placeholder="Confirm current passcode"
                            value={regenPass}
                            onChange={(e) => setRegenPass(e.target.value)}
                            required
                          />
                          <div className="ops-btn-row">
                            <button
                              type="submit"
                              className="ops-btn-secondary"
                              disabled={busyKey === 'regen-codes'}
                            >
                              Generate New Recovery Codes
                            </button>
                          </div>
                        </form>
                      </div>
                    </>
                  )}

                  <div className="ops-item">
                    <div className="ops-item-title">Account Sign-In &amp; Password Reset</div>
                    <p className="ops-meta">
                      Your primary sign-in uses Google ({user.email}). If Email/Password sign-in is enabled in Firebase Console, you can also send a password reset email below.
                    </p>
                    <div className="ops-btn-row">
                      <button
                        type="button"
                        className="ops-btn-secondary"
                        disabled={busyKey === 'auth-reset'}
                        onClick={handleSendAuthReset}
                      >
                        Send Password Reset Email
                      </button>
                    </div>
                  </div>

                  {isOwner && (
                    <div className="ops-item">
                      <div className="ops-item-title">Authorized Staff Accounts</div>
                      <p className="ops-meta">
                        Grant additional signed-in staff members access to the Operations Portal using their User ID.
                      </p>
                      {staffAdmins.length > 0 && (
                        <div className="ops-list">
                          {staffAdmins.map((adm) => (
                            <div
                              key={adm.uid}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 12px',
                                background: '#fff',
                                borderRadius: '8px',
                                border: '1px solid #e2eaf5',
                              }}
                            >
                              <span className="ops-meta">
                                <b>{adm.email}</b> ({adm.uid})
                              </span>
                              <button
                                type="button"
                                className="ops-btn-danger"
                                style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}
                                disabled={busyKey === `rm-admin-${adm.uid}`}
                                onClick={() => handleRemoveStaffAdmin(adm.uid)}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <form
                        className="nuru-form"
                        onSubmit={handleAddStaffAdmin}
                        style={{ padding: 0, background: 'none' }}
                      >
                        <div className="ops-controls">
                          <input
                            className="nuru-input"
                            type="text"
                            placeholder="Staff User ID (UID)"
                            value={newAdminUid}
                            onChange={(e) => setNewAdminUid(e.target.value)}
                            required
                          />
                          <input
                            className="nuru-input"
                            type="email"
                            placeholder="Staff email"
                            value={newAdminEmail}
                            onChange={(e) => setNewAdminEmail(e.target.value)}
                            required
                          />
                        </div>
                        <div className="ops-btn-row">
                          <button
                            type="submit"
                            className="ops-btn-primary"
                            disabled={busyKey === 'add-admin'}
                          >
                            Authorize Staff Account
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
