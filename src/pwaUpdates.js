const UPDATE_COMPLETED_KEY = 'pocofoto:pwa-update-completed';
const UPDATE_READY_EVENT = 'pocofoto:update-ready';

let updateServiceWorker = null;
let state = {
  applying: false,
  ready: false
};
const listeners = new Set();
let consumedUpdatedVersion;

function canUseWindow() {
  return typeof window !== 'undefined';
}

function canUseSessionStorage() {
  if (!canUseWindow()) return false;
  try {
    const key = 'pocofoto:storage-check';
    window.sessionStorage.setItem(key, '1');
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function emitStateChange() {
  listeners.forEach((listener) => listener(state));
}

function emitUpdateReadyEvent() {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent(UPDATE_READY_EVENT, {
    detail: { internal: true }
  }));
}

export function setPwaUpdateServiceWorker(updater) {
  updateServiceWorker = updater;
}

export function markPwaUpdateReady() {
  state = {
    ...state,
    ready: true
  };
  emitStateChange();
  emitUpdateReadyEvent();
}

export function applyPwaUpdate() {
  if (!updateServiceWorker) return false;
  state = {
    ...state,
    applying: true
  };
  emitStateChange();
  updateServiceWorker(true);
  return true;
}

export function markPwaReloadPending() {
  if (!canUseSessionStorage()) return;
  window.sessionStorage.setItem(UPDATE_COMPLETED_KEY, '1');
}

export function consumePwaUpdatedVersion(version) {
  if (consumedUpdatedVersion !== undefined) return consumedUpdatedVersion;
  if (!canUseSessionStorage()) return '';
  if (window.sessionStorage.getItem(UPDATE_COMPLETED_KEY) !== '1') {
    consumedUpdatedVersion = '';
    return consumedUpdatedVersion;
  }
  window.sessionStorage.removeItem(UPDATE_COMPLETED_KEY);
  consumedUpdatedVersion = version;
  return consumedUpdatedVersion;
}

export function getPwaUpdateState() {
  return state;
}

export function subscribeToPwaUpdateState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (canUseWindow()) {
  window.addEventListener(UPDATE_READY_EVENT, (event) => {
    if (event.detail?.internal) return;
    markPwaUpdateReady();
  });
}
