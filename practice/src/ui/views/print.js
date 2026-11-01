// Print views: weekly summary, day coach script, rotation sheet, scout cards
// (4 per page). Blocks are measured and packed onto fixed letter pages by an
// explicit paginator, so a block or card is never split across pages.
import { h, clear } from '../dom.js';
import { computeSchedule } from '../../domain/week.js';
import { validateRotation, rotationRows } from '../../domain/rotation.js';
import { formatClock12, formatMinutes } from '../../domain/time.js';
import { renderDiagram } from '../diagram.js';
import { paginate } from '../paginate.js';
import { CATEGORY_LABEL, byId } from './common.js';
import { printFitError } from '../../domain/cards.js';
import { schemePrintLines } from '../../domain/schemeHandoff.js';

const KINDS = { week: 'Weekly summary', day: 'Coach script', rotation: 'Rotation sheet', cards: 'Scout cards' };

export function renderPrint(main, ctx) {
  const { app } = ctx;
  const kind = KINDS[app.route.id] ? app.route.id : 'week';
  const id = app.route.sub;
  const days = app.project.week.days;
  const dayOpts = (k) => days.map((d) => h('a', { class: `day-pill${kind === k && id === d.id ? ' is-active' : ''}`, href: `#/print/${k}/${encodeURIComponent(d.id)}` }, d.label));
  main.append(h('header', { class: 'page-head print-toolbar' },
    h('div', { class: 'page-title' }, h('h1', null, `Print · ${KINDS[kind]}`)),
    h('p', { class: 'page-sub' }, 'White pages, grayscale-safe labels. Every page is marked FICTIONAL / REFERENCE with the project and day version.'),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'print', on: { click: () => window.print() } }, 'Print'),
      h('a', { class: 'btn', href: '#/print/week' }, 'Weekly summary'),
      h('a', { class: 'btn', href: '#/print/cards/all' }, 'All cards')),
    h('div', { class: 'print-pick' }, h('span', { class: 'muted small' }, 'Coach script: '), dayOpts('day')),
    h('div', { class: 'print-pick' }, h('span', { class: 'muted small' }, 'Rotation sheet: '), dayOpts('rotation')),
    h('div', { class: 'print-pick' }, h('span', { class: 'muted small' }, 'Cards for a day: '), dayOpts('cards'))));
  const info = h('p', { class: 'muted small', 'data-print-info': '' });
  main.append(info);
  const root = document.getElementById('print-root');
  const meta = renderPrintInto(root, { app }, { kind, id });
  root.style.setProperty('--sheet-zoom', String(Math.min(1, (window.innerWidth - 32) / (8.5 * 96))));
  info.textContent = `${meta.pages} page${meta.pages === 1 ? '' : 's'} (US Letter, 0.5 in margins).${meta.oversized ? ` ${meta.oversized} block(s) are taller than a page and print on their own page.` : ''}${meta.solo ? ` ${meta.solo} card(s) need more room than a quarter page and print on their own page.` : ''}${meta.unprintable ? ` ⚠ ${meta.unprintable} card(s) are too long to print without cutting text and are not printed — shorten them first.` : ''}`;
}

// Fill #print-root. Without an explicit target, print what the current view shows.
export function renderPrintInto(root, { app }, target) {
  let kind = target?.kind;
  let id = target?.id;
  if (!kind) {
    const r = app.route;
    if (r.name === 'print') return renderPrintInto(root, { app }, { kind: r.id || 'week', id: r.sub });
    if (r.name === 'rotation') { kind = 'rotation'; id = app.ui.rotationDayId; }
    else if (r.name === 'cards' || r.name === 'card') { kind = 'cards'; id = r.name === 'card' && r.id !== 'new' ? r.id : 'all'; }
    else if (r.name === 'plan' || r.name === 'run' || r.name === 'assist') { kind = 'day'; id = r.name === 'plan' ? app.ui.selectedDayId : app.ui.runDayId; }
    else kind = 'week';
  }
  const p = app.project;
  const day = byId(p.week.days, id);
  if ((kind === 'day' || kind === 'rotation') && !day) kind = 'week';
  const header = headerText(p, kind, kind === 'day' || kind === 'rotation' || (kind === 'cards' && day) ? day : null);
  clear(root);
  root.dataset.kind = kind;
  if (kind === 'cards') return cardPages(root, p, id, header);
  const blocks = kind === 'week' ? weekBlocks(p) : kind === 'day' ? dayBlocks(p, day) : rotationBlocks(p, day);
  return flowPages(root, blocks, header);
}

