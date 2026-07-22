import { GeneratedImage, StickerPackageInfo, StickerType, StickerConfig } from '../types';

/**
 * Local work persistence via IndexedDB.
 *
 * Generated stickers are base64 data URLs (several MB per set), far beyond
 * localStorage limits — IndexedDB keeps finished works so a refresh (or a
 * later visit) no longer destroys the user's output.
 *
 * History: this used to keep only ONE work under a fixed 'last_work' key,
 * overwriting on every save. It now keeps a small GALLERY keyed by each
 * work's own id, capped at MAX_WORKS (oldest evicted) so the browser's
 * IndexedDB quota can't be exhausted. The legacy single record is migrated
 * on first read.
 */

const DB_NAME = 'dreamsticker';
const DB_VERSION = 1;
const STORE = 'works';
const LEGACY_KEY = 'last_work';
/** Each work is several MB; cap the gallery so we never exhaust the quota. */
export const MAX_WORKS = 30;

export interface SavedWork {
    /** Stable per-work id (used as the IndexedDB key). */
    id: string;
    savedAt: number;
    stickerType: StickerType;
    /** Target platform id (absent in pre-multi-platform saves → LINE). */
    platformId?: string;
    finalStickers: GeneratedImage[];
    stickerPackageInfo: StickerPackageInfo | null;
    zipFileName: string;
    mainStickerId: string | null;
    /** Editable upstream state, so restoring a work can step back through the
     *  flow and edit instead of dead-ending on empty screens. Absent in
     *  pre-v2 saves (those restore as a view-only finished set). */
    generatedChar?: GeneratedImage | null;
    rawSheetUrls?: string[];
    stickerConfigs?: StickerConfig[];
    inputMode?: string | null;
    stickerQuantity?: number;
    genMode?: 'SHEET' | 'INDIVIDUAL';
}

export const newWorkId = (): string => {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch { /* fall through */ }
    return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

/** Migrate the legacy single 'last_work' record into a keyed gallery entry. */
const migrateLegacy = async (db: IDBDatabase): Promise<void> => {
    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const req = store.get(LEGACY_KEY);
        req.onsuccess = () => {
            const old = req.result as SavedWork | undefined;
            if (old && old.finalStickers) {
                const id = old.id || newWorkId();
                store.put({ ...old, id }, id);
                store.delete(LEGACY_KEY);
            }
            resolve();
        };
        req.onerror = () => resolve();
    });
};

export const saveWork = async (work: SavedWork): Promise<void> => {
    try {
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(work, work.id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        await evictOldest();
    } catch (e) {
        console.warn('[persistence] save failed', e);
    }
};

/** Newest-first list of every saved work. */
export const listWorks = async (): Promise<SavedWork[]> => {
    try {
        const db = await openDb();
        await migrateLegacy(db);
        const works = await new Promise<SavedWork[]>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).getAll();
            req.onsuccess = () => resolve((req.result as SavedWork[]) ?? []);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return works
            .filter((w) => w && w.finalStickers?.some((s) => s.status === 'SUCCESS'))
            .sort((a, b) => b.savedAt - a.savedAt);
    } catch (e) {
        console.warn('[persistence] list failed', e);
        return [];
    }
};

/** Most recent saved work, or null. (Back-compat helper.) */
export const loadWork = async (): Promise<SavedWork | null> => {
    const all = await listWorks();
    return all[0] ?? null;
};

export const deleteWork = async (id: string): Promise<void> => {
    try {
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (e) {
        console.warn('[persistence] delete failed', e);
    }
};

/** Keep only the newest MAX_WORKS, deleting the oldest beyond the cap. */
const evictOldest = async (): Promise<void> => {
    const all = await listWorks();
    if (all.length <= MAX_WORKS) return;
    const stale = all.slice(MAX_WORKS);
    await Promise.all(stale.map((w) => deleteWork(w.id)));
};

/** Clears the whole gallery. */
export const clearWork = async (): Promise<void> => {
    try {
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (e) {
        console.warn('[persistence] clear failed', e);
    }
};
