// Accepted Exhaust Skin v0.3 solver; exactly one session clock advances it.
import {createState,advance,grab,move,release,grabToggle,moveToggle,releaseToggle,pickEdge,TOGGLE,CONFIGURATIONS} from '../../prototype/act5/emergency-purge/model.js';
export const purgeAvailable=s=>s.config.UPPER_RIDGE_SERVICE==='RESTORED';
export const airborneGas=s=>Math.max(0,s.totalGas-s.totalGasPurged);
export function createPurge(generation=0){return {model:createState(),generation,index:0,active:null,awardedCycle:0,completedAt:null,stableFor:null,fouling:0,lastEvent:null};}
export function cancelPurge(s){const p=s.purge;release(p.model);releaseToggle(p.model);p.active=null;p.index=0;p.generation++;}
function award(s){if(!purgeAvailable(s))return;const p=s.purge,m=p.model;if(m.purge!=='running'||m.toggle.charge<100||p.awardedCycle===m.cycle)return;
 const before=airborneGas(s),removed=before*s.config.purgeRemovalFraction;s.totalGasPurged+=removed;p.awardedCycle=m.cycle;p.active=null;
 p.lastEvent={cycle:m.cycle,at:s.elapsed,before,removed,after:airborneGas(s)};
}
export function advancePurge(s,dt){if(!purgeAvailable(s))return;const p=s.purge,m=p.model;
 // The obstruction remains static until somebody operates this station. Keep
 // the expensive cloth solver dormant while unoccupied; recurrence/fouling
 // below still follows the shared cabin clock.
 if(s.stations.EMERGENCY_PURGE!==null||p.active||m.purge==='running')advance(m,dt);
 if(m.purge!=='complete')return;
 if(p.completedAt===null){p.completedAt=s.elapsed;const r=((s.config.seed*1664525+m.cycle*1013904223)>>>0)/4294967296;p.stableFor=s.config.purgeStableMin+(s.config.purgeStableMax-s.config.purgeStableMin)*r;}
 p.fouling=Math.min(1,(s.elapsed-p.completedAt)/p.stableFor);
 if(p.fouling<1)return;
 const keys=Object.keys(CONFIGURATIONS),step=s.config.seed%2?2:1,next=keys[(keys.indexOf(m.configuration)+step)%keys.length];
 p.model=createState(next,m.cycle+1);p.generation++;p.index=0;p.active=null;p.completedAt=null;p.stableFor=null;p.fouling=0;
}
export function purgeView(s,role){const p=s.purge,m=p.model;return {generation:p.generation,index:p.index,available:purgeAvailable(s),offlineReason:purgeAvailable(s)?null:'UPPER RIDGE SERVICE UNAVAILABLE',operatingState:!purgeAvailable(s)?'OFFLINE':m.purge==='running'?'PURGING':m.purge==='complete'?(p.fouling>=.6?'DETERIORATING':'STABLE'):m.clear?'READY':m.stats.grabs?'CLEARING':'OBSTRUCTED',fouling:p.fouling,stableRemaining:p.stableFor===null?null:Math.max(0,p.stableFor-(s.elapsed-p.completedAt)),lastEvent:!p.lastEvent?null:s.config.airQuality==='WORKING'||role==='admin'?p.lastEvent:{cycle:p.lastEvent.cycle,at:p.lastEvent.at},
 model:{configuration:m.configuration,cycle:m.cycle,time:m.time,grip:structuredClone(m.grip),toggle:structuredClone(m.toggle),purge:m.purge,clear:m.clear,open:m.open,looseArea:m.looseArea,field:[...m.field],stats:{...m.stats},groups:structuredClone(m.groups),nodes:m.nodes.map(({id,patch,x,y,z,vx,vy,vz,adhered})=>({id,patch,x,y,z,vx,vy,vz,adhered})),patches:structuredClone(m.patches),seams:structuredClone(m.seams)}};}
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=1e6&&Math.abs(p.y)<=1e6;
export function purgeError(s,player,a){const p=s.purge,fail=(code,message)=>({code,message});
 if(!purgeAvailable(s))return fail('STATION_OFFLINE','Upper Ridge service unavailable — Emergency Purge is offline');
 if(s.stations.EMERGENCY_PURGE!==player)return fail('NOT_OWNER','Enter Emergency Purge to operate its equipment');
 if(s.status!=='running')return fail('SESSION_NOT_RUNNING','Emergency Purge requires a running session');
 if(a.generation!==p.generation)return fail('STALE_PURGE','Equipment ownership or cycle changed');
 if(!Number.isSafeInteger(a.index)||a.index<=p.index||(!['purge_end','purge_cancel'].includes(a.type)&&a.index!==p.index+1))return fail('PURGE_INPUT_ORDER','Stale or out-of-order purge input');
 if(a.type==='purge_begin'&&(!['sheet','toggle'].includes(a.control)||!point(a.point)||p.active))return fail('INVALID_PURGE_GRAB','Invalid or already held control');
 if(a.type==='purge_move'&&(!p.active||!Array.isArray(a.points)||!a.points.length||a.points.length>64||!a.points.every(point)))return fail('INVALID_PURGE_SAMPLES','Expected up to 64 finite samples for the held control');
 if(a.type==='purge_begin'&&(p.model.purge!=='idle'||a.control==='toggle'&&!p.model.clear))return fail('PURGE_LOCKED','Clear and collect the material before charging; stable equipment cannot fire again');
 if(a.type==='purge_begin'&&a.control==='sheet'&&!pickEdge(p.model,a.point))return fail('PURGE_NO_GRIP','Grab an accessible material edge');
 if(a.type==='purge_begin'&&a.control==='toggle'&&(Math.abs(a.point.x-(TOGGLE.centreX+p.model.toggle.x))>TOGGLE.handleW/2+12||Math.abs(a.point.y-TOGGLE.handleY)>TOGGLE.handleH/2+12))return fail('PURGE_NO_GRIP','Grab the purge toggle handle');
 return null;
}
export function applyPurge(s,a){if(!purgeAvailable(s))return false;const p=s.purge,m=p.model;p.index=a.index;
 if(a.type==='purge_cancel'){cancelPurge(s);return true;}
 if(a.type==='purge_end'){release(m);releaseToggle(m);p.active=null;return true;}
 if(a.type==='purge_begin'){const accepted=a.control==='sheet'?grab(m,a.point):grabToggle(m,a.point);if(accepted)p.active=a.control;return accepted;}
 for(const q of a.points){if(p.active==='sheet')move(m,q);else if(p.active==='toggle')moveToggle(m,q);award(s);}
 return true;
}
