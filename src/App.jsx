import { lazy, Suspense, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, onAuthStateChanged, doc, onSnapshot } from './firebase';
import AuthScreen from './components/AuthScreen';
import PairingScreen from './components/PairingScreen';
import MainScreen from './components/MainScreen';

const Retune = import.meta.env.DEV
  ? lazy(() => import('retune').then((module) => ({ default: module.Retune })))
  : null;

const pageTransition = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.04 },
  transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] }
};

function LoadingScreen() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24
    }}>
      <motion.div
        animate={{ scale: [1, 1.2, 1], rotate: [0, 360] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="loading-logo-mark"
      >
        <img src="/pocofoto-icon.svg" alt="" />
      </motion.div>
      <span className="logo-text" style={{ fontSize: 28 }}>Pocofoto</span>
      <div className="spinner" style={{ marginTop: 8 }} />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coupleId, setCoupleId] = useState(null);
  const [checkingPair, setCheckingPair] = useState(false);

  // Listen for auth changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setCoupleId(null);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Check if user is paired
  useEffect(() => {
    if (!user) return;
    setCheckingPair(true);

    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCoupleId(data.coupleId || null);
      }
      setCheckingPair(false);
      setLoading(false);
    }, () => {
      // Error handler — user doc might not exist yet
      setCheckingPair(false);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const handlePaired = (newCoupleId) => {
    setCoupleId(newCoupleId);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  // Determine screen
  let screen = 'auth';
  if (user && !coupleId && !checkingPair) screen = 'pairing';
  if (user && coupleId) screen = 'main';

  return (
    <>
      <AnimatePresence mode="wait">
        {screen === 'auth' && (
          <motion.div key="auth" {...pageTransition} style={{ height: '100%' }}>
            <AuthScreen />
          </motion.div>
        )}
        {screen === 'pairing' && (
          <motion.div key="pairing" {...pageTransition} style={{ height: '100%' }}>
            <PairingScreen user={user} onPaired={handlePaired} />
          </motion.div>
        )}
        {screen === 'main' && (
          <motion.div key="main" {...pageTransition} style={{ height: '100%' }}>
            <MainScreen user={user} coupleId={coupleId} />
          </motion.div>
        )}
      </AnimatePresence>
      {Retune && (
        <Suspense fallback={null}>
          <Retune />
        </Suspense>
      )}
    </>
  );
}
