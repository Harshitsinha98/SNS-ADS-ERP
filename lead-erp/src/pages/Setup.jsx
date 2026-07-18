import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, setDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Sparkles, Building2, User, Phone, ArrowRight, CheckCircle2 } from 'lucide-react';

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

      // 1. Create organization
      await setDoc(doc(db, 'organizations', orgId), {
        name: orgName.trim(),
        slug: orgName.trim().toLowerCase().replace(/\s+/g, '-'),
        createdAt: serverTimestamp(),
        createdBy: uid,
      });

      // 2. Create/update user identity
      await setDoc(doc(db, 'users', uid), {
        phone: user.phone,
        displayName: user.displayName || 'Admin',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        defaultOrgId: orgId,
      }, { merge: true });

      // 3. Create membership (owner role)
      const membershipId = `${uid}_${orgId}`;
      await setDoc(doc(db, 'memberships', membershipId), {
        uid: uid,
        orgId: orgId,
        role: 'owner',
        displayName: user.displayName || 'Admin',
        active: true,
        invitedBy: uid,
        joinedAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      });

      // 4. Create organization settings
      await setDoc(doc(db, 'organizations', orgId, 'settings', 'config'), {
        statuses: ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closed-Won', 'Closed-Lost'],
        autoAssign: 'round-robin',
      });

      // 5. Create meta for lead assignment
      await setDoc(doc(db, 'organizations', orgId, 'meta', 'leadAssignment'), {
        lastIndex: 0,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate('/admin');
      }, 2000);
    } catch (err) {
      console.error('Setup error:', err);
      setError(err.message || 'Failed to create organization');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-2xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            CodeSkate
          </span>
        </div>

        {/* Setup Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-5 text-white">
            <h1 className="font-display font-semibold text-xl flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Create Your Organization
            </h1>
            <p className="text-sm text-white/80 mt-1">
              Set up your workspace to get started
            </p>
          </div>

          {/* Form */}
          <div className="p-6">
            {success ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="font-display font-semibold text-lg text-gray-800 mb-2">
                  Organization Created!
                </h2>
                <p className="text-sm text-gray-500">
                  Redirecting to dashboard...
                </p>
              </div>
            ) : (
              <form onSubmit={handleSetup} className="space-y-5">
                {/* User Info */}
                <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Logged in as</p>
                    <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <Phone className="w-3 h-3" />
                      {user?.phone}
                    </p>
                  </div>
                </div>

                {/* Org Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g., CodeSkate Technologies"
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none text-gray-800"
                    disabled={loading}
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-100">
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create & Continue
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Help text */}
        <p className="text-center text-xs text-gray-400 mt-4">
          You'll be the owner of this organization
        </p>
      </div>
    </div>
  );
}
