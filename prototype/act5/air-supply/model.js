import {damageLeaks,DAMAGE_STAGES} from './damage.js';
// Three deformable gas envelopes. Fixed-step position-based dynamics; no puzzle slots.
export const WORLD=Object.freeze({width:1280,height:720});
export const VIEW=Object.freeze({x:0,y:100,width:1280,height:540});
export const CHAMBER=Object.freeze({left:140,right:1140,top:170,bottom:570,inletTop:292,inletBottom:448});
export const RULES=Object.freeze({step:1/180,particles:24,iterations:7,minRadius:43,maxRadius:145,inflationRate:.26,ventRate:.34,drag:3.2,retention:16,grabForce:75,maxAcceleration:6500});
// Shared geometric flow rules; no stage-dependent losses. Leakage aperture is
// measured in the same cross-section units as the 156-unit inlet.
export const FLOW_RULES=Object.freeze({sealCoverage:.8,leakConductance:.5,usableStraight:96});
export const LEAKS=Object.freeze(damageLeaks(0));
export {damageLeaks,DAMAGE_STAGES};
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function centre(body){const n=body.nodes.length;return {x:body.nodes.reduce((s,p)=>s+p.x,0)/n,y:body.nodes.reduce((s,p)=>s+p.y,0)/n};}
export function area(nodes){let a=0;for(let i=0;i<nodes.length;i++){const p=nodes[i],q=nodes[(i+1)%nodes.length];a+=p.x*q.y-q.x*p.y;}return a*.5;}
export function radius(body){return RULES.minRadius+(RULES.maxRadius-RULES.minRadius)*body.inflation;}
export function createState(stage=0){if(!Number.isInteger(stage)||stage<0||stage>2)throw Error('Unknown damage stage');const poses=[[487,329,.20],[633,329,.20],[565,465,.48]];const cushions=poses.map(([x,y,inflation],id)=>{const r=RULES.minRadius+(RULES.maxRadius-RULES.minRadius)*inflation;return {id,inflation,anchor:{x,y},nodes:Array.from({length:RULES.particles},(_,i)=>{const a=i*2*Math.PI/RULES.particles;return {x:x+r*Math.cos(a),y:y+r*Math.sin(a),vx:0,vy:0};}),contacts:0};});
 const s={stage,intervention:1,maxRepeats:0,target:DAMAGE_STAGES[stage].target,leaks:damageLeaks(stage),creep:null,restoredAt:null,time:0,remainder:0,cushions,selected:0,grip:null,valve:null,metrics:null,settled:0,complete:false,stats:{grabs:0,contacts:0}};measure(s);return s;}
