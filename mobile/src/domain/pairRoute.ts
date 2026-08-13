export type PairRouteState = 'paired' | 'unpaired' | 'unknown';

export type PairRouteDecision = {
  state: PairRouteState;
  coupleId: string | null;
  persist: boolean;
  reason: string;
};

export function decidePairSnapshot({
  snapshotExists,
  snapshotCoupleId,
  fromCache,
  currentCoupleId,
  cachedCoupleId
}: {
  snapshotExists: boolean;
  snapshotCoupleId: string | null;
  fromCache: boolean;
  currentCoupleId: string | null;
  cachedCoupleId: string | null;
}): PairRouteDecision {
  if (fromCache && !snapshotCoupleId && (currentCoupleId || cachedCoupleId)) {
    return { state: 'paired', coupleId: currentCoupleId || cachedCoupleId, persist: false, reason: 'cache-null-preserved' };
  }

  if (snapshotExists && snapshotCoupleId) {
    return { state: 'paired', coupleId: snapshotCoupleId, persist: true, reason: fromCache ? 'cache-paired' : 'server-paired' };
  }

  if (!fromCache) {
    return { state: 'unpaired', coupleId: null, persist: true, reason: snapshotExists ? 'server-unpaired' : 'server-user-missing' };
  }

  return { state: 'unknown', coupleId: currentCoupleId || cachedCoupleId || null, persist: false, reason: 'cache-unresolved' };
}

export function decidePairListenerError(currentCoupleId: string | null, cachedCoupleId: string | null): PairRouteDecision {
  if (currentCoupleId || cachedCoupleId) {
    return { state: 'paired', coupleId: currentCoupleId || cachedCoupleId, persist: false, reason: 'listener-error-preserved' };
  }

  return { state: 'unknown', coupleId: null, persist: false, reason: 'listener-error-unknown' };
}
