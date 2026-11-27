import { TimeoutError, type LocalStore } from '@midnight-ntwrk/mn-passport-core';

const ENTRIES = 'entries';
const MAX_KEY_BYTES = 120;
const BLOCKED_MS = 5_000;

function checked(key: string): string {
  // The Node.js store cannot keep a lone surrogate apart, so both stores refuse it.
  if (/\p{Cs}/u.test(key)) throw new TypeError('A store key must be well-formed UTF-16.');
  if (new TextEncoder().encode(key).length > MAX_KEY_BYTES) {
    throw new TypeError(`A store key has at most ${MAX_KEY_BYTES} UTF-8 bytes.`);
  }
  return key;
}

function settled<A>(request: IDBRequest<A>): Promise<A> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- `onerror` runs only when `error` holds a DOMException.
    request.onerror = () => reject(request.error);
  });
}

// A connection that this adapter did not open can block the delete with no end.
function deleted(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    let timer: ReturnType<typeof setTimeout> | undefined;
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve();
    };
    request.onerror = () => {
      clearTimeout(timer);
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- `onerror` runs only when `error` holds a DOMException.
      reject(request.error);
    };
    request.onblocked = () => {
      timer = setTimeout(() => reject(new TimeoutError(BLOCKED_MS)), BLOCKED_MS);
    };
  });
}

/** `wipe()` deletes the IndexedDB database named `namespace`. */
export function indexedDbStore(namespace: string): LocalStore {
  let opened: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => {
    if (opened) return opened;
    const request = indexedDB.open(namespace, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(ENTRIES);
    const next = settled(request).then((db) => {
      // A wipe in another tab must not wait for this connection.
      db.onversionchange = () => {
        db.close();
        opened = undefined;
      };
      db.onclose = () => (opened = undefined);
      return db;
    });
    next.catch(() => (opened = undefined));
    return (opened = next);
  };
  const transact = async <A>(
    mode: IDBTransactionMode,
    work: (entries: IDBObjectStore) => IDBRequest<A>,
  ): Promise<A> => {
    const transaction = (await open()).transaction(ENTRIES, mode);
    const request = work(transaction.objectStore(ENTRIES));
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(request.result);
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- The adapter never calls `abort()`, so `error` holds a DOMException here.
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  };

  return {
    async get(key) {
      const id = checked(key);
      const value = await transact<unknown>('readonly', (entries) => entries.get(id));
      return value instanceof Uint8Array ? value : undefined;
    },
    async set(key, value) {
      const id = checked(key);
      // A view stores its whole buffer, so store a copy of the view only.
      await transact('readwrite', (entries) => entries.put(value.slice(), id));
    },
    async delete(key) {
      const id = checked(key);
      await transact('readwrite', (entries) => entries.delete(id));
    },
    async keys() {
      const keys = await transact('readonly', (entries) => entries.getAllKeys());
      return keys.filter((key): key is string => typeof key === 'string');
    },
    async wipe() {
      const db = await opened?.catch(() => undefined);
      db?.close();
      opened = undefined;
      await deleted(namespace);
    },
  };
}
