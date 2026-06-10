const DB_NAME = 'pocofoto-offline-drafts';
const STORE_NAME = 'reviewDrafts';
const DB_VERSION = 1;

export function createReviewDraftKey(userId, coupleId) {
  return `${userId}::${coupleId}`;
}

function getIndexedDB() {
  if (typeof indexedDB === 'undefined') return null;
  return indexedDB;
}

function createIndexedDBAdapter() {
  const openDatabase = () => new Promise((resolve, reject) => {
    const idb = getIndexedDB();
    if (!idb) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error || new Error('Unable to open offline draft database.'));
    request.onsuccess = () => resolve(request.result);
  });

  const runTransaction = async (mode, operation) => {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);

      request.onerror = () => reject(request.error || new Error('Offline draft operation failed.'));
      request.onsuccess = () => resolve(request.result || null);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('Offline draft transaction failed.'));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error('Offline draft transaction aborted.'));
      };
    });
  };

  return {
    put(key, value) {
      return runTransaction('readwrite', (store) => store.put(value, key));
    },
    get(key) {
      return runTransaction('readonly', (store) => store.get(key));
    },
    delete(key) {
      return runTransaction('readwrite', (store) => store.delete(key));
    }
  };
}

export function createOfflineReviewDraftStore(adapter = createIndexedDBAdapter()) {
  return {
    saveDraft(key, draft) {
      return adapter.put(key, draft);
    },
    loadDraft(key) {
      return adapter.get(key);
    },
    clearDraft(key) {
      return adapter.delete(key);
    }
  };
}

const defaultStore = createOfflineReviewDraftStore();

export function saveOfflineReviewDraft(key, draft) {
  return defaultStore.saveDraft(key, draft);
}

export function loadOfflineReviewDraft(key) {
  return defaultStore.loadDraft(key);
}

export function clearOfflineReviewDraft(key) {
  return defaultStore.clearDraft(key);
}
