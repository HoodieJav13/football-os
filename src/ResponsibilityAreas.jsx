import { projectResponsibilityArea, REGION_COLORS, responsibilityEntries } from './responsibilityArea.js';

// Tag positions are derived screen layout, never saved football geometry.
function tagPosition(area, projection, width, height, defenders, occupied) {
  const {cx,cy,rx,ry}=projectResponsibilityArea(area,projection);
  const outward=Math.sign(area.center[0]) || 1;
  const deep=area.deep;
  const preferred=deep ? [[0,.5],[outward*.4,.4]] : [[outward*.55,-.5],[outward*.45,-.3],[outward*.55,-.2]];
  const candidates=[...preferred,[0,0],[-.5,0],[.5,0],[0,.55],[0,-.55]];
  // A modest grid supplies alternatives when a coach has moved a defender.
  for(let y=-.6;y<=.61;y+=.2)for(let x=-.6;x<=.61;x+=.2)candidates.push([x,y]);
  const inside=(x,y)=>[-1,1].every(dx=>[-1,1].every(dy=>
    ((x+dx*width/2-cx)/rx)**2+((y+dy*height/2-cy)/ry)**2<=1));
  const clearance=projection.pixels(13); // largest visible defender + 2px gap
  const score=(x,y)=>defenders.reduce((n,p)=>{
    const dx=Math.max(Math.abs(x-p[0])-width/2,0),dy=Math.max(Math.abs(y-p[1])-height/2,0);
    return n+Math.max(0,clearance-Math.hypot(dx,dy));
  },0)+occupied.reduce((n,p)=>n+(Math.abs(p.x-x)<(p.width+width)/2+projection.pixels(3) && Math.abs(p.y-y)<height+projection.pixels(3)?clearance:0),0);
  let best={x:cx,y:cy,score:Infinity};
  for(const [dx,dy] of candidates){
    const [x,y]=projection.project([area.center[0]+dx*area.radiusX,area.center[1]+dy*area.radiusY]);
    if(!inside(x,y))continue;
    const penalty=score(x,y);
    if(penalty<best.score)best={x,y,score:penalty};
    if(penalty===0)break;
  }
  if(best.score===0)return best;
  // Very small or crowded authored areas may have no room for a label.
  // Keep the tag clear above the area, as before, rather than covering a player.
  let y=cy-ry-height;
  while(score(cx,y)>0)y-=height+projection.pixels(3);
  return {x:cx,y};
}

/** Fills paint below routes; handles paint in a separate pass above tokens. */
export function ResponsibilityAreas({play,projection,layers,selectedAssignmentId,editing,onSelect,onBeginDrag,controls=false,clean=false,mini=false,editable=true}) {
  const entries=responsibilityEntries(play,layers);
  const occupied=[];
  const defenders=(play.defenders??[]).map(p=>projection.project([p.x,p.y]));
  const interactive = !clean && editable && !layers?.defense?.locked;
  return <g className={controls?'responsibility-area-handles':'responsibility-areas'} opacity={layers?.defense?.dimmed?0.4:1}>
    {entries.map(({assignment,area,ownerKey})=>{
      const {cx,cy,rx,ry}=projectResponsibilityArea(area,projection);
      const color=REGION_COLORS[area.color];
      if(controls){
        if(!editing || assignment.id!==selectedAssignmentId || clean || layers?.defense.locked) return null;
        return <g key={assignment.id} data-region-controls={assignment.id}>
          {[["center",area.center],["radiusX",[area.center[0]+area.radiusX,area.center[1]]],["radiusY",[area.center[0],area.center[1]+area.radiusY]]].map(([kind,point])=>{
            const [x,y]=projection.project(point);
            return <g key={kind} className="region-handle" data-region-handle={kind} role="button" tabIndex="0" aria-label={`${kind==='center'?'Move':kind==='radiusX'?'Resize width of':'Resize height of'} ${area.label} area`}
              onPointerDown={event=>{event.stopPropagation();event.preventDefault();onBeginDrag?.(event,kind,projection);}}>
              <circle cx={x} cy={y} r={projection.pixels(22)} fill="transparent" />
              <circle cx={x} cy={y} r={projection.pixels(7)} fill="#0b2420" stroke={color} strokeWidth={projection.pixels(2)} />
              <path d={`M ${x-projection.pixels(3)} ${y} h ${projection.pixels(6)} M ${x} ${y-projection.pixels(3)} v ${projection.pixels(6)}`} stroke={color} strokeWidth={projection.pixels(1)} />
            </g>;
          })}
        </g>;
      }
      // Short keys remain legible even when several authored ellipses overlap.
      const keyHeight=projection.pixels(20),keyWidth=projection.pixels(Math.max(28,ownerKey.length*8+12));
      const {x:keyX,y:keyY}=tagPosition({...area,deep:['deep-third','deep-half','quarter'].includes(assignment.definition.area)},projection,keyWidth,keyHeight,defenders,occupied);
      occupied.push({x:keyX,y:keyY,width:keyWidth});
      return <g key={assignment.id} data-region-assignment={assignment.id} data-region-owner={assignment.playerId}>
        <ellipse className="responsibility-area-fill" cx={cx} cy={cy} rx={rx} ry={ry} fill={color} fillOpacity=".20" stroke={color} strokeOpacity=".6" strokeWidth={projection.pixels(mini?1:1.5)} pointerEvents="none" />
        {!mini?<g className="region-owner-key" role={interactive?'button':undefined} tabIndex={interactive?0:undefined} aria-label={!interactive?undefined:`Select ${ownerKey} ${area.label} area`}
          onPointerDown={!interactive?undefined:event=>{event.stopPropagation();onSelect?.(assignment.id);}}
          onKeyDown={!interactive?undefined:event=>{if(event.key==='Enter'){event.preventDefault();onSelect?.(assignment.id);}}}>
          {interactive?<rect x={keyX-projection.pixels(22)} y={keyY-projection.pixels(22)} width={projection.pixels(44)} height={projection.pixels(44)} fill="transparent" />:null}
          <rect x={keyX-keyWidth/2} y={keyY-keyHeight/2} width={keyWidth} height={keyHeight} rx={projection.pixels(5)} fill="#102922" stroke={color} strokeWidth={projection.pixels(1)} />
          <text x={keyX} y={keyY+projection.pixels(4)} fontSize={projection.pixels(12)} textAnchor="middle" fill={color}>{ownerKey}</text>
        </g>:null}
      </g>;
    })}
  </g>;
}

