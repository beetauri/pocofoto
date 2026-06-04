import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';
import {
  applyPwaUpdate,
  consumePwaUpdatedVersion,
  getPwaUpdateState,
  subscribeToPwaUpdateState
} from '../pwaUpdates';
import { trackEvent } from '../analytics';

const bannerMotion = {
  initial: { opacity: 0, y: -18, x: '-50%' },
  animate: { opacity: 1, y: 0, x: '-50%' },
  exit: { opacity: 0, y: -18, x: '-50%' },
  transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] }
};

export default function UpdateBanner() {
  const buildVersion = import.meta.env.VITE_APP_VERSION || '0.0.0';
  const [updateState, setUpdateState] = useState(() => getPwaUpdateState());
  const [dismissed, setDismissed] = useState(false);
  const [updatedVersion, setUpdatedVersion] = useState(() => consumePwaUpdatedVersion(buildVersion));

  useEffect(() => subscribeToPwaUpdateState((nextState) => {
    setUpdateState(nextState);
  }), []);

  useEffect(() => {
    if (!updatedVersion) return undefined;
    const timeout = window.setTimeout(() => setUpdatedVersion(''), 3400);
    return () => window.clearTimeout(timeout);
  }, [updatedVersion]);

  const showUpdateReady = updateState.ready && !dismissed && !updatedVersion;
  const showUpdated = Boolean(updatedVersion);

  const handleDismiss = () => {
    setDismissed(true);
    trackEvent('pwa_update_banner_dismissed', { version: buildVersion });
  };

  const handleUpdateNow = () => {
    trackEvent('pwa_update_banner_update_clicked', { version: buildVersion });
    if (!applyPwaUpdate()) {
      window.location.reload();
    }
  };

  return (
    <AnimatePresence>
      {showUpdateReady && (
        <motion.div
          key="update-ready"
          className="update-banner"
          role="status"
          aria-live="polite"
          {...bannerMotion}
        >
          <button
            type="button"
            className="update-banner-icon-btn"
            onClick={handleDismiss}
            aria-label="Dismiss update"
          >
            <X aria-hidden="true" />
          </button>
          <div className="update-banner-copy">
            <strong>New update ready</strong>
            <span>Get the newest Pocofoto version.</span>
          </div>
          <button
            type="button"
            className="update-banner-action"
            onClick={handleUpdateNow}
            disabled={updateState.applying}
          >
            <RefreshCw aria-hidden="true" />
            {updateState.applying ? 'Updating' : 'Update now'}
          </button>
        </motion.div>
      )}
      {showUpdated && (
        <motion.div
          key="updated"
          className="update-banner update-banner-success"
          role="status"
          aria-live="polite"
          {...bannerMotion}
        >
          <div className="update-banner-copy centered">
            <strong>Updated to v{updatedVersion}</strong>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
