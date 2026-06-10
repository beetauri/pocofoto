const USER_ROUTE_CACHE_PREFIX = 'pocofoto:user-route:';

function cacheKey(userId) {
  return `${USER_ROUTE_CACHE_PREFIX}${userId}`;
}

function canUseStorage(storage) {
  return Boolean(storage?.getItem && storage?.setItem && storage?.removeItem);
}

export function getCachedUserRoute(userId, storage = globalThis.localStorage) {
  if (!userId || !canUseStorage(storage)) return null;

  try {
    const rawRoute = storage.getItem(cacheKey(userId));
    if (!rawRoute) return null;

    const route = JSON.parse(rawRoute);
    if (!route || typeof route !== 'object') return null;

    return {
      coupleId: route.coupleId || null,
      updatedAt: route.updatedAt || null
    };
  } catch {
    return null;
  }
}

export function setCachedUserRoute(userId, route, storage = globalThis.localStorage) {
  if (!userId || !canUseStorage(storage)) return;

  try {
    storage.setItem(cacheKey(userId), JSON.stringify({
      coupleId: route?.coupleId || null,
      updatedAt: new Date().toISOString()
    }));
  } catch {
    // localStorage can throw in private mode or when quota is full.
  }
}

export function clearCachedUserRoute(userId, storage = globalThis.localStorage) {
  if (!userId || !canUseStorage(storage)) return;

  try {
    storage.removeItem(cacheKey(userId));
  } catch {
    // Ignore storage failures; routing can still fall back to live state.
  }
}
