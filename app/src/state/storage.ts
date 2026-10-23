// Small key-value store in the browser (IndexedDB), used for the recovery copy and recent jobs.
// Works offline. The interface lets tests use an in-memory store instead.

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  /** Every key that starts with the prefix. */
  keys(prefix: string): Promise<string[]>
}

export function memoryStore(): KeyValueStore {
  const map = new Map<string, unknown>()
  return {
    get: async <T,>(key: string) => map.get(key) as T | undefined,
    set: async (key, value) => {
      map.set(key, value)
    },
    delete: async (key) => {
      map.delete(key)
    },
    keys: async (prefix) => [...map.keys()].filter((k) => k.startsWith(prefix)),
  }
}

const DB_NAME = 'axisbuilder'
const STORE = 'kv'

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

/** IndexedDB store; null when the browser has no IndexedDB (or blocks it, e.g. some private windows). */
export function indexedDbStore(): KeyValueStore | null {
  if (typeof indexedDB === 'undefined') return null
  let dbPromise: Promise<IDBDatabase> | null = null
  const db = (): Promise<IDBDatabase> => {
    dbPromise ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(STORE)
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    return dbPromise
  }
  const run = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const tx = (await db()).transaction(STORE, mode)
    return request(fn(tx.objectStore(STORE)))
  }
  return {
    get: <T,>(key: string) => run('readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
    set: async (key, value) => {
      await run('readwrite', (s) => s.put(value, key))
    },
    delete: async (key) => {
      await run('readwrite', (s) => s.delete(key))
    },
    keys: async (prefix) => {
      const all = await run('readonly', (s) => s.getAllKeys())
      return all.map(String).filter((k) => k.startsWith(prefix))
    },
  }
}
