// The accepted v0.4 solver is unchanged. Session ticks alone advance it.
import {createState,advance,grab,move,release,setValve,selectAt,nextDamageStage,clamp} from '../../prototype/act5/air-supply/model.js';
export function createAirSupply(generation=0){return {model:createState(),generation,index:0,restorations:0,lastRestoredAt:null,completedAt:null,stableFor:null,wear:0};}
export function cancelAirSupply(s){const p=s.airSupply;release(p.model);p.generation++;p.index=0;}
export function advanceAirSupply(s,dt){const p=s.airSupply,m=p.model;
 // The accepted cushion solver is intentionally detailed and expensive. Do not
 // integrate an untouched station on every cabin tick: its initial geometry is
 // already measured, and there is no physical input to advance. Once a player
 // enters or disturbs it, continue through release until the material settles.
 const moving=(m.metrics?.motion??0)>.05;
 if(s.stations.AIR_SUPPLY!==null||m.grip||m.valve||m.creep||moving)advance(m,dt);
 if(!m.complete){p.completedAt=null;p.stableFor=null;p.wear=0;return;}
 if(p.completedAt===null){p.completedAt=s.elapsed;p.lastRestoredAt=s.elapsed;p.restorations++;const r=((s.config.seed*1664525+p.restorations*1013904223)>>>0)/4294967296;p.stableFor=s.config.airSupplyStableMin+(s.config.airSupplyStableMax-s.config.airSupplyStableMin)*r;}
 p.wear=clamp((s.elapsed-p.completedAt)/p.stableFor,0,1);
 if(p.wear>=1){cancelAirSupply(s);nextDamageStage(m);p.completedAt=null;p.stableFor=null;p.wear=0;}
}
// Pressure protection is a quality contract, not airflow interpreted directly
// as ingress reduction: zero at <=50% delivery or an entirely open seam,
// full only after the accepted settled completion. Partial seals retain some
// pressure according to their weakest contact and useful delivered air.
export function airSupplyEffectiveness(s){const m=s.airSupply.model;
 if(m.complete&&m.metrics.ready)return 1;
 return Math.min(.95,clamp((m.metrics.supply-.5)/(m.target-.5),0,1)*clamp(Math.min(...m.metrics.leaks)/.8,0,1));
}
export function airSupplyView(s){const p=s.airSupply,m=p.model;return {generation:p.generation,index:p.index,restorations:p.restorations,wear:p.wear,timeSinceRestoration:p.lastRestoredAt===null?null:s.elapsed-p.lastRestoredAt,stableRemaining:p.stableFor===null?null:Math.max(0,p.stableFor-(s.elapsed-p.completedAt)),effectiveness:airSupplyEffectiveness(s),operatingState:m.complete?(p.wear>=.6?'DETERIORATING':'STABLE'):m.grip||m.valve?'RECOVERING':'ATTENTION REQUIRED',model:structuredClone(m)};}
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=1e6&&Math.abs(p.y)<=1e6;
export function airSupplyError(s,player,a){const p=s.airSupply,m=p.model,fail=(code,message)=>({code,message});
 if(s.stations.AIR_SUPPLY!==player)return fail('NOT_OWNER','Enter Positive-Pressure Air Supply to operate the cushions');
 if(s.status!=='running')return fail('SESSION_NOT_RUNNING','Air Supply requires a running session');
 if(a.generation!==p.generation)return fail('STALE_AIR_SUPPLY','Equipment ownership or intervention changed');
 if(!Number.isSafeInteger(a.index)||a.index<=p.index||(!['air_end','air_cancel'].includes(a.type)&&a.index!==p.index+1))return fail('AIR_INPUT_ORDER','Stale or out-of-order cushion input');
 if(['air_end','air_cancel'].includes(a.type))return null;
 if(m.complete)return fail('AIR_STABLE','Supply restored; you can leave');
 if(a.type==='air_grab'&&(!point(a.point)||m.grip||m.valve||selectAt(m,a.point)===null))return fail('AIR_NO_GRIP','Grab an accessible cushion');
 if(a.type==='air_move'&&(!m.grip||!point(a.point)))return fail('AIR_NO_GRIP','No held cushion or invalid target');
 if(a.type==='air_valve'&&(!['inflate','vent'].includes(a.mode)||m.grip||m.valve))return fail('AIR_VALVE_BUSY','Release the active control first');
 return null;
}
export function applyAirSupply(s,a){const p=s.airSupply,m=p.model;p.index=a.index;
 if(a.type==='air_cancel')cancelAirSupply(s);
 else if(a.type==='air_end')release(m);
 else if(a.type==='air_grab')grab(m,a.point);
 else if(a.type==='air_move')move(m,a.point);
 else if(a.type==='air_valve')setValve(m,a.mode);
}
