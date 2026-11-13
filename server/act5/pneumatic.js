import {OPERATING_MAX,isOverpressure} from '../../prototype/act5/pneumatic-motion.js';
// Pure authoritative mechanism. Time comes exclusively from the engine's 10ms step.
export const MAX_WHEEL_SPEED=10,MAX_HAND_SPEED=8,INPUT_BURST=1.6;
export function createPneumatic(){return {angle:0,speed:0,output:0,pressure:0,pressureRate:0,clutch:false,engaged:false,fault:false,faults:0,driveCutout:false,deployments:0,releases:0,lastReleaseAt:null,relief:false,reliefCutoffs:0,lastReliefCutoffAt:null,lastRecoveryAt:null,trips:0,lastTripAt:null,generation:0,input:null,seen:[]};}
export function cancelPneumatic(s){const p=s.pneumatic;p.input=null;p.relief=false;p.generation++;}
export function pneumaticEffectiveness(s){return s.pneumatic.engaged?1:0;}
export function pressureTrend(rate){return rate>3?'RISING FAST':rate>.15?'RISING':rate<-.15?'FALLING':'HOLDING';}
export function syncPneumatic(s){const p=s.pneumatic;
 if(isOverpressure(p.pressure)&&!p.fault){p.fault=true;p.faults++;}
 if(p.clutch&&(p.fault||p.pressure<60)){p.clutch=false;p.releases++;p.lastReleaseAt=s.elapsed;}
 p.engaged=p.clutch&&!p.fault&&p.pressure>=60&&!isOverpressure(p.pressure);s.locked=p.engaged;
}
export function deploymentReason(s){const p=s.pneumatic;
 if(s.status!=='running')return 'SESSION NOT RUNNING';
 if(p.fault)return isOverpressure(p.pressure)?'OVERPRESSURE — VENT BEFORE DEPLOYMENT':'FAULT LATCHED — PRESS RELIEF TO RESET';
 if(p.clutch)return 'DOOR SECURED — CLUTCH ENGAGED';
 if(p.pressure<60)return 'PRESSURE LOW — CHARGE ACCUMULATOR';
 if(isOverpressure(p.pressure))return 'OVERPRESSURE — VENT BEFORE DEPLOYMENT';
 if(p.speed>1||p.output>s.config.pressureLeak)return 'PRESSURE STILL RISING — WAIT FOR STABILITY';
 return 'PRESSURE READY — DEPLOY CLUTCH';
}
export function deploymentReady(s){return deploymentReason(s)==='PRESSURE READY — DEPLOY CLUTCH';}
export function pneumaticGuidance(s){const p=s.pneumatic;
 if(p.relief)return 'VENTING EXCESS PRESSURE';
 if(p.fault)return !isOverpressure(p.pressure)?'FAULT LATCHED — PRESS RELIEF TO RESET':'OVERPRESSURE — HOLD RELIEF TO RECOVER';
 if(p.engaged)return 'DOOR SECURED';
 if(s.status!=='running')return 'SESSION NOT RUNNING';
 if(p.input?.mode==='wheel'&&p.speed>.1)return p.pressure>=60?'RELEASE EARLY — ALLOW PRESSURE TO SETTLE':'CHARGING — KEEP TURNING';
 if(p.releases>0&&p.pressure<60)return 'BRACE RELEASED — RECHARGE REQUIRED';
 return deploymentReason(s);
}
export function pneumaticView(s){const p=s.pneumatic,rate=s.status==='running'?p.pressureRate:0;return {angle:p.angle,speed:p.speed,output:p.output,pressure:p.pressure,pressureRate:rate,trend:pressureTrend(rate),engaged:p.engaged,clutchEngaged:p.clutch,clutchDown:p.clutch?80:p.input?.down??0,clutchSlide:p.clutch?60:p.input?.slide??0,clutchUp:p.clutch?30:p.input?.up??0,deployments:p.deployments,releases:p.releases,lastReleaseAt:p.lastReleaseAt,deploymentReady:deploymentReady(s),deploymentReason:deploymentReason(s),fault:p.fault,faults:p.faults,driveCutout:p.driveCutout,overpressure:isOverpressure(p.pressure),reliefAvailable:isOverpressure(p.pressure)||p.fault,reliefResetRequired:p.fault&&!isOverpressure(p.pressure),relief:p.relief,reliefCutoffs:p.reliefCutoffs,reliefComplete:p.lastReliefCutoffAt!==null&&(p.input?.mode==='relief'||(!isOverpressure(p.pressure)&&s.elapsed-p.lastReliefCutoffAt<4)),recovered:p.lastRecoveryAt!==null&&s.elapsed-p.lastRecoveryAt<4,guidance:pneumaticGuidance(s),trips:p.trips,lastTripAt:p.lastTripAt,safetyTrip:false,generation:p.generation,effectiveness:pneumaticEffectiveness(s),condition:p.fault?(isOverpressure(p.pressure)?'OVERPRESSURE FAULT':'FAULT LATCHED — RESET REQUIRED'):p.engaged?'DOOR SECURED':p.releases>0&&p.pressure<60?'BRACE RELEASED':'CLUTCH DISENGAGED',maxSpeed:MAX_WHEEL_SPEED};}
export function pneumaticError(s,player,a){const p=s.pneumatic,fail=(code,message)=>({code,message});
 if(s.stations.DOOR_BRACE!==player)return fail('NOT_OWNER','Enter Door Brace first');
 if(s.status!=='running')return fail('SESSION_NOT_RUNNING','Pneumatic controls require a running session');
 if(a.generation!==p.generation)return fail('STALE_PNEUMATIC','Control generation changed; grab again');
 if(typeof a.gestureId!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(a.gestureId))return fail('INVALID_GESTURE','Invalid control gesture');
 if(a.type==='brace_begin'){
  if(!['wheel','relief','clutch'].includes(a.mode))return fail('INVALID_CONTROL','Choose wheel, clutch or relief');
  if(p.input)return fail('CONTROL_BUSY','Release the active control first');
  if(a.mode==='clutch'&&!deploymentReady(s))return fail('DEPLOYMENT_UNAVAILABLE',deploymentReason(s));
  if(a.mode==='wheel'&&p.fault)return fail('OVERPRESSURE_FAULT','Recover using relief before charging again');
  if(a.mode==='relief'&&!isOverpressure(p.pressure)&&!p.fault)return fail('RELIEF_NOT_REQUIRED','PRESSURE SAFE — RELIEF NOT REQUIRED');
  if(p.seen.includes(a.gestureId))return fail('REUSED_GESTURE','This gesture has already ended');return null;
 }
 if(!p.input||p.input.id!==a.gestureId)return fail('STALE_GESTURE','Control gesture ended; old input ignored');
 if(a.type==='brace_end'){
  if(a.deploy===true&&(p.input.mode!=='clutch'||p.input.down!==80||p.input.slide!==60||p.input.up!==30||!deploymentReady(s)))return fail('INCOMPLETE_DEPLOYMENT','Seat the handle in the notch at stable green pressure');
  return null;
 }
 if(!Number.isInteger(a.index)||a.index!==p.input.index+1)return fail('INPUT_ORDER','Duplicate or out-of-order sample');
 if(a.type==='brace_clutch'){
  if(p.input.mode!=='clutch')return fail('WRONG_CONTROL','Grab the clutch handle');
  if(!deploymentReady(s))return fail('DEPLOYMENT_UNAVAILABLE',deploymentReason(s));
  const up=a.up??0;
  if(!Number.isFinite(a.down)||!Number.isFinite(a.slide)||a.down<0||a.down>80||a.slide<0||a.slide>60||a.slide>0&&(a.down!==80||p.input.down!==80)||p.input.slide>0&&a.down!==80||!Number.isFinite(up)||up<0||up>30||up>0&&(a.down!==80||a.slide!==60||p.input.slide!==60)||p.input.up>0&&a.slide!==60)return fail('INVALID_CLUTCH_PATH','Pull down, slide fully right, then push up into the locking pocket');
  return null;
 }
 if(p.input.mode!=='wheel'||a.type!=='brace_turn')return fail('WRONG_CONTROL','This control does not drive the flywheel');
 if(p.driveCutout)return fail('DRIVE_CUTOUT','Compressor drive isolated — operate relief');
 if(!Number.isFinite(a.delta)||Math.abs(a.delta)>1.2||!Number.isFinite(a.elapsed)||a.elapsed<=0||a.elapsed>.25||Math.abs(a.delta)>MAX_HAND_SPEED*a.elapsed+.01)return fail('INVALID_ROTATION','Unobserved jump or implausible angular input; reanchor');
 const credit=Math.min(INPUT_BURST,p.input.credit+Math.max(0,s.elapsed-p.input.at)*MAX_HAND_SPEED);
 if(Math.abs(a.delta)>credit+1e-9)return fail('ANGULAR_BUDGET','Angular input exceeds physical observation budget');return null;
}
function finishRelief(s){const p=s.pneumatic;p.relief=false;p.reliefCutoffs++;p.lastReliefCutoffAt=s.elapsed;if(p.fault){p.fault=false;p.driveCutout=false;p.lastRecoveryAt=s.elapsed;}}
export function applyPneumatic(s,a){const p=s.pneumatic;
 if(a.type==='brace_begin'){p.seen.push(a.gestureId);if(p.seen.length>32)p.seen.shift();p.input={id:a.gestureId,mode:a.mode,index:0,credit:INPUT_BURST,at:s.elapsed,down:0,slide:0,up:0};p.relief=a.mode==='relief';if(p.relief&&!isOverpressure(p.pressure))finishRelief(s);}
 else if(a.type==='brace_end'){if(a.deploy===true){p.clutch=true;p.deployments++;}p.input=null;p.relief=false;}
 else if(a.type==='brace_clutch'){p.input.down=a.down;p.input.slide=a.slide;p.input.up=a.up??0;p.input.index=a.index;}
 else {p.input.credit=Math.min(INPUT_BURST,p.input.credit+Math.max(0,s.elapsed-p.input.at)*MAX_HAND_SPEED)-Math.abs(a.delta);p.input.at=s.elapsed;p.input.index=a.index;
  p.speed=Math.max(0,Math.min(MAX_WHEEL_SPEED,p.speed+a.delta*s.config.wheelDrive/s.config.wheelInertia*(a.delta<0?1.5:1)));
 }syncPneumatic(s);
}
export function advancePneumatic(s,dt){const p=s.pneumatic,c=s.config;
 const before=p.speed,drag=(c.wheelDrag+.25*(.5+p.pressure/200))/c.wheelInertia;
 p.speed*=Math.exp(-drag*dt);if(p.speed<.005)p.speed=0;p.angle+=(before+p.speed)*dt/2;
 const target=p.driveCutout?0:c.compressorRate*p.speed/MAX_WHEEL_SPEED;
 p.output+=(target-p.output)*(1-Math.exp(-dt/c.compressorLag));p.output=Math.max(0,Math.min(c.compressorRate,p.output));
 const rate=p.output-c.pressureLeak-(p.relief?c.reliefRate:0);p.pressure=Math.max(0,Math.min(100,p.pressure+rate*dt));p.pressureRate=p.pressure===0?Math.max(0,rate):rate;
 if(p.relief&&!isOverpressure(p.pressure)){p.pressure=OPERATING_MAX;finishRelief(s);p.pressureRate=p.output-c.pressureLeak;}
 if(p.pressure>=95&&!p.driveCutout){p.speed=0;p.output=0;p.pressureRate=-c.pressureLeak;p.driveCutout=true;p.trips++;p.lastTripAt=s.elapsed;cancelPneumatic(s);}
 syncPneumatic(s);
}
