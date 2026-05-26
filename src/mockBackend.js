// ============================================================
// Locket Mock Backend
// Uses localStorage for persistence + BroadcastChannel for
// cross-tab real-time sync (simulates Firestore onSnapshot)
// ============================================================

const PREFIX = 'locket_';

function genId() {
  return Math.random().toString(36).substring(2, 14);
}

function getStore(col) {
  try { return JSON.parse(localStorage.getItem(PREFIX + col) || '{}'); }
  catch { return {}; }
}

function putStore(col, data) {
  localStorage.setItem(PREFIX + col, JSON.stringify(data));
}

// ---- Cross-tab sync via BroadcastChannel ----
const channel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('locket-sync')
  : null;

const docListeners = new Map(); // "col/id" -> Set<callback>
const colListeners = new Map(); // "col" -> Set<emitFunction>

function fireListeners(col, id) {
  const key = `${col}/${id}`;
  const cbs = docListeners.get(key);
  if (cbs && cbs.size > 0) {
    const data = getStore(col)[id];
    const snap = { exists: () => !!data, data: () => (data ? { ...data } : undefined), id };
    cbs.forEach((cb) => { try { cb(snap); } catch { /* Listener errors should not stop sync. */ } });
  }
  const qCbs = colListeners.get(col);
  if (qCbs && qCbs.size > 0) {
    qCbs.forEach((cb) => { try { cb(); } catch { /* Listener errors should not stop sync. */ } });
  }
}

function broadcast(col, id) {
  fireListeners(col, id);
  channel?.postMessage({ col, id });
}

if (channel) {
  channel.onmessage = (e) => fireListeners(e.data.col, e.data.id);
}

// ============================================================
// AUTH
// ============================================================
const authCbs = new Set();
let curUser = null;

try {
  const s = sessionStorage.getItem(PREFIX + 'session');
  if (s) curUser = JSON.parse(s);
} catch {
  // Ignore unavailable or malformed session storage state in the mock backend.
}

export const auth = { get currentUser() { return curUser; } };

function setSession(u) {
  curUser = u;
  if (u) sessionStorage.setItem(PREFIX + 'session', JSON.stringify(u));
  else sessionStorage.removeItem(PREFIX + 'session');
  authCbs.forEach((cb) => cb(curUser));
}

export function onAuthStateChanged(_a, cb) {
  authCbs.add(cb);
  setTimeout(() => cb(curUser), 0);
  return () => authCbs.delete(cb);
}

export function createUserWithEmailAndPassword(_a, email, password) {
  return new Promise((resolve, reject) => {
    const users = getStore('auth_users');
    if (Object.values(users).find((u) => u.email === email)) {
      return reject({ code: 'auth/email-already-in-use' });
    }
    const uid = genId();
    users[uid] = { uid, email, password };
    putStore('auth_users', users);
    const user = { uid, email };
    setSession(user);
    resolve({ user });
  });
}

export function signInWithEmailAndPassword(_a, email, password) {
  return new Promise((resolve, reject) => {
    const users = getStore('auth_users');
    const u = Object.values(users).find((x) => x.email === email);
    if (!u) return reject({ code: 'auth/user-not-found' });
    if (u.password !== password) return reject({ code: 'auth/wrong-password' });
    const user = { uid: u.uid, email: u.email };
    setSession(user);
    resolve({ user });
  });
}

export function signOut() {
  setSession(null);
  return Promise.resolve();
}

// ============================================================
// FIRESTORE
// ============================================================
export const db = {};

export function doc(_db, ...paths) {
  const docId = paths[paths.length - 1];
  return { _c: paths.slice(0, -1).join('/'), _id: docId };
}

export function setDoc(ref, data) {
  const s = getStore(ref._c);
  s[ref._id] = { ...data };
  putStore(ref._c, s);
  broadcast(ref._c, ref._id);
  return Promise.resolve();
}

export function getDoc(ref) {
  const d = getStore(ref._c)[ref._id];
  return Promise.resolve({
    exists: () => !!d,
    data: () => (d ? { ...d } : undefined),
    id: ref._id,
  });
}

