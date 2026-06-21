import { useEffect, useState } from 'react';
import { Check, ChevronDown, Link2Off, LogOut, Pencil, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import NotificationSettings from './NotificationSettings';

const iconProps = { strokeWidth: 2.4, 'aria-hidden': true };

function initialsFor(name, email) {
  const source = name || email || '?';
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function Avatar({ src, name, email, size = 'md' }) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        className="profile-avatar"
        data-size={size}
        src={src}
        alt=""
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="profile-avatar profile-avatar-initials" data-size={size}>
      {initialsFor(name, email)}
    </div>
  );
}

export default function ProfileView({
  displayName,
  email,
  profilePic,
  partnerName,
  partnerEmail,
  partnerPic,
  buildVersion,
  buildCommit,
  uploading,
  removingPairing,
  onPickPhoto,
  onRemovePhoto,
  onSaveDisplayName,
  onLogout,
  onRemovePairing,
  notificationControls
}) {
  const { t } = useTranslation(['profile', 'common']);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName);
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [removePairingOpen, setRemovePairingOpen] = useState(false);

  useEffect(() => {
    if (editingName) return;
    setDraftName(displayName);
  }, [displayName, editingName]);

  const handleStartNameEdit = () => {
    setDraftName(displayName);
    setNameError('');
    setEditingName(true);
  };

  const handleCancelNameEdit = () => {
    setDraftName(displayName);
    setNameError('');
    setEditingName(false);
  };

  const handleSaveName = async () => {
    if (savingName) return;

    const trimmedName = draftName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 30) {
      setNameError(t('nameLengthError'));
      return;
    }

    setSavingName(true);
    setNameError('');
    try {
      await onSaveDisplayName(trimmedName);
      setEditingName(false);
    } catch (err) {
      console.error(err);
      setNameError(t('nameSaveError'));
    } finally {
      setSavingName(false);
    }
  };

  const handleNameKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSaveName();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelNameEdit();
    }
  };

  const handleRemovePairing = () => {
    if (removingPairing) return;
    onRemovePairing();
  };

  return (
    <section className="profile-screen" aria-label={t('screenLabel')}>
      <div className="profile-content">
        <header className="profile-identity">
          <Avatar src={profilePic} name={displayName} email={email} size="lg" />
          <div className="profile-identity-copy">
            <h1>{displayName}</h1>
            <p>{email}</p>
          </div>
          <div className="profile-photo-actions">
            <Button className="profile-action-button" type="button" variant="outline" onClick={onPickPhoto} disabled={uploading}>
              {t('changePhoto')}
            </Button>
            <Button className="profile-action-button" type="button" variant="outline" onClick={onRemovePhoto} disabled={uploading || !profilePic}>
              {t('removePhoto')}
            </Button>
          </div>
        </header>

        <Card className="profile-glass-card profile-partner-card">
          <span className="profile-card-label">{t('pairedWith')}</span>
          <div className="profile-partner-row">
            <Avatar src={partnerPic} name={partnerName} size="md" />
            <div className="profile-partner-copy">
              <strong>{partnerName}</strong>
              <span>{partnerEmail || t('hiddenEmail')}</span>
            </div>
          </div>
        </Card>

        <Card className="profile-glass-card profile-account-card">
          <span className="profile-card-label">{t('account')}</span>
          <div className={`profile-field-row profile-display-name-row${editingName ? ' editing' : ''}`}>
            <span>{t('displayName')}</span>
            {editingName ? (
              <div className="profile-edit-stack">
                <div className="profile-edit-row">
                  <Input
                    className="profile-name-input"
                    type="text"
                    value={draftName}
                    minLength={2}
                    maxLength={30}
                    autoFocus
                    disabled={savingName}
                    onChange={(event) => {
                      setDraftName(event.target.value);
                      setNameError('');
                    }}
                    onKeyDown={handleNameKeyDown}
                    aria-label={t('displayName')}
                  />
                  <div className="profile-edit-actions">
                    <Button type="button" variant="ghost" size="icon" aria-label={t('cancelNameEdit')} onClick={handleCancelNameEdit} disabled={savingName}>
                      <X {...iconProps} />
                    </Button>
                    <Button type="button" size="icon" aria-label={t('saveName')} onClick={handleSaveName} disabled={savingName}>
                      {savingName ? <Spinner /> : <Check {...iconProps} />}
                    </Button>
                  </div>
                </div>
                {nameError && <p className="profile-inline-error">{nameError}</p>}
              </div>
            ) : (
              <div className="profile-value-row">
                <strong>{displayName}</strong>
                <Button type="button" variant="ghost" size="icon" aria-label={t('editName')} onClick={handleStartNameEdit}>
                  <Pencil {...iconProps} />
                </Button>
              </div>
            )}
          </div>
          <div className="profile-field-row">
            <span>{t('email')}</span>
            <strong>{email}</strong>
          </div>
          <div className="profile-field-row">
            <span>{t('signIn')}</span>
            <strong>{t('google')}</strong>
          </div>
        </Card>

        <Card className="profile-glass-card profile-about-card">
          <Collapsible open={aboutOpen} onOpenChange={setAboutOpen}>
            <CollapsibleTrigger asChild>
              <Button className="profile-about-trigger" type="button" variant="ghost" aria-label={t('about')}>
                <span>{t('about')}</span>
                <ChevronDown className="profile-about-chevron" data-open={aboutOpen ? 'true' : 'false'} {...iconProps} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="profile-about-content">
                <div className="profile-legal-links">
                  <a href="#privacy" onClick={(event) => event.preventDefault()}>{t('privacy')}</a>
                  <a href="#terms" onClick={(event) => event.preventDefault()}>{t('terms')}</a>
                </div>
                <div className="profile-build-block">
                  <span>{t('common:version')}</span>
                  <strong>v{buildVersion} ({buildCommit})</strong>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {notificationControls && (
          <NotificationSettings
            status={notificationControls.status}
            diagnostics={notificationControls.diagnostics || {}}
            busy={notificationControls.busy}
            cooldownUntil={notificationControls.cooldownUntil}
            onEnable={notificationControls.enable}
            onDisable={notificationControls.disable}
            onRefreshDiagnostics={notificationControls.refreshDiagnostics}
            onRegisterDevice={notificationControls.registerDevice}
            onTestThisDevice={notificationControls.testThisDevice}
            onTestPartnerDevices={notificationControls.testPartnerDevices}
          />
        )}

        <Card className="profile-glass-card profile-danger-card">
          <AlertDialog open={removePairingOpen} onOpenChange={setRemovePairingOpen}>
            <Button className="profile-danger-action profile-danger-ghost" type="button" variant="ghost" onClick={() => setRemovePairingOpen(true)}>
              <Link2Off {...iconProps} />
              {t('removePairing.action')}
            </Button>
            <AlertDialogContent className="profile-alert-dialog">
              <AlertDialogHeader className="profile-alert-header">
                <AlertDialogTitle className="profile-alert-title">{t('removePairing.title')}</AlertDialogTitle>
                <AlertDialogDescription className="profile-alert-description">
                  {t('removePairing.body')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="profile-alert-actions">
                <AlertDialogCancel className="profile-alert-button profile-alert-cancel" disabled={removingPairing}>{t('common:actions.cancel')}</AlertDialogCancel>
                <AlertDialogAction className="profile-alert-button profile-alert-destructive" variant="destructive" disabled={removingPairing} onClick={handleRemovePairing}>
                  {removingPairing ? t('removePairing.removing') : t('removePairing.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
            <Button className="profile-danger-action profile-danger-ghost" type="button" variant="ghost" onClick={() => setLogoutOpen(true)}>
              <LogOut {...iconProps} />
              {t('logout.action')}
            </Button>
            <AlertDialogContent className="profile-alert-dialog">
              <AlertDialogHeader className="profile-alert-header">
                <AlertDialogTitle className="profile-alert-title">{t('logout.title')}</AlertDialogTitle>
                <AlertDialogDescription className="profile-alert-description">
                  {t('logout.body')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="profile-alert-actions">
                <AlertDialogCancel className="profile-alert-button profile-alert-cancel">{t('common:actions.cancel')}</AlertDialogCancel>
                <AlertDialogAction className="profile-alert-button profile-alert-destructive" variant="destructive" onClick={onLogout}>
                  {t('logout.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
        <img className="easter-egg-mark" src="/senavebilal.svg" alt="" aria-hidden="true" />
      </div>
    </section>
  );
}
