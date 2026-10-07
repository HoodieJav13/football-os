/*
 * One editor per workspace.
 *
 * Exclusion comes from a Web Lock, which the browser grants to exactly one
 * same-origin client at a time and releases only when that client lets go or
 * its document is destroyed. Nothing here can take the lock from a holder:
 * there is no `steal`, no timeout, no reload. A hidden or frozen editor keeps
 * it; a tab that wants to edit queues for it and the editor hands over once
 * its unfinished drafts are resolved and its changes are saved.
 *
 * Every acquisition starts a new *lease* with its own epoch. The durable
 * store refuses writes whose data does not belong to the current lease, so a
 * callback created under an earlier lease -- a debounce timer, a hide
 * listener, an awaited continuation -- cannot write after the lease ends.
 *
 * Notifications are an optimisation only. A BroadcastChannel message tells
 * the editor someone is waiting, but the editor also polls `locks.query()`,
 * which reports queued requests as browser state rather than as an event that
 * can be missed; viewers poll the same way to learn whether an editor exists.
 *
 * Without Web Locks there is no way to keep two tabs apart, so the app fails
 * closed: it opens view-only and says why.
 */

export const EDITOR_LOCK = "football-os.editor";
const CHANNEL_NAME = "football-os.editor";
const leaseLockName = (tabId, epoch) => `${EDITOR_LOCK}.lease.${tabId}.${epoch}`;

const randomId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).slice(0, 13);

