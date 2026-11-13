import {repairMultipliers,LOCK_COUNT,lockShapes,shapeById,fittingError,timingProfile,timingPosition,timingOutcome,targetCenter} from '../../prototype/act5/repair-motion.js';
const freshLocks=()=>Object.fromEntries(lockShapes.map(s=>[s.id,{id:s.id,slotId:s.id,status:'LOOSE',pose:{...s.rack}}]));
export const createRepair=()=>({locks:freshLocks(),secured:0,selected:null,positioned:false,revision:0,attempt:null,serial:0,failures:0,lastFailureAt:null,outcome:null,lastResult:null});
export function repairView(s){const r=s.repair;return {...r,stage:r.secured===LOCK_COUNT?'COMPLETE':r.positioned?'TIMING':'FITTING',positionTolerance:s.config.repairPositionTolerance,angleTolerance:s.config.repairAngleTolerance,profile:timingProfile(s.config,Math.min(LOCK_COUNT-1,r.secured),s.locked),failure:r.secured<LOCK_COUNT&&r.lastFailureAt!==null&&s.elapsed-r.lastFailureAt<6};}
export function advanceRepair(){}
export function repairMultiplier(s){return repairMultipliers[s.repair.secured];}
export function invalidateRepair(s){s.repair.attempt=null;s.repair.revision++;}
export function abandonRepair(s){for(const shape of lockShapes){const l=s.repair.locks[shape.id];if(l.status!=='SECURED'){l.status='LOOSE';l.pose={...shape.rack};}}s.repair.positioned=false;s.repair.selected=null;invalidateRepair(s);}
function start(s){const r=s.repair,profile=timingProfile(s.config,r.secured,s.locked);r.attempt={id:++r.serial,lockId:r.selected,start:s.elapsed,baseSpeed:s.config['repairSpeed'+(r.secured+1)],...profile,center:targetCenter(s.config.seed,r.serial,profile.width)};}
// Receipt evidence is calculated from the authoritative attempt, never a claimed client outcome.
export function repairTimingEvidence(s,a){
 const t=s.repair.attempt;if(!t||a.attemptId!==t.id||!Number.isFinite(a.sampleTime))return null;
 const position=timingPosition(a.sampleTime-t.start,t.speed);
 return {attemptId:t.id,lockId:t.lockId,baseSpeed:t.baseSpeed,speed:t.speed,width:t.width,center:t.center,braceLocked:t.braceLocked,
  lower:t.center-t.width/2,upper:t.center+t.width/2,position,sampleTime:a.sampleTime,
  clientPosition:Number.isFinite(a.position)?a.position:null,discrepancy:Number.isFinite(a.position)?position-a.position:null};
}
export function repairError(s,id,a){const fail=(code,message)=>({code,message}),r=s.repair;
 if(s.stations.DOOR_REPAIR!==id)return fail('NOT_OWNER','Enter Door Repair first.');
 if(s.status!=='running')return fail('SESSION_NOT_RUNNING','Repair requires a running session.');
 if(r.secured===LOCK_COUNT)return fail('REPAIR_COMPLETE','All four locks are secured.');
 if(a.revision!==r.revision)return fail('STALE_REPAIR','Attempt changed. No penalty; retry.');
 if(a.type==='repair_cancel'||a.type==='repair_suspend')return null;
 if(a.type==='repair_select'||a.type==='repair_place'){
  const lock=r.locks[a.lockId];if(!lock)return fail('INVALID_LOCK','Choose a loose reinforcement lock.');
  if(r.positioned)return fail('ALREADY_POSITIONED','Finish or cancel the timing attempt first.');
  if(lock.status==='SECURED')return fail('ALREADY_SECURED','This lock is already secured.');
  if(!a.pose||!['x','y','angle'].every(k=>Number.isFinite(a.pose[k]))||Math.abs(a.pose.x)>2000||Math.abs(a.pose.y)>2000||Math.abs(a.pose.angle)>36000)return fail('INVALID_POSE','Invalid lock position. No locks lost.');
  if(a.type==='repair_place'){const code=fittingError(a.lockId,a.slotId,a.pose,s.config.repairPositionTolerance,s.config.repairAngleTolerance);if(code)return fail(code,code==='WRONG_SLOT'?'That cut-out belongs to another lock.':code==='ROTATION_MISALIGNED'?'Rotate the lock to match its outline.':'Move the lock closer to its matching outline.');}
  return null;
 }
 if(a.type==='repair_begin')return !r.positioned?fail('POSITION_REQUIRED','Fit a lock into its matching cut-out.'):r.attempt?fail('ATTEMPT_ACTIVE','Timing is already running.'):null;
 const t=r.attempt;
 if(!t||a.attemptId!==t.id)return fail('STALE_ATTEMPT','Timing attempt expired. No penalty.');
 if(!Number.isFinite(a.sampleTime)||a.sampleTime<t.start||a.sampleTime<s.elapsed-.75||a.sampleTime>s.elapsed+.2)return fail('STALE_TIMING','Timing update delayed. No penalty; retry.');
 const p=timingPosition(a.sampleTime-t.start,t.speed);
 if(!Number.isFinite(a.position)||Math.abs(a.position-p)>.01)return fail('TIMING_UNCONFIRMED','Displayed timing differs from server. No penalty; retry.');
 return null;
}
export function applyRepair(s,a){const r=s.repair;
 if(a.type==='repair_suspend'){invalidateRepair(s);return;}
 if(a.type==='repair_cancel'){abandonRepair(s);return;}
 if(a.type==='repair_select'){r.selected=a.lockId;r.locks[a.lockId].pose={...a.pose};r.outcome=null;return;}// Fitting edits cannot invalidate an adjacent placement message.
 if(a.type==='repair_place'){r.selected=a.lockId;r.locks[a.lockId].status='POSITIONED';r.locks[a.lockId].pose={...shapeById(a.lockId).slot};r.positioned=true;start(s);}
 if(a.type==='repair_begin')start(s);
 if(a.type==='repair_stop'){
  const t=r.attempt,evidence=repairTimingEvidence(s,a);r.outcome=timingOutcome(evidence.position,t.width,t.center);
  r.lastResult={...evidence,outcome:r.outcome};
  if(r.outcome==='SUCCESS'){r.locks[t.lockId].status='SECURED';r.secured++;}
  else{r.locks=freshLocks();r.secured=0;r.failures++;r.lastFailureAt=s.elapsed;}
  r.positioned=false;r.selected=null;r.attempt=null;
 }
 r.revision++;
}
