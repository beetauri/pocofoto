import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import NotificationSettings from './NotificationSettings';

it('keeps denied notifications visible with generic settings guidance', () => {
  render(<NotificationSettings status={{ permission: 'denied', enabled: false }} diagnostics={{}} />);

  expect(screen.getByRole('switch', { name: 'Notifications' })).not.toBeChecked();
  expect(screen.getByText('Allow notifications in your browser or device settings.')).toBeVisible();
});

it('keeps diagnostics collapsed and reports zero registered devices as non-success', async () => {
  render(
    <NotificationSettings
      status={{ permission: 'granted', enabled: true }}
      diagnostics={{ lastTest: { outcome: 'no_registered_devices', tokenCount: 0 } }}
    />
  );

  expect(screen.queryByText('No registered devices')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Notification diagnostics' }));
  expect(screen.getByText('No registered devices')).toBeVisible();
});

it('shows the last registration error in diagnostics', async () => {
  render(
    <NotificationSettings
      status={{
        permission: 'granted',
        enabled: false,
        registrationError: { reason: 'messaging/unsupported-browser', message: 'Messaging token unavailable' }
      }}
      diagnostics={{}}
    />
  );

  await userEvent.click(screen.getByRole('button', { name: 'Notification diagnostics' }));
  expect(screen.getByText('Registration')).toBeVisible();
  expect(screen.getByText('messaging/unsupported-browser')).toBeVisible();
});

it('offers registration, current-device, and partner-device tests', async () => {
  const registerDevice = vi.fn();
  const testThisDevice = vi.fn();
  const testPartnerDevices = vi.fn();

  render(
    <NotificationSettings
      status={{ permission: 'granted', enabled: true }}
      diagnostics={{}}
      onRegisterDevice={registerDevice}
      onTestThisDevice={testThisDevice}
      onTestPartnerDevices={testPartnerDevices}
    />
  );

  await userEvent.click(screen.getByRole('button', { name: 'Notification diagnostics' }));
  await userEvent.click(screen.getByRole('button', { name: 'Register this device' }));
  expect(registerDevice).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Test this device' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Test your person’s devices' })).toBeVisible();
});