function headerText(p, kind, day) {
  return {
    left: `FICTIONAL / REFERENCE · ${p.project.name}`,
    mid: `${KINDS[kind]}${day ? ` · ${day.label}` : ''} · ${p.week.opponentLabel}`,
    right: `Project rev ${p.project.rev} · week v${p.week.version}${day ? ` · day v${day.version}` : ''}`,
  };
}

function sheet(header, n, total, body) {
  return h('section', { class: 'sheet', 'data-sheet': String(n) },
    h('header', { class: 'sheet-head' }, h('span', { class: 'sheet-stamp' }, header.left), h('span', null, header.mid), h('span', null, header.right)),
    h('div', { class: 'sheet-body' }, body),
    h('footer', { class: 'sheet-foot' }, h('span', null, 'FICTIONAL / REFERENCE — not a real schedule, roster or game plan.'), h('span', null, `Page ${n} of ${total}`)));
}

function measureHost() {
  let host = document.getElementById('print-measure');
  if (!host) {
    host = h('div', { id: 'print-measure', class: 'print-pages', 'aria-hidden': 'true' });
    document.body.appendChild(host);
  }
  clear(host);
  return host;
}

function flowPages(root, blocks, header) {
  const host = measureHost();
  const probe = sheet(header, 1, 1, blocks);
  host.appendChild(probe);
  const body = probe.querySelector('.sheet-body');
  const avail = body.clientHeight || 912; // 9.9in sheet minus header/footer; only used if layout is unavailable
  const gap = 10;
  const heights = blocks.map((b) => ({ h: Math.ceil(b.getBoundingClientRect().height) + gap, breakBefore: b.dataset.breakBefore === 'true' }));
  // Print text layout can differ from screen by a few pixels; keep a small reserve.
  const SLACK = 24;
  const pages = paginate(heights, avail + gap - SLACK);
  clear(host);
  const out = h('div', { class: 'print-pages' });
  pages.forEach((pg, i) => out.appendChild(sheet(header, i + 1, pages.length, pg.indices.map((k) => blocks[k]))));
  root.appendChild(out);
  root.dataset.pages = String(pages.length);
  return { pages: pages.length, oversized: pages.filter((x) => x.oversized).length };
}

const block = (cls, ...children) => h('div', { class: `pblock ${cls}` }, ...children);

// ---------------------------------------------------------------- week
function weekBlocks(p) {
  const out = [block('pb-title', h('h1', null, `Week plan · ${p.week.opponentLabel}`), p.week.notes ? h('p', null, p.week.notes) : null)];
  for (const d of p.week.days) {
    const s = computeSchedule(d);
    const rot = p.rotations[d.id];
    const short = rot ? validateRotation({ day: d, groups: p.groups, participants: p.participants, rotation: rot }).warnings.filter((w) => w.type === 'shortage').length : null;
    out.push(block('pb-day',
      h('h2', null, `${d.label}${d.date ? ` · ${d.date}` : ''}`),
      h('p', { class: 'pb-line' }, `${s.items.length ? `${formatClock12(s.startMin)}–${formatClock12(s.endMin)}` : 'No scheduled periods'} · ${formatMinutes(s.totalMin)} of ${formatMinutes(d.plannedMinutes)} planned${s.overByMin ? ` · ⚠ ${s.overByMin} min OVER` : ''} · day v${d.version}`),
      s.warnings.length ? h('p', { class: 'pb-warn' }, `⚠ ${s.warnings.length} schedule warning${s.warnings.length === 1 ? '' : 's'}`) : null,
      rot ? h('p', { class: 'pb-line' }, short ? `⚠ Rotation: ${short} unfilled slot${short === 1 ? '' : 's'}` : '✓ Rotation: all slots filled') : h('p', { class: 'pb-line' }, 'Rotation: not generated'),
      h('table', { class: 'ptable' }, h('tbody', null, s.items.map((it) => {
        const per = d.periods.find((x) => x.id === it.periodId);
        return h('tr', null, h('td', { class: 'pt-time' }, `${formatClock12(it.startMin)}${it.parallel ? ' ‖' : ''}`), h('td', null, per.title), h('td', { class: 'pt-num' }, `${per.minutes} min`), h('td', null, CATEGORY_LABEL[per.category]));
      }))),
      s.unscheduled.length ? h('p', { class: 'pb-line' }, `Shelf (unscheduled): ${s.unscheduled.map((id) => d.periods.find((x) => x.id === id).title).join('; ')}`) : null));
  }
  return out;
}

