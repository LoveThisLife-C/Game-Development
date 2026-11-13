import {leakGradient,leakCSS,narrowWisp} from './service-leak.js';
import {cells,fractures,panels} from './service-geometry.js';
import {panelDeposits} from './service-view.js';
// Presentation only: no random state, coverage mutation or gameplay clocks.
export function leakIntensity(coverage){return 1-Math.max(0,Math.min(1,Number.isFinite(coverage)?coverage:0));}
// Coordinate-derived noise is stable across snapshots, panel changes and reconnects.
const noise=(x,y,s)=>{const v=Math.sin(x*12.9898+y*78.233+s*37.719)*43758.5453;return v-Math.floor(v);};
const pathOf=points=>'M'+points.map(p=>p.join(' ')).join('L');
export function crackRenderData(cell,index){
 const dx=cell.b[0]-cell.a[0],dy=cell.b[1]-cell.a[1],length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
 const edge=(t,side)=>{const x=cell.a[0]+dx*t,y=cell.a[1]+dy*t;
  const width=cell.width*(cell.panel===0?.32:.4),separation=width*(.55+noise(x,y,side)*.65),displacement=(noise(x,y,7)-.5)*1.3;
  return [x+nx*(side*separation+displacement),y+ny*(side*separation+displacement)];};
 const left=[edge(0,1),edge(.27+noise(cell.x,cell.y,index)*.3,1),edge(1,1)],right=[edge(0,-1),edge(.35+noise(cell.x,cell.y,index+3)*.25,-1),edge(1,-1)];
 return {left,right,outline:pathOf([...left,...right.toReversed()])+'Z',centre:`M${cell.a.join(' ')}L${cell.b.join(' ')}`,origin:[cell.x,cell.y],delay:-(index%23)/9,drift:(noise(cell.x,cell.y,4)-.5)*12};
}
export function fractureRenderData(fracture){
 const segments=cells.map((c,i)=>({c,i})).filter(({c})=>c.fracture===fracture.id),left=[],right=[],chips=[],splits=[];
 for(const {c,i} of segments){const r=crackRenderData(c,i);left.push(...r.left);right.push(...r.right);
  const n=noise(c.x,c.y,18),dx=c.b[0]-c.a[0],dy=c.b[1]-c.a[1],len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len;
  if(n>.81){const p=r.left[1],reach=1.2+n*1.3;chips.push(pathOf([p,[p[0]+nx*reach-dx*.3,p[1]+ny*reach-dy*.3],[p[0]+dx*.5,p[1]+dy*.5]])+'Z');}
  if(n<.07&&fracture.panel!==0){const p=r.right[1];splits.push(pathOf([p,[p[0]-nx*2+dx*.25,p[1]-ny*2+dy*.25],[p[0]-nx*3+dx*.65,p[1]-ny*3+dy*.65]]));}
 }
 return {opening:pathOf([...left,...right.toReversed()])+'Z',left:pathOf(left),right:pathOf(right),chips:chips.join(''),splits:splits.join(''),material:['gasket','housing','cable-seal'][fracture.panel]};
}
export function damageMarkup(f){const r=fractureRenderData(f),rubber=f.panel!==1;return `<g data-material="${r.material}"><path d="${r.opening}" fill="#070c09"/><path d="${r.left}" fill="none" stroke="${rubber?'#635f4d':'#a2a797'}" stroke-width="${rubber?.85:1.2}"/><path d="${r.right}" fill="none" stroke="${rubber?'#242921':'#4d594e'}" stroke-width="1.1"/><path d="${r.chips}" fill="${rubber?'#837b5c':'#929987'}" opacity=".7"/><path d="${r.splits}" fill="none" stroke="#10170f" stroke-width=".8"/></g>`;}
// Narrow historical wisps sit BELOW damage and all interaction material.
export function plumeMarkup(c,i,coverage=0){const intensity=leakIntensity(coverage);return `<g id="service-cell-${i}" opacity="${intensity}" style="display:${intensity?'inline':'none'}">${narrowWisp(c.x,c.y,i,Math.min(4,1.5+c.width/4))}</g>`;}
// Join only accepted, adjacent samples in the same uninterrupted dispensing stroke.
export function depositStrokes(deposits){const strokes=[];for(const d of deposits){let s=strokes.at(-1),last=s?.at(-1);if(!last||d.stroke===undefined||last.stroke!==d.stroke||last.panel!==d.panel||Math.hypot(last.x2-d.x,last.y2-d.y)>1e-7){s=[];strokes.push(s);}s.push(d);}return strokes;}
export const BEAD_WIDTH=12;
export function beadPath(samples){if(!samples.length)return '';return `M${samples[0].x} ${samples[0].y}`+samples.map(d=>`L${d.x2} ${d.y2}`).join('');}
// Associate display samples with the nearest real coverage cell. The 32-unit
// search radius includes the existing maximum useful application radius; it is
// a display lookup, never a hit-test or an award of repair progress.
const materialCells=new Map();
for(const [index,cell] of cells.entries()){const key=`${cell.panel}:${Math.floor(cell.x/32)}:${Math.floor(cell.y/32)}`;if(!materialCells.has(key))materialCells.set(key,[]);materialCells.get(key).push({cell,index});}
export function materialStyle(point,panel,coverage,thickness=6){
 let nearest=null,distance=32;
 if(Array.isArray(coverage))for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(const entry of materialCells.get(`${panel}:${Math.floor(point.x/32)+x}:${Math.floor(point.y/32)+y}`)??[]){const d=Math.hypot(point.x-entry.cell.x,point.y-entry.cell.y);if(d<distance){distance=d;nearest=entry;}}
 const value=nearest?Math.max(0,Math.min(1,coverage[nearest.index]??0)):null;
 const complete=value===1,level=value===null?null:Math.floor(value*10)/10;
 // Full coverage alone grants the complete material appearance. Until then,
 // accepted dose AND coverage constrain the body; no fake opaque completion.
 const dose=Math.max(1,Math.min(BEAD_WIDTH,Number.isFinite(thickness)?thickness*2:1));
 const width=complete?BEAD_WIDTH:Math.round(Math.min(dose,value===null?6:2+level*9)*2)/2;
 return {state:complete?'sealed':value===null?'unconfirmed':value===0?'insufficient':'partial',
  width,opacity:complete?1:value===null?.5:.3+level*.6,coverage:value};
}
export function depositRenderData(samples,coverage){
 if(!Array.isArray(samples))samples=[samples];const runs=[];
 for(const d of samples){const length=Math.hypot(d.x2-d.x,d.y2-d.y),steps=Math.max(1,Math.ceil(length/6));
  for(let i=0;i<steps;i++){const part={...d,x:d.x+(d.x2-d.x)*i/steps,y:d.y+(d.y2-d.y)*i/steps,x2:d.x+(d.x2-d.x)*(i+1)/steps,y2:d.y+(d.y2-d.y)*(i+1)/steps};
   const style=materialStyle({x:(part.x+part.x2)/2,y:(part.y+part.y2)/2},d.panel,coverage,d.thickness),last=runs.at(-1);
   if(last&&last.style.state===style.state&&last.style.width===style.width&&last.style.opacity===style.opacity)last.samples.push(part);
   else runs.push({style,samples:[part]});
  }
 }
 return runs;
}
export function depositMarkup(samples,coverage){return depositRenderData(samples,coverage).map(({style,samples:run})=>{const d=beadPath(run);
 return `<g fill="none" stroke-linecap="round" stroke-linejoin="round" data-material-state="${style.state}" data-bead-width="${style.width}" opacity="${style.opacity}"><path d="${d}" stroke="#777d78" stroke-width="${style.width}"/><path d="${d}" stroke="#aeb4ae" stroke-width="${Math.max(.6,style.width-2)}"/><path d="${d}" stroke="#dce0d9" stroke-width="${Math.min(2,style.width*.18)}" opacity=".55" transform="translate(-.6 -.8)"/></g>`;
 }).join('');}
