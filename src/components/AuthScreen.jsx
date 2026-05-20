import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, doc, setDoc, getDoc, GoogleAuthProvider, signInWithPopup } from '../firebase';

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
};

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', cred.user.uid), {
          email: email,
          displayName: name || email.split('@')[0],
          coupleId: null,
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      const msg = err.code?.replace('auth/', '').replace(/-/g, ' ') || 'Something went wrong';
      setError(msg.charAt(0).toUpperCase() + msg.slice(1));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      
      // Dynamic profile provisioning: Check if user doc exists in the database
      const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
      if (!userSnap.exists()) {
        await setDoc(doc(db, 'users', cred.user.uid), {
          email: cred.user.email,
          displayName: cred.user.displayName || cred.user.email.split('@')[0],
          coupleId: null,
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        const msg = err.code?.replace('auth/', '').replace(/-/g, ' ') || err.message || 'Google sign-in failed';
        setError(msg.charAt(0).toUpperCase() + msg.slice(1));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <motion.div {...fadeUp} style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ fontSize: 56, marginBottom: 8 }}
          >
            💛
          </motion.div>
          <h1 className="logo-text">Locket</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 15 }}>
            Share moments with your person
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AnimatePresence mode="wait">
            {!isLogin && (
              <motion.div
                key="name"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <input
                  id="auth-name"
                  className="input-field"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <input
            id="auth-email"
            className="input-field"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            id="auth-password"
            className="input-field"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ color: 'var(--accent)', fontSize: 13, textAlign: 'center', padding: '0 4px' }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            id="auth-submit"
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? <div className="spinner" /> : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        {/* Divider */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          margin: '20px 0', 
          color: 'var(--text-muted)', 
          fontSize: 13 
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ padding: '0 12px', fontWeight: 500, letterSpacing: 0.5 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Google Sign In Button */}
        <motion.button
          id="auth-google"
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          whileTap={{ scale: 0.98 }}
          className="btn-ghost"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-full)',
            padding: '14px 24px',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" style={{ flexShrink: 0 }}>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {isLogin ? 'Sign In with Google' : 'Sign Up with Google'}
        </motion.button>

        {/* Toggle */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            id="auth-toggle"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 14,
              cursor: 'pointer',
              padding: 8,
            }}
          >
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
              {isLogin ? 'Sign Up' : 'Sign In'}
            </span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
