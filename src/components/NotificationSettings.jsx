import { useState } from 'react';
import { useTranslation } from 'react-i18next';

function permissionCopy(status, t) {
  if (status.permission === 'denied') return t('setting.denied');
  if (status.permission === 'unsupported') return t('setting.unsupported');
  if (status.enabled) return t('setting.enabled');
  if (status.permission === 'granted') return t('setting.permissionOnly');
  return t('setting.disabled');
}

function formatLastTest(lastTest, t) {
  if (!lastTest) return t('diagnostics.noTest');
  if (lastTest.outcome === 'no_registered_devices' || lastTest.tokenCount === 0) return t('diagnostics.noDevices');
  const tokenCount = lastTest.tokenCount ?? 0;
  const successCount = lastTest.successCount ?? 0;
  const failureCount = lastTest.failureCount ?? 0;
  return t('diagnostics.accepted', { successCount, tokenCount, failureCount });
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
  const { t } = useTranslation('notifications');
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
          <span className="profile-card-label">{t('setting.title')}</span>
          <p>{permissionCopy({ ...status, enabled }, t)}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('setting.title')}
          className={`notification-switch${enabled ? ' enabled' : ''}`}
          disabled={disabled}
          onClick={handleToggle}
        >
          <span>{enabled ? t('setting.on') : t('setting.off')}</span>
        </button>
      </div>

      <button className="notification-diagnostics-toggle" type="button" onClick={handleExpand} aria-expanded={expanded}>
        {t('diagnostics.toggle')}
      </button>

      {expanded && (
        <div className="notification-diagnostics">
          <dl>
            <div>
              <dt>{t('diagnostics.permission')}</dt>
              <dd>{status.permission || diagnostics.permission || 'unknown'}</dd>
            </div>
            <div>
              <dt>{t('diagnostics.serviceWorker')}</dt>
              <dd>{diagnostics.workerState || 'unknown'}</dd>
            </div>
            <div>
              <dt>{t('diagnostics.device')}</dt>
              <dd>{diagnostics.deviceId || 'unknown'}</dd>
            </div>
            <div>
              <dt>{t('diagnostics.token')}</dt>
              <dd>{diagnostics.tokenFingerprint || 'not registered'}</dd>
            </div>
            {status.registrationError && (
              <div>
                <dt>{t('diagnostics.registration')}</dt>
                <dd>{status.registrationError.reason || status.registrationError.message}</dd>
              </div>
            )}
            <div>
              <dt>{t('diagnostics.partnerDevices')}</dt>
              <dd>{diagnostics.partnerTokenCount ?? 'unknown'}</dd>
            </div>
          </dl>
          <p className="notification-status">{formatLastTest(diagnostics.lastTest, t)}</p>
          <div className="notification-diagnostics-actions">
            <button className="btn-ghost" type="button" onClick={onRegisterDevice || onEnable} disabled={disabled || busy}>
              {t('diagnostics.register')}
            </button>
            <button className="btn-ghost" type="button" onClick={onTestThisDevice} disabled={testDisabled}>
              {t('diagnostics.testThis')}
            </button>
            <button className="btn-ghost" type="button" onClick={onTestPartnerDevices} disabled={testDisabled}>
              {t('diagnostics.testPartner')}
            </button>
          </div>
          {inCooldown && <p className="notification-status">{t('diagnostics.cooldown')}</p>}
        </div>
      )}
    </div>
  );
}
