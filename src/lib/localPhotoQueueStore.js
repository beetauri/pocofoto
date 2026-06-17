const DB_NAME = 'pocofoto-local-photo-queue';
const STORE_NAME = 'queuedPhotos';
const DB_VERSION = 1;

export function createLocalPhotoQueueKey(userId, coupleId) {
  return `${userId}::${coupleId}::local-photo-queue`;
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
    request.onerror = () => reject(request.error || new Error('Unable to open local photo queue database.'));
    request.onsuccess = () => resolve(request.result);
  });

  const runTransaction = async (mode, operation) => {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);

      request.onerror = () => reject(request.error || new Error('Local photo queue operation failed.'));
      request.onsuccess = () => resolve(request.result || null);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('Local photo queue transaction failed.'));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error('Local photo queue transaction aborted.'));
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

export function createLocalPhotoQueueStore(adapter = createIndexedDBAdapter()) {
  return {
    saveQueue(key, photos) {
      return adapter.put(key, photos);
    },
    loadQueue(key) {
      return adapter.get(key);
    },
    clearQueue(key) {
      return adapter.delete(key);
    }
  };
}

const defaultStore = createLocalPhotoQueueStore();

export function saveLocalPhotoQueue(key, photos) {
  return defaultStore.saveQueue(key, photos);
}

export function loadLocalPhotoQueue(key) {
  return defaultStore.loadQueue(key);
}

export function clearLocalPhotoQueue(key) {
  return defaultStore.clearQueue(key);
}
