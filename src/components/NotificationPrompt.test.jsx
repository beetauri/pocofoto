import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import NotificationPrompt from './NotificationPrompt';

it('offers enable and permanent not-now actions', async () => {
  const onEnable = vi.fn();
  const onDismiss = vi.fn();

  render(<NotificationPrompt open onEnable={onEnable} onDismiss={onDismiss} busy={false} />);

  await userEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
  await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

  expect(onEnable).toHaveBeenCalledOnce();
  expect(onDismiss).toHaveBeenCalledOnce();
});

it('does not render while closed', () => {
  render(<NotificationPrompt open={false} onEnable={() => {}} onDismiss={() => {}} busy={false} />);

  expect(screen.queryByText('Turn on notifications?')).not.toBeInTheDocument();
});
