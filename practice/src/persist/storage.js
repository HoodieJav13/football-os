// localStorage adapter. Every access is guarded: failures are returned as
// { ok: false, error } and never thrown, so the in-memory plan stays usable.
// getBackend is a function because merely touching window.localStorage can
// throw (blocked site data, some private modes).

function describe(e) {
  const name = e && e.name;
  if (name === 'QuotaExceededError' || /quota/i.test(String(e && e.message))) return 'Browser storage is full (quota exceeded).';
  if (name === 'SecurityError') return 'Browser storage is unavailable (access denied).';
  return `Browser storage error: ${e && e.message ? e.message : String(e)}`;
}

export function createStorage(getBackend) {
  function backend() {
    try {
      const b = getBackend();
      if (!b) return { error: 'Browser storage is unavailable.' };
      return { b };
    } catch (e) {
      return { error: describe(e) };
    }
  }
  return {
    read(key) {
      const { b, error } = backend();
      if (error) return { ok: false, error };
      let raw;
      try {
        raw = b.getItem(key);
      } catch (e) {
        return { ok: false, error: describe(e) };
      }
      if (raw === null || raw === undefined) return { ok: true, value: null };
      try {
        return { ok: true, value: JSON.parse(raw) };
      } catch {
        return { ok: false, error: `Saved data under “${key}” is corrupt (not valid JSON).` };
      }
    },
    write(key, value) {
      const { b, error } = backend();
      if (error) return { ok: false, error };
      try {
        b.setItem(key, JSON.stringify(value));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: describe(e) };
      }
    },
    remove(key) {
      const { b, error } = backend();
      if (error) return { ok: false, error };
      try {
        b.removeItem(key);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: describe(e) };
      }
    },
  };
}

export const KEYS = { project: 'pwp:v1:project', clock: 'pwp:v1:clock', meta: 'pwp:v1:meta', lease: 'pwp:v1:lease', prefs: 'pwp:v1:prefs' };
