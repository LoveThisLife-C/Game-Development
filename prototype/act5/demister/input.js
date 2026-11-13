import {VIEW} from './model.js';
export function pointerWorld(svg,e,world=VIEW) {
 const r=svg.getBoundingClientRect(),scale=Math.min(r.width/world.width,r.height/world.height);
 if(!(scale>0))return null;
 const p={x:(world.x||0)+(e.clientX-r.left-(r.width-world.width*scale)/2)/scale,y:(world.y||0)+(e.clientY-r.top-(r.height-world.height*scale)/2)/scale};
 return Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;
}
export function attachInput({svg,root=window,doc=document,onGrab,onMove,onRelease,onHover=()=>{},mapPoint=pointerWorld,shouldRelease=()=>false}) {
 let active=null;
 function finish(e,reason) {
  if(!active||e&&(e.pointerId!==active.id||e.timeStamp<active.stamp))return;
  const id=active.id;active=null;onRelease(reason);try{svg.releasePointerCapture(id);}catch{}
 }
 function down(e) {
  if(active||e.button!==0||e.isPrimary===false)return;
  const p=mapPoint(svg,e);if(!p||!onGrab(p))return;
  e.preventDefault();active={id:e.pointerId,stamp:e.timeStamp};
  try{svg.setPointerCapture(e.pointerId);}catch{finish(null,'capture-failed');}
 }
 function move(e) {
  if(!active||e.pointerId!==active.id||e.timeStamp<active.stamp)return;
  if(e.buttons===0){finish(e,'observed-release');return;}
  // Some browsers combine many physical samples into a single dispatch.
  // Preserve each reversal, even several between two rendered frames.
  let samples=[];try{samples=e.getCoalescedEvents?.()||[];}catch{}
  for(const sample of [...samples,e]){
   if(!active)break;
   if(sample.timeStamp<active.stamp)continue;
   const p=mapPoint(svg,sample);if(!p)continue;
   onMove(p);active.stamp=sample.timeStamp;
   if(shouldRelease())finish(null,'complete');
  }
  e.preventDefault();
 }
 const up=e=>finish(e,'release'),cancel=e=>finish(e,'cancel'),lost=e=>finish(e,'lost');
 const blur=()=>finish(null,'blur'),hidden=()=>{if(doc.hidden)finish(null,'hidden');};
 const hover=e=>{if(!active&&e.buttons===0){const p=mapPoint(svg,e);if(p)onHover(p);}};
 svg.addEventListener('pointermove',hover);
 svg.addEventListener('pointerdown',down);svg.addEventListener('lostpointercapture',lost);
 root.addEventListener('pointermove',move);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',cancel);
 root.addEventListener('blur',blur);doc.addEventListener('visibilitychange',hidden);
 return {get active(){return !!active;},cancel:()=>finish(null,'reset'),destroy(){finish(null,'destroy');
  svg.removeEventListener('pointerdown',down);svg.removeEventListener('lostpointercapture',lost);
  svg.removeEventListener('pointermove',hover);
  root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',cancel);
  root.removeEventListener('blur',blur);doc.removeEventListener('visibilitychange',hidden);}};
}
