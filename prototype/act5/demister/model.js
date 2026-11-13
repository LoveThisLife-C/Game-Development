// Coarse sessile drops: conserved volume, capillary pinning, viscoelastic shape.
// The only progress is liquid physically leaving the collection surface.
export const VIEW=Object.freeze({x:140,y:50,width:950,height:680});
export const SURFACE=Object.freeze({left:205,right:935,top:105,bottom:622});
// The tip can overhang the edge slightly, so even a corner-bound fragment has
// room for a contact from above or beside it. Nothing is hidden behind a rail.
export const WORKING=Object.freeze({left:192,right:948,top:92,bottom:650});
export const RULES=Object.freeze({step:1/240,gravity:260,pinning:6000,kinetic:.74,drag:.95,
  toolRadius:10,contactK:18000,breakStrain:1.05,minVolume:49,toolResponse:180});
export const TOOL_GRAB_RADIUS=40;
export const CONDITIONS=Object.freeze({A:'SINGLE CASCADE',B:'SPLIT CHANNELS',C:'UNSTABLE HEAVY DROPS'});
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function adhesionAt(x,y){return 1+.055*Math.sin(x*.021+y*.009)+.035*Math.cos(y*.025-x*.008);}
export function axes(d){const stretch=1+2*Math.max(0,d.strain);return {a:Math.sqrt(d.volume*stretch),b:Math.sqrt(d.volume/stretch)};}
export function radiusAlong(d,nx,ny){const {a,b}=axes(d),c=Math.cos(d.angle),s=Math.sin(d.angle),u=nx*c+ny*s,v=-nx*s+ny*c;return 1/Math.sqrt(u*u/(a*a)+v*v/(b*b));}
// A wall or drain needs the whole ellipse's projected extent, not the shorter
// centre-line radius of a tilted ellipse. This keeps clearance visually true.
export function extentAlong(d,nx,ny){const {a,b}=axes(d),c=Math.cos(d.angle),s=Math.sin(d.angle);return Math.hypot(a*(nx*c+ny*s),b*(-nx*s+ny*c));}
function makeDrop(s,x,y,r){const d={id:s.nextId++,x,y,volume:r*r,vx:0,vy:0,
  strain:.025+.1*(r*RULES.gravity/(RULES.pinning*adhesionAt(x,y)))**2,angle:Math.PI/2,
  pinned:true,drained:false,cascade:null,ancestors:1,toolHits:0,fx:0,fy:0};s.drops.push(d);return d;}
export function createState(condition='A',seed=0){
 const c=Object.hasOwn(CONDITIONS,condition)?condition:'A',s={condition:c,time:0,ticks:0,remainder:0,nextId:1,drops:[],drainedVolume:0,totalVolume:0,
  tool:{x:915,y:588,vx:0,vy:0,tx:915,ty:588,held:false,offset:null,contact:false},trails:[],splashes:[],
  complete:false,completedAt:null,nextCascade:1,cascades:[],stats:{grabs:0,mergers:0,breakups:0,contactSeconds:0,distance:0}};
 // Authored clusters and downstream opportunities, never scripted flow paths.
 const lanes=c==='A'?[550]:c==='B'?[325,570,805]:[385,755];
 for(let lane=0;lane<lanes.length;lane++){
  const x=lanes[lane],r=c==='C'?20:16;
  makeDrop(s,x-21,160+lane*12,r);makeDrop(s,x+25,164+lane*12,c==='C'?17:14);
  if(c==='A')makeDrop(s,x+4,208,14);
  for(let row=0;row<(c==='A'?9:7);row++){
   const offsets=c==='A'?[0,18,-16,55,12,45,-12,62,-15]:c==='B'?[0,18,-12,28,-8,15,-19]:[0,-40,55,-25,65,-50,30];
   const y=258+row*(c==='A'?35:46)+Math.sin(row*2.1+lane)*7,dx=offsets[row]*(lane%2?-1:1);
   makeDrop(s,x+dx,y,11+row%3*2);
   if(c==='A'&&row%2===0)makeDrop(s,x+dx-42,y+15,10);
  }
 }
 // A little recoverable off-path liquid; not microscopic completion hunting.
 if(c==='A'){makeDrop(s,420,335,10);makeDrop(s,690,475,11);}
 if(c==='B'){makeDrop(s,455,370,11);makeDrop(s,680,520,10);}
 // Bounded repeatable placement variation, never a new random puzzle or liquid.
 if(seed){let n=seed>>>0;const jitter=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return (n/4294967296-.5)*8;};for(const d of s.drops){d.x+=jitter();d.y+=jitter();}}
 s.totalVolume=s.drops.reduce((v,d)=>v+d.volume,0);return s;
}
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
export function grab(s,p){const t=s.tool;if(t.held||s.complete||!valid(p)||Math.hypot(p.x-t.x,p.y-t.y)>TOOL_GRAB_RADIUS)return false;t.held=true;t.offset={x:t.x-p.x,y:t.y-p.y};s.stats.grabs++;return true;}
export function move(s,p){const t=s.tool;if(!t.held||!valid(p))return false;t.tx=clamp(p.x+t.offset.x,WORKING.left,WORKING.right);t.ty=clamp(p.y+t.offset.y,WORKING.top,WORKING.bottom);return true;}
export function hover(s,p){const t=s.tool;if(t.held||s.complete||!valid(p))return false;
 // Lifted XY carriage: free repositioning cannot move or collect any liquid.
 t.x=t.tx=clamp(p.x,WORKING.left,WORKING.right);t.y=t.ty=clamp(p.y,WORKING.top,WORKING.bottom);t.vx=t.vy=0;t.contact=false;return true;}
