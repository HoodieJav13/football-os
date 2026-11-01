// Print paginator. Pure: packs measured blocks onto pages in order and never
// splits a block. A block taller than a page gets a page of its own, flagged.
export function paginate(blocks, pageHeight, { headerHeight = 0 } = {}) {
  const avail = pageHeight - headerHeight;
  const pages = [];
  let cur = null;
  let used = 0;
  const flush = () => {
    if (cur && cur.indices.length) pages.push(cur);
    cur = null;
    used = 0;
  };
  blocks.forEach((raw, i) => {
    const b = typeof raw === 'number' ? { h: raw } : raw;
    if (b.h > avail) {
      flush();
      pages.push({ indices: [i], oversized: true });
      return;
    }
    if (!cur || (b.breakBefore && cur.indices.length) || used + b.h > avail) {
      flush();
      cur = { indices: [], oversized: false };
    }
    cur.indices.push(i);
    used += b.h;
  });
  flush();
  return pages;
}
