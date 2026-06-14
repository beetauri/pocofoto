export default function NotificationPrompt({ open, onEnable, onDismiss, busy }) {
  if (!open) return null;

  return (
    <div className="notification-prompt" role="dialog" aria-labelledby="notification-prompt-title">
      <div>
        <strong id="notification-prompt-title">Turn on notifications?</strong>
        <p>Get a quiet heads-up when your person sends a photo, likes a photo, or responds to pairing.</p>
      </div>
      <div className="notification-prompt-actions">
        <button className="btn-ghost" type="button" onClick={onDismiss} disabled={busy}>
          Not now
        </button>
        <button className="btn-primary" type="button" onClick={onEnable} disabled={busy}>
          {busy ? 'Enabling...' : 'Enable notifications'}
        </button>
      </div>
    </div>
  );
}
