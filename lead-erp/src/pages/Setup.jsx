import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Building2, User, Phone, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import Logo from '../components/marketing/Logo';
import { TRIAL_DAYS } from '../data/plans';

const DEFAULT_STATUSES = [
  'New', 'Ringing', 'Meeting Fixed', 'Negotiation', 'Follow-up', 'Closed-Won', 'Lost',
];

export default function Setup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [orgName, setOrgName] = useState('');

  const handleSetup = async (e) => {
    e.preventDefault();
    if (!orgName.trim()) {
      setError('Organization name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const orgId = `org_${Date.now()}`;
      const uid = user.uid;
      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

      await setDoc(doc(db, 'organizations', orgId), {
        name: orgName.trim(),
        slug: orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        createdAt: serverTimestamp(),
        createdBy: uid,
        planName: 'Growth',
        subscriptionStatus: 'trialing',
        seatsUsed: 1,
        seatsLimit: 10,
        trialEndsAt,
      });

      await setDoc(doc(db, 'users', uid), {
        phone: user.phone,
        displayName: user.displayName || 'Admin',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        defaultOrgId: orgId,
      }, { merge: true });

      await setDoc(doc(db, 'memberships', `${uid}_${orgId}`), {
        uid: uid,
        orgId: orgId,
        role: 'owner',
        displayName: user.displayName || 'Admin',
        active: true,
        invitedBy: uid,
        joinedAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      });

      // Best-effort: rules' get() can lag behind the membership we just wrote,
      // so don't let these block workspace creation.
      try {
        await setDoc(doc(db, 'organizations', orgId, 'settings', 'config'), {
          statuses: DEFAULT_STATUSES,
          autoAssign: 'round-robin',
        });
        await setDoc(doc(db, 'organizations', orgId, 'meta', 'leadAssignment'), {
          lastIndex: 0,
        });
      } catch (nonCritical) {
        console.warn('Optional setup skipped:', nonCritical?.code || nonCritical?.message);
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.assign('/admin');
      }, 1600);
    } catch (err) {
      console.error('Setup error:', err?.code, err?.message);
      const code = err?.code;
      setError(
        code === 'permission-denied'
          ? 'Workspace nahi bana — Firestore Security Rules deploy karo. (permission-denied)'
          : (err?.message || 'Failed to create organization')
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4 relative overflow-hidden texture-grain">
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-300/25 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 animate-blob pointer-events-none" />
      <div className="absolute inset-0 pattern-dots opacity-40 pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <Logo size="lg" />
        </div>

        <div className="bg-white rounded-3xl shadow-soft border border-cream-300/60 overflow-hidden">
          <div className="h-1.5 bg-gradient-orange" />

          <div className="p-7 sm:p-9">
            {success ? (
              <div className="text-center py-6 animate-fade-in">
                <div className="w-20 h-20 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-11 h-11 text-success-600" />
                </div>
                <h2 className="font-display font-bold text-2xl text-ink mb-2">
                  Workspace ready! 🎉
                </h2>
                <p className="text-ink-soft mb-5">Taking you to your dashboard…</p>
                <Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto" />
              </div>
            ) : (
              <>
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                  <Building2 className="text-orange-600" size={24} />
                </div>
                <h1 className="font-display font-bold text-2xl text-ink mb-1">
                  Create your organization
                </h1>
                <p className="text-sm text-ink-soft mb-6">
                  Set up your workspace to get started with your {TRIAL_DAYS}-day free trial.
                </p>

                <form onSubmit={handleSetup} className="space-y-5">
                  <div className="bg-cream-100 rounded-xl p-4 flex items-center gap-3 border border-cream-300/60">
                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs text-ink-muted">Signed in as</p>
                      <p className="text-sm font-medium text-ink flex items-center gap-1.5 font-mono">
                        <Phone className="w-3 h-3" />
                        {user?.phone}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">
                      Organization name
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" size={18} />
                      <input
                        type="text"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="e.g., CodeSkate Technologies"
                        className="input pl-11"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="bg-danger-50 text-danger-600 text-sm px-4 py-3 rounded-xl border border-danger-100">
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="btn btn-primary w-full py-3.5 text-base">
                    {loading ? (
                      <><Loader2 size={18} className="animate-spin" /> Creating…</>
                    ) : (
                      <>Create & continue <ArrowRight size={18} /></>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-ink-muted mt-5">
          You'll be the owner of this organization
        </p>
      </div>
    </div>
  );
}
