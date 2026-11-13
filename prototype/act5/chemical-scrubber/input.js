import {VIEW,VESSEL} from './model.js';
export function pointerWorld(svg,e){const r=svg.getBoundingClientRect(),scale=Math.min(r.width/VIEW.width,r.height/VIEW.height);if(!(scale>0))return null;const p={x:VIEW.x+(e.clientX-r.left-(r.width-VIEW.width*scale)/2)/scale,y:VIEW.y+(e.clientY-r.top-(r.height-VIEW.height*scale)/2)/scale};return Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;}
const inside=p=>p&&p.x>=VESSEL.left&&p.x<=VESSEL.right&&p.y>=VESSEL.top&&p.y<=700;
export function attachInput({svg,root=window,doc=document,onPosition,onPress,onRelease}){
 let active=null;
 function finish(e,reason){if(!active||(e&&(e.pointerId!==active.pointer||e.timeStamp<active.lastStamp)))return;const a=active;active=null;onRelease(reason);try{svg.releasePointerCapture(a.pointer);}catch{}}
 function down(e){if(e.button!==0||active)return;const p=pointerWorld(svg,e);if(!inside(p))return;e.preventDefault();onPosition(p.x);active={pointer:e.pointerId,lastStamp:e.timeStamp};onPress();try{svg.setPointerCapture(e.pointerId);}catch{}}
 function move(e){if(active){if(e.pointerId!==active.pointer||e.timeStamp<active.lastStamp)return;if(e.buttons===0)finish(e,'button-up');else active.lastStamp=e.timeStamp;}const p=pointerWorld(svg,e);if(inside(p))onPosition(p.x);}
 const up=e=>finish(e,'release'),cancel=e=>finish(e,'pointercancel'),blur=()=>finish(null,'blur'),hidden=()=>{if(doc.hidden)finish(null,'hidden');};
 svg.addEventListener('pointerdown',down);svg.addEventListener('pointermove',move);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',cancel);root.addEventListener('blur',blur);doc.addEventListener('visibilitychange',hidden);
 return {get active(){return !!active;},cancel:()=>finish(null,'reset'),destroy(){finish(null,'destroy');svg.removeEventListener('pointerdown',down);svg.removeEventListener('pointermove',move);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',cancel);root.removeEventListener('blur',blur);doc.removeEventListener('visibilitychange',hidden);}};
}
