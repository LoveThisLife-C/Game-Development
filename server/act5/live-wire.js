// Byte-identical v0.4 solver, packaged under public so existing deployment COPY rules suffice.
// Server and browser share this model; parity tests guard the unchanged standalone reference.
import {createState,settings,advance,catchWire,moveGrip,releaseGrip,head,grabRadius,distance,condition,WIRES,WORLD} from '../../prototype/act5/live-wire/model.js';
const parameters=c=>({surgeStrength:c.liveWireDisturbance,grabScale:c.liveWireCatchScale,protectedInterval:c.liveWireProtected,warningDuration:c.liveWireWarning});
export function createLiveWire(config,generation=0){return {model:createState(parameters(config)),generation,control:null};}
export function syncLiveWire(state){state.liveWire.model.config=settings({...state.liveWire.model.config,...parameters(state.config)});}
export function cancelLiveWire(state){const p=state.liveWire;releaseGrip(p.model,'control-released');p.control=null;p.generation++;}
export function resetLiveWire(state){state.liveWire=createLiveWire(state.config,state.liveWire.generation+1);}
export function electricalMultiplier(state){return 1+(4-state.liveWire.model.wires.filter(w=>w.connected).length)/4*state.config.maxPowerPenalty;}
export function liveWireView(state){const p=state.liveWire,s=p.model;return {...structuredClone(s),generation:p.generation,control:p.control?{...p.control}:null,secured:s.wires.filter(w=>w.connected).length,condition:condition(s),protectedRemaining:s.cycle.phase==='PROTECTED'?Math.max(0,s.cycle.protectedUntil-s.time):0,upcomingFailure:WIRES[[2,1,3,0][s.cycle.nextIndex%4]].id};}
const point=a=>Number.isFinite(a.x)&&Number.isFinite(a.y)&&a.x>=0&&a.x<=WORLD.width&&a.y>=0&&a.y<=WORLD.height;
export function liveWireError(state,player,a){const p=state.liveWire,s=p.model,fail=(code,message)=>({code,message});
 if(state.stations.LIVE_WIRE!==player)return fail('NOT_OWNER','Enter Live Wire to control a cable');
 if(state.status!=='running')return fail('SESSION_NOT_RUNNING','Live Wire requires a running session');
 if(a.generation!==p.generation)return fail('STALE_LIVE_WIRE','Control invalidated; begin a fresh catch');
 if(a.type==='wire_begin'){
  if(p.control||s.grip||typeof a.gestureId!=='string'||!a.gestureId.length||a.gestureId.length>100||a.index!==0||!point(a))return fail('INVALID_WIRE_BEGIN','Invalid or overlapping catch gesture');
  if(!s.wires.some(w=>!w.connected&&distance(head(w),a)<=grabRadius(s)))return fail('WIRE_MISSED','Missed the actual moving connector');
  return null;
 }
 const g=p.control;if(!g||g.player!==player||g.id!==a.gestureId)return fail('STALE_LIVE_WIRE','Gesture no longer active');
 // Releasing cannot add energy or progress. Permit a final release after a rejected
 // movement sample; otherwise one invalid sample could strand an authoritative grip.
 if((a.type==='wire_end'||a.type==='wire_cancel')&&Number.isSafeInteger(a.index)&&a.index>g.index)return null;
 if(!Number.isSafeInteger(a.index)||a.index!==g.index+1)return fail('WIRE_INPUT_ORDER','Input sample is stale or out of order');
 if(a.type==='wire_move'&&(!point(a)||distance(a,g.last)>300))return fail('INVALID_WIRE_TARGET','Pointer target exceeds bounded sample travel');
 return null;
}
export function applyLiveWire(state,player,a){const p=state.liveWire,s=p.model;
 if(a.type==='wire_begin'){const caught=catchWire(s,a);p.control={id:a.gestureId,player,index:0,modelGesture:caught.gestureId,wireId:caught.wireId,offset:caught.offset,last:{x:a.x,y:a.y}};return;}
 const g=p.control;g.index=a.index;
 if(a.type==='wire_move'){g.last={x:a.x,y:a.y};moveGrip(s,{x:a.x+g.offset.x,y:a.y+g.offset.y},g.modelGesture);}else cancelLiveWire(state);
}
export function advanceLiveWire(state,dt){const p=state.liveWire;advance(p.model,dt);if(p.control&&!p.model.grip){p.control=null;p.generation++;}}