// ---------------------------------------------------------------- day script
function dayBlocks(p, d) {
  const s = computeSchedule(d);
  const equipment = [...new Set(d.periods.filter((x) => x.scheduled).flatMap((x) => x.equipment))];
  const out = [block('pb-title',
    h('h1', null, `${d.label} · coach script`),
    h('p', { class: 'pb-line' }, `${d.date || 'No date set'} · start ${formatClock12(d.startMin)} (${p.project.timezone}) · ${formatMinutes(s.totalMin)} of ${formatMinutes(d.plannedMinutes)} planned${s.overByMin ? ` · ⚠ ${s.overByMin} min OVER planned length` : ''}`),
    d.notes ? h('p', null, d.notes) : null,
    s.warnings.length ? h('ul', { class: 'pb-warn' }, s.warnings.map((w) => h('li', null, `⚠ ${w.message}`))) : null,
    equipment.length ? h('p', { class: 'pb-line' }, h('strong', null, 'Equipment: '), equipment.join(' · ')) : null)];
  for (const it of s.items) {
    const per = d.periods.find((x) => x.id === it.periodId);
    const drill = per.drillId ? byId(p.drills, per.drillId) : null;
    const cards = per.cardIds.map((id) => byId(p.cards, id)).filter(Boolean);
    const groups = per.groupIds.map((id) => byId(p.groups, id)).filter(Boolean);
    out.push(block(`pb-period${per.category === 'break' ? ' pb-break' : ''}`,
      h('div', { class: 'pb-period-head' },
        h('span', { class: 'pb-time' }, `${formatClock12(it.startMin)}–${formatClock12(it.endMin)}${it.parallel ? ' ‖ station' : ''}`),
        h('span', { class: 'pb-ptitle' }, per.title),
        h('span', { class: 'pb-dur' }, `${per.minutes} min · ${CATEGORY_LABEL[per.category]}`)),
      it.overlapMin ? h('p', { class: 'pb-warn' }, `⚠ Overlaps the previous period by ${it.overlapMin} min`) : null,
      per.objective ? h('p', null, h('strong', null, 'Objective: '), per.objective) : null,
      schemePrintLines(p, per).map((line) => h('p', { class: 'pb-line' }, h('strong', null, 'Scheme call: '), line)),
      per.callLabel ? h('p', null, h('strong', null, 'Call / look: '), per.callLabel) : null,
      drill ? h('p', null, h('strong', null, 'Drill: '), `${drill.title} — ${drill.setup}`) : null,
      cards.length ? h('p', null, h('strong', null, 'Scout cards: '), cards.map((c) => `${c.lookLabel || c.title} (v${c.version})`).join('; ')) : null,
      groups.length ? h('p', null, h('strong', null, 'Scout groups: '), groups.map((g) => g.label).join(', ')) : null,
      per.equipment.length ? h('p', null, h('strong', null, 'Equipment: '), per.equipment.join(', ')) : null,
      per.notes ? h('p', { class: 'pb-notes' }, h('strong', null, 'Notes: '), per.notes) : null));
  }
  if (!s.items.length) out.push(block('pb-empty', h('p', null, 'No scheduled periods on this day.')));
  if (s.unscheduled.length) out.push(block('pb-shelf', h('h2', null, 'Shelf (not scheduled)'), h('ul', null, s.unscheduled.map((id) => { const x = d.periods.find((y) => y.id === id); return h('li', null, `${x.title} · ${x.minutes} min`); }))));
  return out;
}

