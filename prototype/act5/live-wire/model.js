import{createCycle,protect,recurrenceStep}from'./recurrence.js';
// Standalone Live Wire authority. Shared mechanics; four authored calibrations.
export const WORLD=Object.freeze({width:1200,height:740});
export const BOUNDS=Object.freeze({left:98,right:1104,top:110,bottom:629});
export const RULES=Object.freeze({step:1/240,segments:10,iterations:16,bodyMass:.55,headRadius:18,bodyRadius:6,catchRadius:46,maxSpeed:780,maxAcceleration:7200,gripSlew:1050,maxGripForce:18500,gripDamping:6,gravity:34,warning:.55,pulse:.17,restitution:.22});
export const DEFAULTS=Object.freeze({gripForce:180,tension:.92,damping:1.6,surgeStrength:1,surgeInterval:2.6,socketTolerance:32,engagementTime:1.5,grabScale:.78,protectedInterval:50,warningDuration:5});
export const LIMITS=Object.freeze({gripForce:[100,300],tension:[.5,1],damping:[.8,3.5],surgeStrength:[.4,1.6],surgeInterval:[1.8,4],socketTolerance:[24,40],engagementTime:[.5,3],grabScale:[.6,1],protectedInterval:[5,120],warningDuration:[1,10]});
export const WIRES=Object.freeze([
 {id:'fan',name:'FAN',number:'01',colour:'#e6bd72',shape:'diamond',anchor:{x:145,y:165},socket:{x:960,y:180},length:900,mass:2.6,ripple:2400,frequency:3.5,surge:7200,interval:1.1,first:1.8,phase:.3,angles:[0,.55,1.1,.3,-.7,-1.6,-2.5,-3.8,-4.8,-5.8]},
 {id:'seal',name:'SEAL ACTUATOR',number:'02',colour:'#7ed6dc',shape:'hex',anchor:{x:145,y:300},socket:{x:960,y:315},length:850,mass:3.35,ripple:4000,frequency:3.9,surge:11200,interval:1,first:2.5,phase:2.1,instability:.10,stiffness:1.03,dampingScale:.95,warning:.7,pulse:.19,angles:[.1,.3,.8,.8,-.3,-1.2,-2,-3.3,-4.5,-5.3]},
 {id:'vent',name:'VENT CONTROL',number:'03',colour:'#c6a3ef',shape:'square',anchor:{x:145,y:435},socket:{x:960,y:450},length:860,mass:3.5,ripple:4700,frequency:4.1,surge:17000,interval:.98,first:3.1,phase:4.2,instability:.13,stiffness:1.02,dampingScale:.96,warning:.8,pulse:.22,angles:[.05,-.35,-.8,-.9,-.4,.5,1.3,2.4,3.8,5.1]},
 {id:'supply',name:'EMERGENCY SUPPLY',number:'04',colour:'#f2947e',shape:'triangle',anchor:{x:145,y:570},socket:{x:960,y:585},length:845,mass:4,ripple:6100,frequency:4.5,surge:22000,interval:.9,first:3.7,phase:5.6,instability:.16,stiffness:1.06,dampingScale:.9,warning:.85,pulse:.24,angles:[.02,-.4,-.95,-1.05,-.35,.65,1.4,2.6,3.9,6]},
].map(w=>Object.freeze({...w,anchor:Object.freeze(w.anchor),socket:Object.freeze(w.socket),angles:Object.freeze(w.angles)})));
export const GROUND=Object.freeze({x:650,y:607,width:220,height:18});
const DIRECTIONS=Object.freeze([{x:0,y:-1},{x:.92,y:.4},{x:-.8,y:-.6},{x:.2,y:1}]);
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const head=w=>w.nodes.at(-1);
export const speed=w=>Math.hypot(head(w).vx,head(w).vy);
export const grabRadius=s=>RULES.catchRadius*s.config.grabScale;
export const socketRadius=s=>s.config.socketTolerance+RULES.headRadius;
// These same convex keyed mouths are rendered and used for actual-head capture.
export function socketVertices(kind,r){return kind==='triangle'?[[0,-r],[r,r],[-r,r]]:kind==='diamond'?[[0,-r],[r,0],[0,r],[-r,0]]:kind==='hex'?[[-.5*r,-.87*r],[.5*r,-.87*r],[r,0],[.5*r,.87*r],[-.5*r,.87*r],[-r,0]]:[[-r/Math.SQRT2,-r/Math.SQRT2],[r/Math.SQRT2,-r/Math.SQRT2],[r/Math.SQRT2,r/Math.SQRT2],[-r/Math.SQRT2,r/Math.SQRT2]];}
export function socketContains(s,def,p){const points=socketVertices(def.shape,s.config.socketTolerance),x=p.x-def.socket.x,y=p.y-def.socket.y;return points.every(([ax,ay],i)=>{const [bx,by]=points[(i+1)%points.length];return (bx-ax)*(y-ay)-(by-ay)*(x-ax)>=-1e-8;});}
export function settings(values={}){return Object.fromEntries(Object.entries(DEFAULTS).map(([k,v])=>[k,Number.isFinite(values[k])?clamp(values[k],...LIMITS[k]):v]));}
export function constrain(p){return {x:clamp(p.x,BOUNDS.left,BOUNDS.right),y:clamp(p.y,BOUNDS.top,BOUNDS.bottom)};}
export function createState(values={}){
 const config=settings(values);
 return {time:0,remainder:0,config,cycle:createCycle(),grip:null,nextGesture:0,complete:false,completedAt:null,lastMiss:-10,lastMissPoint:null,events:[],wires:WIRES.map(def=>{
  const nodes=[{...def.anchor,vx:0,vy:0}];
  for(const angle of def.angles){const last=nodes.at(-1);nodes.push({x:last.x+Math.cos(angle)*def.length/RULES.segments,y:last.y+Math.sin(angle)*def.length/RULES.segments,vx:0,vy:0});}
  return {id:def.id,nodes,state:'LOOSE',seatedAt:null,seatGesture:null,lastUnseatedAt:-10,connected:false,lockedAt:null,progress:0,valid:false,inside:false,controlled:false,tension:0,forces:{grip:{x:0,y:0},electrical:{x:0,y:0},cable:{x:0,y:0}},nextSurge:def.first,surgeIndex:0,activeSurge:null,surges:0,rejections:0,groundHits:0,lastReject:-10,lastGround:-10,lastEventPoint:null,wrongContact:null,groundContact:false};
 })};
}
function record(s,type,id,detail={}){s.events.push({time:s.time,type,wire:id,...detail});if(s.events.length>35)s.events.shift();}
export function catchWire(s,p){
 if(s.grip||s.complete||!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return null;
 const nearest=s.wires.filter(w=>!w.connected).map(w=>({w,d:distance(head(w),p)})).sort((a,b)=>a.d-b.d);
 if(!nearest.length||nearest[0].d>grabRadius(s)){s.lastMiss=s.time;s.lastMissPoint={x:p.x,y:p.y};return null;}
 const w=nearest[0].w,h=head(w);
 w.state='HELD';s.grip={id:++s.nextGesture,wireId:w.id,target:{x:h.x,y:h.y},desired:{x:h.x,y:h.y}};
 record(s,'caught',w.id);return {wireId:w.id,gestureId:s.grip.id,offset:{x:h.x-p.x,y:h.y-p.y}};
}
export function moveGrip(s,p,gestureId=s.grip?.id){if(!s.grip||gestureId!==s.grip.id||!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return false;s.grip.desired=constrain(p);return true;}
export function releaseGrip(s,reason='release',gestureId=s.grip?.id){
 if(!s.grip||gestureId!==s.grip.id)return false;
 const w=s.wires.find(w=>w.id===s.grip.wireId);
 if(!w.connected){if(w.state==='SEATED'){w.lastUnseatedAt=s.time;record(s,'unseated',w.id);}w.state='LOOSE';w.progress=0;w.valid=false;w.seatGesture=null;w.seatedAt=null;}
 record(s,reason,w.id);s.grip=null;return true;
}
function seat(s,w,def){const entrySpeed=speed(w);w.state='SEATED';w.seatedAt=s.time;w.seatGesture=s.grip.id;w.progress=0;w.inside=true;w.controlled=true;w.valid=true;Object.assign(head(w),def.socket,{vx:0,vy:0});record(s,'seated',w.id,{entrySpeed});}
function lockingStep(s,w){
 w.inside=true;w.controlled=true;w.valid=true;w.progress=clamp((s.time-w.seatedAt)/s.config.engagementTime,0,1);
 if(w.progress>=1-1e-9){w.progress=1;w.state='LOCKED';w.connected=true;w.lockedAt=s.time;w.forces={grip:{x:0,y:0},electrical:{x:0,y:0},cable:{x:0,y:0}};for(const p of w.nodes){p.vx=0;p.vy=0;}releaseGrip(s,'locked',w.seatGesture);record(s,'connected',w.id);}
}
// Authored changes in spacing, magnitude and direction; no random or frame-based kicks.
export const SURGE_PATTERN=Object.freeze([
 {spacing:1.15,magnitude:.90,direction:1},{spacing:.86,magnitude:1.12,direction:3},
 {spacing:1.04,magnitude:.98,direction:0},{spacing:1.22,magnitude:1.18,direction:2},
 {spacing:.92,magnitude:.86,direction:3},{spacing:.98,magnitude:1.06,direction:1},
].map(Object.freeze));
export function disturbance(def,ordinal){return def.instability?SURGE_PATTERN[(ordinal+Number(def.number))%SURGE_PATTERN.length]:{spacing:1,magnitude:1,direction:(ordinal+Number(def.number))%DIRECTIONS.length};}
export const pulseDuration=def=>def.pulse??RULES.pulse;
export function surgePhase(s,w){
 const def=WIRES.find(d=>d.id===w.id),until=w.nextSurge-s.time;
 const next=disturbance(def,w.surgeIndex);
 const active=!w.connected&&w.activeSurge!==null&&s.time-w.activeSurge.at<pulseDuration(def);
 return {active,warning:!w.connected&&until>=0&&until<=(def.warning??RULES.warning),charge:w.connected?0:clamp(1-until/(def.warning??RULES.warning),0,1),until,magnitude:active?w.activeSurge.magnitude:next.magnitude,direction:DIRECTIONS[active?w.activeSurge.index:next.direction]};
}
export function electricalForce(s,w){
 if(w.connected)return {x:0,y:0};
 const d=WIRES.find(d=>d.id===w.id),t=s.time;
 // Continuous alternating-current stress keeps a loose cable alive between surges.
 let x=d.ripple*Math.sin(t*d.frequency+d.phase),y=d.ripple*.72*Math.cos(t*d.frequency*.83+d.phase*.7);
 const envelope=1+(d.instability??0)*Math.sin(t*.73+d.phase);x*=envelope;y*=envelope;
 if(w.activeSurge){const age=t-w.activeSurge.at;if(age>=0&&age<pulseDuration(d)){const dir=DIRECTIONS[w.activeSurge.index%DIRECTIONS.length],f=d.surge*(w.activeSurge.magnitude??1)*Math.sin(Math.PI*age/pulseDuration(d));x+=dir.x*f;y+=dir.y*f;}}
 return {x:x*s.config.surgeStrength,y:y*s.config.surgeStrength};
}
function bounded(x,y,max){const n=Math.hypot(x,y),f=n>max?max/n:1;return {x:x*f,y:y*f};}
function projectBounds(p,r){p.x=clamp(p.x,BOUNDS.left+r,BOUNDS.right-r);p.y=clamp(p.y,BOUNDS.top+r,BOUNDS.bottom-r);}
function groundHit(h){const q={x:clamp(h.x,GROUND.x,GROUND.x+GROUND.width),y:clamp(h.y,GROUND.y,GROUND.y+GROUND.height)};const gap=distance(h,q);if(gap>=RULES.headRadius)return null;
 if(gap>1e-8)return {point:q,nx:(h.x-q.x)/gap,ny:(h.y-q.y)/gap,penetration:RULES.headRadius-gap};
 const faces=[{d:h.x-GROUND.x,nx:-1,ny:0},{d:GROUND.x+GROUND.width-h.x,nx:1,ny:0},{d:h.y-GROUND.y,nx:0,ny:-1},{d:GROUND.y+GROUND.height-h.y,nx:0,ny:1}].sort((a,b)=>a.d-b.d),f=faces[0];return {point:q,...f,penetration:RULES.headRadius+f.d};
}
function simulateWire(s,w,dt){
 if(w.connected)return;
 const def=WIRES.find(d=>d.id===w.id),nodes=w.nodes,h=head(w),held=s.grip?.wireId===w.id;
 if(held&&w.state==='HELD'&&socketContains(s,def,h))seat(s,w,def);
 const seated=w.state==='SEATED'&&held&&w.seatGesture===s.grip.id;
 if(s.time+1e-9>=w.nextSurge){const pattern=disturbance(def,w.surgeIndex);w.activeSurge={at:w.nextSurge,index:pattern.direction,magnitude:pattern.magnitude};w.surgeIndex++;w.surges++;w.nextSurge+=s.config.surgeInterval*def.interval*pattern.spacing;record(s,'surge',w.id);}
 const electrical=electricalForce(s,w);
 const grip=held&&!seated?bounded(s.config.gripForce*(s.grip.target.x-h.x)-RULES.gripDamping*h.vx,s.config.gripForce*(s.grip.target.y-h.y)-RULES.gripDamping*h.vy,RULES.maxGripForce):{x:0,y:0};
 w.forces={grip,electrical,cable:{x:0,y:0}};
 const old=nodes.map(p=>({x:p.x,y:p.y}));let freeVelocity={x:0,y:0};
 for(let i=1;i<nodes.length;i++){
  const p=nodes[i],end=i===RULES.segments;if(end&&seated)continue;const mass=end?def.mass:RULES.bodyMass,t=i/RULES.segments;
  const f=end?{x:electrical.x+grip.x,y:electrical.y+grip.y}:{x:electrical.x*.055*t+120*Math.sin(s.time*2.3+t*5+def.phase),y:electrical.y*.055*t};
  const a=bounded(f.x/mass,f.y/mass+RULES.gravity,RULES.maxAcceleration),damping=Math.exp(-s.config.damping*(def.dampingScale??1)*dt);
  const v=bounded(p.vx*damping+a.x*dt,p.vy*damping+a.y*dt,RULES.maxSpeed);p.vx=v.x;p.vy=v.y;p.x+=v.x*dt;p.y+=v.y*dt;if(end)freeVelocity=v;
 }
 const rest=def.length/RULES.segments;
 for(let pass=0;pass<RULES.iterations;pass++){
  for(let j=0;j<RULES.segments;j++){
   const i=pass%2?RULES.segments-1-j:j,a=nodes[i],b=nodes[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
   const ia=i===0?0:1/RULES.bodyMass,ib=i+1===RULES.segments?(seated?0:1/def.mass):1/RULES.bodyMass,c=(len-rest)/len*Math.min(1,s.config.tension*(def.stiffness??1))/(ia+ib);
   a.x+=dx*c*ia;a.y+=dy*c*ia;b.x-=dx*c*ib;b.y-=dy*c*ib;
  }
  nodes[0].x=def.anchor.x;nodes[0].y=def.anchor.y;
  for(let i=1;i<nodes.length;i++)projectBounds(nodes[i],i===RULES.segments?RULES.headRadius:RULES.bodyRadius);
 }
 // A radial hard limit guarantees reach even during unusually stretched solver steps.
 const radial=distance(h,def.anchor);if(radial>def.length){const f=def.length/radial;h.x=def.anchor.x+(h.x-def.anchor.x)*f;h.y=def.anchor.y+(h.y-def.anchor.y)*f;}
 for(let i=1;i<nodes.length;i++){const p=nodes[i],v=bounded((p.x-old[i].x)/dt,(p.y-old[i].y)/dt,RULES.maxSpeed);p.vx=v.x;p.vy=v.y;}
 w.forces.cable={x:(h.vx-freeVelocity.x)*def.mass/dt,y:(h.vy-freeVelocity.y)*def.mass/dt};
 w.tension=clamp((distance(h,def.anchor)/def.length-.72)/.28,0,1);
 // Only the captured endpoint is retained; the cable body keeps its original forces/solver.
 if(seated){Object.assign(h,def.socket,{vx:0,vy:0});lockingStep(s,w);return;}
 let wrong=null;
 for(const socket of WIRES){
  if(socket.id===w.id)continue;
  const gap=distance(h,socket.socket),rim=socketRadius(s)+RULES.headRadius;
  if(gap<rim){wrong=socket.id;const fallback=distance(def.anchor,socket.socket),nx=gap>1e-8?(h.x-socket.socket.x)/gap:(def.anchor.x-socket.socket.x)/fallback,ny=gap>1e-8?(h.y-socket.socket.y)/gap:(def.anchor.y-socket.socket.y)/fallback;h.x=socket.socket.x+nx*rim;h.y=socket.socket.y+ny*rim;const inward=h.vx*nx+h.vy*ny;if(inward<0){h.vx-=(1+RULES.restitution)*inward*nx;h.vy-=(1+RULES.restitution)*inward*ny;}if(w.wrongContact!==wrong&&s.time-w.lastReject>.4){h.vx+=nx*90;h.vy+=ny*90;w.rejections++;w.lastReject=s.time;w.lastEventPoint={...socket.socket};record(s,'wrong-socket',w.id);}}
 }
 if(wrong)w.wrongContact=wrong;else if(w.wrongContact&&distance(h,WIRES.find(d=>d.id===w.wrongContact).socket)>socketRadius(s)+RULES.headRadius+18)w.wrongContact=null;
 const ground=groundHit(h);if(ground){h.x+=ground.nx*(ground.penetration+.001);h.y+=ground.ny*(ground.penetration+.001);const into=h.vx*ground.nx+h.vy*ground.ny;if(into<0){h.vx-=(1+RULES.restitution)*into*ground.nx;h.vy-=(1+RULES.restitution)*into*ground.ny;}if(!w.groundContact&&s.time-w.lastGround>.5){h.vx+=ground.nx*65;h.vy+=ground.ny*65;w.groundHits++;w.lastGround=s.time;w.lastEventPoint=ground.point;record(s,'ground',w.id);}}
 w.groundContact=!!ground;
 projectBounds(h,RULES.headRadius);
 const finalReach=distance(h,def.anchor);if(finalReach>def.length){const nx=(h.x-def.anchor.x)/finalReach,ny=(h.y-def.anchor.y)/finalReach;h.x=def.anchor.x+nx*def.length;h.y=def.anchor.y+ny*def.length;const outward=h.vx*nx+h.vy*ny;if(outward>0){h.vx-=outward*nx;h.vy-=outward*ny;}}
 const v=bounded(h.vx,h.vy,RULES.maxSpeed);h.vx=v.x;h.vy=v.y;
 w.inside=socketContains(s,def,h);w.controlled=false;
 w.valid=false;w.progress=0;
 if(held&&w.inside&&!wrong&&!ground){seat(s,w,def);}

}
function disconnect(s,id){
 const w=s.wires.find(w=>w.id===id);if(!w.connected)return;
 // Open the collar at its current position, then let bounded momentum and the
 // original tether solver move it. Never restore the authored starting pose.
 w.connected=false;w.state='LOOSE';w.progress=0;w.valid=false;w.inside=false;w.controlled=false;w.lockedAt=null;w.seatedAt=null;w.seatGesture=null;
 const sign=WIRES.findIndex(d=>d.id===id)%2?-1:1;
 Object.assign(head(w),{vx:-240,vy:85*sign});
 w.nodes.at(-2).vx=-100;w.nodes.at(-2).vy=35*sign;
 w.activeSurge=null;w.nextSurge=s.time+.9;w.lastFailureAt=s.time;s.complete=false;
}
function tick(s,dt){
 s.time+=dt;
 const event=recurrenceStep(s.cycle,s.time,s.config);
 if(event){if(event.type==='connection-failed')disconnect(s,event.wire);record(s,event.type,event.wire);}
 if(s.grip){const p=s.grip.target,q=s.grip.desired,dx=q.x-p.x,dy=q.y-p.y,f=Math.min(1,RULES.gripSlew*dt/(Math.hypot(dx,dy)||1));p.x+=dx*f;p.y+=dy*f;}
 for(const w of s.wires)simulateWire(s,w,dt);
 if(!s.complete&&s.wires.every(w=>w.connected)){s.complete=true;s.completedAt=s.time;protect(s.cycle,s.time,s.config);record(s,'complete','all');}
}
export function advance(s,elapsed){if(!Number.isFinite(elapsed)||elapsed<=0)return;s.remainder+=Math.min(elapsed,.25);while(s.remainder+1e-10>=RULES.step){tick(s,RULES.step);s.remainder-=RULES.step;}}
export function condition(s){
 if(s.cycle.phase==='WARNING'){const d=WIRES.find(d=>d.id===s.cycle.wireId);return{title:'CONTACT UNSTABLE — '+d.name,detail:'Collar deteriorating · connection still powered. Prepare to catch the head when it releases.',tone:'warning'};}
 if(s.complete)return {title:s.time-s.completedAt<3?'EMERGENCY POWER RESTORED':'POWER PROTECTED — YOU CAN LEAVE',detail:'ALL FOUR CONNECTIONS SECURED · YOU CAN LEAVE · protection '+Math.max(0,Math.ceil(s.cycle.protectedUntil-s.time))+'s',tone:'success'};
 if(!s.grip&&s.time-s.lastMiss<.7)return {title:'MISSED — CATCH THE MOVING HEAD',detail:'Click and hold close to an actual connector. The coloured cable identifies its socket.',tone:'warning'};
 const w=s.wires.find(w=>w.id===s.grip?.wireId);
 if(!w&&s.wires.some(w=>s.time-w.lastUnseatedAt<1))return {title:'RELEASED EARLY — SOCKET OPEN',detail:'Temporary seating cancelled. Catch the head again and hold until the collar locks.',tone:'warning'};
 if(!w&&s.cycle.phase==='OUTAGE')return{title:WIRES.find(d=>d.id===s.cycle.wireId).name+' DISCONNECTED',detail:'CATCH AND RECONNECT THE LIVE WIRE · the other three systems remain powered.',tone:'warning'};
 if(!w)return {title:'CATCH A LIVE CONNECTOR',detail:'Click and hold a moving head. Match its colour AND connector shape to the receiving socket.',tone:'idle'};
 const def=WIRES.find(d=>d.id===w.id);
 if(w.state==='SEATED')return {title:def.name+' — SEATED · HOLD TO LOCK',detail:'Socket jaws are holding the head. Keep the SAME mouse press held; early release cancels seating.',tone:'live'};
 if(s.time-w.lastReject<.7)return {title:'WRONG SOCKET — REJECTED',detail:'The grip stays intact. Pull towards this cable’s matching shape and colour.',tone:'warning'};
 if(surgePhase(s,w).warning)return {title:def.name+' — SURGE BUILDING',detail:'Watch the arrow. Counter-steer against the coming kick; your grip will not drop.',tone:'warning'};
 return {title:'WRESTLE THE '+def.name+' CABLE',detail:'The head still has momentum. Guide the actual head into its matching inner shape; then keep holding.',tone:'live'};
}
