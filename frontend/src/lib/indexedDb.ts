const DB_NAME = 'binny_offline';
const DB_VERSION = 1;
const STORE_PENDING_SCANS = 'pending_scans';

export interface PendingScan {
  id: string;
  barcode: string;
  sessionType: 'trace' | 'pack' | 'dispatch';
  scannedAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PENDING_SCANS)) {
        const store = db.createObjectStore(STORE_PENDING_SCANS, { keyPath: 'id' });
        store.createIndex('scannedAt', 'scannedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  const tx = db.transaction(STORE_PENDING_SCANS, mode);
  return tx.objectStore(STORE_PENDING_SCANS);
}

export async function addPendingScanToDB(scan: PendingScan): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = getStore(db, 'readwrite');
    const request = store.put(scan);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function getAllPendingScans(): Promise<PendingScan[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = getStore(db, 'readonly');
    const request = store.getAll();
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function deletePendingScan(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = getStore(db, 'readwrite');
    const request = store.delete(id);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function clearAllPendingScans(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = getStore(db, 'readwrite');
    const request = store.clear();
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
