import { useState } from 'react';

function permissionCopy(status = {}) {
  if (status.registrationError?.message) return status.registrationError.message;
  if (status.permission === 'denied') return 'Enable notifications in your browser or device settings.';
  if (status.permission === 'unsupported') return 'Notifications are unavailable in this browser.';
  if (status.enabled) return 'This device is enabled for Pocofoto notifications.';
  if (status.permission === 'granted') return 'Permission is granted, but this device still needs a registered push token.';
  return 'Enable this device to receive Pocofoto notifications.';
}

function formatLastTest(lastTest) {
  if (!lastTest) return 'No test sent yet.';
  if (lastTest.outcome === 'no_registered_devices' || lastTest.tokenCount === 0) return 'No registered devices';
  const tokenCount = lastTest.tokenCount ?? 0;
  const successCount = lastTest.successCount ?? 0;
  const failureCount = lastTest.failureCount ?? 0;
  return `Accepted by FCM: ${successCount}/${tokenCount}, failed: ${failureCount}`;
}

export default function NotificationSettings({
  status = {},
  diagnostics = {},
  busy = false,
  cooldownUntil = 0,
  onEnable,
  onDisable,
  onRefreshDiagnostics,
  onRegisterDevice,
  onTestThisDevice,
  onTestPartnerDevices
}) {
  const [expanded, setExpanded] = useState(false);
  const enabled = Boolean(status.enabled);
  const disabled = busy || status.permission === 'unsupported';
  const inCooldown = cooldownUntil > Date.now();
  const testDisabled = busy || inCooldown || !enabled;

  const handleToggle = async () => {
    if (disabled) return;
    if (enabled) await onDisable?.();
    else await onEnable?.();
  };

  const handleExpand = async () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) await onRefreshDiagnostics?.();
  };

  return (
    <div className="notification-setting">
      <div className="notification-setting-row">
        <div>
          <span className="profile-card-label">Notifications</span>
          <p>{permissionCopy({ ...status, enabled })}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Notifications"
          className={`notification-switch${enabled ? ' enabled' : ''}`}
          disabled={disabled}
          onClick={handleToggle}
        >
          <span>{enabled ? 'On' : 'Off'}</span>
        </button>
      </div>

      <button className="notification-diagnostics-toggle" type="button" onClick={handleExpand} aria-expanded={expanded}>
        Notification diagnostics
      </button>

      {expanded && (
        <div className="notification-diagnostics">
          <dl>
            <div>
              <dt>Permission</dt>
              <dd>{status.permission || diagnostics.permission || 'unknown'}</dd>
            </div>
            <div>
              <dt>Service worker</dt>
              <dd>{diagnostics.workerState || 'unknown'}</dd>
            </div>
            <div>
              <dt>Device</dt>
              <dd>{diagnostics.deviceId || 'unknown'}</dd>
            </div>
            <div>
              <dt>Token</dt>
              <dd>{diagnostics.tokenFingerprint || 'not registered'}</dd>
            </div>
            <div>
              <dt>Partner devices</dt>
              <dd>{diagnostics.partnerTokenCount ?? 'unknown'}</dd>
            </div>
          </dl>
          <p className="notification-status">{formatLastTest(diagnostics.lastTest)}</p>
          <div className="notification-diagnostics-actions">
            <button className="btn-ghost" type="button" onClick={onRegisterDevice || onEnable} disabled={disabled || busy}>
              Register this device
            </button>
            <button className="btn-ghost" type="button" onClick={onTestThisDevice} disabled={testDisabled}>
              Test this device
            </button>
            <button className="btn-ghost" type="button" onClick={onTestPartnerDevices} disabled={testDisabled}>
              Test partner's devices
            </button>
          </div>
          {inCooldown && <p className="notification-status">Test cooldown is active.</p>}
        </div>
      )}
    </div>
  );
}