export function release(s){const t=s.tool,was=t.held;t.held=false;t.offset=null;t.tx=t.x;t.ty=t.y;t.vx=t.vy=0;t.contact=false;return was;}
function cascade(s,d){if(d.cascade!==null)return;d.cascade=s.nextCascade++;s.cascades.push({id:d.cascade,start:s.time,mergers:0,drained:0,peakVolume:d.volume});}
function eventFor(s,d){return d.cascade===null?null:s.cascades.find(e=>e.id===d.cascade);}
export function coalesce(s,a,b){
 const va=a.volume,vb=b.volume,v=va+vb,rv=Math.hypot(a.vx-b.vx,a.vy-b.vy),r=Math.sqrt(v);
 const d={...a,id:s.nextId++,x:(a.x*va+b.x*vb)/v,y:(a.y*va+b.y*vb)/v,volume:v,
  vx:(a.vx*va+b.vx*vb)/v,vy:(a.vy*va+b.vy*vb)/v,strain:Math.min(1.5,(a.strain*va+b.strain*vb)/v+rv*rv*r/1e6*.16+.12),
  angle:Math.atan2(b.y-a.y,b.x-a.x),pinned:false,ancestors:a.ancestors+b.ancestors,toolHits:a.toolHits+b.toolHits};
 const ca=eventFor(s,a),cb=eventFor(s,b);
 if(ca||cb){const main=ca||cb;d.cascade=main.id;main.mergers++;main.peakVolume=Math.max(main.peakVolume,v);
  if(ca&&cb&&ca!==cb){ca.mergers+=cb.mergers;ca.drained+=cb.drained;ca.start=Math.min(ca.start,cb.start);cb.mergedInto=ca.id;for(const drop of s.drops)if(drop.cascade===cb.id)drop.cascade=ca.id;}
 }
 // Replace actual contacting bodies; volume and linear momentum are conserved.
 s.drops=s.drops.filter(x=>x!==a&&x!==b);s.drops.push(d);s.stats.mergers++;return d;
}
export function split(s,d){
 if(d.volume*.45<RULES.minVolume)return false;
 const v=d.volume,r=Math.sqrt(v),v1=v*.45,v2=v-v1,dx=Math.cos(d.angle),dy=Math.sin(d.angle),sep=1.84*r,spread=Math.min(210,45+85*d.strain);
 const a={...d,id:s.nextId++,volume:v1,x:d.x-dx*sep*v2/v,y:d.y-dy*sep*v2/v,vx:d.vx-dx*spread*v2/v,vy:d.vy-dy*spread*v2/v,strain:.06,pinned:false};
 const b={...d,id:s.nextId++,volume:v2,x:d.x+dx*sep*v1/v,y:d.y+dy*sep*v1/v,vx:d.vx+dx*spread*v1/v,vy:d.vy+dy*spread*v1/v,strain:.06,pinned:false};
 s.drops=s.drops.filter(x=>x!==d);s.drops.push(a,b);s.stats.breakups++;return [a,b];
}
export function measure(s){const fraction=s.drainedVolume/s.totalVolume;
 // No real drop is ever discarded by size, percentage or numerical tolerance.
 // The tolerance is only for summation in the already-empty liquid ledger.
 const balanced=Math.abs(s.totalVolume-s.drainedVolume)<=Math.max(1e-7,s.totalVolume*1e-10);
 if(!s.complete&&s.drops.length===0&&balanced){s.complete=true;s.completedAt=s.time;s.trails=[];release(s);}return fraction;
}
function follow(position,velocity,target,dt){const w=RULES.toolResponse,e=Math.exp(-w*dt),offset=position-target,c=velocity+w*offset;
 return [target+(offset+c*dt)*e,(velocity-w*c*dt)*e];}
