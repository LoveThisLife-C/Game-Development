import {createRenderer} from '/live-wire/render.js';
import {WIRES,WORLD,BOUNDS,RULES,head,condition,distance} from '/live-wire/model.js';
import {nextDragTarget} from '/live-wire/drag.js';
// Letterboxing-aware conversion; the world and all physical acceptance shapes are unchanged.
export function wirePoint(svg,e){const r=svg.getBoundingClientRect(),scale=Math.min(r.width/WORLD.width,r.height/WORLD.height);if(!(scale>0))return null;const p={x:(e.clientX-r.left-(r.width-WORLD.width*scale)/2)/scale,y:(e.clientY-r.top-(r.height-WORLD.height*scale)/2)/scale};return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=WORLD.width&&p.y>=0&&p.y<=WORLD.height?p:null;}
export function attachLiveWire({get,send,player,root=window,doc=document,now=()=>performance.now(),every=setInterval,clear=clearInterval,raf=requestAnimationFrame,caf=cancelAnimationFrame,onImpact=()=>{},observe=false}){
 const renderer=createRenderer(get('livewire-board')),svg=renderer.svg;
 let state,online=false,active=null,serial=0,received=now(),frame=null,lastLocked=0;
 const enabled=()=>online&&state?.status==='running'&&state.stations.LIVE_WIRE===player&&!doc.hidden;
 function flush(a=active){if(!a||!a.dirty)return;const next=nextDragTarget(a.target,a.goal);a.target=next.target;a.dirty=next.dirty;send({type:'wire_move',generation:a.generation,gestureId:a.id,index:++a.index,...a.target});}
 function finish(transmit=true){const a=active;if(!a)return;active=null;if(transmit){flush(a);send({type:'wire_end',generation:a.generation,gestureId:a.id,index:++a.index});}try{svg.releasePointerCapture(a.pointer);}catch{}}
 svg.addEventListener('pointerdown',e=>{if(e.button!==0||!enabled()||active)return;const p=wirePoint(svg,e);if(!p)return;
  // Provisional pointer capture only. The server alone decides whether a catch succeeded.
  e.preventDefault();get('livewire-feedback').dataset.state='catching';get('livewire-feedback').textContent='CATCH REQUESTED — keep holding. Do not release the mouse.';active={id:`wire-${++serial}-${Math.round(now()*1000)}`,generation:state.liveWire.generation,index:0,pointer:e.pointerId,start:e.timeStamp,lastStamp:e.timeStamp,target:p,goal:p,dirty:false};
  try{svg.setPointerCapture(e.pointerId);}catch{}send({type:'wire_begin',generation:active.generation,gestureId:active.id,index:0,...p});
 });
 function move(e){const a=active;if(!a||a.pointer!==e.pointerId||e.timeStamp<a.lastStamp)return;if(e.buttons===0){finish();return;}a.lastStamp=e.timeStamp;const p=wirePoint(svg,e);if(!p)return;a.goal=p;a.dirty=true;}
 const end=e=>{if(active&&e.pointerId===active.pointer&&e.timeStamp>=active.lastStamp)finish();};
 root.addEventListener('pointermove',move,true);root.addEventListener('pointerup',end,true);root.addEventListener('pointercancel',end,true);
 root.addEventListener('blur',()=>finish());doc.addEventListener('visibilitychange',()=>{if(doc.hidden)finish();});
 // Lost capture retains window release fallback; scheduling gaps never cancel a hold.
 const timer=every(()=>flush(),50);
 function paint(){if(!state||(!observe&&state.stations.LIVE_WIRE!==player))return;const s=state.liveWire;
  // Bounded presentation extrapolation only: no client solver, catch, seat, timer or score.
  // Stop extrapolating at 50 ms, never move retained/locked endpoints, freeze on pause.
  const dt=state.status==='running'?Math.min(.05,Math.max(0,(now()-received)/1000)):0;
  const visual={...s,wires:s.wires.map(w=>({...w,nodes:w.nodes.map((p,i)=>dt===0||w.connected||i===0||w.state==='SEATED'&&i===w.nodes.length-1?p:{...p,x:Math.max(BOUNDS.left+(i===10?RULES.headRadius:RULES.bodyRadius),Math.min(BOUNDS.right-(i===10?RULES.headRadius:RULES.bodyRadius),p.x+p.vx*dt)),y:Math.max(BOUNDS.top+(i===10?RULES.headRadius:RULES.bodyRadius),Math.min(BOUNDS.bottom-(i===10?RULES.headRadius:RULES.bodyRadius),p.y+p.vy*dt))})}))};
  if(active&&s.control?.id===active.id&&visual.grip)visual.grip={...visual.grip,desired:{x:active.target.x+s.control.offset.x,y:active.target.y+s.control.offset.y}};
  renderer.render(visual,s.time+dt);const c=s.condition??condition(s);get('livewire-status').textContent=c.title;get('livewire-detail').textContent=c.detail;get('livewire-panel').setAttribute('data-tone',c.tone);
  if(s.control?.id===active?.id){get('livewire-feedback').dataset.state='held';get('livewire-feedback').textContent='GRIP CONFIRMED — drag right to the matching shape and keep holding until LOCKED.';if(get('error'))get('error').textContent='';}
  get('livewire-progress').textContent=`${s.secured} / 4 CONNECTIONS SECURED`;
  for(const w of s.wires){const d=WIRES.find(d=>d.id===w.id),card=get('livewire-'+w.id);card.setAttribute('data-state',w.state);card.textContent=`${d.number} · ${d.name} — ${s.cycle.phase==='WARNING'&&s.cycle.wireId===w.id?'CONTACT UNSTABLE':w.connected?'ONLINE':w.state==='SEATED'?'SEATED — HOLD '+Math.ceil((1-w.progress)*1.5*10)/10+'s':w.state==='HELD'?'HELD — WRESTLE TO SOCKET':'OFFLINE'}`;}
  get('livewire-debug').hidden=!state.developerInput;if(get('livewire-debug').open)get('livewire-debug-log').textContent=JSON.stringify({generation:s.generation,control:s.control,cycle:s.cycle,wires:s.wires.map(w=>({id:w.id,state:w.state,head:head(w),progress:w.progress}))},null,2);
 }
 function animate(){paint();frame=raf(animate);}frame=raf(animate);
 return {update(next){if(active&&(next.epoch!==state?.epoch||next.liveWire.generation!==active.generation||next.status!=='running'||next.stations.LIVE_WIRE!==player))finish(false);state=next;online=true;received=now();if(next.liveWire.secured>lastLocked)onImpact('lock');lastLocked=next.liveWire.secured;paint();},onResult(r){if(!r.action?.startsWith('wire_')||r.gestureId!==active?.id)return;if(r.status!=='accepted'){finish(r.action==='wire_move');get('livewire-feedback').dataset.state='missed';get('livewire-feedback').textContent=`${r.message} — click the glowing numbered head, not the cable.`;}},suspend(){finish(online);online=false;},destroy(){finish();clear(timer);caf(frame);},get active(){return !!active;}};
}