// ---------------------------------------------------------------- rotation sheet
function rotationBlocks(p, d) {
  const rot = p.rotations[d.id];
  const out = [];
  if (!rot) {
    out.push(block('pb-title', h('h1', null, `${d.label} · rotation sheet`), h('p', { class: 'pb-warn' }, '⚠ No rotation has been generated for this day.')));
    return out;
  }
  const v = validateRotation({ day: d, groups: p.groups, participants: p.participants, rotation: rot });
  const rows = rotationRows({ day: d, groups: p.groups, participants: p.participants, rotation: rot });
  const unfilled = rows.filter((r) => !r.participantId);
  const problems = v.warnings.filter((w) => w.severity === 'error');
  const label = (id) => byId(p.participants, id)?.label || `Unknown ${id}`;
  const title = (pid) => d.periods.find((x) => x.id === pid)?.title || pid;
  out.push(block('pb-title',
    h('h1', null, `${d.label} · rotation sheet`),
    h('p', { class: 'pb-line' }, `Seed ${rot.seed ?? '—'} · rule: fewest today → fewest in role → seeded rank · ${rows.filter((r) => r.locked).length} locked`),
    unfilled.length ? h('div', { class: 'pb-short' }, h('h2', null, `⚠ ${unfilled.length} UNFILLED slot${unfilled.length === 1 ? '' : 's'} — resolve before practice`), h('ul', null, unfilled.map((r) => h('li', null, `${title(r.periodId)} · ${byId(p.groups, r.groupId)?.label} ${r.roleLabel || r.roleKey}: ${r.reason || 'not generated'}`)))) : h('p', { class: 'pb-line' }, '✓ Every slot is filled.'),
    problems.length ? h('ul', { class: 'pb-warn' }, problems.map((w) => h('li', null, `✕ ${w.message}`))) : null));
  const byPeriod = new Map();
  for (const r of rows) {
    if (!byPeriod.has(r.periodId)) byPeriod.set(r.periodId, []);
    byPeriod.get(r.periodId).push(r);
  }
  for (const [pid, list] of byPeriod) {
    out.push(block('pb-rot',
      h('div', { class: 'pb-period-head' }, h('span', { class: 'pb-time' }, `${formatClock12(list[0].startMin)}–${formatClock12(list[0].endMin)}`), h('span', { class: 'pb-ptitle' }, title(pid))),
      h('table', { class: 'ptable' }, h('tbody', null, list.map((r) => h('tr', { class: r.participantId ? '' : 'pt-unfilled' },
        h('td', null, byId(p.groups, r.groupId)?.label), h('td', null, r.roleLabel || r.roleKey),
        h('td', null, r.participantId ? label(r.participantId) : '⚠ UNFILLED'),
        h('td', null, r.locked ? '[locked]' : '')))))));
  }
  const counts = p.participants.map((x) => ({ x, c: v.counts[x.id] || { total: 0, byRole: {} } })).filter((r) => r.c.total > 0);
  out.push(block('pb-counts', h('h2', null, 'Counts (this fictional plan only — not a workload measure)'),
    h('table', { class: 'ptable' }, h('tbody', null, counts.map(({ x, c }) => h('tr', null, h('td', null, x.label), h('td', { class: 'pt-num' }, String(c.total)), h('td', null, Object.entries(c.byRole).map(([k, n]) => `${k} ×${n}`).join(', '))))))));
  return out;
}

