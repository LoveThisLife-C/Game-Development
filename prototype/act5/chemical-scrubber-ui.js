import {createRenderer} from '/chemical-scrubber/render.js';
import {attachInput} from '/chemical-scrubber/input.js';
import {VESSEL,frontAt,clamp} from '/chemical-scrubber/model.js';
// Rendering and input only. Session ownership, physics, scoring and clocks live
// on the server; mounting another view never advances the accepted solver.
export function attachScrubber({get,send,player,root=window,doc=document,now=()=>performance.now(),every=setInterval,clear=clearInterval,raf=requestAnimationFrame,caf=cancelAnimationFrame,onRestore=()=>{},observe=false}){
 const renderer=createRenderer(get('scrubber-board')),svg=renderer.svg;
 let state=null,online=false,index=0,received=now(),frame=null,dirty=false,target=600,suppress=false,restorations=0;
 const ownsControl=()=>online&&state?.status==='running'&&state.stations.CHEMICAL_SCRUBBER===player;
 const enabled=()=>ownsControl()&&!doc.hidden;
 function action(type,extra={}){if(!(type==='scrubber_up'?ownsControl():enabled()))return;send({type,generation:state.scrubber.generation,index:++index,...extra});}
 function flush(){if(!dirty||!enabled())return;dirty=false;action('scrubber_move',{x:target});}
 const input=attachInput({svg,root,doc,onPosition(x){if(enabled()){target=x;dirty=true;}},onPress(){if(enabled()){flush();action('scrubber_down');}},onRelease(){if(!suppress){flush();action('scrubber_up');}}});
 function cancel(transmit=false){suppress=!transmit;input.cancel();suppress=false;dirty=false;}
 const timer=every(flush,50);
 function paint(){if(!state||(!observe&&state.stations.CHEMICAL_SCRUBBER!==player))return;
  const s=state.scrubber,dt=state.status==='running'?Math.min(.05,Math.max(0,(now()-received)/1000)):0;
  // At most 50ms of bounded linear PRESENTATION, never a second game model.
  // No client hit, escape, split, admission, chemical credit or completion.
  const visual={...s,pockets:s.pockets.map(b=>({...b,x:clamp(b.x+b.vx*dt,VESSEL.left+b.r,VESSEL.right-b.r),y:Math.max(VESSEL.top+b.r+.001,b.y+b.vy*dt)})),pulse:{...s.pulse}};
  if(s.pulse.phase==='PROPAGATING')visual.pulse.front=frontAt(s.pulse,s.time+dt);
  renderer.render(visual);get('scrubber-demister').textContent=state.demister.modifier<.999?`DEMISTER RESTRICTED — TREATMENT EFFICIENCY REDUCED · ×${state.demister.modifier.toFixed(2)}`:'';get('scrubber-status').textContent=s.condition.title;get('scrubber-detail').textContent=s.condition.detail;
  get('scrubber-panel').setAttribute('data-tone',s.condition.tone);
  get('scrubber-loading-label').textContent=s.operatingState==='DETERIORATING'?'AUTOMATIC TREATMENT DETERIORATING':'AUTOMATIC DISPERSER LOADING';get('scrubber-load').value=s.load;get('scrubber-work').textContent=`${s.progress.pending} incoming · ${s.progress.returning} returning · ${s.progress.processing} processing`;
  get('scrubber-feedback').textContent=s.time-s.lastPenalty<.9?'CHEMICAL BREAKTHROUGH · +1 TO TREAT':s.progress.daughtersRemaining?`${s.progress.daughtersRemaining} daughter portions still need treatment`:'Large glancing hits can split. Treat both daughters.';
 }
 function animate(){paint();frame=raf(animate);}frame=raf(animate);
 return {update(next){const changed=state?.epoch!==next.epoch||state?.scrubber.generation!==next.scrubber.generation;
   if(changed||next.status!=='running'||next.stations.CHEMICAL_SCRUBBER!==player)cancel(false);
   index=changed?next.scrubber.index:Math.max(index,next.scrubber.index);state=next;online=true;received=now();
   if(next.scrubber.stats.restorations>restorations)onRestore();restorations=next.scrubber.stats.restorations;paint();
  },onResult(r){if(r.action?.startsWith('scrubber_')&&r.status!=='accepted')cancel(r.code!=='STALE_SCRUBBER'&&r.code!=='NOT_OWNER');},suspend(){cancel(online);online=false;},destroy(){cancel(online);input.destroy();clear(timer);caf(frame);online=false;},get active(){return input.active;}};
}