export function depositsMarkup(deposits,coverage){return depositStrokes(deposits).map(stroke=>depositMarkup(stroke,coverage)).join('');}
// The comparison preview uses this exact production markup, including equipment.
const equipment=[
 `${[[220,245,105],[555,245,90]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r+17}" fill="#38463e" stroke="#69776b" stroke-width="6"/>
 <circle cx="${x}" cy="${y}" r="${r-13}" fill="#0e1916" stroke="#879080" stroke-width="13"/>
 <circle cx="${x}" cy="${y}" r="${r-28}" fill="#26332e" stroke="#4d5d50" stroke-width="6"/>
 <path d="M${x-r+37} ${y-22}h${2*r-74} M${x-r+37} ${y+22}h${2*r-74}" stroke="#56665a" stroke-width="8"/>
 ${[45,135,225,315].map(a=>`<circle cx="${x+(r+17)*Math.cos(a*Math.PI/180)}" cy="${y+(r+17)*Math.sin(a*Math.PI/180)}" r="5" fill="#a0a690"/>`).join('')}`).join('')}
 <text x="95" y="425">RETURN PIPE / GASKET SEATS</text><path d="M90 450H710" stroke="#677564" stroke-width="3"/>`,
 `<path d="M140 110H360V210H455V100H680V285H600V440H350V355H135Z" fill="#414b43" stroke="#89917e" stroke-width="8"/>
 <path d="M155 128H342V227H470V120H662V270H583V420H369V338H154Z" fill="none" stroke="#18271e" stroke-width="4"/>
 ${[[165,150],[330,150],[630,150],[550,390],[180,315],[390,395]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="7" fill="#a4a991"/><path d="M${x-4} ${y}h8" stroke="#1b251e" stroke-width="2"/>`).join('')}
 <text x="475" y="470">CAST UTILITY HOUSING</text>`,
 `<path d="M375 85V210M400 85V210M425 85V210" stroke="#101a17" stroke-width="18"/>
 <path d="M375 85V210M400 85V210M425 85V210" stroke="#71806b" stroke-width="9"/>
 <rect x="344" y="180" width="112" height="72" rx="10" fill="#28382e" stroke="#8b967e" stroke-width="6"/>
 <path d="M355 203H445M355 228H445" stroke="#536a53" stroke-width="8"/>
 <circle cx="358" cy="192" r="4"/><circle cx="442" cy="240" r="4"/>
 <text x="70" y="470">CABLE GLAND / BRANCHED PANEL DAMAGE</text>`,

];
export function panelMarkup(activePanel=0,visual={}){
 const coverage=visual.coverage??cells.map(()=>0);
 return `<svg id="service-svg" viewBox="0 0 800 520" aria-label="Hold mouse to dispense sealant along the damaged fractures"><defs>${leakGradient('service-vapour')}<linearGradient id="service-metal" x2="1" y2="1"><stop stop-color="#435047"/><stop offset="1" stop-color="#17251d"/></linearGradient></defs>
 <style>
 ${leakCSS}
 </style><rect x="10" y="10" width="780" height="500" rx="8" fill="url(#service-metal)" stroke="#738572" stroke-width="8"/><path d="M35 35H765V485H35Z" fill="none" stroke="#111c16" stroke-width="5"/>
 ${panels.map(p=>`<g id="service-art-${p.id}" style="display:${p.id===activePanel?'inline':'none'}" fill="#a5af96" font-family="monospace" font-size="13"><text x="55" y="65" font-size="17">${p.name}</text>${equipment[p.id]}</g>`).join('')}
 <g fill="#a3ac95">${[[28,28],[772,28],[28,492],[772,492]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="5"/>`).join('')}</g>
 <g id="service-leaks" pointer-events="none">${cells.map((c,i)=>plumeMarkup(c,i,coverage[i]).replace('display:inline',`display:${c.panel===activePanel?'inline':'none'}`)).join('')}</g>
 <g id="service-damage" pointer-events="none">${fractures.map(f=>`<g id="service-damage-${f.id}" style="display:${f.panel===activePanel?'inline':'none'}">${damageMarkup(f)}</g>`).join('')}</g>
 <g id="service-deposits">${depositsMarkup(panelDeposits(visual.deposits,activePanel),coverage)}</g>
 <g id="service-live" pointer-events="none"></g>
 <g id="service-nozzle" pointer-events="none"><path d="M0 0L16-24L28-15Z" fill="#c1c8ae" stroke="#101d14" stroke-width="2"/><path d="M18-22L35-48L48-40L29-16" fill="#706f50" stroke="#c2c9ad" stroke-width="2"/></g></svg>`;
}
export function panelPoint(svg,e){const r=svg.getBoundingClientRect(),scale=Math.min(r.width/800,r.height/520);return {x:Math.max(0,Math.min(800,(e.clientX-r.left-(r.width-800*scale)/2)/scale)),y:Math.max(0,Math.min(520,(e.clientY-r.top-(r.height-520*scale)/2)/scale))};}
export function attachService({get,send,player,root=window,now=()=>performance.now(),every=setInterval,clear=clearInterval}){
 get('service-panels').innerHTML=panels.map(p=>`<button id="service-panel-choice-${p.id}" class="secondary" type="button">${p.id+1} · ${p.name}</button>`).join('');
 get('service-board').innerHTML=panelMarkup();const svg=get('service-svg'),pending=new Map(),previews=new Map(),history=[];
 let state,online=false,gesture=null,serial=0,timer=null,point={x:60,y:80},lastSerial=-1,lastDepositPanel=-1,lastEpoch=null,lastCoverage=null,selectedPanel=0,selectionSeq=null,displayedPanel=-1;
 const defaultHint='Hold the nozzle on a fracture and trace it steadily. Lift to reposition or change panels.';
 const setHint=(message,tone='ready')=>{const hint=get('service-hint');hint.textContent=message;hint.dataset.tone=tone;};
 const transmit=a=>{const seq=send(a);if(seq!==null)pending.set(seq,a);return seq;};
 function diagnostic(){get('service-input-debug').hidden=!state?.developerInput;if(!state?.developerInput){get('service-input-events').textContent='';return;}get('service-input-state').textContent=gesture?'DISPENSING':'IDLE';if(!get('service-input-debug').open)return;get('service-input-events').textContent=history.slice().reverse().map(h=>JSON.stringify(h,null,2)).join('\n');}
 const limitedPush=(array,value)=>{array.push(value);if(array.length>40)array.shift();};
 function trace(g,event,data={}){if(!g)return;limitedPush(g.record.events,{at:now(),event,...data});}
 function unavailable(){return !online?'CONNECTION_UNAVAILABLE':state?.status!=='running'?'SESSION_'+(state?.status??'UNAVAILABLE').toUpperCase():state.stations.SERVICE_SEAL!==player?'STATION_DEPARTURE':state.service.complete?'SERVICE_COMPLETE':state.service.remaining<=0?'SEALANT_DEPLETED':document.hidden?'TAB_HIDDEN':selectionSeq!==null||selectedPanel!==state.service.activePanel?'PANEL_SELECTION':null;}
 const enabled=()=>unavailable()===null;
 function paintPreview(){get('service-live').innerHTML=[...previews.values()].map(g=>depositsMarkup(g.preview)).join('');}
 function end(flush=false,reason='CANCELLED'){if(!gesture)return;if(flush)sample();if(!gesture)return;const old=gesture;gesture=null;if(timer!==null)clear(timer);timer=null;old.record.state='ENDED';old.record.terminationReason=reason;trace(old,'END',{reason});try{svg.releasePointerCapture(old.pointer);}catch{}transmit({type:'service_end',gesture:old.id,generation:old.generation});if(flush)old.preview=old.preview.filter(p=>p.sample<old.index);else old.preview=[];if(!old.preview.length)previews.delete(old.id);paintPreview();if(reason==='POINTER_UP'||reason==='MOUSE_UP_FALLBACK')setHint('STROKE RECORDED — inspect the fracture percentage, then revisit any thin section.','recorded');else if(!reason.startsWith('PANEL_'))setHint(defaultHint);diagnostic();}
 function reanchor(reason){if(!gesture)return;const g=gesture,index=g.index++;g.recoveryFloor=index;g.preview=g.preview.filter(p=>p.sample<index);g.span++;g.start={...point};g.samplePoint={...point};g.at=g.moveAt=now();
  trace(g,'DRY_REANCHOR',{reason,index,point:{...point}});const seq=transmit({type:'service_reanchor',gesture:g.id,generation:g.generation,index,point:{...point}});limitedPush(g.record.submissions,{seq,type:'service_reanchor',index});paintPreview();if(seq===null)end(false,'CONNECTION_FAILURE');diagnostic();
 }
 function sample(){if(!gesture)return;if(!enabled()){end(false,unavailable());return;}const g=gesture,elapsed=(now()-g.at)/1000;if(elapsed<.025)return;
  if(elapsed>.12){limitedPush(g.record.samplingGaps,{at:now(),ms:elapsed*1000});reanchor('SAMPLING_GAP');return;}
  if(Math.hypot(point.x-g.samplePoint.x,point.y-g.samplePoint.y)/elapsed>2000){reanchor('IMPLAUSIBLE_OBSERVED_JUMP');return;}
  const index=g.index++,seq=transmit({type:'service_apply',gesture:g.id,generation:g.generation,index,points:[{...point,dt:elapsed}]});g.at=now();g.samplePoint={...point};limitedPush(g.record.submissions,{seq,type:'service_apply',index,dt:elapsed});trace(g,'SAMPLE_SENT',{seq,index,dt:elapsed});if(seq===null)end(false,'CONNECTION_FAILURE');diagnostic();
 }
 svg.addEventListener('pointerdown',e=>{if(e.button!==0||!enabled()||gesture)return;e.preventDefault();point=panelPoint(svg,e);const id=`seal-${++serial}-${Math.floor(now())}`,record={id,pointerdown:true,pointerup:false,pointercancel:false,capture:'not acquired',beganAt:now(),lastPointermove:null,samplingGaps:[],submissions:[],receipts:[],events:[],state:'DISPENSING',terminationReason:null};history.push(record);if(history.length>30)history.shift();
  gesture={id,record,pointer:e.pointerId,pointerType:e.pointerType??'mouse',stamp:e.timeStamp,generation:state.service.generation,index:0,recoveryFloor:-1,span:0,at:now(),moveAt:now(),start:{...point},samplePoint:{...point},preview:[],afterDeposit:state.service.deposits.at(-1)?.id??0};
  previews.set(id,gesture);try{svg.setPointerCapture(e.pointerId);record.capture=svg.hasPointerCapture?.(e.pointerId)?'acquired':'requested';trace(gesture,record.capture==='acquired'?'CAPTURE_ACQUIRED':'CAPTURE_REQUESTED');}catch{record.capture='window fallback';trace(gesture,'CAPTURE_FAILED');}
  const seq=transmit({type:'service_begin',gesture:id,generation:gesture.generation,point});limitedPush(record.submissions,{seq,type:'service_begin'});if(seq===null){end(false,'CONNECTION_FAILURE');return;}setHint('SEALANT FLOWING — keep holding and follow the visible fracture at a steady pace.','active');timer=every(sample,50);diagnostic();
 });
 root.addEventListener('pointermove',e=>{if(gesture&&(e.pointerId!==gesture.pointer||e.timeStamp<gesture.stamp))return;
  if(gesture&&Number.isFinite(e.buttons)&&(e.buttons&1)===0){gesture.record.releaseFallback='buttons=0';end(false,'BUTTON_RELEASE_OBSERVED');return;}
  const previous={...point};point=panelPoint(svg,e);get('service-nozzle').setAttribute('transform',`translate(${point.x} ${point.y})`);
  if(gesture){const g=gesture,elapsed=now()-g.moveAt,observedGap=now()-(g.record.lastPointermove??g.record.beganAt),distance=Math.hypot(point.x-previous.x,point.y-previous.y);g.record.lastPointermove=now();
   if((observedGap>120&&distance>6)||(elapsed>0&&distance/(elapsed/1000)>2000)){reanchor('UNOBSERVED_MOVEMENT_GAP');return;}
   g.preview.push({x:g.start.x,y:g.start.y,x2:point.x,y2:point.y,thickness:6*Math.min(1,110/Math.max(1,Math.hypot(point.x-g.start.x,point.y-g.start.y)/Math.max(.001,elapsed/1000))),sample:g.index,stroke:`${g.id}:${g.span}`,panel:selectedPanel});g.moveAt=now();paintPreview();g.start={...point};sample();
  }
 },true);
 root.addEventListener('pointerup',e=>{if(gesture&&e.pointerId===gesture.pointer&&e.timeStamp>=gesture.stamp){gesture.record.pointerup=true;point=panelPoint(svg,e);end(true,'POINTER_UP');}},true);
 root.addEventListener('mouseup',e=>{if(gesture&&gesture.pointerType==='mouse'&&e.button===0&&e.timeStamp>=gesture.stamp){gesture.record.releaseFallback='mouseup';point=panelPoint(svg,e);end(true,'MOUSE_UP_FALLBACK');}},true);
 root.addEventListener('pointercancel',e=>{if(gesture&&e.pointerId===gesture.pointer&&e.timeStamp>=gesture.stamp){gesture.record.pointercancel=true;end(false,'POINTER_CANCEL');}},true);
 svg.addEventListener('gotpointercapture',e=>{if(gesture&&e.pointerId===gesture.pointer&&e.timeStamp>=gesture.stamp){gesture.record.capture='acquired';trace(gesture,'CAPTURE_ACQUIRED');diagnostic();}});
 svg.addEventListener('lostpointercapture',e=>{if(gesture&&e.pointerId===gesture.pointer&&e.timeStamp>=gesture.stamp){gesture.record.capture='lost; window fallback';trace(gesture,'CAPTURE_LOST');diagnostic();}});
 const cancelPreview=reason=>{end(false,reason);previews.clear();paintPreview();};root.addEventListener('blur',()=>cancelPreview('WINDOW_BLUR'));document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelPreview('TAB_HIDDEN');});
 function paint(){if(!state)return;const v=state.service;diagnostic();
  for(const d of v.deposits){const g=previews.get(d.gesture);if(g&&d.id>g.afterDeposit){g.preview=g.preview.filter(p=>p.sample>d.sample);if(!g.preview.length&&g!==gesture)previews.delete(d.gesture);}}paintPreview();
  svg.setAttribute('data-animate',String(online&&state.status==='running'));
  get('service-panel').setAttribute('data-complete',String(v.complete));
  get('service-status').textContent=v.complete?'SERVICE LEAKS SEALED':v.remaining<=0?'SEALANT DEPLETED':'SERVICE REPAIR INCOMPLETE';
  get('service-completion').textContent=v.complete?'REPAIR COMPLETE · YOU CAN LEAVE THIS STATION':v.remaining<=0?'No refills. Existing repairs remain; unresolved sections still leak.':'Repair all three panels. Partial repairs persist.';
  get('service-panel-name').textContent=panels[selectedPanel].name;
  get('service-panel-condition').textContent=v.perPanel[selectedPanel]>=1-1e-9?'SELECTED PANEL: SEALED':`SELECTED PANEL: ${Math.floor(v.perPanel[selectedPanel]*100)}% SEALED`;
  get('service-supply').textContent=`${v.remaining.toFixed(1)} / ${v.capacity} sealant`;get('service-level').value=v.remaining;get('service-level').max=v.capacity;
  get('service-fractures').textContent=v.perFracture.map((n,i)=>({n,i})).filter(({i})=>fractures[i].panel===selectedPanel).map(({n,i})=>`${fractures[i].name}: ${n>=1-1e-9?'SEALED':Math.floor(n*100)+'%'}`).join(' · ');
  for(const p of panels){get('service-art-'+p.id).style.display=p.id===selectedPanel?'inline':'none';const button=get('service-panel-choice-'+p.id);button.setAttribute('aria-pressed',String(p.id===selectedPanel));button.textContent=`${p.id+1} · ${p.name} · ${v.perPanel[p.id]>=1-1e-9?'SEALED':Math.floor(v.perPanel[p.id]*100)+'%'}`;button.disabled=!online||state.status!=='running'||state.stations.SERVICE_SEAL!==player;}
  get('service-overall').textContent=`PANEL ${selectedPanel+1} / ${panels.length} · OVERALL ${Math.floor(v.coverage*100)}% SEALED`;
  for(let i=0;i<cells.length;i++){if(displayedPanel!==selectedPanel)for(const prefix of ['service-cell-'])get(prefix+i).style.display=cells[i].panel===selectedPanel?'inline':'none';if(cells[i].panel!==selectedPanel)continue;get('service-cell-'+i).setAttribute('opacity',leakIntensity(v.cells[i]));get('service-cell-'+i).style.display=leakIntensity(v.cells[i])>0?'inline':'none';}
  if(displayedPanel!==selectedPanel)for(const f of fractures)get('service-damage-'+f.id).style.display=f.panel===selectedPanel?'inline':'none';
  displayedPanel=selectedPanel;
  if(lastEpoch!==state.epoch||lastDepositPanel!==v.activePanel||lastSerial!==v.deposits.length||!lastCoverage||v.cells.some((n,i)=>n!==lastCoverage[i])){get('service-deposits').innerHTML=depositsMarkup(panelDeposits(v.deposits,selectedPanel),v.cells);lastSerial=v.deposits.length;lastDepositPanel=v.activePanel;lastEpoch=state.epoch;lastCoverage=[...v.cells];}
 }
 for(const p of panels)get('service-panel-choice-'+p.id).addEventListener('click',()=>{if(!online||state.status!=='running'||state.stations.SERVICE_SEAL!==player)return;end(false,'PANEL_SWITCH');previews.clear();paintPreview();get('service-deposits').innerHTML='';selectedPanel=p.id;lastSerial=-1;lastCoverage=null;setHint(`PANEL ${p.id+1} SELECTED — this view shows only ${p.name.toLowerCase()} sealant.`,`panel`);selectionSeq=transmit({type:'service_select',panel:p.id});paint();});
 return {update(next){const reason=next.epoch!==state?.epoch?'SESSION_RESET':next.status!=='running'?'SESSION_'+next.status.toUpperCase():next.stations.SERVICE_SEAL!==player?'STATION_DEPARTURE':next.service.generation!==state?.service.generation?'GENERATION_CHANGE':next.service.complete?'SERVICE_COMPLETE':next.service.remaining<=0?'SEALANT_DEPLETED':null;
  if(reason)cancelPreview(reason);state=next;online=true;if(selectionSeq===null&&selectedPanel!==next.service.activePanel){selectedPanel=next.service.activePanel;lastSerial=-1;}if(!enabled())end(false,unavailable());paint();
 },onResult(r){if(r.seq===selectionSeq){selectionSeq=null;if(r.status!=='accepted'){selectedPanel=state.service.activePanel;lastSerial=-1;paint();}}
  const a=pending.get(r.seq);pending.delete(r.seq);if(!a)return;const record=history.find(h=>h.id===a.gesture);if(record)limitedPush(record.receipts,{at:now(),seq:r.seq,type:a.type,index:a.index,status:r.status,reason:r.code??r.message});
  if(r.status!=='accepted'&&a.gesture){
   const current=gesture?.id===a.gesture;if(current&&a.type==='service_apply'&&a.index<gesture.recoveryFloor){trace(gesture,'OLD_REJECTION_IGNORED',{seq:r.seq,code:r.code});}
   else if(current&&a.type==='service_apply'&&['SERVICE_TIME_BUDGET','INVALID_SERVICE_SEGMENT','STALE_SERVICE_SEGMENT'].includes(r.code)){gesture.preview=gesture.preview.filter(p=>p.sample<a.index);reanchor('SEGMENT_REJECTED_'+r.code);}
   else {previews.delete(a.gesture);paintPreview();if(current)end(false,'SERVER_REJECTION_'+(r.code??r.status));get('service-hint').textContent=`${r.code}: ${r.message}`;}
  }
  diagnostic();
 },suspend(reason='SUSPENDED'){end(false,reason);previews.clear();paintPreview();online=false;selectionSeq=null;pending.clear();paint();}};
}
