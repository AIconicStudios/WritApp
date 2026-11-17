/** Tiny IndexedDB key/value store — persistent, private app storage on the phone. */
const DB = "cashless-edit";
const STORE = "kv";
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp)
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  return dbp;
}

export async function kvGet<T = unknown>(key: string): Promise<T | undefined> {
  const d = await open();
  return new Promise((res, rej) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result as T);
    r.onerror = () => rej(r.error);
  });
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(value, key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
export async function kvDel(key: string): Promise<void> {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, "readwrite");
    t.objectStore(STORE).delete(key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
export async function kvKeys(prefix: string): Promise<string[]> {
  const d = await open();
  return new Promise((res, rej) => {
    const r = d.transaction(STORE).objectStore(STORE).getAllKeys();
    r.onsuccess = () => res((r.result as string[]).filter((k) => String(k).startsWith(prefix)));
    r.onerror = () => rej(r.error);
  });
}
