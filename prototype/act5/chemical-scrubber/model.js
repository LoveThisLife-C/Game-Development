// Standalone authoritative model; only position/press/release are player inputs.
export const WORLD=Object.freeze({width:1200,height:740});
export const VIEW=Object.freeze({x:-20,y:-31,width:1240,height:766});
export const VESSEL=Object.freeze({left:50,right:1150,top:94,bottom:654});
export const LANCE=Object.freeze({left:74,right:1126,base:610,maxCarriageSpeed:5000,referenceSpeed:2160,minSplitRadius:36,dissipation:.14,resetTime:.06});
export const RULES=Object.freeze({step:1/120,goal:16,recoverySpacing:1.6,maxPockets:10,maxJobs:32,admissionGap:1.1,penaltyGap:.8,penaltyMass:9,maxFragments:192,maxWakes:18,maxEffects:40,recycleTransit:1.2,loadPerUnit:.0008,restoredLoad:.12});
export const DEFAULTS=Object.freeze({response:40,jetSpeed:2160,width:18,reach:LANCE.base-VESSEL.top,centralFraction:.45,splitFraction:.78,minImpact:.18,bubbleSpeed:1.1,currentStrength:1,pocketCount:16,frequency:1,deterioration:.008,treatmentRate:1});
export const LIMITS=Object.freeze({response:[25,70],jetSpeed:[1400,3600],width:[14,28],reach:[180,LANCE.base-VESSEL.top],centralFraction:[.25,.60],splitFraction:[.65,.9],minImpact:[.12,.30],bubbleSpeed:[.8,1.8],currentStrength:[0,1.8],pocketCount:[8,16],frequency:[.7,1.5],deterioration:[.003,.02],treatmentRate:[.7,1.5]});
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Slow valuable pockets, fast urgent pockets and an authored three-level cluster.
export const FEED=Object.freeze([
 {at:0,x:280,r:41,mass:15,rise:57,drift:11,gate:.54},
 {at:.9,x:865,r:25,mass:9,rise:108,drift:-12,gate:.58},
 {at:1.7,x:525,r:36,mass:14,rise:65,drift:6,gate:.62},
 {at:2.35,x:535,r:30,mass:12,rise:80,drift:7,gate:.56},
 {at:2.95,x:540,r:25,mass:10,rise:108,drift:6,gate:.66},
 {at:3.9,x:330,r:28,mass:9,rise:94,drift:14,gate:.60},
 {at:4.55,x:358,r:25,mass:8,rise:110,drift:11,gate:.64},
 {at:5.35,x:820,r:44,mass:17,rise:54,drift:-14,gate:.57},
 {at:6.15,x:785,r:32,mass:12,rise:80,drift:-10,gate:.58},
 {at:6.9,x:260,r:26,mass:9,rise:104,drift:13,gate:.62},
 {at:7.65,x:620,r:37,mass:14,rise:62,drift:-8,gate:.56},
 {at:8.4,x:630,r:29,mass:11,rise:92,drift:-11,gate:.64},
].map(Object.freeze));
// Preserve v0.2 automatic loading quantities, order and capacity gates.
export const AUTOMATIC_FEED=Object.freeze(FEED.slice(0,8));

export const SIZE_GROUPS=Object.freeze([
 ['LARGE',38],['SMALL',17],['MEDIUM',31],['MEDIUM',26],
 ['SMALL',16],['MEDIUM',24],['MEDIUM',22],['LARGE',41],
 ['MEDIUM',28],['SMALL',18],['LARGE',37],['MEDIUM',25],
 ['LARGE',38],['SMALL',17],['MEDIUM',31],['MEDIUM',26],
].map(([size,r])=>Object.freeze({size,r})));
const spread=d=>({...d,x:600+(d.x-600)*1100/940});
export function recoveryDefinition(i){return spread({...FEED[i%FEED.length],...SIZE_GROUPS[i%SIZE_GROUPS.length]});}
// A deterministic permutation of the 4/8/4 mix: NEW obligations get a fresh
// size; returns always reuse their existing job definition and split status.
const penaltyDefinition=i=>spread({...FEED[(i*5+2)%FEED.length],...SIZE_GROUPS[(i*7+3)%SIZE_GROUPS.length],mass:RULES.penaltyMass});

