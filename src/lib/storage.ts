// Persist the last loaded MIDI file in IndexedDB so it auto-restores on the next open.
const DB_NAME = 'midi-visualizer'
const STORE = 'kv'
const KEY = 'lastMidi'

type Saved = { name: string; buffer: ArrayBuffer }

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveLastMidi(name: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ name, buffer } satisfies Saved, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadLastMidi(): Promise<Saved | null> {
  try {
    const db = await openDB()
    const result = await new Promise<Saved | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as Saved | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return result
  } catch {
    return null // silently degrade if IndexedDB is unavailable
  }
}

export async function clearLastMidi(): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
