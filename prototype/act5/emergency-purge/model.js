// Coarse stitched membrane: each quad retains its own four particles and area.
// Breakable seams change topology. Faces retire only after entering a receiver.
export const WORLD=Object.freeze({width:1280,height:720});
export const SCREEN=Object.freeze({x:284,y:136,w:748,h:408});
// One service-side receiver for every kind of freed material.
export const COLLECTOR=Object.freeze({x:276,y:575,w:760,h:99});
export const TOGGLE=Object.freeze({width:260,height:360,centreX:130,handleY:166,handleW:116,handleH:72,travel:42,stroke:18,chargePerReversal:3.5});
export const RULES=Object.freeze({cols:10,rows:6,tileW:68,tileH:58,step:1/240,
  materialK:650,seamK:650,linkDrag:2.5,airDrag:2.6,gravity:55,
  adhesionXY:90,adhesionZ:180,gripK:1000,gripDrag:36,maxGripForce:22000,
  handDepth:48,depthLimit:220,tearGap:20,hitRadius:25,openTarget:.80,criticalFlap:.06,
  sampleCols:34,sampleRows:20,clearDepth:85,gasStart:60,gasReduction:20,purgeDuration:3.2});
export const CONFIGURATIONS=Object.freeze({corner:'CORNER ADHESION',fold:'CENTRAL FOLD',remnant:'TORN REMNANT'});
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const project=p=>({x:p.x+.22*p.z,y:p.y-.45*p.z});
const sides=[[0,1],[1,2],[3,2],[0,3]];
const length=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
export function createState(configuration='corner',cycle=1) {
  const key=Object.hasOwn(CONFIGURATIONS,configuration)?configuration:'corner';
  const s={configuration:key,cycle,toggle:{charge:0,grab:null,x:0,reversals:0,lastStroke:-1},time:0,ticks:0,remainder:0,nodes:[],patches:[],links:[],seams:[],grip:null,
    field:[],open:0,looseArea:0,clear:false,lastTear:null,groups:[],nextFragment:1,collectedFragments:[],topologyDirty:true,gas:RULES.gasStart,purge:'idle',purgeAt:null,stats:{debonded:0,tears:0,grabs:0,fragmentsCreated:0,fragmentsCollected:0,patchesCollected:0,purges:0}};
  for(let row=0;row<RULES.rows;row++)for(let col=0;col<RULES.cols;col++) {
    const patch={id:s.patches.length,row,col,ids:[],seams:[null,null,null,null],stress:0,secured:false,intake:null,fragment:key==='remnant'};
    for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]) {
      const bx=320+(col+u)*RULES.tileW,by=162+(row+v)*RULES.tileH;
      let x=bx,y=by,z=0,adhered=true;
      if(key==='corner'&&row===0&&col<2){adhered=false;z=24*(1-(col+u)/2)*(1-v);}
      if(key==='fold'&&bx>=728){x=728-(bx-728)*.97;z=(bx-728)*Math.sqrt(1-.97**2);adhered=false;}
      if(key==='remnant') {
        x+=col<3?-24:col<7?0:24;
        adhered=(col===1&&row===4||col===4&&row===1||col===5&&row===4||col===8&&row===2);
        if(!adhered)z=4+2*Math.sin((col+u)*.7+(row+v)*.8)**2;
      }
      // Uneven cohesive traction, with stronger islands and a diagonal grain.
      const strength=(900+850*(.5+.5*Math.sin(bx*.017+by*.029))
        +(col===4||col===7?650:0))*(key==='remnant'?1.25:1);
      patch.ids.push(s.nodes.length);
      s.nodes.push({id:s.nodes.length,patch:patch.id,x,y,z,vx:0,vy:0,vz:0,ax:x,ay:y,
        adhered,strength,fx:0,fy:0,fz:0});
    }
    // Edges and diagonals preserve each finite patch; no microscopic tear pieces.
    for(const [a,b] of [[0,1],[1,2],[2,3],[3,0],[0,2],[1,3]]) {
      const rest=Math.hypot(([0,1,1,0][a]-[0,1,1,0][b])*RULES.tileW,([0,0,1,1][a]-[0,0,1,1][b])*RULES.tileH);
      s.links.push({a:patch.ids[a],b:patch.ids[b],rest});
    }
    s.patches.push(patch);
  }
  function seam(a,b,sideA,sideB) {
    const id=s.seams.length,pa=s.patches[a],pb=s.patches[b];
    const pairs=sides[sideA].map((n,i)=>[pa.ids[n],pb.ids[sides[sideB][i]]]);
    const broken=key==='remnant'&&(sideA===1&&(pa.col===2||pa.col===6)||sideA===2&&pa.row===2&&pa.col<3);
    s.seams.push({id,a,b,pairs,broken,initiallyBroken:broken,stress:0,limit:RULES.tearGap*(.9+.25*(.5+.5*Math.sin(a*2.17)))});
    pa.seams[sideA]=id;pb.seams[sideB]=id;
  }
  for(const p of s.patches) {
    if(p.col<RULES.cols-1)seam(p.id,p.id+1,1,3);
    if(p.row<RULES.rows-1)seam(p.id,p.id+RULES.cols,2,0);
  }
  refreshGroups(s);if(key==='remnant')for(const g of s.groups){const id=s.nextFragment++;for(const p of g)s.patches[p].fragmentId=id;}s.stats.fragmentsCreated=key==='remnant'?s.groups.length:0;measure(s);return s;
}
export function patchCentre(s,patch) {
  const n=patch.ids.map(id=>s.nodes[id]);
  return {x:n.reduce((v,p)=>v+p.x,0)/4,y:n.reduce((v,p)=>v+p.y,0)/4,z:n.reduce((v,p)=>v+p.z,0)/4};
}
export function components(s) {
  const adjacency=s.patches.map(()=>[]);
  for(const e of s.seams)if(!e.broken&&!s.patches[e.a].secured&&!s.patches[e.b].secured){adjacency[e.a].push(e.b);adjacency[e.b].push(e.a);}
  const seen=new Set(),groups=[];
  for(const p of s.patches)if(!p.secured&&!seen.has(p.id)) {
    const group=[],queue=[p.id];seen.add(p.id);
    while(queue.length){const id=queue.pop();group.push(id);for(const n of adjacency[id])if(!seen.has(n)){seen.add(n);queue.push(n);}}
    groups.push(group);
  }return groups;
}
export function exposedEdges(s) {
  const edges=[];
  for(const p of s.patches.filter(p=>!p.secured&&!p.intake))for(let side=0;side<4;side++) {
    const seam=p.seams[side],ids=sides[side].map(i=>p.ids[i]),a=s.nodes[ids[0]],b=s.nodes[ids[1]];
    if(seam!==null&&!s.seams[seam].broken)continue;
    if(seam===null&&a.adhered&&b.adhered&&Math.max(a.z,b.z)<5)continue;
    edges.push({a:a.id,b:b.id,patch:p.id,torn:seam!==null});
  }return edges;
}
function triangleContains(x,y,a,b,c) {
  const cross=(p,q)=>(x-q.x)*(p.y-q.y)-(p.x-q.x)*(y-q.y);
  const d1=cross(a,b),d2=cross(b,c),d3=cross(c,a),area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  return Math.abs(area)>1e-6&&!((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0));
}
export function surfaceContains(x,y,points) {
  return triangleContains(x,y,points[0],points[1],points[2])||triangleContains(x,y,points[0],points[2],points[3]);
}
export function pickEdge(s,p) {
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
  let best=null;
  for(const edge of exposedEdges(s)) {
    const a=s.nodes[edge.a],b=s.nodes[edge.b],pa=project(a),pb=project(b),dx=pb.x-pa.x,dy=pb.y-pa.y;
    const t=clamp(((p.x-pa.x)*dx+(p.y-pa.y)*dy)/(dx*dx+dy*dy||1),0,1);
    const x=pa.x+t*dx,y=pa.y+t*dy,z=a.z+t*(b.z-a.z),distance=Math.hypot(p.x-x,p.y-y);
    if(distance>RULES.hitRadius)continue;
    const hidden=s.patches.some(other=>!other.secured&&!other.intake&&other.id!==edge.patch&&patchCentre(s,other).z>z+8
      &&surfaceContains(x,y,other.ids.map(id=>project(s.nodes[id]))));
    if(hidden)continue;
    if(!best||distance<best.distance-2||Math.abs(distance-best.distance)<=2&&z>best.z)best={...edge,t,x,y,z,distance};
  }
  if(!best)for(const group of s.groups) {
    if(group.some(id=>s.patches[id].intake))continue;
    for(const id of group){const patch=s.patches[id];if(patch.ids.some(n=>s.nodes[n].adhered)||patchCentre(s,patch).z<12)continue;const verts=patch.ids.map(n=>project(s.nodes[n]));
      if(!surfaceContains(p.x,p.y,verts))continue;
      const front=s.patches.some(q=>!q.secured&&q.id!==id&&patchCentre(s,q).z>patchCentre(s,patch).z+8&&surfaceContains(p.x,p.y,q.ids.map(n=>project(s.nodes[n]))));
      if(front)continue;
      const a=s.nodes[patch.ids[0]],b=s.nodes[patch.ids[2]],point=project({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2});
      best={a:a.id,b:b.id,patch:id,t:.5,x:point.x,y:point.y,z:(a.z+b.z)/2,distance:0};break;
    }
    if(best)break;
  }
  return best;
}
export function grab(s,p) {
  if(s.grip||s.toggle.grab||s.purge!=='idle')return false;
  const edge=pickEdge(s,p);if(!edge)return false;
  s.grip={...edge,offsetX:edge.x-p.x,offsetY:edge.y-p.y,depth:Math.max(RULES.handDepth,edge.z),startY:edge.y,targetX:edge.x,targetY:edge.y};
  s.stats.grabs++;s.clear=false;return true;
}
export function move(s,p) {
  if(!s.grip||!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return false;
  s.grip.targetX=clamp(p.x+s.grip.offsetX,58,1222);s.grip.targetY=clamp(p.y+s.grip.offsetY,68,659);return true;
}
export function release(s){if(!s.grip)return false;s.grip=null;measure(s);return true;}
function spring(s,aId,bId,rest,k) {
  const a=s.nodes[aId],b=s.nodes[bId];if(s.patches[a.patch].secured||s.patches[b.patch].secured)return;const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=Math.hypot(dx,dy,dz);
  if(d<1e-8)return;
  const speed=((b.vx-a.vx)*dx+(b.vy-a.vy)*dy+(b.vz-a.vz)*dz)/d;
  const f=k*(d-rest)+RULES.linkDrag*speed,fx=f*dx/d,fy=f*dy/d,fz=f*dz/d;
  a.fx+=fx;a.fy+=fy;a.fz+=fz;b.fx-=fx;b.fy-=fy;b.fz-=fz;
}
function localFlow(s,x,y) {
  if(x<SCREEN.x||x>SCREEN.x+SCREEN.w||y<SCREEN.y||y>SCREEN.y+SCREEN.h)return 0;
  const ix=clamp(Math.floor((x-SCREEN.x)/SCREEN.w*RULES.sampleCols),0,RULES.sampleCols-1);
  const iy=clamp(Math.floor((y-SCREEN.y)/SCREEN.h*RULES.sampleRows),0,RULES.sampleRows-1);
  let open=0,total=0;
  for(let v=-1;v<=1;v++)for(let u=-1;u<=1;u++){const xx=ix+u,yy=iy+v;if(xx>=0&&xx<RULES.sampleCols&&yy>=0&&yy<RULES.sampleRows){open+=s.field[yy*RULES.sampleCols+xx]?0:1;total++;}}
  return .25+.75*open/total;
}
function selfContact(s) {
  // Coarse layer contact between overlapping patch centres prevents a folded
  // flap collapsing through another layer. Not a general cloth collision engine.
  const centres=s.patches.map(p=>patchCentre(s,p));
  for(let a=0;a<s.patches.length;a++)for(let b=a+1;b<s.patches.length;b++) {
    if(s.patches[a].secured||s.patches[b].secured)continue;
    const pa=centres[a],pb=centres[b],dz=pb.z-pa.z;
    if(Math.hypot(pa.x-pb.x,pa.y-pb.y)>34||Math.abs(dz)>=6)continue;
    const sign=dz>=0?1:-1,correction=(6-Math.abs(dz))*.5;
    for(const id of s.patches[a].ids)s.nodes[id].z=Math.max(0,s.nodes[id].z-sign*correction);
    for(const id of s.patches[b].ids)s.nodes[id].z=Math.max(0,s.nodes[id].z+sign*correction);
  }
}
// Topology is rebuilt only on fracture/collection; resident objects stay bounded.
function refreshGroups(s) {
  const old=s.groups||[],next=components(s);
  for(const group of old){const children=next.filter(g=>g.some(id=>group.includes(id))).sort((a,b)=>b.length-a.length);
    if(children.length>1&&!group.some(id=>s.patches[id].intake||s.patches[id].secured)){for(const child of children.slice(1)){const fid=s.nextFragment++;for(const id of child){s.patches[id].fragment=true;s.patches[id].fragmentId=fid;}}s.stats.fragmentsCreated+=children.length-1;}
  }
  s.groups=next;s.topologyDirty=false;
}
const inRect=(p,r)=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
function receivers(s) {
  if(s.topologyDirty)refreshGroups(s);
  for(const group of s.groups){
    const patches=group.map(id=>s.patches[id]),nodes=patches.flatMap(p=>p.ids.map(id=>s.nodes[id]));
    // Intake can NEVER transmit force into adhered material.
    if(nodes.some(n=>n.adhered))continue;
    let type=patches[0].intake;
    if(!type){const r=COLLECTOR;
      if(nodes.filter(n=>inRect(project(n),r)&&n.z>12).length<Math.min(2,nodes.length))continue;
      type='collector';for(const p of patches)p.intake=type;
      if(s.grip&&group.includes(s.nodes[s.grip.a].patch))s.grip=null;
    }
    const r=COLLECTOR;
    for(const n of nodes){const v=project(n);
      // Feed towards/through the broad mouth, with spring-like guidance. The
      // receiver secures only faces which have physically crossed its lip.
      const tx=clamp(v.x,r.x+45,r.x+r.w-45),ty=r.y+r.h+65;
      n.fx+=14*(tx-.22*n.z-n.x)-7*n.vx;n.fy+=14*(ty+.45*n.z-n.y)-7*n.vy;n.fz+=12*(100-n.z)-6*n.vz;
    }
    for(const p of patches){const v=p.ids.map(id=>project(s.nodes[id]));
      const crossed=v.every(v=>v.y>r.y+18&&v.x>=r.x&&v.x<=r.x+r.w);
      if(!crossed)continue;
      p.secured=true;p.intake=null;s.stats.patchesCollected++;s.topologyDirty=true;
      for(const id of p.ids){const n=s.nodes[id];n.vx=n.vy=n.vz=0;}
    }
    for(const fid of new Set(patches.map(p=>p.fragmentId).filter(Boolean)))if(!s.collectedFragments.includes(fid)&&s.patches.filter(p=>p.fragmentId===fid).every(p=>p.secured)){s.collectedFragments.push(fid);s.stats.fragmentsCollected++;}
  }
}
export function phase(s){return s.purge==='complete'?'stable':s.purge==='running'?'purging':s.clear?'ready':'obstructed';}
export function nextTestCycle(s){
  if(s.purge!=='complete')return null;
  const keys=Object.keys(CONFIGURATIONS),next=keys[(keys.indexOf(s.configuration)+1)%keys.length];
  return createState(next,s.cycle+1);
}
export function grabToggle(s,p){
  measure(s);
  if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!s.clear||s.purge!=='idle'||s.grip||s.toggle.grab)return false;
  if(Math.abs(p.x-(TOGGLE.centreX+s.toggle.x))>TOGGLE.handleW/2+12||Math.abs(p.y-TOGGLE.handleY)>TOGGLE.handleH/2+12)return false;
  s.toggle.grab={extreme:p.x,direction:0,low:p.x,high:p.x,previous:p.x,inputX:p.x};return true;
}
export function releaseToggle(s){if(!s.toggle.grab)return false;s.toggle.grab=null;s.toggle.x=0;return true;}
export function moveToggle(s,p){
  const t=s.toggle,g=t.grab;
  if(!g||!p||!Number.isFinite(p.x)||s.purge!=='idle')return false;
  if(!s.clear){releaseToggle(s);return false;}
  // Direct mechanical response. Raw (unclipped) travel recognises gestures;
  // only the illustrated lever stops at its physical end positions.
  t.x=clamp(t.x+p.x-g.inputX,-TOGGLE.travel,TOGGLE.travel);g.inputX=p.x;
  if(!g.direction){g.low=Math.min(g.low,p.x);g.high=Math.max(g.high,p.x);if(g.high-g.low>=TOGGLE.stroke){g.direction=Math.sign(p.x-g.previous);g.extreme=p.x;}g.previous=p.x;return true;}
  g.extreme=g.direction>0?Math.max(g.extreme,p.x):Math.min(g.extreme,p.x);
  if((g.extreme-p.x)*g.direction<TOGGLE.stroke)return true;
  g.direction=-g.direction;g.extreme=p.x;
  t.reversals++;t.charge=Math.min(100,t.charge+TOGGLE.chargePerReversal);t.lastStroke=s.time;
  if(t.charge>=100){
    // Authoritative live check; no second click or release is required.
    measure(s);
    if(s.clear){releaseToggle(s);s.purge='running';s.purgeAt=s.time;s.stats.purges++;}
  }
  return true;
}
function tick(s) {
  const dt=RULES.step;s.time=++s.ticks*dt;
  // Detached material has no deliberate inward reattachment force. Natural
  // momentum/gravity remain; tearing's cost is handling separate pieces.
  const freed=new Set(s.groups.filter(g=>g.every(id=>s.patches[id].ids.every(id=>!s.nodes[id].adhered))).flat());
  for(const n of s.nodes) {
    if(s.patches[n.patch].secured)continue;
    const flow=localFlow(s,n.x,n.y);
    n.fx=0;n.fy=RULES.gravity;n.fz=freed.has(n.patch)?0:-flow*(45+100*s.open);
    if(!n.adhered&&!freed.has(n.patch))n.fz+=flow*9*Math.sin(s.time*5+n.ax*.023+n.ay*.014);
    if(n.adhered) {
      const fx=RULES.adhesionXY*(n.x-n.ax),fy=RULES.adhesionXY*(n.y-n.ay),fz=RULES.adhesionZ*Math.max(0,n.z);
      const traction=Math.hypot(fz,Math.hypot(fx,fy)/2.5);
      if(traction>n.strength){n.adhered=false;s.stats.debonded++;}
      else {n.fx-=fx;n.fy-=fy;n.fz-=fz;}
    }
  }
  for(const link of s.links)spring(s,link.a,link.b,link.rest,RULES.materialK);
  for(const seam of s.seams)if(!seam.broken&&!s.patches[seam.a].secured&&!s.patches[seam.b].secured) {
    const gap=Math.max(...seam.pairs.map(([a,b])=>length(s.nodes[a],s.nodes[b])));
    seam.stress=gap/seam.limit;
    if(gap>seam.limit) {
      seam.broken=true;s.stats.tears++;s.topologyDirty=true;
      const n=s.nodes[seam.pairs[0][0]];s.lastTear={at:s.time,x:n.x,y:n.y,z:n.z};
    }else for(const [a,b] of seam.pairs)spring(s,a,b,0,RULES.seamK);
  }
  receivers(s);
  if(s.grip) {
    const g=s.grip,a=s.nodes[g.a],b=s.nodes[g.b],u=1-g.t,v=g.t;
    // The hand moves in an inclined service plane: down lifts away from
    // the grille; sideways loads shear. Only this grabbed interpolation is driven.
    const depth=clamp(g.depth+.45*(g.targetY-g.startY),12,180);
    const x=a.x*u+b.x*v,y=a.y*u+b.y*v,z=a.z*u+b.z*v;
    let fx=RULES.gripK*(g.targetX-.22*depth-x)-RULES.gripDrag*(a.vx*u+b.vx*v);
    let fy=RULES.gripK*(g.targetY+.45*depth-y)-RULES.gripDrag*(a.vy*u+b.vy*v);
    let fz=RULES.gripK*(depth-z)-RULES.gripDrag*(a.vz*u+b.vz*v);
    const factor=Math.min(1,RULES.maxGripForce/Math.hypot(fx,fy,fz));fx*=factor;fy*=factor;fz*=factor;
    a.fx+=fx*u;a.fy+=fy*u;a.fz+=fz*u;b.fx+=fx*v;b.fy+=fy*v;b.fz+=fz*v;
  }
  const drag=Math.exp(-RULES.airDrag*dt);
  for(const n of s.nodes) {
    if(s.patches[n.patch].secured)continue;
    n.vx=(n.vx+n.fx*dt)*drag;n.vy=(n.vy+n.fy*dt)*drag;n.vz=(n.vz+n.fz*dt)*drag;
    n.x+=n.vx*dt;n.y+=n.vy*dt;n.z+=n.vz*dt;
    if(n.z>RULES.depthLimit){n.z=RULES.depthLimit;n.vz=Math.min(0,-n.vz*.1);}
    if(n.z<0){n.z=0;n.vz=Math.max(0,-n.vz*.08);n.vx*=.98;n.vy*=.98;}
    if(s.patches[n.patch].intake)continue;
    if(n.x<58){n.x=58;n.vx=Math.max(0,-n.vx*.15);}if(n.x>1222-.22*n.z){n.x=1222-.22*n.z;n.vx=Math.min(0,-n.vx*.15);}
    // The service floor is fixed in projected space, matching the top bound.
    // The v0.1 world-y floor trapped lifted material above the visible tray.
    if(n.y<68+.45*n.z){n.y=68+.45*n.z;n.vy=Math.max(0,-n.vy*.15);}if(n.y>659+.45*n.z){n.y=659+.45*n.z;n.vy=Math.min(0,-n.vy*.1);n.vx*=.95;}
  }
  if(s.ticks%2===0)selfContact(s);
  if(s.purge==='running'){
    const t=clamp((s.time-s.purgeAt)/RULES.purgeDuration,0,1),ease=t*t*(3-2*t);
    s.toggle.charge=100*(1-ease);s.gas=RULES.gasStart-RULES.gasReduction*ease;if(t>=1)s.purge='complete';
  }
  if(s.ticks%24===0)measure(s);
}
export function measure(s) {
  const cols=RULES.sampleCols,rows=RULES.sampleRows,total=cols*rows,field=new Uint8Array(total),loose=new Uint8Array(total);
  function raster(points,isLoose) {
    // Clip physical faces against the service-side clearance plane. Lifted
    // sections leave a visible gap; low parts still obstruct, including folds.
    let clipped=[];
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],inside=a.z<=RULES.clearDepth,next=b.z<=RULES.clearDepth;
      if(inside)clipped.push(a);
      if(inside!==next){const t=(RULES.clearDepth-a.z)/(b.z-a.z);clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:RULES.clearDepth});}
    }
    if(clipped.length<3)return;
    points=clipped;
    const left=clamp(Math.floor((Math.min(...points.map(p=>p.x))-SCREEN.x)/SCREEN.w*cols),0,cols-1);
    const right=clamp(Math.floor((Math.max(...points.map(p=>p.x))-SCREEN.x)/SCREEN.w*cols),0,cols-1);
    const top=clamp(Math.floor((Math.min(...points.map(p=>p.y))-SCREEN.y)/SCREEN.h*rows),0,rows-1);
    const bottom=clamp(Math.floor((Math.max(...points.map(p=>p.y))-SCREEN.y)/SCREEN.h*rows),0,rows-1);
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(points.slice(1,-1).some((_,i)=>triangleContains(SCREEN.x+(x+.5)/cols*SCREEN.w,SCREEN.y+(y+.5)/rows*SCREEN.h,points[0],points[i+1],points[i+2]))) {
      field[y*cols+x]=1;if(isLoose)loose[y*cols+x]=1;
    }
  }
  for(const p of s.patches.filter(p=>!p.secured)){const n=p.ids.map(id=>s.nodes[id]);raster(n,n.filter(n=>!n.adhered).length>=3);}
  // Intact stretched seams still contain material; cracks open only on fracture.
  for(const e of s.seams)if(!e.broken&&!s.patches[e.a].secured&&!s.patches[e.b].secured)raster([s.nodes[e.pairs[0][0]],s.nodes[e.pairs[1][0]],s.nodes[e.pairs[1][1]],s.nodes[e.pairs[0][1]]],false);
  let largest=0;const seen=new Set();
  for(let i=0;i<total;i++)if(loose[i]&&!seen.has(i)) {
    const queue=[i];seen.add(i);let area=0;
    while(queue.length){const at=queue.pop();area++;for(const next of [at-cols,at+cols,at%cols?at-1:-1,at%cols<cols-1?at+1:-1])if(next>=0&&next<total&&loose[next]&&!seen.has(next)){seen.add(next);queue.push(next);}}
    largest=Math.max(largest,area);
  }
  if(s.topologyDirty)refreshGroups(s);
  s.field=Array.from(field);s.open=1-field.reduce((a,b)=>a+b,0)/total;s.looseArea=largest/total;
  // Live geometry and collection determine readiness, independently of tear history.
  // Secured faces have crossed a real receiver lip. Statistics never grant clearance.
  s.clear=!s.grip&&s.open>=RULES.openTarget&&s.looseArea<=RULES.criticalFlap
    &&s.nodes.filter(n=>n.adhered&&!s.patches[n.patch].secured).length<=8
    &&s.patches.filter(p=>!p.secured).length<=2
    &&s.groups.every(g=>g.some(id=>s.patches[id].ids.some(n=>s.nodes[n].adhered)));
}
export function advance(s,seconds) {
  if(!Number.isFinite(seconds)||seconds<=0)return;
  s.remainder+=Math.min(seconds,.25);
  while(s.remainder+1e-10>=RULES.step){s.remainder=Math.max(0,s.remainder-RULES.step);if(s.remainder<1e-10)s.remainder=0;tick(s);}
}
