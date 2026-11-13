import {render} from '/demister/render.js';
import {WORKING,TOOL_GRAB_RADIUS,clamp} from '/demister/model.js';
import {attachInput} from '/demister/input.js';
// Only input and presentation. Lifted positioning may be previewed locally;
// liquid, contact, drainage, completion and recurrence remain server-owned.
export function attachDemister({get,send,player,root=window,doc=document,every=setInterval,clear=clearInterval}){
 const svg=get('demister-machine');let state=null,online=false,index=0,held=false,pending=null,suppress=false,gesture=null,serial=0,lifted=null;
 const owns=()=>online&&state?.status==='running'&&state.stations.DEMISTER_DRAINAGE===player;
 const enabled=()=>owns()&&!doc.hidden&&!state.demister.model.complete;
 const bounded=p=>({x:clamp(p.x,WORKING.left,WORKING.right),y:clamp(p.y,WORKING.top,WORKING.bottom)});
 function action(type,extra={}){if(owns())send({type,generation:state.demister.generation,index:++index,gestureId:gesture,...extra});}
 function flush(){if(pending&&enabled()){const a=pending;pending=null;action(a.type,{point:a.point});}}
 function end(){if(!suppress){flush();if(held)action('demister_end');}held=false;pending=null;gesture=null;lifted=null;if(get('demister-feedback'))get('demister-feedback').textContent='TIP LIFTED — move the mouse to reposition, then click and hold again.';}
 const input=attachInput({svg,root,doc,onGrab(point){if(!enabled()||held)return false;
   const p=bounded(point),tip=lifted||state.demister.model.tool;if(Math.hypot(point.x-tip.x,point.y-tip.y)>TOOL_GRAB_RADIUS)return false;
   flush();held=true;lifted=null;gesture=state.demister.generation+':'+ ++serial;action('demister_grab',{point:p});if(get('demister-feedback'))get('demister-feedback').textContent='WIPER HELD — keep holding and push the droplets down into the gutter.';paint();return held;
  },onMove(point){if(enabled()&&held)pending={type:'demister_move',point:bounded(point)};},onHover(point){if(enabled()&&!held){lifted=bounded(point);pending={type:'demister_hover',point:lifted};if(get('demister-feedback'))get('demister-feedback').textContent='TIP LIFTED — place the gold ring, then click and hold to wipe.';paint();}},onRelease:end});
 function cancel(transmit=false){suppress=!transmit;input.cancel();suppress=false;held=false;pending=null;gesture=null;lifted=null;}
 function paint(){if(!state||state.stations.DEMISTER_DRAINAGE!==player)return;const p=state.demister,m=p.model;
  const visual=lifted&&!held?{...m,tool:{...m.tool,...lifted}}:m;
  svg.innerHTML=render(visual).replace(/id="(plate|liquid|drainLiquid)"/g,'id="demister-$1"').replace(/url\(#(plate|liquid|drainLiquid)\)/g,'url(#demister-$1)');svg.style.cursor=held?'grabbing':'grab';
  get('demister-remaining').textContent=String(m.drops.length);
  get('demister-status').textContent=m.complete?'DEMISTER CLEARED':'DRAIN EVERY DROPLET';
  get('demister-detail').textContent=m.complete?'LIQUID RECOVERY STABLE · YOU CAN LEAVE THIS STATION':'Merge droplets to release heavier drops. Lift the tip to reposition; guide isolated drops into the bottom gutter.';
  get('demister-condition').textContent=p.operatingState;
  if(get('demister-feedback')&&m.complete)get('demister-feedback').textContent='DEMISTER CLEAR — all liquid has entered the lower gutter.';
  get('demister-coupling').textContent=`SCRUBBER CAPACITY ×${p.modifier.toFixed(2)} · ${m.complete?'Liquid will gradually accumulate again; you can leave.':'Clearing the plate restores normal treatment performance.'}`;
  get('demister-panel').dataset.state=p.operatingState;
 }
 const timer=every(flush,25);
 return {update(next){const changed=state?.epoch!==next.epoch||state?.demister.generation!==next.demister.generation;
   if(changed||next.status!=='running'||next.stations.DEMISTER_DRAINAGE!==player||next.demister.model.complete)cancel(false);
   index=changed?next.demister.index:Math.max(index,next.demister.index);state=next;online=true;paint();
  },onResult(r){if(gesture&&r.gestureId===gesture&&r.action?.startsWith('demister_')&&r.status!=='accepted')cancel(!['STALE_DEMISTER','NOT_OWNER'].includes(r.code));},suspend(){cancel(online);online=false;},destroy(){cancel(online);input.destroy();clear(timer);online=false;},get active(){return held;}};
}
