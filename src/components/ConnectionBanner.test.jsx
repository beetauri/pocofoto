import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ConnectionBanner from './ConnectionBanner';

describe('ConnectionBanner', () => {
  it('shows offline copy in a polite status alert', () => {
    render(<ConnectionBanner status="offline" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('A little offline, but your camera still works.')).toBeInTheDocument();
    expect(screen.getByText('Reconnect when you’re ready to send or pair.')).toBeInTheDocument();
  });

  it('shows restored copy without the offline description', () => {
    render(<ConnectionBanner status="restored" />);

    expect(screen.getByRole('status')).toHaveTextContent('You’re back online.');
    expect(screen.queryByText('Reconnect when you’re ready to send or pair.')).not.toBeInTheDocument();
  });

  it('does not render when the app is online', () => {
    const { container } = render(<ConnectionBanner status="online" />);

    expect(container).toBeEmptyDOMElement();
  });
});