export function settings(values={}){
 const result=Object.fromEntries(Object.entries(DEFAULTS).map(([k,v])=>[k,Number.isFinite(values[k])?clamp(values[k],...LIMITS[k]):v]));
 result.pocketCount=Math.round(result.pocketCount);result.seed=Number.isFinite(values.seed)?values.seed>>>0:708;return result;
}
const log=(s,type,extra={})=>{s.events.push({at:s.time,type,...extra});if(s.events.length>60)s.events.shift();};
function effect(s,type,x,y,strength=1,extra={}){s.effects.push({type,x,y,strength,at:s.time,...extra});if(s.effects.length>RULES.maxEffects)s.effects.shift();}
const part=(quota,daughter=false)=>({quota,processed:0,pendingMass:0,returnAt:null,done:false,daughter});
const pending=j=>Object.values(j.parts).reduce((n,p)=>n+p.pendingMass,0);
function jobs(s,start,seed=null){return Array.from({length:s.config.pocketCount},(_,i)=>{
 const d=recoveryDefinition(i),at=d.at+Math.floor(i/FEED.length)*(FEED.at(-1).at+.9),quota=i===0&&seed?seed.mass:d.mass;
 return {id:++s.jobSerial,penalty:false,quota,processed:0,parts:{root:part(quota)},splitUsed:false,dispersionStarted:false,spawned:false,done:false,attempts:0,due:start+at*RULES.recoverySpacing/s.config.frequency,def:i===0&&seed?{...d,...seed,size:seed.r>=LANCE.minSplitRadius?'LARGE':seed.r<20?'SMALL':'MEDIUM'}:d};
});}
function idlePulse(config){return {phase:'READY',serial:0,origin:600,start:null,speed:config.jetSpeed,flight:config.reach/config.jetSpeed,dissipation:LANCE.dissipation,resetTime:LANCE.resetTime,reach:config.reach,width:config.width,centralFraction:config.centralFraction,splitFraction:config.splitFraction,minImpact:config.minImpact,front:LANCE.base,previousFront:LANCE.base,tail:LANCE.base,opacity:0,contacts:{},hitIds:[],ignoredIds:[],wakeAt:0};}
export function createState(values={}){
 const config=settings(values),s={time:0,ticks:0,remainder:0,config,carriage:{x:600,target:600,v:0},inputDown:false,pulse:idlePulse(config),pockets:[],births:[],fragments:[],wakes:[],effects:[],jobs:[],jobSerial:0,serial:0,phase:'RECOVERY',load:.82,nextAutoAt:null,autoIndex:0,batch:null,nextAdmissionAt:0,admissionSerial:0,lastPenalty:-10,lastPenaltyEvent:null,lastRestored:null,lastEscape:-10,lastHit:-10,lastSplit:-10,lastGraze:-10,lastBusy:-10,lastEmpty:-10,lastCombo:null,stats:{supplied:0,treated:0,escaped:0,recirculating:0,returned:0,shots:0,hits:0,successfulShots:0,misses:0,busy:0,directDispersions:0,daughterDispersions:0,daughterPocketsTreated:0,splits:0,grazes:0,multiShots:0,triples:0,escapedPockets:0,penalties:0,penaltyTreatments:0,originalTreatments:0,daughterEscapes:0,microEscapes:0,maxRemaining:16,maxActive:0,maxJobs:16,restorations:0,jobsTreated:0,wakeDeflection:0,admissions:{LARGE:0,MEDIUM:0,SMALL:0},penaltyAdmissions:{LARGE:0,MEDIUM:0,SMALL:0},returns:0},events:[]};
 s.jobs=jobs(s,0);resetBatch(s);return s;
}
function resetBatch(s){s.batch={initial:s.jobs.length,penaltyBase:s.jobSerial,penalties:0,penaltiesTreated:0,penaltyProcessed:0,penaltyExtraMass:0,queued:0,nextPenaltyAt:null};s.nextAdmissionAt=s.time;s.admissionSerial=0;}
export function moveCarriage(s,x){if(!Number.isFinite(x))return false;s.carriage.target=clamp(x,LANCE.left,LANCE.right);return true;}
export function press(s){
 if(s.inputDown)return false;s.inputDown=true;
 if(s.pulse.phase!=='READY'){s.lastBusy=s.time;s.stats.busy++;return false;}
 const serial=s.pulse.serial+1;s.pulse={...idlePulse(s.config),phase:'PROPAGATING',serial,origin:s.carriage.x,start:s.time,opacity:1,wakeAt:s.time};
 s.stats.shots++;log(s,'pulse',{origin:s.carriage.x});return true;
}
export function release(s){s.inputDown=false;}
export function frontAt(q,time){return q.start===null?LANCE.base:LANCE.base-Math.min(q.reach,Math.max(0,time-q.start)*q.speed);}
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const cross=(a,b)=>a.x*b.y-a.y*b.x;
function nearest(p,a,b){const d=sub(b,a),t=clamp(dot(sub(p,a),d)/(dot(d,d)||1),0,1);return {x:a.x+t*d.x,y:a.y+t*d.y};}
function segmentDistance(a,z,c,d){
 const u=sub(z,a),v=sub(d,c),den=cross(u,v);
 if(Math.abs(den)>1e-12){const t=cross(sub(c,a),v)/den,k=cross(sub(c,a),u)/den;if(t>=0&&t<=1&&k>=0&&k<=1)return {distance:0,t,point:{x:a.x+t*u.x,y:a.y+t*u.y}};}
 let best=null;
 for(const [p,q,t] of [[a,nearest(a,c,d),0],[z,nearest(z,c,d),1]]){const distance=Math.hypot(p.x-q.x,p.y-q.y);if(!best||distance<best.distance)best={distance,t,point:q};}
 for(const p of [c,d]){const q=nearest(p,a,z),distance=Math.hypot(p.x-q.x,p.y-q.y),t=dot(sub(q,a),u)/(dot(u,u)||1);if(distance<best.distance)best={distance,t,point:p};}
 return best;
}
// A narrow horizontal liquid front sweeps relative to a moving circular pocket.
// Visible column/spray behind the front is not another collision rectangle.
export function sweptFront(a,z,before,after,radius,width=DEFAULTS.width){
 const hit=segmentDistance(sub(before,a),sub(after,z),{x:-width/2,y:0},{x:width/2,y:0});
 if(hit.distance>radius)return null;
 return {...hit,x:a.x+(z.x-a.x)*hit.t+hit.point.x,y:a.y+(z.y-a.y)*hit.t+hit.point.y};
}
// Seeded travelling currents and moving eddies. No input/aim dependence and
// no per-frame random steering. Loading bounds the lateral challenge; the
// accepted vertical field and rise calibration are retained.
export function turbulenceLevel(s){return clamp((s.load-.35)/.65,0,1);}
export function currentAt(s,x,y){const t=s.time,phase=t%17.3,cx=600+230*Math.sin(t*.173),cy=430+75*Math.sin(t*.237+.6),dx=x-cx,dy=y-cy,f=Math.exp(-(dx*dx+dy*dy)/(210*210));
 const seed=(s.config.seed%65521)*.017,pressure=turbulenceLevel(s);
 let vx=(51*Math.sin(y/107+t*.93+seed)+43*Math.sin(x/179-y/151-t*.71+seed*.37)+29*Math.sin(y/73+x/311+t*1.37+seed*.73))*(1+.45*pressure);
 let vy=10*Math.cos(x/173+t*.373)*Math.sin(y/103-t*.211)+dx*.12*f;
 for(let i=0;i<3;i++){
  const ex=600+400*Math.sin(t*(.19+i*.031)+seed+i*2.1),ey=355+170*Math.sin(t*(.27+i*.047)+seed*.43+i*1.7);
  const ox=x-ex,oy=y-ey,eddy=Math.exp(-(ox*ox+oy*oy)/(155*155));
  vx-=oy*(i%2?-1:1)*(.85+.45*pressure)*eddy;
 }
 for(const [at,px,py,spin] of [[2.1,350,480,1],[7.8,820,380,-1],[13.6,570,540,1]]){const delta=((phase-at+25.95)%17.3)-8.65,local=Math.exp(-((delta/1.15)**2))*Math.exp(-((x-px)**2+(y-py)**2)/(125*125));vy-=(x-px)*.35*spin*local;}
 // Smooth saturation rather than clipped plateaux in the lateral field.
 return {x:175*Math.tanh(vx/175)*s.config.currentStrength,y:clamp(vy,-24,24)*s.config.currentStrength};
}

