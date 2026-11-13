import {apparatus,toggleApparatus} from '/emergency-purge/render.js';
import {pickEdge,TOGGLE,clamp} from '/emergency-purge/model.js';
import {attachInput,pointerWorld} from '/emergency-purge/input.js';
// Input and presentation only: no client solver, recurrence clock or reward.
export function attachPurge({get,send,player,root=window,doc=document,every=setInterval,clear=clearInterval,raf=requestAnimationFrame,caf=cancelAnimationFrame,now=()=>performance.now()}){
 const svg=get('purge-machine'),toggle=get('purge-toggle');let state=null,online=false,index=0,held=null,points=[],suppress=false,lever=0,lastX=0,frame,received=now(),gesture=null,gestureSerial=0;
 const owns=()=>online&&state?.status==='running'&&state.purge.available&&state.stations.EMERGENCY_PURGE===player;
 const enabled=()=>owns()&&!doc.hidden;
 function action(type,extra={}){if(owns())send({type,generation:state.purge.generation,index:++index,gestureId:gesture,...extra});}
 function flush(){if(points.length&&enabled()){const batch=points;points=[];action('purge_move',{points:batch});}}
 function queue(p){if(!enabled()||!held)return;
  if(held==='sheet')points=[p];
  else {lever=clamp(lever+p.x-lastX,-TOGGLE.travel,TOGGLE.travel);lastX=p.x;
   // Preserve extrema/reversals while compressing monotone high-Hz samples.
   const a=points.at(-2),b=points.at(-1);if(a&&b&&(b.x-a.x)*(p.x-b.x)>=0)points[points.length-1]=p;else points.push(p);
   paintLever();
  }
  if(points.length>=64)flush();
 }
 function end(){if(!suppress){flush();if(held)action('purge_end');}held=null;gesture=null;points=[];lever=0;}
 function begin(control,p){if(!enabled()||held)return false;const m=state.purge.model;
  if(m.purge!=='idle'||control==='sheet'&&!pickEdge(m,p)||control==='toggle'&&(!m.clear||Math.abs(p.x-130)>70||Math.abs(p.y-166)>48))return false;
  held=control;gesture=state.purge.generation+':'+ ++gestureSerial;lever=0;lastX=p.x;action('purge_begin',{control,point:p});return held===control;
 }
 const sheetInput=attachInput({svg,root,doc,onGrab:p=>begin('sheet',p),onMove:queue,onRelease:end});
 const toggleInput=attachInput({svg:toggle,root,doc,mapPoint:(el,e)=>pointerWorld(el,e,TOGGLE),onGrab:p=>begin('toggle',p),onMove:queue,onRelease:end});
 function cancel(transmit=false){points=[];suppress=!transmit;sheetInput.cancel();toggleInput.cancel();suppress=false;held=null;gesture=null;points=[];lever=0;}
 function paintLever(){if(!state)return;const m=state.purge.model,visual=held==='toggle'?{...m,toggle:{...m.toggle,x:lever}}:m;toggle.innerHTML=toggleApparatus(visual);toggle.style.cursor=held==='toggle'?'grabbing':m.clear&&m.purge==='idle'?'grab':'default';}
 function paint(){if(!state||state.stations.EMERGENCY_PURGE!==player)return;const p=state.purge,m=p.model;
  // At most 30ms of presentation-only extrapolation, like the scrubber.
  // No client forces, adhesion, fracture, collection, scoring or recurrence.
  const dt=state.status==='running'?Math.min(.03,Math.max(0,(now()-received)/1000)):0;
  const visual={...m,time:m.time+dt,nodes:m.nodes.map(n=>{const z=clamp(n.z+n.vz*dt,0,220);return {...n,x:clamp(n.x+n.vx*dt,58,1222-.22*z),y:clamp(n.y+n.vy*dt,68+.45*z,659+.45*z),z};})};
  svg.innerHTML=apparatus(visual);svg.style.cursor=held==='sheet'?'grabbing':'default';paintLever();
  get('purge-obstruction').textContent=Math.round((1-m.open)*100)+'% OBSTRUCTED';get('purge-charge').textContent=Math.round(m.toggle.charge)+'%';get('purge-charge-bar').style.width=m.toggle.charge+'%';
  get('purge-toggle-status').textContent=m.purge==='complete'?'SYSTEM STABLE — YOU CAN LEAVE':m.purge==='running'?'PURGE DISCHARGING':m.clear?'EXHAUST CLEAR — SHAKE TO PURGE':'PURGE LOCKED — CLEAR EXHAUST';
  get('purge-status').textContent=m.purge==='complete'?'EMERGENCY PURGE COMPLETE · CABIN CONTAMINATION REDUCED · SYSTEM STABLE — YOU CAN LEAVE':m.purge==='running'?'EMERGENCY EXTRACTION ENGAGED':m.clear?'EXHAUST CLEAR — SHAKE TO PURGE':'PEEL THE FOULING · COLLECT ALL REMOVED MATERIAL';
  get('purge-condition').textContent=p.operatingState==='DETERIORATING'?'Filter loading is increasing. The system will need attention again.':m.purge==='complete'?'Temporary restoration. You can leave; filter fouling will return.':'Feed every freed piece into the single collector below the grille.';
  get('purge-panel').setAttribute('data-state',p.operatingState);
 }
 const timer=every(flush,20);function animate(){paint();frame=raf(animate);}frame=raf(animate);
 return {update(next){const changed=state?.epoch!==next.epoch||state?.purge.generation!==next.purge.generation;
   if(changed||next.status!=='running'||next.stations.EMERGENCY_PURGE!==player||next.purge.model.purge!=='idle')cancel(false);
   index=changed?next.purge.index:Math.max(index,next.purge.index);state=next;online=true;received=now();paint();
  },onResult(r){if(gesture&&r.gestureId===gesture&&r.action?.startsWith('purge_')&&r.status!=='accepted')cancel(r.code!=='STALE_PURGE'&&r.code!=='NOT_OWNER');},suspend(){cancel(online);online=false;},destroy(){cancel(online);sheetInput.destroy();toggleInput.destroy();clear(timer);caf(frame);online=false;},get active(){return sheetInput.active||toggleInput.active;}};
}
