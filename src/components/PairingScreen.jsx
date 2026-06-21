import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Copy as LucideCopyIcon, Link as LucideLinkIcon, LogOut as LucideLogoutIcon } from 'lucide-react';
import {
  auth,
  db,
  functions,
  collection,
  doc,
  query,
  where,
  onSnapshot,
  updateDoc,
  signOut,
  httpsCallable
} from '../firebase';
import { trackEvent } from '../analytics';

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] }
};

function initialsFor(name, email) {
  const source = name || email || '?';
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function Avatar({ src, name, email }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img className="contact-avatar" src={src} alt="" onError={() => setFailed(true)} />;
  }
  return <div className="contact-avatar initials">{initialsFor(name, email)}</div>;
}

const lucideIconProps = { strokeWidth: 2.4, 'aria-hidden': true };

function LinkIcon() {
  return <LucideLinkIcon {...lucideIconProps} />;
}

function LogoutIcon() {
  return <LucideLogoutIcon {...lucideIconProps} />;
}

function CopyIcon() {
  return <LucideCopyIcon {...lucideIconProps} />;
}

export default function PairingScreen({ user, isOnline = true, onPaired, initialNotice = '', onNoticeConsumed, notificationControls = null }) {
  const { t } = useTranslation(['pairing', 'common']);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState(null);
  const [pairingCode, setPairingCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);

  const displayName = user.displayName || user.email?.split('@')[0] || 'You';
  const buildVersion = import.meta.env.VITE_APP_VERSION || '0.0.0';
  const buildCommit = import.meta.env.VITE_APP_COMMIT || 'dev';
  const trackedEntryRef = useRef(false);

  const callFunction = useCallback((name, payload = {}) => {
    return httpsCallable(functions, name)(payload).then((result) => result.data);
  }, []);

  useEffect(() => {
    if (trackedEntryRef.current) return;
    trackedEntryRef.current = true;
    trackEvent('pairing_flow_entry', { userId: user.uid });
  }, [user.uid]);

  useEffect(() => {
    if (!initialNotice) return;
    setNotice(initialNotice);
    onNoticeConsumed?.();
  }, [initialNotice, onNoticeConsumed]);

  useEffect(() => {
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('type', '==', 'pairing_removed'),
      where('status', '==', 'unread')
    );
    return onSnapshot(q, (snap) => {
      const notification = snap.docs[0];
      if (!notification) return;
      const data = notification.data();
      const initiatorName = data.initiator?.displayName || t('yourContact');
      setNotice(t('removedByPerson', { name: initiatorName }));
      updateDoc(doc(db, 'users', user.uid, 'notifications', notification.id), {
        status: 'resolved',
        resolvedAt: new Date().toISOString()
      }).catch((err) => {
        console.warn('Could not resolve pairing removed notification.', err);
      });
    });
  }, [t, user.uid]);

  useEffect(() => {
    const q = query(
      collection(db, 'pairingRequests'),
      where('recipientId', '==', user.uid),
      where('status', '==', 'pending')
    );
    return onSnapshot(q, (snap) => {
      setIncoming(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
  }, [user.uid]);

  useEffect(() => {
    const q = query(
      collection(db, 'pairingRequests'),
      where('senderId', '==', user.uid),
      where('status', '==', 'pending')
    );
    return onSnapshot(q, (snap) => {
      const requests = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setOutgoing(requests[0] || null);
    });
  }, [user.uid]);

  const sortedIncoming = useMemo(() => {
    return [...incoming].sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  }, [incoming]);

  const handleAccept = async (request) => {
    setWorkingId(request.id);
    setError('');
    try {
      const data = await callFunction('acceptPairingRequest', { requestId: request.id });
      if (data.coupleId) onPaired(data.coupleId);
      trackEvent('pairing_request_accepted', { requestId: request.id, coupleId: data.coupleId || null });
    } catch {
      setError(t('errors.accept'));
    } finally {
      setWorkingId('');
    }
  };

  const handleDecline = async (request) => {
    setWorkingId(request.id);
    setError('');
    try {
      await callFunction('declinePairingRequest', { requestId: request.id });
      trackEvent('pairing_request_declined', { requestId: request.id });
      setNotice(t('invites.declined'));
    } catch {
      setError(t('errors.decline'));
    } finally {
      setWorkingId('');
    }
  };

  const handleCancelOutgoing = async () => {
    if (!outgoing) return;
    setWorkingId('cancel');
    setError('');
    try {
      await callFunction('cancelPairingRequest', { requestId: outgoing.id });
      trackEvent('pairing_request_canceled', { requestId: outgoing.id });
      setNotice(t('invites.canceled'));
    } catch {
      setError(t('errors.cancel'));
    } finally {
      setWorkingId('');
    }
  };

  const handleCreateCode = async () => {
    setWorkingId('create-code');
    setError('');
    setNotice('');
    try {
      const data = await callFunction('createPairingCode');
      setPairingCode(data.code);
      trackEvent('pairing_code_created');
    } catch {
      setError(t('errors.createCode'));
    } finally {
      setWorkingId('');
    }
  };

  const handleRedeemCode = async (event) => {
    event.preventDefault();
    setWorkingId('redeem-code');
    setError('');
    try {
      const data = await callFunction('redeemPairingCode', { code: inputCode });
      if (data.coupleId) onPaired(data.coupleId);
      trackEvent('pairing_code_redeemed', { coupleId: data.coupleId || null });
    } catch {
      setError(t('errors.redeemCode'));
    } finally {
      setWorkingId('');
    }
  };

  const handleCopyCode = async () => {
    await navigator.clipboard?.writeText(pairingCode);
    setNotice(t('code.copied'));
  };

  const handleLogout = async () => {
    try {
      await notificationControls?.cleanupBeforeLogout?.();
    } catch (error) {
      console.warn('Notification cleanup before logout failed.', { code: error?.code || 'unknown' });
    } finally {
      await signOut(auth);
    }
  };

  const handleEnableNotifications = async () => {
    setWorkingId('enable-notifications');
    setError('');
    try {
      const result = await notificationControls?.enable?.();
      if (result?.status === 'registered') setNotice(t('notifications.enabled'));
      else if (result?.status === 'denied') setNotice(t('notifications.denied'));
      else setNotice(t('notifications.unavailable'));
    } catch {
      setError(t('errors.notifications'));
    } finally {
      setWorkingId('');
    }
  };

  return (
    <div className="pairing-discovery screen">
      <header className="pairing-topbar">
        <div>
          <span className="pairing-eyebrow">{t('signedInAs')}</span>
          <strong>{displayName}</strong>
        </div>
        <button className="icon-btn small" type="button" aria-label={t('accessibility.logout')} onClick={() => setConfirmLogout(true)}>
          <LogoutIcon />
        </button>
      </header>

      <motion.main {...fadeUp} className="pairing-panel">
        <section className="pairing-hero">
          <div className="brand-mark"><LinkIcon /></div>
          <div>
            <h1>{t('title')}</h1>
            <p>{t('intro')}</p>
          </div>
        </section>

        <AnimatePresence>
          {error && (
            <motion.p className="error-text" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {error}
            </motion.p>
          )}
          {notice && (
            <motion.p className="success-text" role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {notice}
            </motion.p>
          )}
        </AnimatePresence>

        {!isOnline && (
          <div className="pairing-offline-note" role="status">
            {t('errors.offline')}
          </div>
        )}

        {notificationControls && (
          <section className="pairing-notification-action" aria-label={t('accessibility.notifications')}>
            <div>
              <strong>{t('notifications.title')}</strong>
              <span>
                {notificationControls.status?.permission === 'denied'
                  ? t('notifications.denied')
                  : t('notifications.body')}
              </span>
            </div>
            <button
              className="mini-btn"
              type="button"
              onClick={handleEnableNotifications}
              disabled={!isOnline || notificationControls.busy || workingId === 'enable-notifications'}
            >
              {workingId === 'enable-notifications' ? t('notifications.enabling') : t('notifications.enable')}
            </button>
          </section>
        )}

        {sortedIncoming.length > 0 && (
          <section className="request-stack" aria-label={t('accessibility.incomingRequests')}>
            <h2>{t('invites.title')}</h2>
            {sortedIncoming.map((request) => (
              <article className="request-card" key={request.id}>
                <Avatar src={request.sender?.profilePic} name={request.sender?.displayName} email={request.sender?.email} />
                <div>
                  <strong>{request.sender?.displayName || t('someone')}</strong>
                  <span>{t('invites.wantsToPair')}</span>
                </div>
                <div className="request-actions">
                  <button className="mini-btn ghost" type="button" onClick={() => handleDecline(request)} disabled={!isOnline || workingId === request.id}>
                    {t('invites.decline')}
                  </button>
                  <button className="mini-btn" type="button" onClick={() => handleAccept(request)} disabled={!isOnline || workingId === request.id}>
                    {t('invites.accept')}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {outgoing && (
          <section className="pending-card" aria-label={t('accessibility.outgoingRequest')}>
            <div>
              <strong>{t('invites.pending')}</strong>
              <span>{t('invites.pendingBody', { name: outgoing.recipient?.displayName || t('yourContact') })}</span>
            </div>
            <button className="mini-btn ghost" type="button" onClick={handleCancelOutgoing} disabled={!isOnline || workingId === 'cancel'}>
              {t('invites.cancel')}
            </button>
          </section>
        )}

        <section className="code-fallback">
          <div className="code-fallback-intro">
            <div>
              <h2>{t('code.title')}</h2>
              <p>{t('code.intro')}</p>
            </div>
          </div>
          <div className="code-panel">
            <div className="code-option-card">
              <div className="code-option-copy">
                <strong>{t('code.shareTitle')}</strong>
                <span>{t('code.shareBody')}</span>
              </div>
              <button id="pairing-create" className="btn-primary" type="button" onClick={handleCreateCode} disabled={!isOnline || workingId === 'create-code'}>
                {workingId === 'create-code' ? <div className="spinner" /> : t('code.create')}
              </button>
              {pairingCode && (
                <div className="invite-code-card">
                  <p>{t('code.createdLabel')}</p>
                  <strong>{pairingCode}</strong>
                  <button className="btn-ghost" type="button" onClick={handleCopyCode}>
                    <CopyIcon />
                    {t('code.copy')}
                  </button>
                </div>
              )}
            </div>
            <form className="code-option-card code-entry-form" onSubmit={handleRedeemCode}>
              <div className="code-option-copy">
                <label htmlFor="pairing-code-input">{t('code.enterLabel')}</label>
                <span>{t('code.enterHelp')}</span>
              </div>
              <input
                id="pairing-code-input"
                className="input-field"
                type="text"
                placeholder="ABC123"
                value={inputCode}
                onChange={(event) => setInputCode(event.target.value.toUpperCase())}
                maxLength={6}
                disabled={!isOnline || workingId === 'redeem-code'}
                style={{ textAlign: 'center', letterSpacing: 6, fontSize: 22, fontWeight: 900 }}
              />
              <button id="pairing-join-submit" className="btn-primary" type="submit" disabled={!isOnline || workingId === 'redeem-code' || inputCode.length < 6}>
                {workingId === 'redeem-code' ? <div className="spinner" /> : t('code.submit')}
              </button>
            </form>
          </div>
        </section>
      </motion.main>

      <div className="screen-version">
        <span>{t('common:version')}</span>
        <strong>v{buildVersion} ({buildCommit})</strong>
      </div>

      <AnimatePresence>
        {confirmLogout && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}>
              <h2 id="logout-title">{t('logout.title')}</h2>
              <p>{t('logout.body')}</p>
              <div className="dialog-actions">
                <button className="btn-ghost" type="button" onClick={() => setConfirmLogout(false)}>{t('common:actions.cancel')}</button>
                <button className="btn-primary" type="button" onClick={handleLogout}>{t('logout.confirm')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
