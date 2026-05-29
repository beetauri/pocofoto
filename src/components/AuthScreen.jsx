import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  auth,
  db,
  doc,
  setDoc,
  getDoc,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  functions,
  httpsCallable,
  USE_FIREBASE_EMULATORS
} from '../firebase';
import { requestAndRegisterPushToken } from '../pushNotifications';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -18 },
  transition: { duration: 0.34, ease: [0.4, 0, 0.2, 1] }
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/contacts.readonly');
      provider.setCustomParameters({ prompt: 'consent' });
      const cred = await signInWithPopup(auth, provider);
      const oauthCredential = GoogleAuthProvider.credentialFromResult(cred);
      const accessToken = oauthCredential?.accessToken;
      if (!accessToken) {
        throw new Error('Google Contacts permission is required to finish signup.');
      }

      const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
      const normalizedEmail = cred.user.email?.trim().toLowerCase() || '';
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: cred.user.email,
        normalizedEmail,
        displayName: cred.user.displayName || cred.user.email.split('@')[0],
        profilePic: cred.user.photoURL || '',
        provider: 'google',
        coupleId: userSnap.exists() ? (userSnap.data().coupleId || null) : null,
        createdAt: userSnap.exists() ? (userSnap.data().createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const mockContacts = USE_FIREBASE_EMULATORS
        ? [
            { email: 'alice@example.com', displayName: 'Alice Example' },
            { email: 'bob@example.com', displayName: 'Bob Example' }
          ].filter((contact) => contact.email !== normalizedEmail)
        : undefined;
      await httpsCallable(functions, 'importGoogleContacts')({ accessToken, mockContacts });

      try {
        await requestAndRegisterPushToken();
      } catch (pushErr) {
        console.warn('Push registration skipped.', pushErr);
      }
    } catch (err) {
      if (auth.currentUser) {
        await signOut(auth);
      }
      if (err.code !== 'auth/popup-closed-by-user') {
        const msg = err.code?.replace('auth/', '').replace(/-/g, ' ') || err.message || 'Google sign-in failed';
        setError(msg.charAt(0).toUpperCase() + msg.slice(1));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div {...fadeUp} className="auth-card">
        <div className="brand-lockup">
          <motion.div
            className="brand-mark"
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <img src="/pocofoto-icon.svg" alt="" />
          </motion.div>
          <h1 className="logo-text">Pocofoto</h1>
          <p>Share photos with your person.</p>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              className="error-text"
              role="alert"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          id="auth-google"
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          whileTap={{ scale: 0.98 }}
          className="btn-ghost"
          style={{ gap: 10 }}
        >
          <GoogleIcon />
          {loading ? <div className="spinner" /> : 'Continue with Google'}
        </motion.button>
      </motion.div>
    </div>
  );
}
