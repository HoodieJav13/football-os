// Competing-writer guard: one writer lease plus a revision check. Pure.
export const LEASE_TTL_MS = 8000;
export const LEASE_HEARTBEAT_MS = 2000;

export function makeLease(instanceId, now) {
  return { instanceId, heartbeatAt: now };
}

// 'mine' | 'other' (fresh lease held by another tab) | 'free'
export function evaluateLease(lease, myId, now, ttl = LEASE_TTL_MS) {
  if (!lease || typeof lease !== 'object' || typeof lease.instanceId !== 'string' || !Number.isFinite(lease.heartbeatAt)) return 'free';
  if (lease.instanceId === myId) return 'mine';
  const age = now - lease.heartbeatAt;
  if (age > ttl) return 'free';
  if (age < -ttl) return 'free'; // dated in the future: the wall clock changed; treat as stale
  return 'other';
}

// May this tab write now? Never overwrite a newer saved revision silently.
export function planWrite({ lease, myId, now, storedRev, baseRev }) {
  if (evaluateLease(lease, myId, now) === 'other') return { allowed: false, reason: 'read-only' };
  // A newer revision, or saved data that vanished after this tab saved it, is a
  // conflict: never overwrite it or recreate it silently.
  if ((storedRev ?? null) !== (baseRev ?? null)) return { allowed: false, reason: 'conflict' };
  return { allowed: true, reason: 'ok' };
}