function wake(s,x,y,strength,spin=1){s.wakes.push({x,y,v:strength,spin,at:s.time});if(s.wakes.length>RULES.maxWakes)s.wakes.shift();}
export function wakeAt(s,x,y){let ax=0,ay=0;for(const w of s.wakes){const age=s.time-w.at,dx=x-w.x,dy=y-w.y,r=90+age*35,f=w.v*Math.exp(-age/1.0)*Math.exp(-(dx*dx+dy*dy)/(r*r));ax+=f*(.65*dx/r-.35*dy/r*w.spin);ay-=f*(.65+.45*dx/r*w.spin);}const n=Math.hypot(ax,ay),k=Math.min(1,140/(n||1));return {x:ax*k,y:ay*k};}

function makePocket(s,d,jobId,mass=d.mass,branchId='root'){
 const job=s.jobs.find(j=>j.id===jobId);
 if(jobId!==null){const size=d.size??'MEDIUM';if(branchId==='root'&&job?.attempts===1){s.stats.admissions[size]++;if(job.penalty)s.stats.penaltyAdmissions[size]++;}else s.stats.returns++;}
 return {id:++s.serial,kind:'POCKET',size:d.size??(d.r>=36?'LARGE':'MEDIUM'),jobId,lineageId:jobId,branchId,alreadySplit:job?.splitUsed??false,x:d.x,y:VESSEL.bottom-d.r-3,vx:d.drift,vy:-d.rise*s.config.bubbleSpeed,r:d.r,mass,initial:mass,rise:d.rise,drift:d.drift,phase:s.serial*1.731,deformation:0,dead:false};
}
// Fine bubbles retain BOTH original workload and daughter branch identity.
function fragment(s,b,mass){
 const available=RULES.maxFragments-s.fragments.length,count=Math.min(6,available);
 if(count<1){const old=s.fragments.find(f=>f.jobId===b.jobId&&f.branchId===b.branchId);if(!old)return false;old.mass+=mass;old.initial+=mass;return true;}
 const r=b.r*Math.sqrt(mass/b.mass)/Math.sqrt(count);
 for(let i=0;i<count;i++){const a=(i+.5)/count*Math.PI*2;s.fragments.push({id:++s.serial,kind:'MICROBUBBLE',jobId:b.jobId,lineageId:b.lineageId,branchId:b.branchId,alreadySplit:b.alreadySplit,x:b.x+Math.cos(a)*b.r*.2,y:b.y+Math.sin(a)*b.r*.2,vx:b.vx*.25+Math.cos(a)*58,vy:-24+Math.sin(a)*48,r:Math.max(4,r),mass:mass/count,initial:mass/count,age:0,duration:(1.3+Math.max(4,r)*.035)/s.config.treatmentRate,phase:s.serial+i});}
 return true;
}
function registerHit(s,b){
 const q=s.pulse;if(!q.hitIds.length)s.stats.successfulShots++;q.hitIds.push(b.id);s.stats.hits++;s.lastHit=s.time;
 if(q.hitIds.length===2){s.stats.multiShots++;s.lastCombo={at:s.time,count:2};}
 else if(q.hitIds.length>=3){if(q.hitIds.length===3)s.stats.triples++;s.lastCombo={at:s.time,count:q.hitIds.length};}
}
export function classifyImpact(s,b,hit){
 const calibration=s.pulse.phase==='READY'?s.config:s.pulse,ratio=hit.distance/b.r,job=s.jobs.find(j=>j.id===b.jobId),energy=hit.energy;
 const used=b.alreadySplit||job?.splitUsed,canSplit=!used&&!job?.dispersionStarted&&job?.def.size==='LARGE'&&b.r>=LANCE.minSplitRadius;
 if(ratio<=calibration.centralFraction&&energy>=calibration.minImpact)return 'DISPERSE';
 if(canSplit&&ratio<=calibration.splitFraction&&energy>=calibration.minImpact)return 'SPLIT';
 // Smaller/already-processed gas is easier to disperse; it cannot breed new targets.
 if(!canSplit&&energy>=calibration.minImpact*.5)return 'DISPERSE';
 return 'GRAZE';
}
function disperse(s,b){
 const mass=b.mass;if(!fragment(s,b,mass))return;
 registerHit(s,b);const job=s.jobs.find(j=>j.id===b.jobId);if(job)job.dispersionStarted=true;
 if(job?.parts[b.branchId]?.daughter)s.stats.daughterDispersions++;else s.stats.directDispersions++;
 b.mass=0;b.dead=true;b.deformation=.9;
 wake(s,b.x,b.y,115+.8*mass,Math.sign(b.x-s.pulse.origin||1));effect(s,'disperse',b.x,b.y,clamp(mass/9,.35,2));log(s,'dispersion',{pocket:b.id,job:b.jobId,branch:b.branchId,mass,pulse:s.pulse.serial});
}
function splitOriginal(s,b,hit){
 const job=s.jobs.find(j=>j.id===b.jobId);
 if(!job||job.splitUsed||b.alreadySplit)return; // A lineage can allocate branches once only.
 job.splitUsed=true;const source=job.parts[b.branchId],mass=b.mass;
 source.quota=Math.max(0,source.quota-mass);registerHit(s,b);s.stats.splits++;s.lastSplit=s.time;
 const r=b.r/Math.sqrt(2),separation=35+Math.min(1,hit.energy)*35;
 for(const [i,side] of [-1,1].entries()){
  const branchId=i===0?'a':'b';job.parts[branchId]=part(mass/2,true);
  const child={...b,id:++s.serial,branchId,alreadySplit:true,mass:mass/2,initial:mass/2,r,x:b.x+side*b.r*.18,y:b.y+side*b.r*.04,vx:b.vx+side*separation,vy:b.vy-side*8,deformation:.9,phase:b.phase+side*.3,splitAt:s.time,splitOrigin:{x:b.x,y:b.y}};
  const speed=Math.hypot(child.vx,child.vy),scale=Math.min(1,240/(speed||1));child.vx*=scale;child.vy*=scale;
  s.births.push(child);s.pulse.ignoredIds.push(child.id);
 }
 b.mass=0;b.dead=true;
 wake(s,b.x,b.y,70+mass,Math.sign(b.x-s.pulse.origin||1));effect(s,'split',b.x,b.y,1,{r:b.r});log(s,'split',{pocket:b.id,job:b.jobId,mass,daughters:2,pulse:s.pulse.serial});
}
function resolveContact(s,b,hit){
 const outcome=classifyImpact(s,b,hit);
 if(outcome==='DISPERSE')disperse(s,b);
 else if(outcome==='SPLIT')splitOriginal(s,b,hit);
 else {s.stats.grazes++;s.lastGraze=s.time;b.deformation=.65;const impulse=18*clamp(hit.energy/s.pulse.minImpact,0,1);b.vx+=Math.sign(b.x-s.pulse.origin||1)*impulse;b.vy-=impulse*5/18;const speed=Math.hypot(b.vx,b.vy),scale=Math.min(1,240/(speed||1));b.vx*=scale;b.vy*=scale;effect(s,'graze',b.x,b.y,.3);log(s,'graze',{pocket:b.id,energy:hit.energy});}
}
function scanPulse(s,b,before,after,front){
 const q=s.pulse;if(q.hitIds.includes(b.id)||q.ignoredIds.includes(b.id)||b.dead)return;
 const hit=sweptFront({x:q.origin,y:q.previousFront},{x:q.origin,y:front},before,after,b.r,q.width);
 if(!hit)return;
 hit.energy=clamp((q.speed+b.vy)/LANCE.referenceSpeed,.1,1.5)*(1-.15*clamp((LANCE.base-hit.y)/q.reach,0,1))*clamp(1-hit.distance/b.r,0,1);
 b.deformation=Math.max(b.deformation,hit.distance>b.r*q.centralFraction&&hit.energy>=q.minImpact ? .75 : .3);const previous=q.contacts[b.id];
 if(!previous||hit.distance<previous.distance)q.contacts[b.id]=hit;
 // Wait for best penetration before resolving an off-centre contact. A genuinely
 // central front can disperse immediately instead of falsely splitting on first touch.
 if(hit.distance<=b.r*q.centralFraction&&hit.energy>=q.minImpact)disperse(s,b);
}
function finishContacts(s){
 for(const b of s.pockets){const hit=s.pulse.contacts[b.id];if(hit&&!b.dead&&b.y-b.r>VESSEL.top&&!s.pulse.hitIds.includes(b.id))resolveContact(s,b,hit);}
}
function startRecovery(s,seed=null,returned=false){
 s.phase='RECOVERY';s.jobs=jobs(s,s.time,seed);resetBatch(s);s.load=Math.max(s.load,.58);s.nextAutoAt=null;
 if(returned){const j=s.jobs[0];j.spawned=true;j.parts.root.pendingMass=seed.mass;j.parts.root.returnAt=s.time+RULES.recycleTransit;}
 log(s,'recovery-needed');
}
export function escape(s,b){
 // Idempotence lives on the actual physical packet, not an unbounded ID history.
 if(b.escaped||b.dead||b.mass<=1e-9||b.y-b.r>VESSEL.top)return false;b.escaped=true;
 s.stats.escaped+=b.mass;s.stats.escapedPockets++;s.stats.recirculating+=b.mass;s.lastEscape=s.time;
 const untreatedPocket=b.kind==='POCKET';
 if(!untreatedPocket)s.stats.microEscapes++;
 effect(s,'escape',b.x,VESSEL.top,b.mass/10,{penalty:untreatedPocket});
 let job=s.jobs.find(j=>j.id===b.jobId),branchId=b.branchId;
 if(!job){
  if(s.phase==='AUTO'){startRecovery(s,{x:b.x,r:Math.max(23,b.r),mass:b.mass,rise:80,drift:8},true);job=s.jobs[0];}
  else {job=s.jobs.find(j=>!j.done)??s.jobs.at(-1);job.quota+=b.mass;if(job.penalty)s.batch.penaltyExtraMass+=b.mass;job.done=false;branchId='root';job.parts.root.quota+=b.mass;job.parts.root.done=false;job.parts.root.pendingMass+=b.mass;job.parts.root.returnAt??=s.time+RULES.recycleTransit;}
 }else {const p=job.parts[branchId];p.pendingMass+=b.mass;p.returnAt??=s.time+RULES.recycleTransit;}
 if(untreatedPocket){
  s.batch.penalties++;s.batch.queued++;const obligation=++s.jobSerial;
  s.batch.nextPenaltyAt??=s.time+RULES.recycleTransit;
  s.stats.penalties++;if(job.parts[branchId]?.daughter)s.stats.daughterEscapes++;
  s.lastPenalty=s.time;s.lastPenaltyEvent={serial:s.stats.penalties,at:s.time,pocket:b.id,job:job.id,branch:branchId,obligation};
  log(s,'penalty',{...s.lastPenaltyEvent,added:1});
  s.stats.maxRemaining=Math.max(s.stats.maxRemaining,progress(s).remaining);
 }
 log(s,'breakthrough',{mass:b.mass,job:job.id,branch:branchId,penalty:untreatedPocket?1:0,pocket:b.id});return true;
}
// Admission reserves room for one daughter pair from every eligible large pocket.
// Only bounded live jobs/branches are scanned. Arbitrarily many waiting penalties
// occupy one counted FIFO range, never one object/timer per obligation.
function capacity(s){return s.pockets.length+s.births.length+s.pockets.filter(b=>!b.dead&&!b.alreadySplit&&s.jobs.find(j=>j.id===b.jobId)?.def.size==='LARGE'&&b.r>=LANCE.minSplitRadius).length;}
function feed(s){
 if(s.phase==='RECOVERY'){
  if(s.time+1e-9<s.nextAdmissionAt)return;
  const ready=[];
  for(const j of s.jobs){
   if(!j.spawned&&s.time+1e-9>=j.due)ready.push({at:j.due,j});
   for(const [branchId,p] of Object.entries(j.parts))if(p.pendingMass>1e-9&&s.time+1e-9>=p.returnAt&&!s.pockets.some(b=>b.jobId===j.id&&b.branchId===branchId&&!b.dead))ready.push({at:p.returnAt,j,branchId,p});
  }
  if(s.batch.queued&&s.time+1e-9>=s.batch.nextPenaltyAt&&s.jobs.length<RULES.maxJobs)ready.push({at:s.batch.nextPenaltyAt,penalty:true});
  // Give new independent work a regular slot while old branches keep their
  // own fair chronological service. Queue length never accelerates admission.
  const preferPenalty=s.admissionSerial%3===2;
  ready.sort((a,b)=>preferPenalty?(Number(!!b.penalty)-Number(!!a.penalty)||a.at-b.at):a.at-b.at);
  for(const request of ready){
   const j=request.j,d=request.penalty?penaltyDefinition(s.batch.penalties-s.batch.queued):j.def;
   const mass=request.p?.pendingMass??(request.penalty?RULES.penaltyMass:j.quota);
   const r=request.p?Math.max(Math.min(22,d.r),d.r*Math.sqrt(mass/j.quota)):d.r;
   const reserve=d.size==='LARGE'&&!j?.splitUsed&&r>=LANCE.minSplitRadius?2:1;
   if(capacity(s)+reserve>RULES.maxPockets)continue;
   if(request.penalty){
    const id=s.batch.penaltyBase+s.batch.penalties-s.batch.queued+1;
    const penalty={id,penalty:true,quota:mass,processed:0,parts:{root:part(mass)},splitUsed:false,dispersionStarted:false,spawned:true,done:false,attempts:1,due:request.at,def:d};
    s.jobs.push(penalty);s.stats.maxJobs=Math.max(s.stats.maxJobs,s.jobs.length);s.batch.queued--;s.batch.nextPenaltyAt=s.batch.queued?s.time+RULES.penaltyGap:null;
    s.stats.supplied+=mass;s.load=clamp(s.load+mass*RULES.loadPerUnit,0,1);s.pockets.push(makePocket(s,d,id,mass));log(s,'penalty-admitted',{job:id,mass});
   }else if(request.p){
    request.p.pendingMass=0;request.p.returnAt=null;j.attempts++;s.stats.recirculating=Math.max(0,s.stats.recirculating-mass);s.stats.returned+=mass;
    s.pockets.push(makePocket(s,{...d,r},j.id,mass,request.branchId));log(s,'recirculated',{job:j.id,branch:request.branchId,mass});
   }else{j.spawned=true;j.attempts++;s.stats.supplied+=j.quota;s.load=clamp(s.load+j.quota*RULES.loadPerUnit,0,1);s.pockets.push(makePocket(s,d,j.id,j.quota));log(s,'admitted',{job:j.id,mass:j.quota});}
   s.admissionSerial++;s.nextAdmissionAt=s.time+RULES.admissionGap;break;
  }
 }else if(s.time+1e-9>=s.nextAutoAt){
  const d=AUTOMATIC_FEED[s.autoIndex++%AUTOMATIC_FEED.length];s.nextAutoAt=s.time+1.6/s.config.frequency;s.load=clamp(s.load+d.mass*RULES.loadPerUnit,0,1);
  if(s.load>=d.gate){startRecovery(s,d);feed(s);}else{const b=makePocket(s,d,null);if(fragment(s,b,d.mass)){s.stats.supplied+=d.mass;effect(s,'auto',b.x,b.y,.4);}}
 }
}
function pocketMotion(s,b,dt){const w=wakeAt(s,b.x,b.y),flow=currentAt(s,b.x,b.y);s.stats.wakeDeflection+=Math.hypot(w.x,w.y)*dt;
 // Small pockets follow changing currents faster; large ones retain momentum.
 const response=clamp(42/b.r,.85,2.2),phase=b.phase+(s.config.seed%997)*.013;
 const ahead=clamp(b.x+b.vx*.55,VESSEL.left+b.r,VESSEL.right-b.r);
 const wall=190*(Math.exp(-(ahead-b.r-VESSEL.left)/48)-Math.exp(-(VESSEL.right-b.r-ahead)/48));
 const target=flow.x+Math.sin(s.time*(.83+response*.17)+phase)*Math.abs(b.drift)*2+wall;
 b.vx+=clamp((target-b.vx)*response+w.x,-240,240)*dt;
 b.vy+=((-b.rise*s.config.bubbleSpeed+flow.y-b.vy)*1.6+w.y)*dt;
 const n=Math.hypot(b.vx,b.vy),f=Math.min(1,240/(n||1));b.vx*=f;b.vy*=f;b.x+=b.vx*dt;b.y+=b.vy*dt;b.deformation*=Math.exp(-3*dt);
 if(b.x-b.r<VESSEL.left){b.x=VESSEL.left+b.r;b.vx=Math.abs(b.vx)*.4;}if(b.x+b.r>VESSEL.right){b.x=VESSEL.right-b.r;b.vx=-Math.abs(b.vx)*.4;}if(b.y+b.r>VESSEL.bottom){b.y=VESSEL.bottom-b.r;b.vy=-Math.abs(b.vy)*.4;}
}

