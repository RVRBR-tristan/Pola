// ── Galerie persistante (IndexedDB) ──
// Chaque entrée conserve la photo source (blob JPEG pleine résolution)
// et les réglages — le polaroid reste modifiable à tout moment.

const DB_NAME = 'pola';
const STORE = 'shots';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbPromise;
}

const req = (r) =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

export async function putShot(shot) {
  const d = await openDb();
  return req(d.transaction(STORE, 'readwrite').objectStore(STORE).put(shot));
}

export async function getShot(id) {
  const d = await openDb();
  return req(d.transaction(STORE, 'readonly').objectStore(STORE).get(id));
}

export async function getAllShots() {
  const d = await openDb();
  return req(d.transaction(STORE, 'readonly').objectStore(STORE).getAll());
}

export async function deleteShots(ids) {
  const d = await openDb();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    for (const id of ids) s.delete(id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
