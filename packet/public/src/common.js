// Small shared helpers. Pure.

/** A rejected input. Its message is safe to show the coach. */
export class PacketError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PacketError';
  }
}

export const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export const clone = (value) => JSON.parse(JSON.stringify(value));

/** Sorted keys and undefined dropped, so property order cannot change a comparison. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? 'null' : canonical(item))).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
