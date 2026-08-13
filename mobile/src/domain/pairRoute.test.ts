import { describe, expect, it } from 'vitest';
import { decidePairListenerError, decidePairSnapshot } from './pairRoute';

describe('native pair routing', () => {
  it('does not downgrade a known pairing from a cache-only null snapshot', () => {
    expect(decidePairSnapshot({
      snapshotExists: true,
      snapshotCoupleId: null,
      fromCache: true,
      currentCoupleId: 'couple-1',
      cachedCoupleId: 'couple-1'
    })).toMatchObject({ state: 'paired', coupleId: 'couple-1', persist: false });
  });

  it('keeps an unknown route unknown when Firestore listener fails before a pairing is known', () => {
    expect(decidePairListenerError(null, null)).toMatchObject({ state: 'unknown', coupleId: null });
  });
});
