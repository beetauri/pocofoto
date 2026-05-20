import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { db, doc, setDoc, getDoc, updateDoc, onSnapshot } from '../firebase';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
};

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function PairingScreen({ user, onPaired }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [code, setCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);

  // Generate invite code
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
      setError('Failed to create invite');
    } finally {
      setLoading(false);
    }
  };

  // Listen for partner joining
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

  // Join with code
  const handleJoin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const trimmed = inputCode.trim().toUpperCase();
      const inviteSnap = await getDoc(doc(db, 'invites', trimmed));

      if (!inviteSnap.exists()) {
        setError('Invalid code. Please try again.');
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
        setError("You can't pair with yourself!");
        setLoading(false);
        return;
      }

      // Create couple
      const coupleId = `${invite.creatorId}_${user.uid}`;
      await setDoc(doc(db, 'couples', coupleId), {
        users: [invite.creatorId, user.uid],
        currentPhotoUrl: null,
        senderId: null,
        timestamp: null,
        createdAt: new Date().toISOString()
      });

      // Update both users
      await updateDoc(doc(db, 'users', invite.creatorId), { coupleId });
      await updateDoc(doc(db, 'users', user.uid), { coupleId });

      // Mark invite as used
      await updateDoc(doc(db, 'invites', trimmed), { used: true, coupleId });

      onPaired(coupleId);
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(code);
  };

  return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
      {/* Top absolute back button when in a sub-mode */}
      {mode && (
        <button
          onClick={() => { setMode(null); setError(''); }}
          style={{
            position: 'absolute',
            top: 'calc(var(--safe-top) + 20px)',
            left: 20,
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-full)',
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontSize: 18,
            transition: 'all 0.2s ease',
            zIndex: 10
          }}
          title="Back"
        >
          ←
        </button>
      )}

      <motion.div {...fadeUp} style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{ fontSize: 56, marginBottom: 16 }}
        >
          💛
        </motion.div>
        <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
          {mode === 'join' ? 'Enter pairing code' : mode === 'create' ? 'Invite your partner' : 'Connect with your person'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 40 }}>
          {mode === 'join' ? 'Paste or type the invite code from your partner' : mode === 'create' ? 'Send this code to your partner to link lockets' : 'Share a code to link your Lockets together'}
        </p>

        {!mode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button id="pairing-create" className="btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? <div className="spinner" /> : '✨ Create Invite Code'}
            </button>
            <button id="pairing-join-toggle" className="btn-ghost" onClick={() => setMode('join')}>
              🔗 I have a code
            </button>
          </div>
        )}

        {mode === 'create' && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div
              className="glass-card"
              style={{
                padding: '32px 24px',
                marginBottom: 16,
                textAlign: 'center'
              }}
            >
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                Your invite code
              </p>
              <div style={{
                fontSize: 36,
                fontWeight: 700,
                letterSpacing: 8,
                color: 'var(--accent)',
                fontFamily: 'monospace'
              }}>
                {code}
              </div>
            </div>
            <button className="btn-ghost" onClick={copyCode} style={{ marginBottom: 16 }}>
              📋 Copy Code
            </button>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Waiting for your partner to enter this code...
            </p>
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ marginTop: 16 }}
            >
              <div className="spinner" style={{ margin: '0 auto' }} />
            </motion.div>
          </motion.div>
        )}

        {mode === 'join' && (
          <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onSubmit={handleJoin}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <input
              id="pairing-code-input"
              className="input-field"
              type="text"
              placeholder="Enter 6-character code"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ textAlign: 'center', letterSpacing: 6, fontSize: 22, fontWeight: 600 }}
              autoFocus
            />
            {error && (
              <p style={{ color: 'var(--accent)', fontSize: 13 }}>{error}</p>
            )}
            <button id="pairing-join-submit" type="submit" className="btn-primary" disabled={loading || inputCode.length < 6}>
              {loading ? <div className="spinner" /> : '💛 Connect'}
            </button>
          </motion.form>
        )}
      </motion.div>
    </div>
  );
}