let context;
const LEGEND_FONT_SIZE=12; // Never smaller than the in-bubble owner tags.
function textWidth(text){
  if(typeof document==='undefined')return text.length*LEGEND_FONT_SIZE*.6;
  context??=document.createElement('canvas').getContext('2d');
  context.font=`500 ${LEGEND_FONT_SIZE}px Arial`;return context.measureText(text).width;
}
// Existing custom labels can be wider than the entire output. Only that
// exceptional single-column case wraps; ordinary lesson phrases stay intact.
function overflowLines(text,width){
  const lines=[];let line='';
  for(const word of text.split(/\s+/)){
    if(line && textWidth(line+' '+word)<=width){line+=' '+word;continue;}
    if(line){lines.push(line);line='';}
    for(const char of word){if(line&&textWidth(line+char)>width){lines.push(line);line='';}line+=char;}
  }
  if(line)lines.push(line);return lines;
}
export function regionLegendLayout(play,layers,width){
  const entries=responsibilityEntries(play,layers);if(!entries.length)return {height:0,entries:[]};
  const isDeep = entry => ['deep-third','deep-half','quarter'].includes(entry.assignment.definition.area);
  const isFlat = entry => entry.assignment.definition.area === 'flat';
  // Layout only: deep zones, interior underneath zones, then flats; left to right.
  const groups=[entries.filter(isDeep),entries.filter(entry=>!isDeep(entry)&&!isFlat(entry)),entries.filter(isFlat)]
    .filter(group=>group.length).map(group=>group.sort((a,b)=>a.area.center[0]-b.area.center[0]));
  const available=width-32;
  let y=20;const laidOut=[];
  for(const group of groups){
    const longest=Math.max(...group.map(entry=>textWidth(`${entry.ownerKey} — ${entry.area.label}`)));
    // Keep every full phrase intact; fall back to two columns, then one.
    const columns=[Math.min(4,group.length),2,1].find(n=>n<=group.length && (longest+12)*n<=available) ?? 1;
    const columnWidth=available/columns;
    for(let start=0;start<group.length;start+=columns){
      const row=group.slice(start,start+columns).map(entry=>{
        const text=`${entry.ownerKey} — ${entry.area.label}`;
        return {...entry,lines:columns===1&&textWidth(text)>available?overflowLines(text,available):[text]};
      });
      row.forEach((entry,index)=>laidOut.push({...entry,x:16+index*columnWidth,y}));
      y+=Math.max(...row.map(entry=>entry.lines.length))*18;
    }
    y+=4;
  }
  return {height:y+2,entries:laidOut};
}
export function ResponsibilityLegend({layout,projection,background="field"}){
  if(!layout.height)return null;
  const [x,y,width,height]=projection.viewBox.split(' ').map(Number);
  return <g className="responsibility-legend" transform={`translate(${x} ${y+height})`}>
    <rect width={width} height={projection.pixels(layout.height)} fill={background === "diagram" ? "#18232b" : "#10231f"} />
    {layout.entries.map(({assignment,area,lines,x:px,y:py})=><text key={assignment.id} data-legend-owner={assignment.playerId} x={projection.pixels(px)} y={projection.pixels(py)} fill={REGION_COLORS[area.color]} style={{fontFamily:'Arial, sans-serif',fontSize:projection.pixels(LEGEND_FONT_SIZE),fontWeight:500,textAnchor:'start'}}>
      {lines.map((line,index)=><tspan key={index} x={projection.pixels(px)} dy={index?projection.pixels(18):0}>{line}{index<lines.length-1?' ':''}</tspan>)}
    </text>)}
  </g>;
}
