// One accepted Cascade solver per session; only the central session tick advances it.
import {createState,step,grab,move,hover,release,WORKING,TOOL_GRAB_RADIUS,clamp} from '../../prototype/act5/demister/model.js';
export function createDemister(seed=1,generation=0){return {model:createState('A',seed),generation,index:0,cycle:0,restorations:0,completedAt:null,stableFor:null,fouling:1};}
export function cancelDemister(s){const p=s.demister;release(p.model);p.generation++;p.index=0;}
export function demisterMultiplier(s){return 1-s.config.demisterMaxRestriction*clamp(s.demister.fouling,0,1);}
export function advanceDemister(s,dt){const p=s.demister,m=p.model;
 if(!m.complete){step(m,dt);p.fouling=clamp(1-m.drainedVolume/m.totalVolume,0,1);if(!m.complete)return;
  p.completedAt=s.elapsed;p.restorations++;p.fouling=0;
  const r=((Math.imul(s.config.seed,1664525)+Math.imul(p.restorations,1013904223))>>>0)/4294967296;
  p.stableFor=s.config.demisterStableMin+(s.config.demisterStableMax-s.config.demisterStableMin)*r;
  cancelDemister(s);
 }
 const age=s.elapsed-p.completedAt;
 // An unattended clean period followed by progressive liquid loading. Active
 // interventions receive finite liquid: nothing spawns during their clearance.
 p.fouling=clamp((age-p.stableFor*.4)/(p.stableFor*.6),0,1);
 if(age+1e-8>=p.stableFor){
  const previous=m.condition;p.cycle++;const shift=1+(s.config.seed%2);
  const condition='ABC'[('ABC'.indexOf(previous)+shift)%3];
  p.model=createState(condition,(s.config.seed+Math.imul(p.cycle,2654435761))>>>0);
  p.completedAt=null;p.stableFor=null;p.fouling=1;cancelDemister(s);
 }
}
export function demisterView(s){const p=s.demister;return {...structuredClone(p),modifier:demisterMultiplier(s),operatingState:p.model.complete?(p.fouling>0?'DETERIORATING':'STABLE'):p.model.tool.held?'RECOVERING':'ATTENTION REQUIRED',stableRemaining:p.completedAt===null?null:Math.max(0,p.stableFor-(s.elapsed-p.completedAt))};}
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=WORKING.left&&p.x<=WORKING.right&&p.y>=WORKING.top&&p.y<=WORKING.bottom;
export function demisterError(s,player,a){const p=s.demister,m=p.model,fail=(code,message)=>({code,message});
 if(s.stations.DEMISTER_DRAINAGE!==player)return fail('NOT_OWNER','Enter Demister Drainage to operate the wiper');
 if(s.status!=='running')return fail('SESSION_NOT_RUNNING','Demister requires a running session');
 if(a.generation!==p.generation)return fail('STALE_DEMISTER','Wiper ownership or intervention changed');
 if(!Number.isSafeInteger(a.index)||a.index<=p.index||(!['demister_end','demister_cancel'].includes(a.type)&&a.index!==p.index+1))return fail('DEMISTER_INPUT_ORDER','Stale or out-of-order wiper input');
 if(['demister_end','demister_cancel'].includes(a.type))return null;
 if(m.complete)return fail('DEMISTER_STABLE','Demister cleared; you can leave');
 if(!valid(a.point))return fail('INVALID_DEMISTER_TARGET','Target lies outside the plate mechanism');
 if(a.type==='demister_hover'&&m.tool.held)return fail('DEMISTER_HELD','Release before repositioning');
 if(a.type==='demister_grab'&&(m.tool.held||Math.hypot(a.point.x-m.tool.x,a.point.y-m.tool.y)>TOOL_GRAB_RADIUS))return fail('DEMISTER_NO_GRIP','Grab the wiper tip');
 if(a.type==='demister_move'&&!m.tool.held)return fail('DEMISTER_NO_GRIP','No held wiper');
 return null;
}
export function applyDemister(s,a){const p=s.demister,m=p.model;p.index=a.index;
 if(a.type==='demister_cancel')cancelDemister(s);
 else if(a.type==='demister_end')release(m);
 else if(a.type==='demister_hover')hover(m,a.point);
 else if(a.type==='demister_grab')grab(m,a.point);
 else if(a.type==='demister_move')move(m,a.point);
}