export function inside(p,nodes){let yes=false;for(let i=0,j=nodes.length-1;i<nodes.length;j=i++){const a=nodes[i],b=nodes[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
export function nearest(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);const x=a.x+t*dx,y=a.y+t*dy;return {x,y,t,distance:Math.hypot(p.x-x,p.y-y)};}
export function selectAt(s,p){for(let i=s.cushions.length-1;i>=0;i--){const b=s.cushions[i];if(inside(p,b.nodes)||b.nodes.some(n=>Math.hypot(n.x-p.x,n.y-p.y)<18))return i;}return null;}
// Preserve the retention sling offset on regrip. A sideways drag must not
// silently release compression against a wall.
export function grab(s,p){if(s.complete||s.valve||s.grip)return false;const id=selectAt(s,p);if(id===null)return false;const anchor=s.cushions[id].anchor;s.selected=id;s.grip={id,start:{...p},moved:false,offset:{x:anchor.x-p.x,y:anchor.y-p.y},target:{...anchor}};s.stats.grabs++;return true;}
export function move(s,p){if(!s.grip||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;if(!s.grip.moved&&Math.hypot(p.x-s.grip.start.x,p.y-s.grip.start.y)<3)return;s.grip.moved=true;s.grip.target={x:clamp(p.x+s.grip.offset.x,CHAMBER.left+25,CHAMBER.right-25),y:clamp(p.y+s.grip.offset.y,CHAMBER.top+25,CHAMBER.bottom-25)};}
export function release(s){if(s.grip){if(s.grip.moved)s.cushions[s.grip.id].anchor={...s.grip.target};s.grip=null;}s.valve=null;}
export function setValve(s,mode){if(s.complete||s.grip||s.valve||!['inflate','vent'].includes(mode))return false;s.valve={id:s.selected,mode};return true;}
function distanceConstraint(a,b,target,k){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.001,c=(d-target)/d*.5*k;a.x+=dx*c;a.y+=dy*c;b.x-=dx*c;b.y-=dy*c;}
function envelope(b){const n=b.nodes.length,r=radius(b),edge=2*r*Math.sin(Math.PI/n),bend=2*r*Math.sin(2*Math.PI/n);
 for(let i=0;i<n;i++)distanceConstraint(b.nodes[i],b.nodes[(i+1)%n],edge,.60);
 for(let i=0;i<n;i++)distanceConstraint(b.nodes[i],b.nodes[(i+2)%n],bend,.065);
 // Polygon area is gas volume in this 2-D section. Pressure acts on its boundary normals.
 const target=n*.5*r*r*Math.sin(2*Math.PI/n),a=area(b.nodes),grads=b.nodes.map((p,i)=>{const prev=b.nodes[(i+n-1)%n],next=b.nodes[(i+1)%n];return {x:(next.y-prev.y)*.5,y:(prev.x-next.x)*.5};});
 const norm=grads.reduce((sum,g)=>sum+g.x*g.x+g.y*g.y,0),lambda=clamp((target-a)/(norm||1)*.16,-1.8,1.8);
 for(let i=0;i<n;i++){b.nodes[i].x+=grads[i].x*lambda;b.nodes[i].y+=grads[i].y*lambda;}
}
function walls(b){for(const p of b.nodes){p.x=clamp(p.x,CHAMBER.left+2,CHAMBER.right-2);p.y=clamp(p.y,CHAMBER.top+2,CHAMBER.bottom-2);}}
function collide(a,b){let contacts=0;
 for(const p of a.nodes){if(!inside(p,b.nodes))continue;let hit=null;
  for(let j=0;j<b.nodes.length;j++){const q=nearest(p,b.nodes[j],b.nodes[(j+1)%b.nodes.length]);if(!hit||q.distance<hit.distance)hit={...q,j};}
  const q=b.nodes[hit.j],r=b.nodes[(hit.j+1)%b.nodes.length],ex=r.x-q.x,ey=r.y-q.y,len=Math.hypot(ex,ey)||1;
  // CCW polygon in screen coordinates: (dy,-dx) is the outward normal.
  const nx=ey/len,ny=-ex/len,depth=hit.distance+1.4,w0=1-hit.t,w1=hit.t,den=1+w0*w0+w1*w1;
  const shift=Math.min(12,depth)/den;p.x+=nx*shift;p.y+=ny*shift;q.x-=nx*shift*w0;q.y-=ny*shift*w0;r.x-=nx*shift*w1;r.y-=ny*shift*w1;contacts++;
 }
 return contacts;
}
function step(s){const dt=RULES.step;s.time+=dt;
 advanceCreep(s,dt);
 if(s.valve){const b=s.cushions[s.valve.id];b.inflation=clamp(b.inflation+(s.valve.mode==='inflate'?RULES.inflationRate:-RULES.ventRate)*dt,0,1);}
 const old=s.cushions.map(b=>b.nodes.map(p=>({x:p.x,y:p.y})));
 for(const b of s.cushions){b.contacts=0;const c=centre(b),held=s.grip?.id===b.id&&s.grip.moved,target=held?s.grip.target:b.anchor,k=held?RULES.grabForce:RULES.retention;let ax=(target.x-c.x)*k,ay=(target.y-c.y)*k;const force=Math.hypot(ax,ay),scale=Math.min(1,RULES.maxAcceleration/(force||1));ax*=scale;ay*=scale;
  for(const p of b.nodes){p.vx=(p.vx+ax*dt)*Math.exp(-RULES.drag*dt);p.vy=(p.vy+ay*dt)*Math.exp(-RULES.drag*dt);p.x+=p.vx*dt;p.y+=p.vy*dt;}
 }
 for(let k=0;k<RULES.iterations;k++){
  for(const b of s.cushions)envelope(b);
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){const a=s.cushions[i],b=s.cushions[j];const n=collide(a,b)+collide(b,a);a.contacts+=n;b.contacts+=n;}
  for(const b of s.cushions)walls(b);
 }
 for(let j=0;j<3;j++)for(let i=0;i<RULES.particles;i++){const p=s.cushions[j].nodes[i],q=old[j][i];p.vx=clamp((p.x-q.x)/dt,-700,700);p.vy=clamp((p.y-q.y)/dt,-700,700);}
 s.stats.contacts+=s.cushions.reduce((n,b)=>n+b.contacts,0);
 // Sampling is instrumentation only; forces run at every fixed substep.
 if(Math.round(s.time/dt)%90===0){
  measure(s);
  if(!s.complete){
   if(s.metrics.ready&&s.metrics.motion<=12&&!s.creep&&!s.grip?.moved)s.settled+=.1;else s.settled=0;
   if(s.settled>=1-1e-8){s.complete=true;s.restoredAt=s.time;release(s);}
  }
  if(!s.metrics.ready){s.complete=false;s.settled=0;s.restoredAt=null;}
 }
}
export function advance(s,seconds){if(!Number.isFinite(seconds)||seconds<0)return;s.remainder+=seconds;let count=Math.floor((s.remainder+1e-10)/RULES.step);s.remainder-=count*RULES.step;while(count-->0)step(s);}
export function leakCoverage(s,leak){return leak.samples.reduce((n,p)=>n+(s.cushions.some(b=>inside(p,b.nodes))?1:0),0)/leak.samples.length;}
export const leakState=coverage=>coverage>=FLOW_RULES.sealCoverage?'SEALED':coverage>=.4?'PARTIAL':'LEAKING';
export function measure(s){
 const leaks=s.leaks.map(l=>leakCoverage(s,l)),flow=passage(s),sealed=leaks.reduce((a,b)=>a+b,0)/leaks.length;
 const port=CHAMBER.inletBottom-CHAMBER.inletTop;
 // Absolute uncovered seam length, not mean percentage: enlarging untreated
 // damage can never improve delivery at identical cushion geometry.
 const uncovered=s.leaks.reduce((n,l,i)=>n+l.width*(1-leaks[i]),0);
 const leakage=clamp(uncovered*FLOW_RULES.leakConductance/port,0,1);
 const supply=flow.capacity*(1-leakage),nodes=s.cushions.flatMap(b=>b.nodes),previous=s.motionSample,elapsed=s.time-(previous?.time??s.time);
 // Judge visible settling across the 100ms observation interval. Instantaneous
 // PBD contact correction velocities can spike while the actual skin barely moves.
 const shapeMotion=previous&&elapsed>1e-8?Math.sqrt(nodes.reduce((n,p,i)=>n+(p.x-previous.points[i].x)**2+(p.y-previous.points[i].y)**2,0)/nodes.length)/elapsed:0;
 const motion=elapsed>1e-8?shapeMotion:(s.metrics?.motion??0);
 if(!previous||elapsed>=.05)s.motionSample={time:s.time,points:nodes.map(p=>({x:p.x,y:p.y}))};
 const constriction=1-clamp(flow.width/port,0,1),diversion=(1-constriction)*(1-flow.efficiency),leakageLoss=flow.capacity*leakage;
 s.metrics={losses:{constriction,diversion,leakage:leakageLoss},streamlines:flow.streamlines,deflection:flow.deflection,routeLength:flow.length,leaks,leakStates:leaks.map(leakState),sealed,uncovered,leakage,passage:flow.width,flow:flow.capacity,path:flow.path,route:flow.mode,efficiency:flow.efficiency,straightWidth:flow.straightWidth,straightBand:flow.straightBand,supply,motion,ready:leaks.every(v=>v>=FLOW_RULES.sealCoverage)&&supply+1e-9>=s.target};return s.metrics;
}
export function nextDamageStage(s){
 if(!s.complete)return false;
 release(s);const previous=s.stage;s.stage=Math.min(2,s.stage+1);s.intervention++;s.target=DAMAGE_STAGES[s.stage].target;s.leaks=damageLeaks(s.stage);s.settled=0;s.complete=false;s.restoredAt=null;
 if(previous===2){
  // At maximum wear the same damaged sealing land yields; only contact preload
  // relaxes. Apply a bounded change gradually, never teleport the material.
  const ranking=[0,1,2].sort((a,b)=>s.metrics.leaks[a]-s.metrics.leaks[b]),leak=ranking[s.maxRepeats++%3];
  const site=s.leaks[leak],body=s.cushions.map(b=>({b,n:site.samples.filter(p=>inside(p,b.nodes)).length})).sort((a,b)=>b.n-a.n)[0].b;
  const midpoint=site.samples.reduce((n,p)=>n+p.x,0)/site.samples.length,offset=centre(body).x-midpoint;
  const direction=Math.abs(offset)<3?(s.intervention%2?1:-1):Math.sign(offset);
  s.creep={id:body.id,remaining:1.5,duration:1.5,dx:direction*24,dy:site.side==='top'?5:-5,loss:.065};
 }
 measure(s);return true;
}
function advanceCreep(s,dt){
 if(!s.creep)return;const c=s.creep,b=s.cushions[c.id],fraction=Math.min(dt,c.remaining)/c.duration;
 b.anchor.x=clamp(b.anchor.x+c.dx*fraction,CHAMBER.left+25,CHAMBER.right-25);b.anchor.y=clamp(b.anchor.y+c.dy*fraction,CHAMBER.top+25,CHAMBER.bottom-25);
 b.inflation=clamp(b.inflation-c.loss*fraction,0,1);c.remaining-=dt;if(c.remaining<=1e-8)s.creep=null;
}
// A full-width horizontal strip is clear iff it misses every polygon's vertical
// projection. This is exact for our contained polygons, not a raster estimate.
export function straightPassage(s){
 const top=CHAMBER.inletTop,bottom=CHAMBER.inletBottom;
 const blocked=s.cushions.map(b=>[Math.min(...b.nodes.map(p=>p.y)),Math.max(...b.nodes.map(p=>p.y))]).sort((a,b)=>a[0]-b[0]);
 let start=top,best={top,bottom:top,width:0};
 for(const [a,b] of [...blocked,[bottom,bottom]]){
  const end=Math.min(bottom,a);if(end>start&&end-start>best.width)best={top:start,bottom:end,width:end-start};
  start=Math.max(start,b);if(start>=bottom)break;
 }
 return best;
}
// One routed stream tube. Its centreline and width both come from the same
// polygon clearance field. There is no separate straight-line scoring shortcut.
function pointClearance(s,p){
 let gap=Math.min(p.y-CHAMBER.top,CHAMBER.bottom-p.y);
 for(const b of s.cushions){if(inside(p,b.nodes))return 0;for(let i=0;i<b.nodes.length;i++)gap=Math.min(gap,nearest(p,b.nodes[i],b.nodes[(i+1)%b.nodes.length]).distance);}
 return gap;
}
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function segmentClearance(s,a,b){
 let gap=Math.min(a.y-CHAMBER.top,b.y-CHAMBER.top,CHAMBER.bottom-a.y,CHAMBER.bottom-b.y);
 for(const body of s.cushions){if(inside(a,body.nodes)||inside(b,body.nodes))return 0;
  for(let i=0;i<body.nodes.length;i++){const c=body.nodes[i],d=body.nodes[(i+1)%body.nodes.length];
   if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;
   gap=Math.min(gap,nearest(a,c,d).distance,nearest(b,c,d).distance,nearest(c,a,b).distance,nearest(d,a,b).distance);
  }
 }
 return gap;
}
export function passage(s){
 const band=straightPassage(s),cell=10,nx=(CHAMBER.right-CHAMBER.left)/cell+1,ny=(CHAMBER.bottom-CHAMBER.top)/cell+1;
 const mid=(CHAMBER.inletTop+CHAMBER.inletBottom)/2,port=CHAMBER.inletBottom-CHAMBER.inletTop,entry=Math.round((mid-CHAMBER.top)/cell);
 const point=(x,y)=>({x:CHAMBER.left+x*cell,y:CHAMBER.top+y*cell}),clear=new Float64Array(nx*ny);
 // A full port-width tube on the fixed port centreline needs no detour. This
 // proof uses whole-segment polygon clearance, not an arbitrary free strip.
 if(segmentClearance(s,point(0,entry),point(nx-1,entry))>=port/2)return describeRoute(s,Array.from({length:nx},(_,x)=>point(x,entry)),band);
 for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)clear[x*ny+y]=pointClearance(s,point(x,y));
 function routeTube(centredOnly){
 // Widest forward-connected tube. Adjacent endpoints minus half their
 // separation conservatively bound clearance over the entire connecting edge.
 const portRadius=y=>Math.max(0,Math.min(CHAMBER.top+y*cell-CHAMBER.inletTop,CHAMBER.inletBottom-CHAMBER.top-y*cell));
 let widths=new Float64Array(ny);for(let y=0;y<ny;y++)if(!centredOnly||y===entry)widths[y]=Math.min(portRadius(y),clear[y]);
 for(let x=1;x<nx;x++){
  const next=new Float64Array(ny);
  for(let y=1;y<ny-1;y++)for(let dy=-1;dy<=1;dy++){
   const py=y+dy;if(py<0||py>=ny||widths[py]<=0)continue;
   const edge=Math.min(clear[(x-1)*ny+py],clear[x*ny+y])-cell*Math.hypot(1,dy)/2;
   next[y]=Math.max(next[y],Math.min(widths[py],edge));
  }
  widths=next;
 }
 const radius=centredOnly?widths[entry]:Math.max(...widths.map((v,y)=>Math.min(v,portRadius(y))));
 if(radius<=0)return {width:0,path:[],streamlines:[],capacity:0,efficiency:0,mode:'BLOCKED',deflection:0,length:0,straightWidth:band.width,straightBand:band};
 // Among routes supporting that tube choose a short, centrally biased path.
 // The bias only selects geometry; delivered efficiency uses actual length.
 const previous=new Int16Array(nx*ny).fill(-1);let costs=new Float64Array(ny).fill(Infinity);for(let y=0;y<ny;y++)if((!centredOnly||y===entry)&&portRadius(y)>=radius&&clear[y]>=radius)costs[y]=.015*Math.abs(point(0,y).y-mid);
 for(let x=1;x<nx;x++){
  const next=new Float64Array(ny).fill(Infinity);
  for(let y=1;y<ny-1;y++)for(let dy=-1;dy<=1;dy++){
   const py=y+dy;if(py<0||py>=ny||!Number.isFinite(costs[py]))continue;
   const edge=Math.min(clear[(x-1)*ny+py],clear[x*ny+y])-cell*Math.hypot(1,dy)/2;
   if(edge+1e-7<radius)continue;
   const cost=costs[py]+cell*Math.hypot(1,dy)+.015*Math.abs(point(x,y).y-mid);
   if(cost<next[y]){next[y]=cost;previous[x*ny+y]=py;}
  }
  costs=next;
 }
 let exit=-1;for(let y=0;y<ny;y++)if((!centredOnly||y===entry)&&portRadius(y)>=radius&&(exit<0||costs[y]<costs[exit]))exit=y;
 const path=[];for(let x=nx-1,y=exit;x>=0;x--){path.push(point(x,y));if(x)y=previous[x*ny+y];}path.reverse();
 // Relax grid corners within the ACTUAL safe tube. Check full segments, not
 // just vertices, so the renderer cannot cut through a cushion at a bend.
 for(let pass=0;pass<4;pass++)for(let i=1;i<path.length-1;i++){
  const p={x:path[i].x,y:(path[i-1].y+2*path[i].y+path[i+1].y)/4};
  if(segmentClearance(s,path[i-1],p)>=radius&&segmentClearance(s,p,path[i+1])>=radius)path[i]=p;
 }
 return describeRoute(s,path,band);
 }
 const routed=routeTube(false);
 // The conservative grid can tie routes that have different exact capacity.
 // Compare the centred candidate with the same actual tube/streamline score;
 // an off-centre port must not discard a better physically available route.
 if(routed.path.length&&(routed.path[0].y!==mid||routed.path.at(-1).y!==mid)){
  const centred=routeTube(true);if(centred.capacity>routed.capacity)return centred;
 }
 return routed;
}
function describeRoute(s,path,band){
 const port=CHAMBER.inletBottom-CHAMBER.inletTop,mid=(CHAMBER.inletTop+CHAMBER.inletBottom)/2;
 const portClear=p=>Math.min(p.y-CHAMBER.inletTop,CHAMBER.inletBottom-p.y);
 let actual=Math.min(port/2,portClear(path[0]),portClear(path.at(-1))),length=0;const gaps=[];for(let i=1;i<path.length;i++){const gap=segmentClearance(s,path[i-1],path[i]);gaps.push(gap);actual=Math.min(actual,gap);length+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);}
 const width=actual*2,centreDeflection=Math.max(...path.map(p=>Math.abs(p.y-mid)));
 const streamlines=[-.82,0,.82].map(f=>path.map((p,i)=>{const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy);const local=Math.min(port/2,gaps[Math.max(0,i-1)],gaps[Math.min(gaps.length-1,i)],i===0?portClear(p):Infinity,i===path.length-1?portClear(p):Infinity);return {x:p.x-dy/n*local*f,y:p.y+dx/n*local*f};}));
 // Include contraction/expansion curvature of the outer streamlines as well
 // as the centreline. These are exactly the paths presented by the renderer.
 const lengths=streamlines.map(line=>line.reduce((n,p,i)=>i?n+Math.hypot(p.x-line[i-1].x,p.y-line[i-1].y):0,0));
 const meanLength=lengths.reduce((n,v)=>n+v,0)/lengths.length,efficiency=(CHAMBER.right-CHAMBER.left)/meanLength;
 const deflection=Math.max(...streamlines.flatMap(line=>line.map(p=>{const a=line[0],b=line.at(-1),t=(p.x-a.x)/(b.x-a.x);return Math.abs(p.y-(a.y+(b.y-a.y)*t));})));
 return {width,path,streamlines,length:meanLength,centreLength:length,centreDeflection,deflection,efficiency,capacity:clamp(width/port,0,1)*efficiency,mode:deflection<=12?'STRAIGHT':'DIVERTED',straightWidth:band.width,straightBand:band};
}
