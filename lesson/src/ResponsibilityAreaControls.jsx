import { useEffect, useState } from 'react';
import { FIELD, clampPoint } from './playData.js';
import { REGION_COLORS, responsibilityAreaError } from './responsibilityArea.js';

const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export function ResponsibilityAreaControls({area,ownerLabel,disabled,onChange,onEdit,editing,defaultCenter=[0,20]}) {
  const [draft,setDraft]=useState({label:'',width:'',height:''});
  const [error,setError]=useState('');
  useEffect(()=>{
    setDraft(area?{label:area.label,width:String(area.radiusX*2),height:String(area.radiusY*2)}:{label:'',width:'',height:''});
    setError('');
  },[area]);
  const commit=(field)=>{
    if (!area || disabled) return;
    let next;
    if(field==='label') next={...area,label:draft.label};
    else {
      const value=Number(draft[field]);
      if(!draft[field].trim() || !Number.isFinite(value) || value<=0){setError('Enter a positive size in yards.');return;}
      const max=field==='width'?FIELD.bounds.maxX-FIELD.bounds.minX:FIELD.bounds.maxY-FIELD.bounds.minY;
      const radius=clamp(value,1,max)/2;
      next={...area,[field==='width'?'radiusX':'radiusY']:radius};
      setDraft(d=>({...d,[field]:String(radius*2)}));
    }
    const invalid=responsibilityAreaError(next);
    if(invalid){setError(invalid);return;}
    setError('');onChange(next);
  };
  const input=(field,label,type='text')=>(
    <label><span>{label}</span><input aria-label={label} type={type} value={draft[field]} maxLength={field==='label'?48:undefined}
      step={type==='number'?'.5':undefined} onChange={e=>setDraft(d=>({...d,[field]:e.target.value}))}
      onBlur={()=>commit(field)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}} /></label>
  );
  return (
    <fieldset className="responsibility-controls" disabled={disabled}>
      <legend>Responsibility area · {ownerLabel}</legend>
      {!area ? <button type="button" onClick={()=>onChange({version:1,shape:'ellipse',center:[...defaultCenter],radiusX:6,radiusY:6,label:'Responsibility',color:'blue'})}>Add responsibility area</button> : <>
        {input('label','Area label')}
        <div className="area-size-row">{input('width','Area width (yards)','number')}{input('height','Area height (yards)','number')}</div>
        <label><span>Area color</span><select aria-label="Area color" value={area.color} onChange={e=>onChange({...area,color:e.target.value})}>{Object.keys(REGION_COLORS).map(color=><option key={color} value={color}>{color[0].toUpperCase()+color.slice(1)}</option>)}</select></label>
        {error?<p className="area-input-error" role="alert">{error}</p>:null}
        <div className="area-actions"><button type="button" aria-pressed={editing} onClick={onEdit}>{editing?'Done editing area':'Edit area'}</button><button type="button" onClick={()=>onChange(undefined)}>Remove area</button></div>
        <div className="area-nudges" role="group" aria-label="Move area by a quarter yard">
          {[["Left",-.25,0],["Up",0,.25],["Down",0,-.25],["Right",.25,0]].map(([label,dx,dy])=><button type="button" key={label} aria-label={`Move area ${label.toLowerCase()}`} onClick={()=>onChange({...area,center:clampPoint([area.center[0]+dx,area.center[1]+dy])})}>{label}</button>)}
        </div>
        <small>Area stays in field coordinates when its defender moves.</small>
      </>}
    </fieldset>
  );
}
