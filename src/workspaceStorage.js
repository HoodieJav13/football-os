import { MAIN_PLAYBOOK_ID, normalizePlay } from './playData.js';
import { validateResponsibilityAreas } from './responsibilityArea.js';
import {
  WORKSPACE_KEY, WORKSPACE_VERSION, LEGACY_WORKSPACE_KEYS, RECOVERY_WORKSPACE_KEY,
  createDefaultWorkspace, normalizeWorkspace, validPlays,
} from './workspaceData.js';

export const LEGACY_LIBRARY_KEY = 'football-os.library.v4';
export const GAME_DAY_KEY = 'football-os.game-day.v7';
export const LEGACY_GAME_DAY_KEYS = ['football-os.game-day.v6','football-os.game-day.v5','football-os.game-day.v4'];

/** The first present key is authoritative, including when it is corrupt. */
function firstStored(storage,keys) {
  for (const key of keys) {
    const raw=storage.getItem(key);
    if (raw !== null) return {sourceKey:key,raw};
  }
  return {sourceKey:null,raw:null};
}
export function loadWorkspaceState(storage) {
  let sourceKey=null,raw=null;
  try {
    ({sourceKey,raw}=firstStored(storage,[WORKSPACE_KEY,...LEGACY_WORKSPACE_KEYS,LEGACY_LIBRARY_KEY]));
    if (sourceKey===null) return {workspace:createDefaultWorkspace(),sourceKey,raw,writable:true,error:null};
    const parsed=JSON.parse(raw);
    if (sourceKey===LEGACY_LIBRARY_KEY && Array.isArray(parsed)) parsed.forEach((play,index)=>validateResponsibilityAreas(play,`legacy library play ${index}`,false));
    const workspace=sourceKey===LEGACY_LIBRARY_KEY
      ? (validPlays(parsed) ? createDefaultWorkspace(parsed) : null)
      : normalizeWorkspace(parsed);
    if (!workspace) throw new Error('unsupported or incomplete saved workspace');
    return {workspace,sourceKey,raw,writable:true,error:null};
  } catch(error) {
    return {workspace:createDefaultWorkspace(),sourceKey,raw,writable:false,
      error:`Saved workspace could not be opened: ${error.message}. Editing and autosave are paused. Restore a valid backup to continue; the original data is retained.`};
  }
}
export function loadGameDayState(storage) {
  let sourceKey=null,raw=null;
  try {
    ({sourceKey,raw}=firstStored(storage,[GAME_DAY_KEY,...LEGACY_GAME_DAY_KEYS]));
    if (sourceKey===null) return {gameDay:null,sourceKey,raw,writable:true,error:null};
    const saved=JSON.parse(raw);
    if (sourceKey===GAME_DAY_KEY && saved?.resolved===true && saved.workspaceVersion===WORKSPACE_VERSION) return {gameDay:null,sourceKey,raw,writable:true,error:null};
    if (!saved || typeof saved.playId!=='string' || saved.playId!==saved.snapshot?.id || !validPlays([saved.snapshot])) throw new Error('invalid saved adjustment');
    if (saved.workspaceVersion!==undefined && saved.workspaceVersion!==WORKSPACE_VERSION) throw new Error('unsupported snapshot version');
    validateResponsibilityAreas(saved.snapshot,'game-day snapshot',sourceKey===GAME_DAY_KEY);
    const gameDay={...saved,workspaceVersion:WORKSPACE_VERSION,playbookId:saved.playbookId??MAIN_PLAYBOOK_ID,snapshot:normalizePlay(saved.snapshot)};
    return {gameDay,sourceKey,raw,writable:true,error:null};
  } catch(error) {
    return {gameDay:null,sourceKey,raw,writable:false,error:`Saved game-day adjustment could not be opened: ${error.message}. Its original data is retained; game-day changes are paused.`};
  }
}

/** Recovery write must succeed before replacing data or changing the live workspace. */
export function restoreWorkspace(storage,candidate,currentState) {
  const normalized=normalizeWorkspace(candidate);
  if (!normalized) throw new Error('The replacement workspace is invalid.');
  const recovery={version:WORKSPACE_VERSION,createdAt:new Date().toISOString(),workspace:currentState.workspace};
  if (!currentState.writable && currentState.sourceKey) {
    recovery.sourceKey=currentState.sourceKey;
    recovery.raw=storage.getItem(currentState.sourceKey);
  }
  storage.setItem(RECOVERY_WORKSPACE_KEY,JSON.stringify(recovery));
  storage.setItem(WORKSPACE_KEY,JSON.stringify(normalized));
  return normalized;
}

// Defer even the localStorage getter so restricted-browser access is caught by callers.
export const browserStorage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key,value) => window.localStorage.setItem(key,value),
  removeItem: key => window.localStorage.removeItem(key),
};
