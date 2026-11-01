// Views are plain trees, so Node tests can inspect exactly what would be mounted.
// Text only ever becomes a text node and attributes only ever go through
// setAttribute: untrusted data cannot become markup.
const SVG_NS = 'http://www.w3.org/2000/svg';
const BLOCKED_ATTRIBUTE = /^(on|style$|href$|src$|srcdoc$|xlink:)/i;

function normalizeChildren(children) {
  return children.flat(Infinity)
    .filter((child) => child !== null && child !== undefined && child !== false && child !== '')
    .map((child) => (typeof child === 'number' ? String(child) : child));
}

export const h = (tag, attrs, ...children) => ({ tag, svg: false, attrs: attrs ?? {}, children: normalizeChildren(children) });

export const svg = (tag, attrs, ...children) => ({ tag, svg: true, attrs: attrs ?? {}, children: normalizeChildren(children) });

export function mount(node, doc) {
  if (typeof node === 'string') return doc.createTextNode(node);
  const element = node.svg ? doc.createElementNS(SVG_NS, node.tag) : doc.createElement(node.tag);
  for (const [name, value] of Object.entries(node.attrs)) {
    if (BLOCKED_ATTRIBUTE.test(name)) throw new Error(`Attribute not allowed in views: ${name}`);
    if (value !== null && value !== undefined && value !== false) element.setAttribute(name, String(value));
  }
  for (const child of node.children) element.appendChild(mount(child, doc));
  return element;
}

/** All visible text of a view, for tests. */
export function viewText(node) {
  if (typeof node === 'string') return node;
  return node.children.map(viewText).join(' ');
}