export function updateDoc(ref, data) {
  const s = getStore(ref._c);
  s[ref._id] = { ...(s[ref._id] || {}), ...data };
  putStore(ref._c, s);
  broadcast(ref._c, ref._id);
  return Promise.resolve();
}

export function onSnapshot(ref, cb, _errCb) {
  void _errCb;
  if (ref._isQuery || ref._isCol) {
    const colName = ref._c;
    if (!colListeners.has(colName)) colListeners.set(colName, new Set());

    const emit = () => {
      let items = Object.entries(getStore(colName)).map(([id, data]) => ({
        id,
        data: () => data
      }));
      if (ref._constraints) {
        const order = ref._constraints.find(c => c.type === 'orderBy');
        if (order) {
          items.sort((a, b) => {
            const vA = a.data()[order.field];
            const vB = b.data()[order.field];
            if (vA < vB) return order.direction === 'asc' ? -1 : 1;
            if (vA > vB) return order.direction === 'asc' ? 1 : -1;
            return 0;
          });
        }
      }
      cb({ docs: items });
    };

    colListeners.get(colName).add(emit);
    setTimeout(emit, 0);

    return () => {
      const set = colListeners.get(colName);
      if (set) { set.delete(emit); if (set.size === 0) colListeners.delete(colName); }
    };
  }

  const key = `${ref._c}/${ref._id}`;
  if (!docListeners.has(key)) docListeners.set(key, new Set());
  docListeners.get(key).add(cb);

  const d = getStore(ref._c)[ref._id];
  setTimeout(() => cb({ exists: () => !!d, data: () => (d ? { ...d } : undefined), id: ref._id }), 0);

  return () => {
    const set = docListeners.get(key);
    if (set) { set.delete(cb); if (set.size === 0) docListeners.delete(key); }
  };
}

export function collection(_db, ...paths) {
  return { _isCol: true, _c: paths.join('/') };
}

export function addDoc(ref, data) {
  const id = genId();
  const docRef = { _c: ref._c, _id: id };
  return setDoc(docRef, data).then(() => docRef);
}

export function query(colRef, ...constraints) {
  return { _isQuery: true, _c: colRef._c, _constraints: constraints };
}

export function orderBy(field, direction = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function where() { return {}; }
export function getDocs() { return Promise.resolve({ docs: [] }); }

// ============================================================
// STORAGE  (stores images as data-URLs in localStorage)
// ============================================================
export const storage = {};

export function ref(_s, path) {
  return { _p: path };
}

export function uploadBytes(sRef, blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const files = getStore('files');
      files[sRef._p] = e.target.result;
      putStore('files', files);
      resolve({});
    };
    reader.readAsDataURL(blob);
  });
}

export function getDownloadURL(sRef) {
  const url = getStore('files')[sRef._p];
  return url ? Promise.resolve(url) : Promise.reject(new Error('not found'));
}

// ============================================================
// GOOGLE AUTH (MOCK)
// ============================================================
export class GoogleAuthProvider {
  static credentialFromResult(_result) {
    return { accessToken: 'mock-access-token' };
  }
}

export function signInWithPopup(_authInstance, _provider) {
  return new Promise((resolve, reject) => {
    // Simulated prompt-based popup selection
    const email = window.prompt("Simulated Google Account Selection\nEnter Google email to sign in:", "google-user@test.com");
    if (!email) {
      return reject({ code: 'auth/popup-closed-by-user', message: 'The popup was closed.' });
    }
    
    // Check or create mock user auth
    const authUsers = getStore('auth_users');
    let existingUser = Object.values(authUsers).find(u => u.email === email);
    
    let uid;
    if (existingUser) {
      uid = existingUser.uid;
    } else {
      uid = `google_${genId()}`;
      authUsers[uid] = { uid, email, password: 'google-oauth-dummy-pass' };
      putStore('auth_users', authUsers);
    }
    
    const user = { uid, email };
    setSession(user);
    
    resolve({
      user,
      credential: { accessToken: 'mock-google-token' }
    });
  });
}
