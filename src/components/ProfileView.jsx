import { useEffect, useState } from 'react';
import { Check, ChevronDown, Link2Off, LogOut, Pencil, X } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';

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
  pushDebugEnabled,
  pushDebugResult,
  registeringPushDebug,
  sendingPushDebug,
  onRegisterPushDebug,
  onSendPushDebug
}) {
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
      setNameError('Display name must be 2-30 characters.');
      return;
    }

    setSavingName(true);
    setNameError('');
    try {
      await onSaveDisplayName(trimmedName);
      setEditingName(false);
    } catch (err) {
      console.error(err);
      setNameError('Could not update display name.');
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
    <section className="profile-screen" aria-label="Profile">
      <div className="profile-content">
        <header className="profile-identity">
          <Avatar src={profilePic} name={displayName} email={email} size="lg" />
          <div className="profile-identity-copy">
            <h1>{displayName}</h1>
            <p>{email}</p>
          </div>
          <div className="profile-photo-actions">
            <Button className="profile-action-button" type="button" variant="outline" onClick={onPickPhoto} disabled={uploading}>
              Change photo
            </Button>
            <Button className="profile-action-button" type="button" variant="outline" onClick={onRemovePhoto} disabled={uploading || !profilePic}>
              Remove photo
            </Button>
          </div>
        </header>

        <Card className="profile-glass-card profile-partner-card">
          <span className="profile-card-label">Paired with</span>
          <div className="profile-partner-row">
            <Avatar src={partnerPic} name={partnerName} size="md" />
            <strong>{partnerName}</strong>
          </div>
        </Card>

        <Card className="profile-glass-card profile-account-card">
          <span className="profile-card-label">Account</span>
          <div className={`profile-field-row profile-display-name-row${editingName ? ' editing' : ''}`}>
            <span>Display name</span>
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
                    aria-label="Display name"
                  />
                  <div className="profile-edit-actions">
                    <Button type="button" variant="ghost" size="icon" aria-label="Cancel display name edit" onClick={handleCancelNameEdit} disabled={savingName}>
                      <X {...iconProps} />
                    </Button>
                    <Button type="button" size="icon" aria-label="Save display name" onClick={handleSaveName} disabled={savingName}>
                      {savingName ? <Spinner /> : <Check {...iconProps} />}
                    </Button>
                  </div>
                </div>
                {nameError && <p className="profile-inline-error">{nameError}</p>}
              </div>
            ) : (
              <div className="profile-value-row">
                <strong>{displayName}</strong>
                <Button type="button" variant="ghost" size="icon" aria-label="Edit display name" onClick={handleStartNameEdit}>
                  <Pencil {...iconProps} />
                </Button>
              </div>
            )}
          </div>
          <div className="profile-field-row">
            <span>Email</span>
            <strong>{email}</strong>
          </div>
          <div className="profile-field-row">
            <span>Sign-in</span>
            <strong>Google</strong>
          </div>
        </Card>

        <Card className="profile-glass-card profile-about-card">
          <Collapsible open={aboutOpen} onOpenChange={setAboutOpen}>
            <CollapsibleTrigger asChild>
              <Button className="profile-about-trigger" type="button" variant="ghost" aria-label="About">
                <span>About</span>
                <ChevronDown className="profile-about-chevron" data-open={aboutOpen ? 'true' : 'false'} {...iconProps} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="profile-about-content">
                <div className="profile-legal-links">
                  <a href="#privacy" onClick={(event) => event.preventDefault()}>Privacy Notice</a>
                  <a href="#terms" onClick={(event) => event.preventDefault()}>Terms of Use</a>
                </div>
                <div className="profile-version-block">
                  <span>Version</span>
                  <strong>v{buildVersion} ({buildCommit})</strong>
                </div>
                {pushDebugEnabled && (
                  <>
                    <Separator />
                    <div className="profile-diagnostics">
                      <span className="profile-card-label">Diagnostics</span>
                      <div className="profile-debug-actions">
                        <Button type="button" variant="outline" onClick={onRegisterPushDebug} disabled={registeringPushDebug}>
                          {registeringPushDebug ? 'Registering...' : 'Register this device'}
                        </Button>
                        <Button type="button" variant="outline" onClick={onSendPushDebug} disabled={sendingPushDebug}>
                          {sendingPushDebug ? 'Sending...' : 'Send test push to partner'}
                        </Button>
                      </div>
                      <p className="profile-debug-result">
                        {pushDebugResult || 'Enable, register this browser, then send a test push.'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card className="profile-glass-card profile-danger-card">
          <AlertDialog open={removePairingOpen} onOpenChange={setRemovePairingOpen}>
            <Button className="profile-danger-action" type="button" variant="destructive" onClick={() => setRemovePairingOpen(true)}>
              <Link2Off {...iconProps} />
              Remove pairing
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove pairing?</AlertDialogTitle>
                <AlertDialogDescription>
                  Old shared history will no longer be visible. Both of you can pair again whenever you are ready.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={removingPairing}>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={removingPairing} onClick={handleRemovePairing}>
                  {removingPairing ? 'Removing...' : 'Remove pairing'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
            <Button className="profile-danger-action" type="button" variant="outline" onClick={() => setLogoutOpen(true)}>
              <LogOut {...iconProps} />
              Log out
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Log out?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will need to sign in with Google again to use Pocofoto.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onLogout}>
                  Log out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      </div>
    </section>
  );
}
