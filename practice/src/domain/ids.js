// Stable id factory: `${prefix}-${base36}`. Ids are opaque; display names never
// derive identity. Seeded factories are deterministic (fixtures, tests);
// unseeded ones use crypto randomness when available.
import { mulberry32 } from './rng.js';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomSource(seed) {
  if (seed !== undefined) return mulberry32(seed);
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(64);
    let i = buf.length;
    return () => {
      if (i >= buf.length) { c.getRandomValues(buf); i = 0; }
      return buf[i++] / 4294967296;
    };
  }
  return Math.random;
}

export function createIdFactory({ seed } = {}) {
  const rand = randomSource(seed);
  const issued = new Set();
  return function newId(prefix = 'id') {
    for (;;) {
      let s = '';
      for (let i = 0; i < 10; i++) s += ALPHABET[Math.floor(rand() * 36)];
      const id = `${prefix}-${s}`;
      if (!issued.has(id)) {
        issued.add(id);
        return id;
      }
    }
  };
}

export const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;
