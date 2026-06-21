import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import SentryErrorFallback from './SentryErrorFallback'

describe('SentryErrorFallback', () => {
  it('reports the exact captured event', async () => {
    const user = userEvent.setup()
    const onReport = vi.fn()

    render(
      <SentryErrorFallback
        eventId="event-123"
        onReport={onReport}
        onReload={() => {}}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Tell us what happened' }))
    expect(onReport).toHaveBeenCalledWith('event-123')
  })

  it('offers a reload recovery action', async () => {
    const user = userEvent.setup()
    const onReload = vi.fn()

    render(
      <SentryErrorFallback
        eventId="event-123"
        onReport={() => {}}
        onReload={onReload}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Restart Pocofoto' }))
    expect(onReload).toHaveBeenCalledOnce()
  })
})
