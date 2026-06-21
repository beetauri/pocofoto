import { useTranslation } from 'react-i18next';

export default function NotificationPrompt({ open, onEnable, onDismiss, busy }) {
  const { t } = useTranslation(['notifications', 'common']);
  if (!open) return null;

  return (
    <div className="notification-prompt" role="dialog" aria-labelledby="notification-prompt-title">
      <div>
        <strong id="notification-prompt-title">{t('prompt.title')}</strong>
        <p>{t('prompt.body')}</p>
      </div>
      <div className="notification-prompt-actions">
        <button className="btn-ghost" type="button" onClick={onDismiss} disabled={busy}>
          {t('common:actions.notNow')}
        </button>
        <button className="btn-primary" type="button" onClick={onEnable} disabled={busy}>
          {busy ? t('prompt.enabling') : t('prompt.enable')}
        </button>
      </div>
    </div>
  );
}
