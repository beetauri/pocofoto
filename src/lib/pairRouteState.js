function knownCoupleId(currentCoupleId, cachedCoupleId) {
  return currentCoupleId || cachedCoupleId || null;
}

export function decidePairSnapshot({
  snapshotExists,
  snapshotCoupleId,
  fromCache,
  currentCoupleId,
  cachedCoupleId
}) {
  if (snapshotCoupleId) {
    return {
      state: 'paired',
      coupleId: snapshotCoupleId,
      persist: true,
      reason: fromCache ? 'cache-paired' : 'server-paired'
    };
  }

  const knownId = knownCoupleId(currentCoupleId, cachedCoupleId);
  if (fromCache) {
    if (knownId) {
      return {
        state: 'paired',
        coupleId: knownId,
        persist: false,
        reason: 'ignored-cache-unpaired'
      };
    }

    return {
      state: 'unknown',
      coupleId: null,
      persist: false,
      reason: 'cache-unpaired-unconfirmed'
    };
  }

  return {
    state: 'unpaired',
    coupleId: null,
    persist: true,
    reason: snapshotExists ? 'server-unpaired' : 'server-user-missing'
  };
}

export function decidePairListenerError({ currentCoupleId, cachedCoupleId }) {
  const knownId = knownCoupleId(currentCoupleId, cachedCoupleId);
  if (knownId) {
    return {
      state: 'paired',
      coupleId: knownId,
      persist: false,
      reason: 'listener-error-preserved-pairing'
    };
  }

  return {
    state: 'unknown',
    coupleId: null,
    persist: false,
    reason: 'listener-error-unknown'
  };
}
