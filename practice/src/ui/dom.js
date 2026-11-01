// Safe element builder. Text always goes in as text nodes; there is no path
// for data to reach innerHTML, event-handler attributes or script URLs.
export const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'line', 'circle', 'rect', 'text', 'path', 'polygon', 'defs', 'marker', 'title', 'tspan', 'polyline']);
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction']);
const BOOL_PROPS = new Set(['checked', 'disabled', 'selected', 'hidden', 'readOnly', 'required', 'multiple']);

export function createH(doc) {
  function append(el, child) {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) {
      for (const c of child) append(el, c);
      return;
    }
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(doc.createTextNode(String(child)));
      return;
    }
    el.appendChild(child);
  }

  return function h(tag, attrs, ...children) {
    const el = SVG_TAGS.has(tag) ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
    let value;
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'innerHTML' || k === 'outerHTML') throw new Error('innerHTML is not allowed; pass text children.');
        if (/^on/i.test(k) && k !== 'on') throw new Error(`Inline event attribute “${k}” is not allowed; use on: { … }.`);
        if (v === null || v === undefined || v === false) continue;
        if (k === 'on') {
          for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
        } else if (k === 'style') {
          if (typeof v !== 'object') throw new Error('style must be an object of properties.');
          for (const [sk, sv] of Object.entries(v)) {
            if (sk.startsWith('--') && el.style.setProperty) el.style.setProperty(sk, String(sv));
            else el.style[sk] = sv;
          }
        } else if (k === 'value') {
          value = v;
        } else if (BOOL_PROPS.has(k)) {
          el[k] = true;
          el.setAttribute(k === 'readOnly' ? 'readonly' : k, '');
        } else if (k === 'dataset') {
          for (const [dk, dv] of Object.entries(v)) el.setAttribute(`data-${dk.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, String(dv));
        } else {
          const s = v === true ? '' : String(v);
          if (URL_ATTRS.has(k) && /^\s*(javascript|vbscript|data):/i.test(s)) throw new Error(`Unsafe URL in ${k}.`);
          el.setAttribute(k, s);
        }
      }
    }
    for (const c of children) append(el, c);
    if (value !== undefined) el.value = String(value);
    return el;
  };
}

export const h = typeof document !== 'undefined' ? createH(document) : null;

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}
