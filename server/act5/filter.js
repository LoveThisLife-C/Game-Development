import {CHAMBER,CHUTE,HOPPER,SUCTION_ZONE,overlapsSuctionZone,capturePosition,FLOOR,HOPPER_GUIDES,HOPPER_WALLS,BAFFLES,INITIAL_DEBRIS,TYPES,TOTAL_WEIGHT,MAX_SPEED,jetImpulse} from '../../prototype/act5/filter-geometry.js';
const COLLIDERS=Object.freeze([FLOOR,...HOPPER_GUIDES,...HOPPER_WALLS,...BAFFLES]);
const spawn=(f,index)=>({...INITIAL_DEBRIS[index],...TYPES[INITIAL_DEBRIS[index].type],id:++f.serial,vx:0,vy:0,attached:INITIAL_DEBRIS[index].type==='sticky'});
export function createFilter(config,generation=0){const f={generation,serial:0,debris:[],reserve:config.filterCapacity,shots:0,cleared:0,cycle:0,lastClearAt:null,nextLoadAt:null,loadingIndex:0,phase:'LOADED',lastShot:null,lastCollection:null};f.debris=INITIAL_DEBRIS.map((_,i)=>spawn(f,i));return f;}
export function resetFilter(state){state.filter=createFilter(state.config,state.filter.generation+1);}
export function obstruction(f){return Math.min(1,f.debris.reduce((n,d)=>n+d.weight,0)/TOTAL_WEIGHT);}
export function filterMultiplier(state){return 1+obstruction(state.filter)*state.config.maxFilterPenalty;}
export function filterView(state){const f=state.filter;return {...f,debris:f.debris.map(d=>({...d,...(d.capture?{capture:{...d.capture}}:{})})),obstruction:obstruction(f),capacity:state.config.filterCapacity,cost:state.config.filterPulseCost,timeSinceClear:f.lastClearAt===null?null:state.elapsed-f.lastClearAt,physics:state.status==='running'?'RUNNING':state.status.toUpperCase()};}
export function filterError(state,player,a){const fail=(code,message)=>({code,message});if(state.stations.FILTER_BANK!==player)return fail('NOT_OWNER','Enter Filter Bank to fire');if(state.status!=='running')return fail('SESSION_NOT_RUNNING','Backflush requires a running session');if(a.generation!==state.filter.generation)return fail('STALE_FILTER_SHOT','Filter scenario reset; aim again');if(!Number.isFinite(a.angle)||a.angle<-.2||a.angle>Math.PI/2+.15)return fail('INVALID_AIM','Aim must point into the chamber');if(state.filter.reserve+1e-9<state.config.filterPulseCost)return fail('LOW_PRESSURE','Insufficient air pressure — reservoir recharging');return null;}
function boundSpeed(d){const speed=Math.hypot(d.vx,d.vy);if(speed>MAX_SPEED){d.vx*=MAX_SPEED/speed;d.vy*=MAX_SPEED/speed;}}
export function fireFilter(state,a){const f=state.filter;f.reserve=Math.max(0,f.reserve-state.config.filterPulseCost);f.shots++;f.lastShot={serial:f.shots,at:state.elapsed,angle:a.angle};for(const d of f.debris){if(d.capture)continue;const impulse=jetImpulse(d,a.angle,state.config.filterPulseStrength);if(d.attached&&impulse.magnitude<120)continue;d.attached=false;d.vx+=impulse.x/d.mass;d.vy+=impulse.y/d.mass;boundSpeed(d);}}
export function inChute(d){return !d.attached&&(overlapsSuctionZone(d)||
 // Bodies already inside the physical throat are also valid, including a restored snapshot.
 (d.x-d.radius>=CHUTE.left&&d.x+d.radius<=CHUTE.right&&d.y>=HOPPER.mouthY&&d.y<=CHUTE.bottom));}
function beginCapture(d,time){if(d.capture||!inChute(d))return false;d.capture={startedAt:time,fromX:d.x,fromY:d.y,toX:(CHUTE.left+CHUTE.right)/2,toY:Math.max(d.y+12,HOPPER.bottom-12)};d.vx=0;d.vy=0;return true;}
function advanceCapture(d,time){Object.assign(d,capturePosition(d,time));}

function bounce(d,nx,ny,restitution){const normal=d.vx*nx+d.vy*ny;if(normal<0){d.vx-=(1+restitution)*normal*nx;d.vy-=(1+restitution)*normal*ny;}}
function surfaces(d,c,dt){const r=d.radius;if(d.x<CHAMBER.left+r){d.x=CHAMBER.left+r;bounce(d,1,0,c.filterRestitution);}if(d.x>CHAMBER.right-r){d.x=CHAMBER.right-r;bounce(d,-1,0,c.filterRestitution);}if(d.y<CHAMBER.top+r){d.y=CHAMBER.top+r;bounce(d,0,1,c.filterRestitution);}
 // Finite surfaces: no conditional half-plane across or below the aperture.
 for(const b of COLLIDERS){
  const dx=b.bx-b.ax,dy=b.by-b.ay,t=Math.max(0,Math.min(1,((d.x-b.ax)*dx+(d.y-b.ay)*dy)/(dx*dx+dy*dy))),px=b.ax+t*dx,py=b.ay+t*dy,ox=d.x-px,oy=d.y-py,length=Math.hypot(ox,oy),reach=r+(b.radius??5);
  if(length<reach){const nx=length?ox/length:dy/Math.hypot(dx,dy),ny=length?oy/length:-dx/Math.hypot(dx,dy);d.x=px+nx*reach;d.y=py+ny*reach;bounce(d,nx,ny,c.filterRestitution);
   if(b===FLOOR&&ny<-.9){if(Math.abs(d.vy)<10)d.vy=0;d.vx*=Math.exp(-.7*dt);}
  }
 }
}

