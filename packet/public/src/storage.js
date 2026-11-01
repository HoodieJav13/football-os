// Guarded local storage adapter. One companion-owned key; no other key is touched.
export const STORAGE_KEY = 'coaching-session-packet:v1:saved';

function explain(error) {
  if (error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'Browser storage is full.';
  if (error?.name === 'SecurityError') return 'This browser is blocking local storage on this page.';
  return 'Browser storage is not available.';
}

/** getStorage may itself throw: merely touching localStorage can be refused. */
export function createPacketStore(getStorage) {
  const open = () => {
    const storage = getStorage();
    if (!storage) throw new Error('no storage');
    return storage;
  };
  return {
    read() {
      try {
        const text = open().getItem(STORAGE_KEY);
        return text === null ? { status: 'empty' } : { status: 'found', text };
      } catch (error) {
        return { status: 'unavailable', message: explain(error) };
      }
    },
    write(text) {
      try {
        const storage = open();
        storage.setItem(STORAGE_KEY, text);
        if (storage.getItem(STORAGE_KEY) !== text) return { ok: false, message: 'Browser storage did not keep the packet.' };
        return { ok: true };
      } catch (error) {
        return { ok: false, message: explain(error) };
      }
    },
  };
}
