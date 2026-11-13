import {scene} from '/air-supply/render.js';
import {selectAt,DAMAGE_STAGES} from '/air-supply/model.js';
import {attachInput} from '/air-supply/input.js';
// Presentation and input only. No browser physics, completion or wear clock.
export function attachAirSupply({get,send,player,root=window,doc=document,every=setInterval,clear=clearInterval}){
 const svg=get('air-machine');let state=null,online=false,index=0,held=null,pending=null,suppress=false,gesture=null,serial=0;
 const owns=()=>online&&state?.status==='running'&&state.stations.AIR_SUPPLY===player;
 const enabled=()=>owns()&&!doc.hidden&&!state.airSupply.model.complete;
 function action(type,extra={}){if(owns())send({type,generation:state.airSupply.generation,index:++index,gestureId:gesture,...extra});}
 function flush(){if(pending&&enabled()){const point=pending;pending=null;action('air_move',{point});}}
 function end(){if(!suppress){flush();if(held)action('air_end');}held=null;pending=null;gesture=null;}
 const input=attachInput({svg,root,doc,onGrab(point){if(!enabled()||held||selectAt(state.airSupply.model,point)===null)return false;held='drag';gesture=state.airSupply.generation+':'+ ++serial;action('air_grab',{point});return held==='drag';},onMove(point){if(enabled()&&held==='drag')pending=point;},onRelease:end});
 const cleanups=[],buttons=[];
 for(const mode of ['inflate','vent']){
  const el=get('air-'+mode);let active=null;buttons.push(()=>finish());
  function finish(e){if(!active||e&&(e.pointerId!==active.id||e.timeStamp<active.stamp))return;const id=active.id;active=null;end();el.dataset.held='false';el.setAttribute('aria-pressed','false');get('air-control-feedback').textContent='Release to stop changing size.';try{el.releasePointerCapture(id);}catch{}}
  function down(e){if(!enabled()||held||e.button!==0||e.isPrimary===false)return;e.preventDefault();held=mode;gesture=state.airSupply.generation+':'+ ++serial;active={id:e.pointerId,stamp:e.timeStamp};el.dataset.held='true';el.setAttribute('aria-pressed','true');get('air-control-feedback').textContent=mode==='inflate'?'INFLATING SELECTED CUSHION — RELEASE TO STOP':'VENTING SELECTED CUSHION — RELEASE TO STOP';action('air_valve',{mode});if(!active)return;try{el.setPointerCapture(e.pointerId);}catch{finish();}}
  const blur=()=>finish(),hidden=()=>{if(doc.hidden)finish();},motion=e=>{if(active&&e.buttons===0)finish(e);};
  for(const [target,type,fn] of [[el,'pointerdown',down],[el,'lostpointercapture',finish],[root,'pointerup',finish],[root,'pointercancel',finish],[root,'pointermove',motion],[root,'blur',blur],[doc,'visibilitychange',hidden]]){target.addEventListener(type,fn);cleanups.push(()=>target.removeEventListener(type,fn));}
 }
 function cancel(transmit=false){suppress=!transmit;input.cancel();for(const finish of buttons)finish();suppress=false;held=null;pending=null;gesture=null;}
 function paint(){if(!state||state.stations.AIR_SUPPLY!==player)return;const p=state.airSupply,m=p.model,a=m.metrics;// Scope the accepted renderer's paint-server IDs to avoid the scrubber's
  // existing #housing element in this shared document. Geometry is untouched.
  svg.innerHTML=scene(m).replace(/id="(housing|rubber|mesh)"/g,'id="air-$1"').replace(/url\(#(housing|rubber|mesh)\)/g,'url(#air-$1)');svg.style.cursor=held==='drag'?'grabbing':'grab';
  for(let i=0;i<3;i++){get('air-leak-'+i).textContent='LEAK '+(i+1)+' — '+a.leakStates[i];get('air-leak-'+i).dataset.state=a.leakStates[i];}
  get('air-stage').textContent='STAGE '+(m.stage+1)+' — '+DAMAGE_STAGES[m.stage].name;
  get('air-flow').textContent=Math.floor((a.supply+1e-9)*100)+'%';get('air-target').textContent='REQUIRED: '+Math.round(m.target*100)+'%';
  get('air-selected').textContent='CUSHION '+ 'ABC'[m.selected]+' · '+Math.round(m.cushions[m.selected].inflation*100)+'% INFLATED';
  get('air-status').textContent=m.complete?'SUPPLY PRESSURE RESTORED':m.creep?'SEAL CONTACT RELAXING':a.ready?'VALID ARRANGEMENT — SETTLING':a.leaks.every(v=>v>=.8)?'AIRFLOW RESTRICTED — REPOSITION OR VENT CUSHIONS':'SEAL REMAINING LEAKS';
  get('air-detail').textContent=m.complete?'CLEAN AIR DELIVERY STABLE · YOU CAN LEAVE THIS STATION':a.ready?'Release the cushion and allow approximately one second to settle.':'Seal all three seams and keep clean airflow above the displayed target.';
  get('air-wear').textContent=m.complete?(p.operatingState==='DETERIORATING'?'Seam wear is advancing. Temporary seals will need attention again.':'Temporary restoration. Existing seams will deteriorate; you can leave.'):'Clean-air pressure reduces future contaminated ingress. It does not remove existing cabin gas.';
  get('air-panel').dataset.state=p.operatingState;for(const mode of ['inflate','vent'])get('air-'+mode).disabled=!enabled();
 }
 const timer=every(flush,50);
 return {update(next){const changed=state?.epoch!==next.epoch||state?.airSupply.generation!==next.airSupply.generation;
   if(changed||next.status!=='running'||next.stations.AIR_SUPPLY!==player||next.airSupply.model.complete)cancel(false);
   index=changed?next.airSupply.index:Math.max(index,next.airSupply.index);state=next;online=true;paint();
  },onResult(r){if(gesture&&r.gestureId===gesture&&r.action?.startsWith('air_')&&r.status!=='accepted')cancel(!['STALE_AIR_SUPPLY','NOT_OWNER'].includes(r.code));},suspend(){cancel(online);online=false;},destroy(){cancel(online);input.destroy();for(const fn of cleanups)fn();clear(timer);online=false;},get active(){return !!held;}};
}
