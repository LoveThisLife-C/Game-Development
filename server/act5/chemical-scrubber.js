// Accepted Jetbreaker v0.8 solver, byte-identical shared assets. Only the session
// engine advances it; views send input and render authoritative snapshots.
import {createState,advance,moveCarriage,press,release,progress,condition,VESSEL,RULES,clamp} from '../../prototype/act5/chemical-scrubber/model.js';
export const INTRO_WORKLOAD_CAP=25;
export function createScrubber(generation=0){return {model:createState(),generation,index:0,firstVisit:null};}
export function cancelScrubber(state){const p=state.scrubber;release(p.model);p.index=0;p.generation++;}
export function resetScrubber(state){const previous=state.scrubber;state.scrubber={...createScrubber(previous.generation+1),firstVisit:previous.firstVisit};}
// A one-time introduction budget, separate from the cabin's historical gas.
// Preserve every live packet and its job. Retire only excess waiting/returning
// obligations before the first operator arrives; no hidden debt is deferred.
export function openScrubber(state){const p=state.scrubber,s=p.model;
 if(p.firstVisit||!['running','paused'].includes(state.status))return;
 const before=progress(s),physical=new Set([...s.pockets,...s.births,...s.fragments].map(b=>b.jobId));
 const suppliedBefore=s.stats.supplied,recirculatingBefore=s.stats.recirculating;
 let retiredJobs=0,retiredMass=0,retiredQueued=0;
 if(before.remaining>INTRO_WORKLOAD_CAP){
  const unfinished=s.jobs.filter(j=>!j.done),live=unfinished.filter(j=>physical.has(j.id));
  // Untended recovery never splits on its own. Nevertheless keep every live
  // job intact rather than losing a daughter or treating a branch as complete.
  const keep=[...live,...unfinished.filter(j=>!physical.has(j.id)&&!j.penalty),...unfinished.filter(j=>!physical.has(j.id)&&j.penalty)].slice(0,INTRO_WORKLOAD_CAP);
  const ids=new Set(keep.map(j=>j.id));
  const retired=unfinished.filter(j=>!ids.has(j.id));
  retiredJobs=retired.length;
  retiredMass=retired.reduce((n,j)=>n+Object.values(j.parts).reduce((a,b)=>a+b.pendingMass,0),0);
  s.jobs=s.jobs.filter(j=>j.done||ids.has(j.id));
  const queued=Math.min(s.batch.queued,Math.max(0,INTRO_WORKLOAD_CAP-keep.length));
  retiredQueued=s.batch.queued-queued;s.batch.queued=queued;
  s.batch.initial=s.jobs.filter(j=>!j.penalty).length;
  s.batch.penalties=s.batch.penaltiesTreated+s.jobs.filter(j=>j.penalty&&!j.done).length+queued;
  // Rebase the compact queue's IDs above existing jobs, including after gaps.
  s.batch.penaltyBase=s.jobSerial-s.batch.penalties;
  s.batch.nextPenaltyAt=queued?s.batch.nextPenaltyAt:null;
  // These are the recoverable station-mass ledger, not cabin gas/exposure.
  // Removed return mass was supplied earlier; archive it below, never mark it
  // treated or grant AUTO effectiveness. All present packets are unchanged.
  s.stats.recirculating=Math.max(0,s.stats.recirculating-retiredMass);
  s.stats.supplied=Math.max(0,s.stats.supplied-retiredMass);
 }
 p.firstVisit={at:state.elapsed,cap:INTRO_WORKLOAD_CAP,before:before.remaining,after:progress(s).remaining,retiredJobs,retiredQueued,retiredReturnMass:retiredMass,suppliedBefore,recirculatingBefore};
}
export function advanceScrubber(state,dt){if(state.stations.CHEMICAL_SCRUBBER!==null)openScrubber(state);advance(state.scrubber.model,dt);}
export function scrubberEffectiveness(state){const s=state.scrubber.model;return s.phase==='AUTO'?clamp((1-s.load)/(1-RULES.restoredLoad),0,1):0;}
export function scrubberView(state){const p=state.scrubber,s=p.model;return {...structuredClone(s),generation:p.generation,index:p.index,firstVisit:structuredClone(p.firstVisit),progress:progress(s),condition:condition(s),effectiveness:scrubberEffectiveness(state),operatingState:s.phase==='RECOVERY'?'RECOVERING':s.load>.34?'DETERIORATING':'EFFECTIVE'};}
export function scrubberError(state,player,a){const p=state.scrubber,fail=(code,message)=>({code,message});
 if(state.stations.CHEMICAL_SCRUBBER!==player)return fail('NOT_OWNER','Enter Chemical Scrubber to operate the liquid lance');
 if(state.status!=='running')return fail('SESSION_NOT_RUNNING','Chemical Scrubber requires a running session');
 if(a.generation!==p.generation)return fail('STALE_SCRUBBER','Station control changed; use the current state');
 // A release may close an input after a rejected movement; it cannot fire or
 // award treatment. Movement/down samples otherwise require exact ordering.
 if(!Number.isSafeInteger(a.index)||a.index<=p.index||(!['scrubber_up','scrubber_cancel'].includes(a.type)&&a.index!==p.index+1))return fail('SCRUBBER_INPUT_ORDER','Stale or out-of-order lance input');
 if(a.type==='scrubber_move'&&(!Number.isFinite(a.x)||a.x<VESSEL.left||a.x>VESSEL.right))return fail('INVALID_SCRUBBER_TARGET','Lance target lies outside the treatment chamber');
 if(a.type==='scrubber_down'&&p.model.inputDown)return fail('SCRUBBER_HELD','Release before another pulse');
 return null;
}
export function applyScrubber(state,a){const p=state.scrubber;p.index=a.index;
 if(a.type==='scrubber_move')moveCarriage(p.model,a.x);
 else if(a.type==='scrubber_down')press(p.model);
 else if(a.type==='scrubber_cancel')cancelScrubber(state);
 else release(p.model);
}
