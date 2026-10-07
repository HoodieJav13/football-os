/*
 * A small Web Locks model for unit tests: exclusive locks, FIFO queue,
 * ifAvailable, AbortSignal, query(), and release when a client "dies".
 * Several clients share one manager, like tabs of one origin.
 */
export function createLockManager() {
  const held = new Map(); // name -> { clientId }
  const queue = []; // { name, clientId, grant, reject, signal }
  const clients = new Map(); // clientId -> Set of release fns

  function tryGrant() {
    for (let index = 0; index < queue.length; index += 1) {
      const entry = queue[index];
      if (held.has(entry.name)) continue;
      queue.splice(index, 1);
      entry.grant();
      index = -1;
    }
  }

  function client(clientId) {
    clients.set(clientId, new Set());
    const run = (name, callback, resolve, reject) => {
      held.set(name, { clientId });
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        if (held.get(name)?.clientId === clientId) held.delete(name);
        clients.get(clientId)?.delete(release);
        queueMicrotask(tryGrant);
      };
      clients.get(clientId).add(release);
      Promise.resolve().then(() => callback({ name, mode: "exclusive" }))
        .then((value) => { release(); resolve(value); }, (error) => { release(); reject(error); });
    };
    return {
      request(name, options, callback) {
        if (typeof options === "function") { callback = options; options = {}; }
        return new Promise((resolve, reject) => {
          if (options.ifAvailable) {
            if (held.has(name) || queue.some((entry) => entry.name === name)) {
              Promise.resolve().then(() => callback(null)).then(resolve, reject);
              return;
            }
            run(name, callback, resolve, reject);
            return;
          }
          const entry = { name, clientId, grant: () => run(name, callback, resolve, reject) };
          if (options.signal) {
            if (options.signal.aborted) { reject(new DOMException("aborted", "AbortError")); return; }
            options.signal.addEventListener("abort", () => {
              const index = queue.indexOf(entry);
              if (index >= 0) { queue.splice(index, 1); reject(new DOMException("aborted", "AbortError")); }
            });
          }
          queue.push(entry);
          tryGrant();
        });
      },
      async query() {
        return {
          held: [...held.entries()].map(([name, value]) => ({ name, mode: "exclusive", clientId: value.clientId })),
          pending: queue.map((entry) => ({ name: entry.name, mode: "exclusive", clientId: entry.clientId })),
        };
      },
    };
  }

  /** The browser destroying a client's document releases everything it held. */
  function kill(clientId) {
    for (const release of [...(clients.get(clientId) ?? [])]) release();
    for (let index = queue.length - 1; index >= 0; index -= 1) if (queue[index].clientId === clientId) queue.splice(index, 1);
  }

  return { client, kill, held };
}

/** A BroadcastChannel hub that can be told to drop messages. */
export function createChannelHub() {
  const members = new Set();
  const hub = {
    dropping: false,
    create() {
      const channel = {
        onmessage: null,
        postMessage(data) {
          if (hub.dropping) return;
          for (const other of members) if (other !== channel) queueMicrotask(() => other.onmessage?.({ data }));
        },
        close() { members.delete(channel); },
      };
      members.add(channel);
      return channel;
    },
  };
  return hub;
}

export const flush = async (rounds = 8) => { for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

export function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
}
