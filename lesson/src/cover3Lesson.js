import {basePlayers,clonePlaybook,normalizePlay} from './playData.js';

// Illustrative starting content; coaches define the responsibilities they teach.
const coverage = [
 ['cl','BC',-19,8,-18,26,8,11,'Deep left','blue'],
 ['fs','S',0,15,0,27,10,11,'Deep middle','blue'],
 ['cr','FC',19,8,18,26,8,11,'Deep right','blue'],
 ['wl','B',-14,5.5,-20,9,7,6,'Left flat','teal'],
 ['ml','W',-5,5.5,-7,12,8,7,'Left hook','amber'],
 ['mr','M',5,5.5,7,12,8,7,'Right hook','amber'],
 ['sr','A',14,5.5,20,9,7,6,'Right flat','teal'],
];
export function createCover3Lesson(id,name='Cover 3 — teaching example') {
 const players=clonePlaybook(basePlayers).map(p=>({...p,id:`${id}-${p.id}`}));
 const front=[-6,-2,2,6].map((x,i)=>({id:`${id}-front-${i}`,label:['E','T','T','E'][i],x,y:2.5}));
 const defenders=[...front,...coverage.map(([key,label,x,y])=>({id:`${id}-${key}`,label,x,y}))];
 const assignments=coverage.map(([key,label,x,y,cx,cy,rx,ry,title,color],i)=>({
   id:`${id}-zone-${key}`,playerId:`${id}-${key}`,unit:'defense',phase:'post',type:'Zone',pace:1,delay:0,
   geometryMode:'manual',preset:title,points:[[x,y],[cx,cy]],
   definition:{area:i<3?'deep-third':key==='wl'||key==='sr'?'flat':'hook',landmark:'Illustrative teaching area; adjust for your lesson.',
     responsibilityArea:{version:1,shape:'ellipse',center:[cx,cy],radiusX:rx,radiusY:ry,label:title,color}}
 }));
 return normalizePlay({id,name,fieldSide:'right',family:'Cover 3 teaching',folder:'Teaching',formation:'Trips Right Open',personnel:'10 Personnel',players,defenders,assignments});
}
