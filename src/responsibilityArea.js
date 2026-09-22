/** Authored field-yard geometry, separate from a defender's drop path. */
export const REGION_COLORS = Object.freeze({
  blue: '#7CB7FF', teal: '#67D9C0', amber: '#F1C86A', violet: '#BEA0F5', rose: '#F49DAF',
});
export function responsibilityAreaError(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'must be an object';
  if (value.version !== 1 || value.shape !== 'ellipse') return 'unsupported shape version';
  if (!Array.isArray(value.center) || value.center.length !== 2 || !value.center.every(Number.isFinite)) return 'center must contain two finite yards';
  if (![value.radiusX,value.radiusY].every(n => Number.isFinite(n) && n > 0)) return 'radii must be positive finite yards';
  if (![value.center[0]-value.radiusX,value.center[0]+value.radiusX,value.center[1]-value.radiusY,value.center[1]+value.radiusY].every(Number.isFinite)) return 'extent exceeds numeric range';
  if (typeof value.label !== 'string' || !value.label.trim() || value.label.length > 48 || /[\u0000-\u001f\u007f-\u009f]/.test(value.label)) return 'label must contain 1–48 printable characters';
  if (typeof value.color !== 'string' || !Object.hasOwn(REGION_COLORS,value.color)) return 'unknown color';
  return null;
}
export function copyResponsibilityArea(value) {
  const error=responsibilityAreaError(value);
  if (error) throw new Error('Responsibility area: '+error);
  return {version:1,shape:'ellipse',center:[...value.center],radiusX:value.radiusX,radiusY:value.radiusY,label:value.label,color:value.color};
}
export const hasResponsibilityArea = assignment => Boolean(assignment?.definition && Object.hasOwn(assignment.definition,'responsibilityArea'));

/** Run before normalization, which otherwise filters assignments with missing owners. */
export function validateResponsibilityAreas(entity, location='play', allowRegions=true) {
  const assignments=Array.isArray(entity?.assignments) ? entity.assignments : Array.isArray(entity?.routes) ? entity.routes : [];
  for (const a of assignments) {
    if (!hasResponsibilityArea(a)) continue;
    const fail=reason=>{throw new Error(`Responsibility area in ${location}, assignment ${a.id ?? '(missing id)'}: ${reason}`);};
    if (!allowRegions) fail('new geometry cannot appear in a legacy envelope');
    const error=responsibilityAreaError(a.definition.responsibilityArea);
    if (error) fail(error);
    if (a.type !== 'Zone' || a.unit !== 'defense') fail('requires a defensive Zone assignment');
    if (typeof a.id !== 'string' || !a.id || assignments.filter(item=>item?.id===a.id).length!==1) fail('assignment ID must be unique');
    if (typeof a.playerId !== 'string' || !a.playerId || !Array.isArray(entity.defenders) || entity.defenders.filter(p=>p?.id===a.playerId).length!==1) fail('requires exactly one matching defender ID');
  }
}

export function regionBounds(a) {
  return {minX:a.center[0]-a.radiusX,maxX:a.center[0]+a.radiusX,minY:a.center[1]-a.radiusY,maxY:a.center[1]+a.radiusY};
}
export function projectResponsibilityArea(a,projection) {
  const [cx,cy]=projection.project(a.center);
  return {cx,cy,rx:projection.view==='side'?a.radiusY:a.radiusX,ry:projection.view==='side'?a.radiusX:a.radiusY};
}
export function responsibilityOwnerKeys(play) {
  const ownedIds=new Set((play.assignments??[]).filter(hasResponsibilityArea).map(a=>a.playerId));
  const roster=play.defenders??[];
  const ownedLabels=new Set(roster.filter(p=>ownedIds.has(p.id)).map(p=>p.label));
  const seen=new Map(),counts=new Map();
  for(const p of roster) counts.set(p.label,(counts.get(p.label)??0)+1);
  return new Map(roster.map(p=>{
    const index=(seen.get(p.label)??0)+1;seen.set(p.label,index);
    return [p.id,ownedLabels.has(p.label)&&counts.get(p.label)>1?`${p.label}·${index}`:p.label];
  }));
}
export function responsibilityEntries(play,layers) {
  if(layers && (!layers.defense.visible || !layers.assignments.visible)) return [];
  const keys=responsibilityOwnerKeys(play);
  return (play.assignments??[]).filter(a=>a.unit==='defense'&&a.type==='Zone'&&hasResponsibilityArea(a))
    .map(a=>({assignment:a,area:a.definition.responsibilityArea,ownerKey:keys.get(a.playerId)??a.playerId}));
}
