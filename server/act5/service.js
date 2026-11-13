import {cells,fractureLength,fractures,panels,panelLengths} from '../../prototype/act5/service-geometry.js';
export function createService(config){return {remaining:config.serviceCapacity,capacity:config.serviceCapacity,coverage:cells.map(()=>0),activePanel:0,perPanel:panels.map(()=>0),activeTracingTime:0,elapsedInStation:0,exhausted:false,complete:false,generation:0,gesture:null,credit:.12,lastCreditAt:0,deposits:[],serial:0};}
export function cancelService(state){state.service.gesture=null;state.service.generation++;}
export function serviceMetrics(state){const sum=fractures.map(()=>0),length=fractures.map(()=>0);for(let i=0;i<cells.length;i++){const c=cells[i];sum[c.fracture]+=c.length*state.service.coverage[i];length[c.fracture]+=c.length;}const coverage=state.service.complete?1:Math.min(1,sum.reduce((a,b)=>a+b,0)/fractureLength);const perPanel=panels.map(p=>Math.min(1,fractures.filter(f=>f.panel===p.id).reduce((n,f)=>n+sum[f.id],0)/panelLengths[p.id]));return {perPanel,coverage,unsealedFraction:Math.max(0,1-coverage),perFracture:sum.map((v,i)=>Math.min(1,v/length[i]))};}
export function serviceView(state){const s=state.service;return {activePanel:s.activePanel,activeTracingTime:s.activeTracingTime,elapsedInStation:s.elapsedInStation,exhausted:s.exhausted,totalPathLength:fractureLength,remaining:s.remaining,capacity:s.capacity,coverage:[...s.coverage],complete:s.complete,generation:s.generation,deposits:s.deposits.filter(d=>d.panel===s.activePanel),...serviceMetrics(state),cells:[...s.coverage]};}
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=800&&p.y>=0&&p.y<=520;
export function serviceError(state,player,a){const s=state.service,fail=(code,message)=>({code,message});
 if(state.stations.SERVICE_SEAL!==player)return fail('NOT_OWNER','Enter Service Seal to dispense');
 if(state.status!=='running')return fail('SESSION_NOT_RUNNING','Dispensing requires a running session');
 if(a.type==='service_select')return Number.isInteger(a.panel)&&a.panel>=0&&a.panel<panels.length?null:fail('INVALID_SERVICE_PANEL','Unknown service panel');
 if(a.generation!==s.generation)return fail('STALE_SERVICE_GESTURE','Application cancelled; begin a fresh stroke');
 if(a.type==='service_end')return !s.gesture||a.gesture===s.gesture.id?null:fail('STALE_SERVICE_SEGMENT','Release belongs to an older stroke');
 if(s.complete||s.remaining<=0)return fail('SERVICE_UNAVAILABLE',s.complete?'Service penetrations sealed':'Sealant depleted');
 if(a.type==='service_begin')return !s.gesture&&typeof a.gesture==='string'&&a.gesture.length<=80&&validPoint(a.point)?null:fail('INVALID_SERVICE_BEGIN','Invalid or overlapping application stroke');
 // A dry reposition can skip rejected/unobserved indices, but never replay one.
 if(a.type==='service_reanchor')return s.gesture&&a.gesture===s.gesture.id&&validPoint(a.point)&&Number.isSafeInteger(a.index)&&a.index>=s.gesture.index&&a.index<=1e9?null:fail('STALE_SERVICE_SEGMENT','Dry reposition is stale or invalid');
 if(!s.gesture||a.gesture!==s.gesture.id||a.index!==s.gesture.index)return fail('STALE_SERVICE_SEGMENT','Application segment is stale or out of sequence');
 if(!Array.isArray(a.points)||a.points.length<1||a.points.length>5)return fail('INVALID_SERVICE_SEGMENT','Expected 1–5 bounded samples');
 let prev=s.gesture.point,total=0;
 for(const p of a.points){if(!validPoint(p)||!Number.isFinite(p.dt)||p.dt<.025||p.dt>.12||Math.hypot(p.x-prev.x,p.y-prev.y)/p.dt>2000)return fail('INVALID_SERVICE_SEGMENT','Implausible position, duration or speed');total+=p.dt;prev=p;}
 if(total>.3||total>Math.min(.25,s.credit+Math.max(0,state.elapsed-s.lastCreditAt))+1e-8)return fail('SERVICE_TIME_BUDGET','Samples exceed elapsed authoritative application time');
 return null;
}
export function applyService(state,a){const s=state.service,c=state.config;
 if(a.type==='service_select'){cancelService(state);s.activePanel=a.panel;return;}
 if(a.type==='service_end'){s.gesture=null;return;}
 if(a.type==='service_begin'){s.gesture={id:a.gesture,stroke:s.serial+1,index:0,point:a.point};return;}
 if(a.type==='service_reanchor'){
  // Drop missed time; retain only existing bounded credit, never mint it.
  s.credit=Math.min(.12,s.credit+Math.max(0,state.elapsed-s.lastCreditAt));s.lastCreditAt=state.elapsed;
  s.gesture.point=a.point;s.gesture.index=a.index+1;s.gesture.stroke=s.serial+1;return;
 }

 s.credit=Math.min(.25,s.credit+Math.max(0,state.elapsed-s.lastCreditAt));s.lastCreditAt=state.elapsed;
 let from=s.gesture.point;
 for(const p of a.points){const dt=Math.min(p.dt,s.remaining/c.serviceConsumption),ratio=dt/p.dt,to={x:from.x+(p.x-from.x)*ratio,y:from.y+(p.y-from.y)*ratio},speed=Math.hypot(p.x-from.x,p.y-from.y)/p.dt;
  s.credit-=p.dt;s.activeTracingTime+=dt;s.remaining=Math.max(0,s.remaining-dt*c.serviceConsumption);
  const steps=Math.ceil(dt/.005);for(let j=0;j<steps;j++){const t=(j+.5)/steps,x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t;
   for(let i=0;i<cells.length;i++){const cell=cells[i];if(cell.panel!==s.activePanel)continue;const distance=Math.hypot(x-cell.x,y-cell.y),radius=c.serviceTolerance+cell.width/2;
    if(distance<=radius)s.coverage[i]=Math.min(1,s.coverage[i]+c.serviceApplication*dt/steps*Math.min(1,c.serviceMaxSpeed/Math.max(1,speed))*(1-.35*distance/radius));
   }
  }
  if(dt>0)s.deposits.push({panel:s.activePanel,stroke:s.gesture.stroke,gesture:s.gesture.id,sample:s.gesture.index,id:++s.serial,x:from.x,y:from.y,x2:to.x,y2:to.y,thickness:Math.min(16,3+dt*60)*Math.min(1,c.serviceMaxSpeed/Math.max(1,speed))});
  from=p;if(s.remaining<=1e-8){s.remaining=0;break;}
 }
 s.perPanel=serviceMetrics(state).perPanel;s.exhausted ||= s.remaining===0;
 s.complete=s.coverage.every(v=>v>=1);if(s.complete||s.remaining===0)s.gesture=null;else{s.gesture.point=from;s.gesture.index++;}
}