export function createEditorAuthority({
  locks = globalThis.navigator?.locks,
  createChannel = (name) => (typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null),
  pollMs = 1000,
  setTimer = (fn, ms) => globalThis.setInterval(fn, ms),
  clearTimer = (id) => globalThis.clearInterval(id),
  tabId = randomId(),
} = {}) {
  let state = {
    status: "starting",
    epoch: 0,
    /** Editor: another tab is queued for the lock. */
    requested: false,
    /** Editor: why handover is waiting, if it is. */
    blocked: null,
    /** Viewer/requester: whether any tab holds the lock (null until known). */
    editorPresent: null,
    /** Requester: what the editor last said is holding it up. */
    editorBlocked: null,
    /** Why this tab is not editing, when there is something to explain. */
    reason: null,
  };
  const listeners = new Set();
  let handlers = { acquire: () => {}, prepareHandover: () => ({ ok: true }), demote: () => {} };
  let lease = null;
  let epochCounter = 0;
  let pendingRequest = null;
  let channel = null;
  let poller = null;
  let started = false;

  const emit = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const post = (message) => {
    try { channel?.postMessage({ ...message, from: tabId }); } catch { /* best effort */ }
  };

  const isCurrent = (epoch) => Boolean(lease?.active && lease.epoch === epoch);

  function beginLease() {
    epochCounter += 1;
    const epoch = epochCounter;
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    // baseline: tabs already queued when this lease began. They asked the
    // previous editor, not this one, so they are not handed the lock the
    // moment this tab gets it; a fresh request (message) or a new queue entry
    // is needed. Without this, two queued tabs bounce the first one out within
    // a poll of its coach choosing Edit here.
    lease = { epoch, active: true, release, leaseLockHeld: false, clientId: null, baseline: null, freshRequest: false };
    pendingRequest = null;
    try {
      // Reread durable state under the lock, before anything can edit.
      handlers.acquire(epoch);
    } catch (error) {
      lease.active = false;
      release();
      emit({ status: "viewer", epoch: 0, reason: { kind: "acquire-failed", message: error?.message ?? String(error) } });
      return held;
    }
    // A second, lease-specific lock lets the editor confirm later that the
    // browser still considers it the holder, and tells it its own clientId.
    const current = lease;
    locks.request(leaseLockName(tabId, epoch), { ifAvailable: true }, (lock) => {
      if (!lock) return undefined;
      current.leaseLockHeld = true;
      poll();
      return held;
    }).catch(() => {});
    emit({ status: "editor", epoch, requested: false, blocked: null, editorBlocked: null, editorPresent: true, reason: null });
    return held;
  }

  function release(kind) {
    if (!lease?.active) return;
    lease.active = false;
    lease.release();
    emit({ status: "viewer", epoch: 0, requested: false, blocked: null, editorPresent: null, reason: { kind } });
    post({ type: "released" });
  }

  /**
   * Reads the lock state for the current lease, or null when the answer is
   * stale: the lease changed, or its lease lock was granted, while the query
   * was in flight. Acting on a snapshot from before an acquisition finished
   * could see this tab's own queued request, or miss its new lease lock.
   */
  async function leaseSnapshot() {
    const current = lease;
    if (!current?.active || !locks?.query) return null;
    const wasHeld = current.leaseLockHeld;
    let snapshot;
    try { snapshot = await locks.query(); } catch { return null; }
    if (lease !== current || !current.active || current.leaseLockHeld !== wasHeld) return null;
    const held = snapshot.held ?? [];
    const own = held.find((entry) => entry.name === leaseLockName(tabId, current.epoch));
    if (own) current.clientId = own.clientId;
    const others = (snapshot.pending ?? []).filter((entry) => entry.name === EDITOR_LOCK && entry.clientId !== current.clientId);
    return { current, wasHeld, held, own, others };
  }

  function requestedFrom(current, others) {
    if (!current.leaseLockHeld) return false;
    if (current.baseline === null) {
      current.baseline = new Set(others.map((entry) => entry.clientId));
      if (others.length) post({ type: "deferred" });
    }
    return others.some((entry) => current.freshRequest || !current.baseline.has(entry.clientId));
  }

  let handingOver = false;
  /**
   * Hands over if someone is still waiting and the app says it is safe. The
   * queue is re-read first, so a requester that cancelled or closed since the
   * last poll is not handed a lock nobody will take.
   */
  async function tryHandover() {
    if (!lease?.active || !state.requested || handingOver) return;
    handingOver = true;
    try {
      const view = await leaseSnapshot();
      if (!view) return;
      const { current, others } = view;
      if (!requestedFrom(current, others)) {
        emit({ requested: false, blocked: null });
        return;
      }
      let result;
      try {
        result = handlers.prepareHandover(current.epoch);
      } catch (error) {
        result = { ok: false, blocked: { kind: "save", message: error?.message ?? String(error) } };
      }
      if (result?.ok) {
        release("handed-over");
        return;
      }
      const blocked = result?.blocked ?? { kind: "unknown" };
      if (JSON.stringify(blocked) !== JSON.stringify(state.blocked)) {
        emit({ blocked });
        post({ type: "blocked", blocked });
      }
    } finally {
      handingOver = false;
    }
  }

  async function poll() {
    if (!locks?.query) return;
    if (lease?.active) {
      const view = await leaseSnapshot();
      if (!view) return;
      const { current, wasHeld, own, others } = view;
      if (wasHeld && !own) {
        // The browser no longer counts this tab as the holder (for example a
        // suspended page whose locks were released). Stop writing at once and
        // let go of the editor lock too, so no tab waits on it forever; the
        // live branch stays in memory for the coach to preserve.
        current.active = false;
        current.release();
        // Before anything re-renders as view-only (which unmounts editors and
        // drops their drafts), let the app keep what is unfinished.
        try { handlers.demote("lost"); } catch { /* best effort; the live branch is still in memory */ }
        emit({ status: "viewer", epoch: 0, requested: false, blocked: null, editorPresent: null, reason: { kind: "lost" } });
        post({ type: "released" });
        return;
      }
      const requested = requestedFrom(current, others);
      if (requested !== state.requested) emit({ requested, blocked: requested ? state.blocked : null });
      if (requested) tryHandover();
      return;
    }
    let snapshot;
    try { snapshot = await locks.query(); } catch { return; }
    if (lease?.active) return;
    const editorPresent = (snapshot.held ?? []).some((entry) => entry.name === EDITOR_LOCK);
    if (editorPresent !== state.editorPresent) emit({ editorPresent });
  }

  function onMessage(event) {
    const message = event?.data;
    if (!message || message.from === tabId) return;
    if (message.type === "request" && lease?.active) lease.freshRequest = true;
    if (["request", "released", "cancel"].includes(message.type)) poll();
    if (message.type === "blocked" && state.status === "requesting") emit({ editorBlocked: message.blocked });
    if (message.type === "deferred" && state.status === "requesting") emit({ editorBlocked: { kind: "deferred" } });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect(next) { handlers = { ...handlers, ...next }; },
    isCurrent,

    start() {
      if (started) return;
      started = true;
      if (typeof locks?.request !== "function") {
        emit({ status: "unsupported", reason: { kind: "unsupported" } });
        return;
      }
      try { channel = createChannel(CHANNEL_NAME); } catch { channel = null; }
      if (channel) channel.onmessage = onMessage;
      poller = setTimer(() => { poll(); }, pollMs);
      // A resumed or re-shown tab re-checks at once rather than at the next tick.
      globalThis.addEventListener?.("pageshow", () => poll());
      globalThis.document?.addEventListener?.("visibilitychange", () => poll());
      locks.request(EDITOR_LOCK, { ifAvailable: true }, (lock) => {
        if (lock) return beginLease();
        emit({ status: "viewer", editorPresent: true });
        poll();
        return undefined;
      }).catch((error) => {
        emit({ status: "unsupported", reason: { kind: "unsupported", message: error?.message ?? String(error) } });
      });
    },

    /** Queues for the lock. Granted only when the editor lets go. */
    requestEdit() {
      if (state.status !== "viewer") return;
      const controller = new AbortController();
      pendingRequest = controller;
      emit({ status: "requesting", editorBlocked: null, reason: null });
      locks.request(EDITOR_LOCK, { signal: controller.signal }, () => beginLease())
        .catch(() => {
          if (pendingRequest === controller) {
            pendingRequest = null;
            emit({ status: "viewer", editorBlocked: null });
          }
        });
      post({ type: "request" });
    },

    cancelRequest() {
      if (state.status !== "requesting" || !pendingRequest) return;
      const controller = pendingRequest;
      pendingRequest = null;
      controller.abort();
      emit({ status: "viewer", editorBlocked: null });
      post({ type: "cancel" });
      poll();
    },

    /** The app calls this whenever drafts clear or a save succeeds. */
    tryHandover,
    poll,

    /** For tests and teardown only. */
    stop() {
      if (poller) clearTimer(poller);
      poller = null;
      try { channel?.close(); } catch { /* ignore */ }
    },
  };
}

let shared = null;
/** The per-document authority. One per tab, created on first use. */
export function getEditorAuthority() {
  if (!shared) shared = createEditorAuthority();
  return shared;
}
