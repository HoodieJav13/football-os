// Playmaker side of the scheme package: diagram binding, lesson pack reuse and storage
// through the existing workspace route. Library lives on the book, which normalizeWorkspace
// and workspace backups already carry unchanged.
import { createLessonPack, lessonRevision } from './lessonPack.js';
import { SchemePackageError } from './schemePackage.js';
import { WORKSPACE_KEY } from './workspaceData.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const callOf = (pkg, callId) => {
  const call = pkg.calls.find((item) => item.callId === callId);
  if (!call) throw new SchemePackageError('unknown-call', `Call ${callId} is not in this revision.`);
  return call;
};
const TEACHABLE = ['id', 'name', 'family', 'formation', 'personnel', 'folder', 'fieldSide', 'players', 'defenders', 'assignments'];
const teachablePlay = (play) => clone(Object.fromEntries(TEACHABLE.filter((field) => play[field] !== undefined).map((field) => [field, play[field]])));

export const diagramRefFor = (play) => ({ diagramId: play.id, teachableRevision: lessonRevision(play) });

/** Records an edited diagram on a draft call. Frozen revisions are immutable. */
export function bindDiagramToCall(draft, callId, play) {
  if (draft.frozen === true) throw new SchemePackageError('frozen-revision', 'This revision is frozen. Start a new draft revision to change it.');
  const next = clone(draft);
  const call = callOf(next, callId);
  const defenderById = new Map((play.defenders ?? []).map((defender) => [defender.id, defender]));
  if (defenderById.size !== call.roles.length || call.roles.some((role) => !defenderById.has(role.roleId))) {
    throw new SchemePackageError('diagram-role-mismatch', 'This diagram must hold exactly the same eleven stable role ids as the call.');
  }
  const previous = call.diagramRef.diagramId;
  const entry = { diagramId: play.id, play: teachablePlay(play) };
  const sharedByOthers = next.calls.some((item) => item !== call && item.diagramRef.diagramId === previous);
  next.diagrams = sharedByOthers || previous !== play.id
    ? [...next.diagrams.filter((item) => item.diagramId !== play.id), entry]
    : next.diagrams.map((item) => (item.diagramId === previous ? entry : item));
  call.diagramRef = diagramRefFor(play);
  for (const role of call.roles) {
    const defender = defenderById.get(role.roleId);
    role.alignment = { ...role.alignment, x: defender.x, y: defender.y };
    role.positionLabel = defender.label;
  }
  return next;
}

export function diagramForCall(pkg, callId) {
  const { diagramRef } = callOf(pkg, callId);
  const diagram = pkg.diagrams.find((item) => item.diagramId === diagramRef.diagramId);
  if (!diagram) throw new SchemePackageError('missing-referenced-asset', 'This call’s diagram is missing, so nothing can be generated.');
  return diagram.play;
}

export const lessonPackForCall = (pkg, callId) => createLessonPack(diagramForCall(pkg, callId));

export function withSchemeLibrary(workspace, bookId, library) {
  return { ...workspace, playbooks: workspace.playbooks.map((book) => (book.id === bookId ? { ...book, schemeLibrary: library } : book)) };
}

export const readSchemeLibrary = (workspace, bookId) => workspace.playbooks.find((book) => book.id === bookId)?.schemeLibrary ?? null;

function describeStorageError(error) {
  if (error?.name === 'QuotaExceededError') return 'Browser storage is full.';
  if (error?.name === 'SecurityError') return 'Browser storage is blocked on this page.';
  return `Browser storage failed: ${error?.message ?? 'unknown error'}.`;
}

/** Reports saved only after the existing workspace key reads back byte for byte. */
export function commitSchemeLibrary(storage, workspace, bookId, library) {
  const next = withSchemeLibrary(workspace, bookId, library);
  try {
    const text = JSON.stringify(next);
    storage.setItem(WORKSPACE_KEY, text);
    if (storage.getItem(WORKSPACE_KEY) !== text) throw new Error('storage did not keep the workspace');
    return { ok: true, saved: true, workspace: next, error: null };
  } catch (error) {
    return { ok: false, saved: false, workspace, error: describeStorageError(error) };
  }
}
