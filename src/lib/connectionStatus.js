const DEFAULT_RESTORED_DURATION = 3000;

function canUseWindow(win) {
  return Boolean(win?.addEventListener && win?.navigator);
}

export function getInitialConnectionStatus(navigatorLike = globalThis.navigator) {
  return {
    isOnline: navigatorLike?.onLine !== false,
    status: navigatorLike?.onLine === false ? 'offline' : 'online'
  };
}

export function createConnectionStatusStore(
  win = typeof window !== 'undefined' ? window : null,
  { restoredDuration = DEFAULT_RESTORED_DURATION } = {}
) {
  let state = getInitialConnectionStatus(win?.navigator);
  let restoredTimer = null;
  const listeners = new Set();

  const emit = () => {
    listeners.forEach((listener) => listener(state));
  };

  const setState = (nextState) => {
    state = nextState;
    emit();
  };

  const clearRestoredTimer = () => {
    if (!restoredTimer || !win?.clearTimeout) return;
    win.clearTimeout(restoredTimer);
    restoredTimer = null;
  };

  const handleOffline = () => {
    clearRestoredTimer();
    setState({ isOnline: false, status: 'offline' });
  };

  const handleOnline = () => {
    clearRestoredTimer();
    setState({ isOnline: true, status: 'restored' });
    restoredTimer = win.setTimeout(() => {
      restoredTimer = null;
      setState({ isOnline: true, status: 'online' });
    }, restoredDuration);
  };

  if (canUseWindow(win)) {
    win.addEventListener('offline', handleOffline);
    win.addEventListener('online', handleOnline);
  }

  return {
    getSnapshot() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      clearRestoredTimer();
      if (!canUseWindow(win)) return;
      win.removeEventListener('offline', handleOffline);
      win.removeEventListener('online', handleOnline);
    }
  };
}

export const connectionStatusStore = createConnectionStatusStore();
