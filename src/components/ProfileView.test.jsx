import { readFileSync } from 'node:fs';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProfileView from './ProfileView';

function renderProfile(overrides = {}) {
  const props = {
    displayName: 'Bilal',
    email: 'bilal@example.com',
    profilePic: '',
    partnerName: 'Alex',
    partnerEmail: 'alex@example.com',
    partnerPic: '',
    buildVersion: '0.2.27',
    buildCommit: 'abc1234',
    uploading: false,
    removingPairing: false,
    onPickPhoto: vi.fn(),
    onRemovePhoto: vi.fn(),
    onSaveDisplayName: vi.fn().mockResolvedValue(undefined),
    onLogout: vi.fn().mockResolvedValue(undefined),
    onRemovePairing: vi.fn().mockResolvedValue(undefined),
    notificationControls: null,
    ...overrides,
  };

  return { user: userEvent.setup(), props, ...render(<ProfileView {...props} />) };
}

describe('ProfileView', () => {
  it('renders identity plus partner name and email', () => {
    renderProfile();

    expect(screen.getByRole('heading', { name: 'Bilal' })).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('disables photo actions for upload and missing-photo states', () => {
    const { rerender, props } = renderProfile();

    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeDisabled();

    rerender(<ProfileView {...props} uploading profilePic="photo.jpg" />);

    expect(screen.getByRole('button', { name: 'Change photo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeDisabled();
  });

  it('cancels display-name edits from the button and Escape key', async () => {
    const { user, props } = renderProfile();

    await user.click(screen.getByRole('button', { name: 'Edit display name' }));
    await user.clear(screen.getByRole('textbox', { name: 'Display name' }));
    await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Changed');
    await user.click(screen.getByRole('button', { name: 'Cancel display name edit' }));

    expect(screen.queryByRole('textbox', { name: 'Display name' })).not.toBeInTheDocument();
    expect(props.onSaveDisplayName).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Edit display name' }));
    await user.clear(screen.getByRole('textbox', { name: 'Display name' }));
    await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Changed{Escape}');

    expect(screen.queryByRole('textbox', { name: 'Display name' })).not.toBeInTheDocument();
    expect(props.onSaveDisplayName).not.toHaveBeenCalled();
  });

  it('saves a trimmed display name with Enter', async () => {
    const { user, props } = renderProfile();

    await user.click(screen.getByRole('button', { name: 'Edit display name' }));
    await user.clear(screen.getByRole('textbox', { name: 'Display name' }));
    await user.type(screen.getByRole('textbox', { name: 'Display name' }), '  New Name  {Enter}');

    await waitFor(() => expect(props.onSaveDisplayName).toHaveBeenCalledWith('New Name'));
    expect(props.onSaveDisplayName).toHaveBeenCalledTimes(1);
  });

  it('shows validation and rejected-save errors for display names', async () => {
    const { user, props, rerender } = renderProfile();

    await user.click(screen.getByRole('button', { name: 'Edit display name' }));
    await user.clear(screen.getByRole('textbox', { name: 'Display name' }));
    await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'A');
    await user.click(screen.getByRole('button', { name: 'Save display name' }));

    expect(screen.getByText('Display name must be 2-30 characters.')).toBeInTheDocument();
    expect(props.onSaveDisplayName).not.toHaveBeenCalled();

    const rejectedSave = vi.fn().mockRejectedValue(new Error('nope'));
    rerender(<ProfileView {...props} onSaveDisplayName={rejectedSave} />);
    await user.clear(screen.getByRole('textbox', { name: 'Display name' }));
    await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Valid Name');
    await user.click(screen.getByRole('button', { name: 'Save display name' }));

    expect(await screen.findByText('Could not update display name.')).toBeInTheDocument();
  });

  it('shows a loading status while display-name save is pending', async () => {
    let resolveSave;
    const pendingSave = vi.fn(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    const { user } = renderProfile({ onSaveDisplayName: pendingSave });

    await user.click(screen.getByRole('button', { name: 'Edit display name' }));
    await user.clear(screen.getByRole('textbox', { name: 'Display name' }));
    await user.type(screen.getByRole('textbox', { name: 'Display name' }), 'Pending Name');
    await user.click(screen.getByRole('button', { name: 'Save display name' }));

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    resolveSave();
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument());
  });

  it('keeps About collapsed until opened and hides diagnostics by default', async () => {
    const { user } = renderProfile();

    expect(screen.queryByText('Privacy Notice')).not.toBeInTheDocument();
    expect(screen.queryByText('Terms of Use')).not.toBeInTheDocument();
    expect(screen.queryByText('v0.2.27 (abc1234)')).not.toBeInTheDocument();
    expect(screen.queryByText('Push debug')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /About/i }));

    expect(screen.getByText('Privacy Notice')).toBeInTheDocument();
    expect(screen.getByText('Terms of Use')).toBeInTheDocument();
    expect(screen.getByText('v0.2.27 (abc1234)')).toBeInTheDocument();
    expect(screen.queryByText('Push debug')).not.toBeInTheDocument();
  });

  it('shows notification diagnostics when notification controls are available', async () => {
    const notificationControls = {
      status: { permission: 'granted', enabled: true },
      diagnostics: { deviceId: 'device-1', workerState: 'activated', activeDeviceCount: 1 },
      busy: false,
      cooldownUntil: 0,
      enable: vi.fn(),
      registerDevice: vi.fn(),
      disable: vi.fn(),
      refreshDiagnostics: vi.fn(),
      testThisDevice: vi.fn(),
      testPartnerDevices: vi.fn()
    };
    const { user } = renderProfile({ notificationControls });

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Notification diagnostics')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Notification diagnostics' }));
    await user.click(screen.getByRole('button', { name: 'Register this device' }));
    await user.click(screen.getByRole('button', { name: 'Test this device' }));
    await user.click(screen.getByRole('button', { name: "Test partner's devices" }));

    expect(notificationControls.registerDevice).toHaveBeenCalledTimes(1);
    expect(notificationControls.enable).not.toHaveBeenCalled();
    expect(notificationControls.testThisDevice).toHaveBeenCalledTimes(1);
    expect(notificationControls.testPartnerDevices).toHaveBeenCalledTimes(1);
  });

  it('uses distinct dialogs for log out and remove pairing actions', async () => {
    const { user, props } = renderProfile();

    await user.click(screen.getByRole('button', { name: 'Remove pairing' }));
    let dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Remove pairing?' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(props.onRemovePairing).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove pairing' }));
    dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove pairing' }));
    expect(props.onRemovePairing).toHaveBeenCalledTimes(1);
    expect(props.onLogout).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Log out?' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(props.onLogout).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Log out' }));
    expect(props.onLogout).toHaveBeenCalledTimes(1);
  });

  it('disables the remove pairing confirmation while removal is pending', async () => {
    const { user } = renderProfile({ removingPairing: true });

    await user.click(screen.getByRole('button', { name: 'Remove pairing' }));
    const dialog = await screen.findByRole('alertdialog');

    expect(within(dialog).getByRole('button', { name: 'Removing...' })).toBeDisabled();
  });

  it('uses the balanced glass Profile structure without legacy selectors', () => {
    const source = readFileSync('src/components/ProfileView.jsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');
    const oldSelectors = [
      '.profile-info-row',
      '.profile-unpair-button',
      '.profile-link-row',
      '.profile-version',
      '.confirm-backdrop',
      '.confirm-sheet'
    ];

    expect(source.match(/profile-glass-card/g)).toHaveLength(4);
    expect(source).toContain('<NotificationSettings');
    expect(source).toContain('profile-danger-ghost');
    expect(css).toContain(`.profile-glass-card {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  background: rgba(23, 23, 23, 0.68);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2);
  -webkit-backdrop-filter: blur(24px) saturate(130%);
  backdrop-filter: blur(24px) saturate(130%);
}`);
    expect(css).toContain(`.notification-setting {
  display: grid;
  gap: 12px;
  margin-top: 2px;
  padding: 14px;
  border: 1px solid rgba(157, 170, 255, 0.22);
  border-radius: 18px;
  background: rgba(157, 170, 255, 0.08);
}`);
    expect(css).toContain(`.notification-diagnostics-actions .btn-ghost {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 14px;
  font-size: 13px;
}`);
    expect(css).toContain(`.profile-danger-card {
  border-color: rgba(255, 255, 255, 0.1);
}`);
    expect(css).toContain(`.profile-danger-ghost {
  border-color: transparent;
  background: transparent;
  color: var(--danger);
}`);
    expect(css).not.toContain(`.profile-danger-card {
  border-color: rgba(255, 92, 122, 0.22);
}`);
    oldSelectors.forEach((selector) => {
      expect(css).not.toContain(selector);
    });
  });
});
