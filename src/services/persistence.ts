import { GeneratedImage, StickerPackageInfo, StickerType } from '../types';

/**
 * Local work persistence via IndexedDB.
 * Generated stickers are base64 data URLs (several MB per set), far beyond
 * localStorage limits — IndexedDB keeps the last finished work so a page
 * refresh no longer destroys the user's output.
 */

const DB_NAME = 'dreamsticker';
const DB_VERSION = 1;
const STORE = 'works';
const KEY = 'last_work';

export interface SavedWork {
    savedAt: number;
    stickerType: StickerType;
    /** Target platform id (absent in pre-multi-platform saves → LINE). */
    platformId?: string;
    finalStickers: GeneratedImage[];
    stickerPackageInfo: StickerPackageInfo | null;
    zipFileName: string;
    mainStickerId: string | null;
}

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

export const saveWork = async (work: SavedWork): Promise<void> => {
    try {
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(work, KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (e) {
        console.warn('[persistence] save failed', e);
    }
};

export const loadWork = async (): Promise<SavedWork | null> => {
    try {
        const db = await openDb();
        const work = await new Promise<SavedWork | null>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(KEY);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return work;
    } catch (e) {
        console.warn('[persistence] load failed', e);
        return null;
    }
};

export const clearWork = async (): Promise<void> => {
    try {
        const db = await openDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (e) {
        console.warn('[persistence] clear failed', e);
    }
};
