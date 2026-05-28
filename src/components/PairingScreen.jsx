import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  auth,
  db,
  functions,
  collection,
  query,
  where,
  onSnapshot,
  signOut,
  httpsCallable
} from '../firebase';

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

function ContactIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 11a4 4 0 1 0-8 0" />
      <path d="M4 21a8 8 0 0 1 16 0" />
      <path d="M19 3v4" />
      <path d="M21 5h-4" />
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

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
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

function parseError(err, fallback = 'Something went wrong. Please try again.') {
  const raw = err?.message || err?.code || fallback;
  return raw.replace(/^Firebase: /, '').replace(/\.$/, '.');
}

export default function PairingScreen({ user, onPaired }) {
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState(null);
  const [codePanel, setCodePanel] = useState(false);
  const [pairingCode, setPairingCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);

  const displayName = user.displayName || user.email?.split('@')[0] || 'You';
  const hasPendingOutgoing = Boolean(outgoing);

  const callFunction = useCallback((name, payload = {}) => {
    return httpsCallable(functions, name)(payload).then((result) => result.data);
  }, []);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    setError('');
    try {
      const data = await callFunction('listEligibleContacts');
      setContacts(data.contacts || []);
    } catch (err) {
      setError(parseError(err, 'Could not load contacts.'));
    } finally {
      setLoadingContacts(false);
    }
  }, [callFunction]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

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

  const handleSendRequest = async (contact) => {
    setWorkingId(contact.uid);
    setError('');
    setNotice('');
    try {
      await callFunction('sendPairingRequest', { recipientId: contact.uid });
      setNotice(`Pairing invite sent to ${contact.displayName}.`);
    } catch (err) {
      setError(parseError(err, 'Could not send pairing invite.'));
    } finally {
      setWorkingId('');
    }
  };

  const handleAccept = async (request) => {
    setWorkingId(request.id);
    setError('');
    try {
      const data = await callFunction('acceptPairingRequest', { requestId: request.id });
      if (data.coupleId) onPaired(data.coupleId);
    } catch (err) {
      setError(parseError(err, 'Could not accept invite.'));
    } finally {
      setWorkingId('');
    }
  };

  const handleDecline = async (request) => {
    setWorkingId(request.id);
    setError('');
    try {
      await callFunction('declinePairingRequest', { requestId: request.id });
      setNotice('Invite declined');
    } catch (err) {
      setError(parseError(err, 'Could not decline invite.'));
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
      setNotice('Invite canceled');
    } catch (err) {
      setError(parseError(err, 'Could not cancel invite.'));
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
    } catch (err) {
      setError(parseError(err, 'Could not create pairing code.'));
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
    } catch (err) {
      setError(parseError(err, 'Could not redeem pairing code.'));
    } finally {
      setWorkingId('');
    }
  };

  const handleCopyCode = async () => {
    await navigator.clipboard?.writeText(pairingCode);
    setNotice('Code copied');
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <div className="pairing-discovery screen">
      <header className="pairing-topbar">
        <div>
          <span className="pairing-eyebrow">Signed in as</span>
          <strong>{displayName}</strong>
        </div>
        <button className="icon-btn small" type="button" aria-label="Log out" onClick={() => setConfirmLogout(true)}>
          <LogoutIcon />
        </button>
      </header>

      <motion.main {...fadeUp} className="pairing-panel">
        <section className="pairing-hero">
          <div className="brand-mark"><ContactIcon /></div>
          <div>
            <h1>Find your person</h1>
            <p>Contacts who already use Pocofoto and are available to pair appear here.</p>
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

        {sortedIncoming.length > 0 && (
          <section className="request-stack" aria-label="Incoming pairing requests">
            <h2>Pairing invites</h2>
            {sortedIncoming.map((request) => (
              <article className="request-card" key={request.id}>
                <Avatar src={request.sender?.profilePic} name={request.sender?.displayName} email={request.sender?.email} />
                <div>
                  <strong>{request.sender?.displayName || 'Someone'}</strong>
                  <span>wants to pair with you</span>
                </div>
                <div className="request-actions">
                  <button className="mini-btn ghost" type="button" onClick={() => handleDecline(request)} disabled={workingId === request.id}>
                    Decline
                  </button>
                  <button className="mini-btn" type="button" onClick={() => handleAccept(request)} disabled={workingId === request.id}>
                    Accept
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {outgoing && (
          <section className="pending-card" aria-label="Outgoing pairing request">
            <div>
              <strong>Invite pending</strong>
              <span>{outgoing.recipient?.displayName || 'Your contact'} has 24 hours to respond.</span>
            </div>
            <button className="mini-btn ghost" type="button" onClick={handleCancelOutgoing} disabled={workingId === 'cancel'}>
              Cancel
            </button>
          </section>
        )}

        <div className="section-heading">
          <div>
            <h2>Available contacts</h2>
            <p>Send an invite to someone who already has Pocofoto.</p>
          </div>
        </div>

        {loadingContacts ? (
          <div className="contact-empty">
            <div className="spinner" />
            <span>Loading contacts</span>
          </div>
        ) : contacts.length === 0 ? (
          <div className="contact-empty">
            <LinkIcon />
            <strong>No available contacts yet</strong>
            <span>Use a pairing code if your person is not showing up.</span>
          </div>
        ) : (
          <div className="contact-list">
            {contacts.map((contact) => (
              <article className="contact-row" key={contact.uid}>
                <Avatar src={contact.profilePic} name={contact.displayName} email={contact.email} />
                <div className="contact-copy">
                  <strong>{contact.displayName}</strong>
                  <span>{contact.email}</span>
                </div>
                <button
                  className="mini-btn"
                  type="button"
                  onClick={() => handleSendRequest(contact)}
                  disabled={hasPendingOutgoing || workingId === contact.uid}
                >
                  {workingId === contact.uid ? 'Sending' : 'Pair'}
                </button>
              </article>
            ))}
          </div>
        )}

        <section className="code-fallback">
          <div className="code-fallback-intro">
            <div>
              <h2>Pair with a code</h2>
              <p>Use this when your person is not listed in contacts.</p>
            </div>
            <button id="pairing-join-toggle" className="btn-ghost code-toggle" type="button" onClick={() => setCodePanel((value) => !value)} aria-expanded={codePanel}>
              <LinkIcon />
              {codePanel ? 'Hide' : 'Pair with code'}
            </button>
          </div>
          <AnimatePresence>
            {codePanel && (
              <motion.div className="code-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="code-option-card">
                  <div className="code-option-copy">
                    <strong>Share your code</strong>
                    <span>Create a one-time code and send it to your person.</span>
                  </div>
                  <button id="pairing-create" className="btn-primary" type="button" onClick={handleCreateCode} disabled={workingId === 'create-code'}>
                    {workingId === 'create-code' ? <div className="spinner" /> : 'Create code'}
                  </button>
                  {pairingCode && (
                    <div className="invite-code-card">
                      <p>Give them this code</p>
                      <strong>{pairingCode}</strong>
                      <button className="btn-ghost" type="button" onClick={handleCopyCode}>
                        <CopyIcon />
                        Copy code
                      </button>
                    </div>
                  )}
                </div>
                <form className="code-option-card code-entry-form" onSubmit={handleRedeemCode}>
                  <div className="code-option-copy">
                    <label htmlFor="pairing-code-input">Enter their code</label>
                    <span>Type the six characters they shared with you.</span>
                  </div>
                  <input
                    id="pairing-code-input"
                    className="input-field"
                    type="text"
                    placeholder="ABC123"
                    value={inputCode}
                    onChange={(event) => setInputCode(event.target.value.toUpperCase())}
                    maxLength={6}
                    style={{ textAlign: 'center', letterSpacing: 6, fontSize: 22, fontWeight: 900 }}
                  />
                  <button id="pairing-join-submit" className="btn-primary" type="submit" disabled={workingId === 'redeem-code' || inputCode.length < 6}>
                    {workingId === 'redeem-code' ? <div className="spinner" /> : 'Connect'}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </motion.main>

      <AnimatePresence>
        {confirmLogout && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}>
              <h2 id="logout-title">Log out?</h2>
              <p>You will need to sign in again to pair or share photos.</p>
              <div className="dialog-actions">
                <button className="btn-ghost" type="button" onClick={() => setConfirmLogout(false)}>Cancel</button>
                <button className="btn-primary" type="button" onClick={handleLogout}>Log out</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
