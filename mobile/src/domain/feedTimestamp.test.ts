import { describe, expect, it, vi, afterEach } from 'vitest';
import { timestampLabel } from './feedTimestamp';

const t = (key: string, options?: Record<string, number>) => {
  if (key === 'time.justNow') return 'Just now';
  if (key === 'time.minutesAgo') return `${options?.count}m ago`;
  if (key === 'time.hoursAgo') return `${options?.count}h ago`;
  return key;
};

describe('timestampLabel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns justNow for missing or invalid timestamps', () => {
    expect(timestampLabel(null, t)).toBe('Just now');
    expect(timestampLabel(undefined, t)).toBe('Just now');
    expect(timestampLabel('not-a-date', t)).toBe('Just now');
  });

  it('returns relative labels for recent timestamps', () => {
    const now = new Date('2026-09-12T12:00:00.000Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(timestampLabel(new Date(now - 30 * 1000).toISOString(), t)).toBe('Just now');
    expect(timestampLabel(new Date(now - 5 * 60 * 1000).toISOString(), t)).toBe('5m ago');
    expect(timestampLabel(new Date(now - 3 * 3600 * 1000).toISOString(), t)).toBe('3h ago');
  });

  it('supports Firestore-style timestamps with toDate', () => {
    const now = new Date('2026-09-12T12:00:00.000Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const stamp = { toDate: () => new Date(now - 2 * 60 * 1000) };
    expect(timestampLabel(stamp, t)).toBe('2m ago');
  });
});
