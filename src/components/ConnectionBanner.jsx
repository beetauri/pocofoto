import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff, Wifi } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from './ui/alert';

const bannerMotion = {
  initial: { opacity: 0, y: -18, x: '-50%' },
  animate: { opacity: 1, y: 0, x: '-50%' },
  exit: { opacity: 0, y: -18, x: '-50%' },
  transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] }
};

export default function ConnectionBanner({ status }) {
  const isOffline = status === 'offline';
  const isRestored = status === 'restored';
  const shouldShow = isOffline || isRestored;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key={status}
          className={`connection-banner ${isOffline ? 'connection-banner--offline' : 'connection-banner--restored'}`}
          {...bannerMotion}
        >
          <Alert role="status" aria-live="polite">
            {isOffline ? <WifiOff aria-hidden="true" /> : <Wifi aria-hidden="true" />}
            <AlertTitle>{isOffline ? "You're offline" : 'Back online'}</AlertTitle>
            {isOffline && (
              <AlertDescription>
                Capture still works. Reconnect to send or pair.
              </AlertDescription>
            )}
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
