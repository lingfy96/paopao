// Single persistence layer. Business code never touches localStorage / IndexedDB directly,
// so a cloud backend (Supabase, CloudBase…) only needs to replace this file.

const EMPTY_PROFILE = { tags: [], actors: [], blacklist: [] };

let ls = null;
try {
  ls = window.localStorage;
  const probe = '__pp_probe__';
  ls.setItem(probe, '1');
  ls.removeItem(probe);
} catch {
  ls = null;
}
const memoryLs = new Map();

function sameShape(value, fallback) {
  if (fallback === undefined || fallback === null) return true;
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (typeof fallback === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === typeof fallback;
}

function get(key, fallback = null) {
  try {
    const raw = ls ? ls.getItem(key) : memoryLs.get(key);
    if (raw === null || raw === undefined) return fallback;
    const value = JSON.parse(raw);
    if (value === null || value === undefined) return fallback;
    return sameShape(value, fallback) ? value : fallback;
  } catch {
    return fallback;
  }
}

function set(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (ls) ls.setItem(key, raw);
    else memoryLs.set(key, raw);
    return true;
  } catch {
    memoryLs.set(key, JSON.stringify(value));
    return false;
  }
}

function remove(key) {
  try {
    ls ? ls.removeItem(key) : memoryLs.delete(key);
  } catch {
    memoryLs.delete(key);
  }
}

const normalizeProfile = (p) => ({
  tags: Array.isArray(p?.tags) ? p.tags.filter((x) => typeof x === 'string') : [],
  actors: Array.isArray(p?.actors) ? p.actors.filter((x) => typeof x === 'string') : [],
  blacklist: Array.isArray(p?.blacklist) ? p.blacklist.filter((x) => typeof x === 'string') : [],
});

// ---------- IndexedDB image store (with in-memory fallback) ----------
const DB_NAME = 'paopao-select';
const STORE = 'images';
const memoryImages = new Map();
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!('indexedDB' in window)) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      const timer = setTimeout(() => resolve(null), 2500);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => { clearTimeout(timer); resolve(req.result); };
      req.onerror = () => { clearTimeout(timer); resolve(null); };
      req.onblocked = () => { clearTimeout(timer); resolve(null); };
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idb(mode, fn) {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

const urlCache = new Map();

export const storage = {
  get,
  set,
  remove,

  getProfile: (who = 'profile') => normalizeProfile(get(who, EMPTY_PROFILE)),
  saveProfile: (profile, who = 'profile') => set(who, normalizeProfile(profile)),

  getWatchlist: () => get('watchlist', []).filter((x) => x && typeof x.id === 'number'),
  saveWatchlist: (list) => set('watchlist', list),

  getMemories: () => get('memories', []).filter((x) => x && typeof x.id === 'string'),
  saveMemories: (list) => set('memories', list),
  saveMemory(memory) {
    const list = storage.getMemories().filter((m) => m.id !== memory.id);
    list.unshift(memory);
    set('memories', list);
    return list;
  },

  /** Persist an image Blob. Resolves to true when it survives a reload. */
  async saveImage(key, blob) {
    memoryImages.set(key, blob);
    urlCache.delete(key);
    const ok = await idb('readwrite', (s) => s.put(blob, key));
    return ok !== undefined;
  },
  /** Resolves to an object URL or null. Never rejects. */
  async getImage(key) {
    if (!key) return null;
    if (urlCache.has(key)) return urlCache.get(key);
    let blob = memoryImages.get(key);
    if (!blob) blob = await idb('readonly', (s) => s.get(key));
    if (!(blob instanceof Blob)) return null;
    try {
      const url = URL.createObjectURL(blob);
      urlCache.set(key, url);
      return url;
    } catch {
      return null;
    }
  },
  async removeImage(key) {
    memoryImages.delete(key);
    urlCache.delete(key);
    await idb('readwrite', (s) => s.delete(key));
  },
};

export const EMPTY = EMPTY_PROFILE;
export default storage;
