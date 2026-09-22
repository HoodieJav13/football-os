import { projectResponsibilityArea, REGION_COLORS, responsibilityEntries } from './responsibilityArea.js';

/** Fills paint below routes; handles paint in a separate pass above tokens. */
export function ResponsibilityAreas({play,projection,layers,selectedAssignmentId,editing,onSelect,onBeginDrag,controls=false,clean=false,mini=false,editable=true}) {
  const entries=responsibilityEntries(play,layers);
  const occupied=[];
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
      let keyY=cy-keyHeight*1.5;
      while(occupied.some(p=>Math.abs(p.x-cx)<(p.width+keyWidth)/2 && Math.abs(p.y-keyY)<keyHeight))keyY-=keyHeight;
      occupied.push({x:cx,y:keyY,width:keyWidth});
      return <g key={assignment.id} data-region-assignment={assignment.id} data-region-owner={assignment.playerId}>
        <ellipse className="responsibility-area-fill" cx={cx} cy={cy} rx={rx} ry={ry} fill={color} fillOpacity=".20" stroke={color} strokeOpacity=".6" strokeWidth={projection.pixels(mini?1:1.5)} pointerEvents="none" />
        {!mini?<g className="region-owner-key" role={interactive?'button':undefined} tabIndex={interactive?0:undefined} aria-label={!interactive?undefined:`Select ${ownerKey} ${area.label} area`}
          onPointerDown={!interactive?undefined:event=>{event.stopPropagation();onSelect?.(assignment.id);}}
          onKeyDown={!interactive?undefined:event=>{if(event.key==='Enter'){event.preventDefault();onSelect?.(assignment.id);}}}>
          {interactive?<rect x={cx-projection.pixels(22)} y={keyY-projection.pixels(22)} width={projection.pixels(44)} height={projection.pixels(44)} fill="transparent" />:null}
          <rect x={cx-keyWidth/2} y={keyY-keyHeight/2} width={keyWidth} height={keyHeight} rx={projection.pixels(5)} fill="#102922" stroke={color} strokeWidth={projection.pixels(1)} />
          <text x={cx} y={keyY+projection.pixels(4)} fontSize={projection.pixels(12)} textAnchor="middle" fill={color}>{ownerKey}</text>
        </g>:null}
      </g>;
    })}
  </g>;
}

let context;
function textWidth(text){
  if(typeof document==='undefined')return text.length*7;
  context??=document.createElement('canvas').getContext('2d');
  context.font='14px Arial';return context.measureText(text).width;
}
function wrap(text,width){
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
  const columns=Math.max(1,Math.min(3,Math.floor(width/300))),columnWidth=(width-32)/columns;
  let y=28;const laidOut=[];
  for(let start=0;start<entries.length;start+=columns){
    const row=entries.slice(start,start+columns).map(entry=>({...entry,lines:wrap(`${entry.ownerKey} — ${entry.area.label}`,Math.max(60,columnWidth-24))}));
    row.forEach((entry,index)=>laidOut.push({...entry,x:16+index*columnWidth,y}));
    y+=Math.max(...row.map(entry=>entry.lines.length))*18+12;
  }
  return {height:y+8,entries:laidOut};
}
export function ResponsibilityLegend({layout,projection}){
  if(!layout.height)return null;
  const [x,y,width,height]=projection.viewBox.split(' ').map(Number);
  return <g className="responsibility-legend" transform={`translate(${x} ${y+height})`}>
    <rect width={width} height={projection.pixels(layout.height)} fill="#10231f" />
    {layout.entries.map(({assignment,area,lines,x:px,y:py})=><text key={assignment.id} data-legend-owner={assignment.playerId} x={projection.pixels(px)} y={projection.pixels(py)} fill={REGION_COLORS[area.color]} style={{fontFamily:'Arial, sans-serif',fontSize:projection.pixels(14),fontWeight:500,textAnchor:'start'}}>
      {lines.map((line,index)=><tspan key={index} x={projection.pixels(px)} dy={index?projection.pixels(18):0}>{line}</tspan>)}
    </text>)}
  </g>;
}