function fragmentStep(s,b,dt){
 b.age+=dt;const w=wakeAt(s,b.x,b.y);b.vx+=(w.x*.55-b.vx*1.5)*dt;b.vy+=((-24-b.vy)*1.5+w.y*.4)*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.x=clamp(b.x,VESSEL.left+b.r,VESSEL.right-b.r);
 if(b.y+b.r>VESSEL.bottom){b.y=VESSEL.bottom-b.r;b.vy=-Math.abs(b.vy)*.2;}
 let removed=Math.min(b.mass,b.initial/b.duration*dt);b.mass-=removed;if(b.mass<1e-9){removed+=b.mass;b.mass=0;}s.stats.treated+=removed;
 const job=s.jobs.find(j=>j.id===b.jobId);
 if(job){job.processed=Math.min(job.quota,job.processed+removed);const p=job.parts[b.branchId];p.processed=Math.min(p.quota,p.processed+removed);}
 if(b.mass===0)return false;if(b.y-b.r<=VESSEL.top){escape(s,b);return false;}return true;
}
function hasPackets(s,jobId,branchId){return [...s.pockets,...s.fragments].some(b=>b.jobId===jobId&&b.branchId===branchId);}
function tick(s,dt){
 s.time=++s.ticks*RULES.step;s.load=clamp(s.load+s.config.deterioration*dt,0,1);const c=s.carriage,q=s.pulse,active=q.phase!=='READY';
 if(!active){const step=clamp((c.target-c.x)*(1-Math.exp(-s.config.response*dt)),-LANCE.maxCarriageSpeed*dt,LANCE.maxCarriageSpeed*dt);c.x+=step;c.v=step/dt;}else{c.x=q.origin;c.v=0;}
 feed(s);let propagating=false,finish=false;
 if(active){
  q.previousFront=q.front;const age=s.time-q.start;propagating=q.phase==='PROPAGATING';q.front=frontAt(q,s.time);
  if(propagating&&age>=q.flight-1e-9)finish=true;
  if(propagating&&s.time>=q.wakeAt){q.wakeAt=s.time+.045;wake(s,q.origin,q.front+25,Math.min(130,q.speed*.08),q.serial%2?1:-1);}
  const fade=clamp((age-q.flight)/q.dissipation,0,1);q.tail=LANCE.base-q.reach*fade;q.opacity=1-fade;
 }
 for(const b of s.pockets){const before={x:b.x,y:b.y};pocketMotion(s,b,dt);
  // Clip BOTH moving bodies to the first of valve closure or outlet crossing.
  // An escaped packet (including a deferred glancing contact) cannot be retrieved.
  if(propagating&&before.y-b.r>VESSEL.top){
   const outlet=b.y-b.r<=VESSEL.top?(before.y-b.r-VESSEL.top)/(before.y-b.y):1;
   const fraction=Math.min(outlet,clamp((q.flight-(s.time-dt-q.start))/dt,0,1));
   const after={x:before.x+(b.x-before.x)*fraction,y:before.y+(b.y-before.y)*fraction};
   scanPulse(s,b,before,after,frontAt(q,s.time-dt+dt*fraction));
  }
 }
 if(finish){finishContacts(s);q.phase='DISSIPATING';}
 s.pockets=s.pockets.filter(b=>{if(b.dead)return false;if(b.y-b.r<=VESSEL.top){escape(s,b);return false;}return true;});
 s.pockets.push(...s.births);s.births=[];
 s.fragments=s.fragments.filter(b=>fragmentStep(s,b,dt));
 if(active){
  const age=s.time-q.start;
  if(age>=q.flight+q.dissipation-1e-9){q.phase='RESETTING';q.opacity=0;}
  if(age>=q.flight+q.dissipation+q.resetTime-1e-9){q.phase='READY';q.opacity=0;if(!q.hitIds.length){s.stats.misses++;s.lastEmpty=s.time;}log(s,'ready',{pulse:q.serial,hits:q.hitIds.length});}
 }
 for(const j of s.jobs){
  for(const [id,p] of Object.entries(j.parts))if(!p.done&&j.spawned&&p.pendingMass<1e-8&&p.processed>=p.quota-1e-7&&!hasPackets(s,j.id,id)){p.done=true;p.processed=p.quota;if(p.daughter)s.stats.daughterPocketsTreated++;}
  if(!j.done&&j.spawned&&pending(j)<1e-8&&j.processed>=j.quota-1e-7&&Object.values(j.parts).every(p=>p.done)){j.done=true;j.processed=j.quota;s.stats.jobsTreated++;if(j.penalty){s.batch.penaltiesTreated++;s.batch.penaltyProcessed+=j.processed;s.stats.penaltyTreatments++;}else s.stats.originalTreatments++;log(s,'job-treated',{job:j.id});}
 }
 s.jobs=s.jobs.filter(j=>!j.penalty||!j.done);
 s.stats.maxActive=Math.max(s.stats.maxActive,s.pockets.length);s.stats.maxJobs=Math.max(s.stats.maxJobs,s.jobs.length);
 if(s.phase==='RECOVERY'&&progress(s).remaining===0&&s.jobs.every(j=>j.done)){s.phase='AUTO';s.load=RULES.restoredLoad;s.lastRestored=s.time;s.stats.restorations++;s.nextAutoAt=s.time+1.6/s.config.frequency;effect(s,'restored',600,400,1);log(s,'restored');}
 s.wakes=s.wakes.filter(w=>s.time-w.at<2.2);s.effects=s.effects.filter(e=>s.time-e.at<(e.type==='escape'?1.8:.85));
}
export function advance(s,elapsed){if(!Number.isFinite(elapsed)||elapsed<=0)return;s.remainder+=Math.min(.25,elapsed);while(s.remainder+1e-10>=RULES.step){tick(s,RULES.step);s.remainder-=RULES.step;}if(Math.abs(s.remainder)<1e-10)s.remainder=0;}
export function progress(s){
 const originals=s.jobs.filter(j=>!j.penalty),total=s.batch.initial+s.batch.penalties,treated=originals.filter(j=>j.done).length+s.batch.penaltiesTreated;
 const quota=originals.reduce((n,j)=>n+j.quota,0)+s.batch.penalties*RULES.penaltyMass+s.batch.penaltyExtraMass;
 const processed=s.jobs.reduce((n,j)=>n+j.processed,0)+s.batch.penaltyProcessed;
 return {total,treated,remaining:total-treated,initial:s.batch.initial,penalties:s.batch.penalties,penaltiesTreated:s.batch.penaltiesTreated,quota,processed,fraction:quota?processed/quota:0,pending:s.jobs.filter(j=>!j.spawned).length+s.batch.queued,queuedPenalties:s.batch.queued,returning:s.jobs.filter(j=>pending(j)>1e-8).length,processing:new Set(s.fragments.filter(b=>b.jobId!==null).map(b=>b.jobId)).size,splitRemaining:s.jobs.filter(j=>j.splitUsed&&!j.done).length,daughtersRemaining:s.jobs.reduce((n,j)=>n+Object.values(j.parts).filter(p=>p.daughter&&!p.done).length,0)};
}

export function balance(s){return {supplied:s.stats.supplied,treated:s.stats.treated,recirculating:s.stats.recirculating,present:[...s.pockets,...s.births,...s.fragments].reduce((n,b)=>n+b.mass,0)};}
export function condition(s){
 const p=progress(s);
 if(s.phase==='AUTO')return {title:'SCRUBBER EFFECTIVE',detail:'AUTOMATIC TREATMENT RESTORED · YOU CAN LEAVE THIS STATION',tone:'success'};
 if(s.time-s.lastPenalty<.9)return {title:'CHEMICAL BREAKTHROUGH',detail:'+1 TO TREAT',tone:'warning'};
 if(!p.pending&&!s.pockets.length&&p.processing)return {title:'NEUTRALISATION IN PROGRESS',detail:'Fine bubbles are processing. Recovery counts only genuinely treated gas.',tone:'live'};
 return {title:s.lastRestored===null?'DISPERSE THE GREEN GAS POCKETS':'TREATMENT DETERIORATING — FIRE THE LIQUID JET',detail:`CONTAMINATED POCKETS REMAINING: ${p.remaining} · ${p.pending} incoming · ${p.returning} returning untreated`,tone:s.lastRestored===null?'idle':'warning'};
}