function constrain(d){const ex=extentAlong(d,1,0),ey=extentAlong(d,0,1);
 if(d.x-ex<SURFACE.left){d.x=SURFACE.left+ex;d.vx=Math.abs(d.vx)*.12;}
 if(d.x+ex>SURFACE.right){d.x=SURFACE.right-ex;d.vx=-Math.abs(d.vx)*.12;}
 if(d.y-ey<SURFACE.top){d.y=SURFACE.top+ey;d.vy=Math.abs(d.vy)*.12;}
}
function physics(s,dt){s.time+=dt;s.ticks++;const t=s.tool;
 const oldX=t.x,oldY=t.y;
 if(t.held){[t.x,t.vx]=follow(t.x,t.vx,t.tx,dt);[t.y,t.vy]=follow(t.y,t.vy,t.ty,dt);}
 t.x=clamp(t.x,WORKING.left,WORKING.right);t.y=clamp(t.y,WORKING.top,WORKING.bottom);t.contact=false;
 if(t.held)s.stats.distance+=Math.hypot(t.x-oldX,t.y-oldY);
 for(const d of s.drops){const r=Math.sqrt(d.volume);d.fx=-RULES.drag*d.volume*d.vx;d.fy=d.volume*RULES.gravity-RULES.drag*d.volume*d.vy;
  let cx=t.x,cy=t.y;
  // Swept entry contact prevents a fast, precise stroke skipping a small drop.
  const sx=t.x-oldX,sy=t.y-oldY,len=Math.hypot(sx,sy);
  if(t.held&&len>1e-8){const ux=sx/len,uy=sy/len,along=(d.x-oldX)*ux+(d.y-oldY)*uy,
    across=(d.x-oldX)*uy-(d.y-oldY)*ux,r=RULES.toolRadius+radiusAlong(d,ux,uy);
   if(Math.abs(across)<r){const entry=along-Math.sqrt(r*r-across*across);
    if(entry>=0&&entry<=len){const at=Math.min(len,entry+Math.min(len-entry,r*.6));cx=oldX+ux*at;cy=oldY+uy*at;}}
  }
  const dx=d.x-cx,dy=d.y-cy,dist=Math.hypot(dx,dy)||1,nx=dx/dist,ny=dy/dist,extent=radiusAlong(d,nx,ny),over=RULES.toolRadius+extent-dist;
  const restStrain=.025+.1*(r*RULES.gravity/(RULES.pinning*adhesionAt(d.x,d.y)))**2;
  d.strain+=(restStrain-d.strain)*(1-Math.exp(-dt/(.16*(r/14)**1.5)));
  if(t.held&&over>0){const relative=(d.vx-t.vx)*nx+(d.vy-t.vy)*ny,f=clamp(RULES.contactK*over-relative*90,0,650000);
   d.fx+=nx*f;d.fy+=ny*f;t.vx-=nx*f/950*dt;t.vy-=ny*f/950*dt;t.contact=true;d.toolHits++;
   // Capillary stretching is driven by actual relative contact speed (Weber-like).
   const speed=Math.hypot(t.vx-d.vx,t.vy-d.vy),weber=speed*speed*r/1e6;
   // Fracture is resolved this step; unresolved high-speed input cannot create
   // an infinitely long ellipse before daughters are formed.
   d.strain=Math.min(1.6,d.strain+dt*(Math.max(0,weber-.25)*8+Math.min(.6,over/r)));
   if(speed>15)d.angle=Math.atan2(t.vy-d.vy,t.vx-d.vx);
  }else if(Math.hypot(d.vx,d.vy)>20){const target=Math.atan2(d.vy,d.vx);d.angle+=Math.atan2(Math.sin(target-d.angle),Math.cos(target-d.angle))*dt*5;d.strain+=dt*Math.min(.4,Math.hypot(d.vx,d.vy)/800);}
  const wetHeight=extentAlong(d,0,1),contactFraction=clamp((SURFACE.bottom-(d.y-wetHeight))/(2*wetHeight),0,1),pin=RULES.pinning*r*adhesionAt(d.x,d.y)*contactFraction;
  d.pinning=pin;
  const force=Math.hypot(d.fx,d.fy),speed=Math.hypot(d.vx,d.vy);
  if(speed<4&&force<=pin){d.vx=0;d.vy=0;d.pinned=true;}
  else{d.pinned=false;const ux=speed>4?d.vx/speed:d.fx/force,uy=speed>4?d.vy/speed:d.fy/force;
   d.fx-=pin*RULES.kinetic*ux;d.fy-=pin*RULES.kinetic*uy;
   d.vx+=d.fx/d.volume*dt;d.vy+=d.fy/d.volume*dt;
   // Avoid discrete friction reversing an almost-stopped small drop.
   if(speed<4&&force<=pin){d.vx=0;d.vy=0;d.pinned=true;}
   d.x+=d.vx*dt;d.y+=d.vy*dt;
  }
  constrain(d);
  if(!d.pinned&&d.volume*RULES.gravity>pin&&d.vy>12)cascade(s,d);
 }
 if(t.contact)s.stats.contactSeconds+=dt;
 // Contacts only: there is no attraction or invisible collection radius.
 let changed=true,passes=0;while(changed&&passes++<4){changed=false;outer:for(let i=0;i<s.drops.length;i++)for(let j=i+1;j<s.drops.length;j++){
  const a=s.drops[i],b=s.drops[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.001;
  if(d<=radiusAlong(a,dx/d,dy/d)+radiusAlong(b,-dx/d,-dy/d)){coalesce(s,a,b);changed=true;break outer;}
 }}
 for(const d of [...s.drops])if(d.strain>RULES.breakStrain)split(s,d);
 // A newly formed ellipse/daughter obeys those same walls immediately.
 for(const d of s.drops)constrain(d);
 for(const d of [...s.drops])if(d.y-extentAlong(d,0,1)>SURFACE.bottom){s.drainedVolume+=d.volume;const event=eventFor(s,d);if(event)event.drained+=d.volume;
  s.splashes.push({x:d.x,volume:d.volume,time:s.time});s.drops=s.drops.filter(x=>x!==d);
 }
 if(s.ticks%12===0)for(const d of s.drops)if(!d.pinned&&Math.hypot(d.vx,d.vy)>35)s.trails.push({x:d.x,y:d.y,r:Math.min(8,Math.sqrt(d.volume)*.16),time:s.time});
 s.trails=s.trails.filter(p=>s.time-p.time<.7).slice(-180);s.splashes=s.splashes.filter(p=>s.time-p.time<.65).slice(-12);measure(s);
}
export function usefulCascades(s){return s.cascades.filter(e=>!e.mergedInto&&e.mergers>=2&&e.drained>=s.totalVolume*.12).length;}
export function step(s,elapsed){if(!Number.isFinite(elapsed)||elapsed<=0)return;s.remainder+=Math.min(elapsed,.12);while(s.remainder>=RULES.step-1e-10){physics(s,RULES.step);s.remainder-=RULES.step;}}
