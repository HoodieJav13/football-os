/** Optional play metadata: it never changes alignment or assignment geometry. */
export function normalizeFieldSide(value) {
  if (value === undefined) return 'none';
  if (!['left', 'right', 'none'].includes(value)) throw new Error('Field side must be left, right, or none.');
  return value;
}

export function fieldSideText(value, view = 'end') {
  const side = normalizeFieldSide(value);
  if (side === 'none') return '';
  // Sideline rotates the field: positive lateral yards point down the screen.
  if (view === 'side') return side === 'right' ? 'FIELD ↓' : 'FIELD ↑';
  return side === 'right' ? 'FIELD →' : '← FIELD';
}