function pairs(debris,restitution){for(let i=0;i<debris.length;i++)for(let j=i+1;j<debris.length;j++){const a=debris[i],b=debris[j],dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy),reach=a.radius+b.radius;if(distance>=reach)continue;const ia=a.attached?0:1/a.mass,ib=b.attached?0:1/b.mass,total=ia+ib;if(!total)continue;const nx=distance?dx/distance:1,ny=distance?dy/distance:0,overlap=reach-distance;a.x-=nx*overlap*ia/total;a.y-=ny*overlap*ia/total;b.x+=nx*overlap*ib/total;b.y+=ny*overlap*ib/total;
 const velocity=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(velocity<0){const impulse=-(1+restitution)*velocity/total;a.vx-=impulse*nx*ia;a.vy-=impulse*ny*ia;b.vx+=impulse*nx*ib;b.vy+=impulse*ny*ib;}}}
// Spatially continuous recirculating force, in drawing units/s² for unit mass.
// Bottom return flow lifts settled bodies; inward boundary flow avoids corner traps.
// Eddies are smooth functions of authoritative time, never random per-frame kicks.
export function airflow(x,y,time,config){
 const strength=config.filterCirculation,eddy=config.filterEddyStrength;
 const ramp=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
 // Return flow fades into the existing waste outlet instead of lifting debris
 // back out of its opening. Local capture is handled separately at the mouth.
 const outlet=1-ramp((x-700)/100)*ramp((y-390)/100);
 return {
  x:strength*((y-300)/210+1.8*(ramp((150-x)/60)-ramp((x-750)/60)))
    +eddy*(Math.sin(time*.73+y/83)+.5*Math.sin(time*.31+x/117)),
  y:outlet*(strength*(-(x-450)/360-3*ramp((y-410)/90)+2*ramp((160-y)/60))
    +eddy*(Math.cos(time*.61+x/97)+.5*Math.sin(time*.43-y/103)))
 };
}
export function advanceFilter(state,dt){const f=state.filter,c=state.config;f.reserve=Math.min(c.filterCapacity,f.reserve+c.filterRecharge*dt);
 if(f.nextLoadAt!==null&&state.elapsed+1e-9>=f.nextLoadAt){f.debris.push(spawn(f,f.loadingIndex++));f.phase=f.loadingIndex<INITIAL_DEBRIS.length?'RELOADING':'LOADED';f.nextLoadAt=f.loadingIndex<INITIAL_DEBRIS.length?f.nextLoadAt+c.filterLoadInterval:null;}
 // Two 5 ms substeps inside the existing authoritative 10 ms engine step.
 for(let step=0;step<2;step++){
  const start=state.elapsed-dt+step*dt/2,end=start+dt/2;
  for(const d of f.debris){
   if(d.capture){advanceCapture(d,end);continue;}
   if(d.attached)continue;
   // Commit before any collision can eject a legitimate overlapping body.
   if(beginCapture(d,start)){advanceCapture(d,end);continue;}
   const flow=airflow(d.x,d.y,start,c);d.vx+=flow.x/d.mass*dt/2;d.vy+=(c.filterGravity+flow.y/d.mass)*dt/2;
   const damping=Math.exp(-c.filterDamping*dt/2);d.vx*=damping;d.vy*=damping;boundSpeed(d);d.x+=d.vx*dt/2;d.y+=d.vy*dt/2;
   if(!beginCapture(d,end))surfaces(d,c,dt/2);
  }
  // Captured bodies cannot receive pair impulses, block other debris, or be re-fired.
  pairs(f.debris.filter(d=>!d.capture),c.filterRestitution);
  for(const d of f.debris)if(!d.attached&&!d.capture){if(!beginCapture(d,end)){surfaces(d,c,dt/2);boundSpeed(d);beginCapture(d,end);}}
  const collected=f.debris.filter(d=>d.capture&&end+1e-9>=d.capture.startedAt+SUCTION_ZONE.duration);
  if(collected.length){const ids=new Set(collected.map(d=>d.id));f.debris=f.debris.filter(d=>!ids.has(d.id));f.cleared+=collected.length;f.lastCollection={serial:f.cleared,count:collected.length,at:state.elapsed};if(!f.debris.length){f.phase='CLEAR';f.cycle++;f.lastClearAt=state.elapsed;f.loadingIndex=0;f.nextLoadAt=state.elapsed+c.filterCleanInterval;}}
 }
}
