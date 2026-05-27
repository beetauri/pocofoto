import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, auth, doc, setDoc, getDoc, updateDoc, onSnapshot, signOut } from '../firebase';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.34, ease: [0.4, 0, 0.2, 1] }
};

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h14" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function PairingScreen({ user, onPaired }) {
  const [mode, setMode] = useState(null);
  const [code, setCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);

  const displayName = user.email.split('@')[0];
  const showMenu = Boolean(menuAnchor);

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      const newCode = generateCode();
      await setDoc(doc(db, 'invites', newCode), {
        creatorId: user.uid,
        creatorEmail: user.email,
        createdAt: new Date().toISOString(),
        used: false
      });
      setCode(newCode);
      setMode('create');
      setWaiting(true);
    } catch (err) {
      console.error(err);
      setError('Failed to create invite');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!waiting || !code) return;

    const unsub = onSnapshot(doc(db, 'invites', code), (snap) => {
      const data = snap.data();
      if (data?.used && data?.coupleId) {
        onPaired(data.coupleId);
      }
    });

    return () => unsub();
  }, [waiting, code, onPaired]);

  const handleJoin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const trimmed = inputCode.trim().toUpperCase();
      const inviteSnap = await getDoc(doc(db, 'invites', trimmed));

      if (!inviteSnap.exists()) {
        setError('Invalid code. In local mock mode, invite codes only work in tabs from the same normal browser profile.');
        setLoading(false);
        return;
      }

      const invite = inviteSnap.data();
      if (invite.used) {
        setError('This code has already been used.');
        setLoading(false);
        return;
      }

      if (invite.creatorId === user.uid) {
        setError("You can't pair with yourself.");
        setLoading(false);
        return;
      }

      const coupleId = `${invite.creatorId}_${user.uid}`;
      await setDoc(doc(db, 'couples', coupleId), {
        users: [invite.creatorId, user.uid],
        currentPhotoUrl: null,
        senderId: null,
        timestamp: null,
        createdAt: new Date().toISOString()
      });

      await updateDoc(doc(db, 'users', invite.creatorId), { coupleId });
      await updateDoc(doc(db, 'users', user.uid), { coupleId });
      await updateDoc(doc(db, 'invites', trimmed), { used: true, coupleId });

      onPaired(coupleId);
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(code);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const title = mode === 'join' ? 'Enter pairing code' : mode === 'create' ? 'Invite your person' : 'Connect your Lockets';
  const subtitle = mode === 'join'
    ? 'Paste or type the invite code from your person.'
    : mode === 'create'
      ? 'Send this code to link your Lockets.'
      : 'Create an invite code or enter one you received.';

  return (
    <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <header className="app-header pairing-header">
        <button
          className="icon-btn"
          type="button"
          aria-label="Profile"
          aria-expanded={menuAnchor === 'profile'}
          onClick={() => setMenuAnchor(menuAnchor === 'profile' ? null : 'profile')}
        >
          <UserIcon />
        </button>
        <div className="header-title">
          <strong>Locket</strong>
          <span>{displayName}</span>
        </div>
        <button
          className="icon-btn"
          type="button"
          aria-label="Open menu"
          aria-expanded={menuAnchor === 'menu'}
          onClick={() => setMenuAnchor(menuAnchor === 'menu' ? null : 'menu')}
        >
          <MenuIcon />
        </button>
      </header>

      <AnimatePresence>
        {showMenu && (
          <>
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className={`menu-popover ${menuAnchor === 'profile' ? 'from-profile' : 'from-menu'}`}
            >
              <div className="profile-row">
                <img
                  className="avatar"
                  src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`}
                  alt=""
                />
                <div>
                  <strong>{displayName}</strong>
                  <span>{user.email}</span>
                </div>
              </div>
              <button className="menu-action" type="button" onClick={handleLogout}>
                <LogoutIcon />
                Sign out
              </button>
            </motion.div>
            <div
              aria-hidden="true"
              onClick={() => setMenuAnchor(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 50 }}
            />
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mode && (
          <motion.button
            className="icon-btn small"
            type="button"
            aria-label="Back"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            onClick={() => { setMode(null); setError(''); }}
            style={{ position: 'absolute', top: 'calc(var(--safe-top) + 92px)', left: 20, zIndex: 10 }}
          >
            <BackIcon />
          </motion.button>
        )}
      </AnimatePresence>

      <motion.div {...fadeUp} className="pairing-card" style={{ textAlign: 'center' }}>
        <div className="brand-lockup" style={{ marginBottom: 34 }}>
          <div className="brand-mark">
            <LinkIcon />
          </div>
          <h2 style={{ color: 'var(--text-primary)', fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>
            {title}
          </h2>
          <p className="pairing-subtitle" style={{ marginTop: 10 }}>
            {subtitle}
          </p>
        </div>

        {!mode && (
          <div className="form-stack">
            <button id="pairing-create" className="btn-primary" type="button" onClick={handleCreate} disabled={loading}>
              {loading ? <div className="spinner" /> : 'Create Invite Code'}
            </button>
            <button id="pairing-join-toggle" className="btn-ghost" type="button" onClick={() => setMode('join')}>
              I have a code
            </button>
          </div>
        )}

        {mode === 'create' && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="invite-code-card">
              <p>Your invite code</p>
              <strong>{code}</strong>
            </div>
            <button className="btn-ghost" type="button" onClick={copyCode} style={{ gap: 10, marginBottom: 18 }}>
              <CopyIcon />
              Copy Code
            </button>
            <p className="pairing-subtitle">Waiting for your person to enter this code.</p>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
              <div className="spinner" />
            </div>
          </motion.div>
        )}

        {mode === 'join' && (
          <motion.form
            className="form-stack"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onSubmit={handleJoin}
          >
            <input
              id="pairing-code-input"
              className="input-field"
              type="text"
              placeholder="ABC123"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ textAlign: 'center', letterSpacing: 6, fontSize: 22, fontWeight: 900 }}
              autoFocus
            />
            {error && (
              <p className="error-text" role="alert">{error}</p>
            )}
            <button id="pairing-join-submit" type="submit" className="btn-primary" disabled={loading || inputCode.length < 6}>
              {loading ? <div className="spinner" /> : 'Connect'}
            </button>
          </motion.form>
        )}
      </motion.div>
    </div>
  );
}