// ---------------------------------------------------------------- cards
function cardPages(root, p, id, header) {
  let cards = p.cards;
  const day = byId(p.week.days, id);
  if (day) cards = [...new Set(day.periods.flatMap((x) => x.cardIds))].map((cid) => byId(p.cards, cid)).filter(Boolean);
  else if (id && id !== 'all') cards = p.cards.filter((c) => c.id === id);
  const legend = () => h('p', { class: 'pcard-legend' }, 'Diagrams are illustrative, not to scale. ○ offense · ▽ defense · solid arrow = route · thick = run · dashed = motion · bar end = block.');
  const overflows = (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;

  // Pass 1 — measure every card in a real four-up cell (dense text if needed).
  // A card that still does not fit is measured alone on a full page (notes in
  // two columns). If even that cannot hold it, it is not printed and the page
  // says so explicitly. Nothing is ever cut off or hidden by overflow.
  const host = measureHost();
  const mode = new Map(); // card id -> 'four' | 'four-dense' | 'solo' | 'unprintable'
  for (let i = 0; i < cards.length; i += 4) {
    const probe = sheet(header, 1, 1, [h('div', { class: 'card-page' }, legend(), h('div', { class: 'card-sheet' }, cards.slice(i, i + 4).map((c) => printCard(c))))]);
    host.appendChild(probe);
    for (const el of probe.querySelectorAll('.pcard')) {
      const cid = el.dataset.printCard;
      if (!overflows(el)) { mode.set(cid, 'four'); continue; }
      el.classList.add('pcard-dense');
      mode.set(cid, overflows(el) ? 'solo' : 'four-dense');
    }
  }
  // A card on its own page always says why (never silent); it is measured with that note.
  const soloNote = (c) => (printFitError(c)
    ? 'Saved by an older version and too long for a quarter-page card, so it prints on its own page. Shorten it to print it four to a page.'
    : 'Printed on its own page: it did not fit a quarter-page card in this print layout.');
  for (const c of cards.filter((x) => mode.get(x.id) === 'solo')) {
    const probe = sheet(header, 1, 1, [h('div', { class: 'card-solo' }, printCard(c, { solo: true, note: soloNote(c) }))]);
    host.appendChild(probe);
    if (overflows(probe.querySelector('.pcard'))) mode.set(c.id, 'unprintable');
  }
  clear(host);

  // Pass 2 — build the pages in order from those measurements.
  const pagesContent = [];
  let group = [];
  const flush = () => {
    if (group.length) pagesContent.push([h('div', { class: 'card-page' }, legend(), h('div', { class: 'card-sheet' }, group))]);
    group = [];
  };
  let solo = 0;
  let unprintable = 0;
  for (const c of cards) {
    const m = mode.get(c.id);
    if (m === 'four' || m === 'four-dense') {
      group.push(printCard(c, { dense: m === 'four-dense' }));
      if (group.length === 4) flush();
    } else if (m === 'solo') {
      flush();
      solo++;
      pagesContent.push([h('div', { class: 'card-solo' }, printCard(c, { solo: true, note: soloNote(c) }))]);
    } else {
      flush();
      unprintable++;
      pagesContent.push([block('pb-unprintable', h('h2', null, `Not printed: “${c.lookLabel || c.title}”`),
        h('p', null, 'This card is too long to print on one page without cutting text. It is kept unchanged. Open it in the card editor and shorten its notes or cues, then print again.'))]);
    }
  }
  flush();
  const out = h('div', { class: 'print-pages' });
  if (!pagesContent.length) out.appendChild(sheet(header, 1, 1, [block('pb-empty', h('p', null, 'No scout cards to print here.'))]));
  pagesContent.forEach((content, i) => out.appendChild(sheet(header, i + 1, pagesContent.length, content)));
  root.appendChild(out);
  const pages = Math.max(1, pagesContent.length);
  root.dataset.pages = String(pages);
  return { pages, oversized: 0, solo, unprintable };
}

function printCard(c, { dense = false, solo = false, note = null } = {}) {
  return h('article', { class: `pcard${dense ? ' pcard-dense' : ''}${solo ? ' pcard-solo' : ''}`, 'data-print-card': c.id },
    note ? h('p', { class: 'pcard-solo-note' }, `⚠ ${note}`) : null,
    h('header', { class: 'pcard-head' }, h('span', { class: 'pcard-look' }, c.lookLabel || c.title), h('span', { class: 'pcard-stamp' }, `REFERENCE / FICTIONAL · v${c.version}`)),
    h('p', { class: 'pcard-title' }, c.title),
    renderDiagram(c, { size: 'print' }),
    c.notes ? h('p', { class: 'pcard-notes' }, c.notes) : null,
    c.cues.length ? h('ul', { class: 'pcard-cues' }, c.cues.map((q) => h('li', null, q))) : null);
}
