import {LOCK_COUNT,LOCK_SCALE,ROTATION_STEP,lockShapes,shapeById,fittingError,timingPosition} from './repair-motion.js';
// Preview and live renderer use the same machined geometry and presentation.
export function socketMarkup(){return lockShapes.map(s=>`<g transform="translate(${s.slot.x} ${s.slot.y}) rotate(${s.slot.angle}) scale(${LOCK_SCALE})"><circle r="62" fill="url(#repair-steel)" stroke="#09100f" stroke-width="5"/><circle r="56" fill="#131b19" stroke="#77837c" stroke-width="1"/><path id="repair-slot-${s.id}" d="${s.path}" fill="#070c0b" stroke="${s.color}" stroke-width="3" stroke-dasharray="5 4"/><circle r="17" fill="#080d0c" stroke="#35443d" pointer-events="none"/></g>`).join('');}
export function headMarkup(){return lockShapes.map(s=>`<g id="repair-piece-${s.id}" class="repair-piece" tabindex="0" role="button" aria-label="Select ${s.name}"><path d="${s.path}" fill="url(#repair-steel)" stroke="${s.color}" stroke-width="3"/><path d="${s.path}" fill="url(#repair-metal)" pointer-events="none"/><g pointer-events="none"><circle r="27" fill="none" stroke="#17231e" stroke-width="3"/><circle r="24" fill="none" stroke="#aab2a3" stroke-width="1"/><path d="M-12-7V7L0 14L12 7V-7L0-14Z" fill="#15201c" stroke="#c0c6b9" stroke-width="2"/><path d="M-19-33H12M-33 8L-29 16M20 32L30 27" stroke="#e0e0cf" opacity=".3"/><path d="M-8-40H8" stroke="${s.color}" stroke-width="5"/></g></g>`).join('');}
// Browser coordinates -> drawing coordinates, including SVG letterboxing and zoom.
export function drawingPoint(svg,event){if(svg.getScreenCTM){const m=svg.getScreenCTM();if(m){const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(m.inverse());return{x:p.x,y:p.y};}}
 const r=svg.getBoundingClientRect(),scale=Math.min(r.width/960,r.height/640);return{x:(event.clientX-r.left-(r.width-960*scale)/2)/scale,y:(event.clientY-r.top-(r.height-640*scale)/2)/scale};}
export function attachRepair({get,send,player,onSuccess=()=>{},onFailure=()=>{},onImpact=()=>{},root=window,now=()=>performance.now(),requestFrame=cb=>requestAnimationFrame(cb),cancelFrame=id=>cancelAnimationFrame(id)}){
 const svg=get('repair-door-svg');
 get('repair-slots').innerHTML=socketMarkup();
 get('repair-pieces').innerHTML=headMarkup();
 let state,received=0,anchor=0,at=0,online=false,pending=null,frame=null,message='',displayTime=0,selected=null,poses={},gesture=null,moving=false,keyHeld=false,latestFitSeq=null,stopFeedback=null,paintedAttempt=null,paintedAt=0;
 const timingHistory=[];let diagnosticsDirty=true;
 const active=()=>online&&state?.status==='running'&&state.stations.DOOR_REPAIR===player&&!document.hidden&&now()-received<500;
 const fitting=()=>active()&&!pending&&!stopFeedback&&!state.repair.positioned&&state.repair.secured<LOCK_COUNT;
 const time=()=>anchor+Math.max(0,now()-at)/1000;
 function submit(action,wait=true){if(!active()||pending)return null;message='';const seq=send({...action,revision:state.repair.revision});if(wait&&seq!==null)pending=seq;else if(seq!==null)latestFitSeq=seq;if(seq===null)message='Input not sent. Check connection.';paint();return seq;}
 function copyPoses(){poses=Object.fromEntries(Object.entries(state.repair.locks).map(([id,l])=>[id,{...l.pose}]));selected=state.repair.selected;}
 // Keep loose components reachable after an outside drop; never attract them to a slot.
 function movePiece(id,x,y){poses[id].x=Math.max(100,Math.min(860,x));poses[id].y=Math.max(110,Math.min(530,y));}
 function syncPose(){if(selected)submit({type:'repair_select',lockId:selected,pose:{...poses[selected]}},false);}
 function tryFit(){if(!fitting()||!selected)return;const r=state.repair,pose=poses[selected],reason=fittingError(selected,selected,pose,r.positionTolerance,r.angleTolerance);
  syncPose();if(!reason){submit({type:'repair_place',lockId:selected,slotId:selected,pose:{...pose}});}
  else{message=reason==='ROTATION_MISALIGNED'?'CENTRED — ROTATE TO MATCH THE OUTLINE':'NOT FITTED — ADJUST POSITION AND ROTATION';paint();}
 }
 function paint(animate=false){if(!state)return;
  if(stopFeedback?.until!==undefined&&now()>=stopFeedback.until)stopFeedback=null;
  const r=state.repair,feedback=stopFeedback,t=feedback?.attempt??r.attempt,result=feedback?.result,
   enabled=active()&&!pending&&!feedback,shape=shapeById(t?.lockId??selected),profile=result??t??r.profile;
  const timingVisible=!!feedback||r.positioned;
  get('repair-timing-debug').hidden=!state.developerInput;
  if(state.developerInput&&diagnosticsDirty){get('repair-timing-events').textContent=timingHistory.map(x=>JSON.stringify(x,null,2)).reverse().join('\n');diagnosticsDirty=false;}
  else if(!state.developerInput){get('repair-timing-events').textContent='';diagnosticsDirty=true;}
  get('repair-progress').textContent='LOCKS SECURED: '+r.secured+' / '+LOCK_COUNT;
  get('repair-instruction').textContent=r.secured===LOCK_COUNT?'DOOR REPAIRED — YOU CAN LEAVE':r.positioned?'WATCH THE PIN — ENGAGE INSIDE THE CATCH':selected?'ROTATE INTO POSITION · DRAG TO ADJUST':'DRAG A LOCKING HEAD INTO ITS MATCHING MOUNT';
  get('repair-failure').hidden=!r.failure;
  get('repair-outcome').textContent=message||(r.outcome==='SUCCESS'?'LOCK SECURED':r.outcome==='FAILURE'?'REINFORCEMENT FAILURE — ALL FOUR LOCKS LOST':'');
  get('repair-outcome').setAttribute('data-outcome',r.outcome??'');
  get('repair-influence').textContent=(profile.braceLocked?'PNEUMATIC BRACE ACTIVE — PIN TIMING ASSISTED':'PNEUMATIC BRACE INACTIVE — STANDARD TIMING')+(t&&t.braceLocked!==state.brace.engaged?' · BRACE CHANGE APPLIES NEXT ATTEMPT':'');
  get('repair-timing').hidden=false;get('repair-timing').setAttribute('data-active',String(timingVisible));get('repair-stop').disabled=!enabled||!r.positioned;
  get('repair-timing').setAttribute('data-feedback',result?.outcome??(feedback?'PENDING':''));
  get('repair-timing-title').textContent=result?(result.outcome==='SUCCESS'?'LOCK SECURED':'REINFORCEMENT FAILURE'):r.secured===LOCK_COUNT?'ALL FOUR PINS SECURED':r.positioned?'HEAD FITTED — SECURE WITH PIN':'FIT A HEAD TO START THE PIN';
  get('repair-resolution').textContent=result?(result.outcome==='SUCCESS'?'CONTACT — LOCK ENGAGED':'PIN MISSED CATCH — ASSEMBLY BROKEN'):feedback?'PENDING — checking impact':'';
  get('repair-contact').hidden=!result||result.outcome!=='SUCCESS';
  get('repair-miss').hidden=!result||result.outcome!=='FAILURE';
  get('repair-breakage').hidden=!result;get('repair-breakage').setAttribute('aria-label',result?.outcome==='SUCCESS'?'Reinforcement assembly engaged':'Reinforcement assembly broken');
  if(result){get('repair-contact').style.left=result.position+'%';const edge=result.position<result.lower?result.lower:result.upper;
   get('repair-miss').style.left=Math.min(result.position,edge)+'%';get('repair-miss').style.width=Math.abs(result.position-edge)+'%';}

  get('repair-stop').textContent=result?'IMPACT RESOLVED':feedback?'PENDING…':'ENGAGE LOCKING PIN';
  get('repair-patch').hidden=!timingVisible;get('repair-marker').hidden=!timingVisible;
  get('repair-patch').style.left=(result?.lower??((t?.center??50)-profile.width/2))+'%';get('repair-patch').style.width=(result?result.upper-result.lower:profile.width)+'%';get('repair-patch').style.background=shape?.color??'#aaa';
  if(active()&&t&&!pending&&!feedback&&(animate||paintedAttempt!==t.id)){displayTime=time();paintedAttempt=t.id;paintedAt=now();}
  get('repair-marker').style.left=(result?result.position:feedback?feedback.position:t?timingPosition(displayTime-t.start,t.speed):0)+'%';
  for(const s of lockShapes){const l=r.locks[s.id],p=l.status==='LOOSE'?(poses[s.id]??l.pose):l.pose,node=get('repair-piece-'+s.id),chosen=selected===s.id&&l.status==='LOOSE';
   node.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${p.angle}) scale(${LOCK_SCALE})`);node.setAttribute('data-status',l.status);node.setAttribute('data-selected',String(chosen));node.setAttribute('aria-disabled',String(!fitting()||l.status!=='LOOSE'));
   const status=get('repair-state-'+s.id);status.textContent=s.name.slice(-1)+' · '+(l.status==='SECURED'?'SECURED':l.status==='POSITIONED'?'FITTED · NOT SECURED':'AVAILABLE');status.setAttribute('data-status',l.status);
   const slot=get('repair-slot-'+s.id);slot.setAttribute('data-selected',String(chosen));
   const aligned=chosen&&!fittingError(s.id,s.id,p,r.positionTolerance,r.angleTolerance);slot.setAttribute('data-aligned',String(aligned));slot.style.opacity=chosen?String(.45+.55*Math.max(0,1-Math.hypot(p.x-s.slot.x,p.y-s.slot.y)/180)):'1';node.setAttribute('data-aligned',String(aligned));
  }
  get('repair-rotation').hidden=false;get('repair-selection').textContent=selected?shapeById(selected).name:'SELECT A LOCKING HEAD';
  for(const id of ['repair-left','repair-right','repair-move'])get(id).disabled=!fitting()||!selected;
  get('repair-move').textContent=moving?'CLICK DOOR TO PLACE':'MOVE & PLACE';
  get('repair-panel').setAttribute('data-complete',String(r.secured===LOCK_COUNT));
  get('repair-status-title').textContent=r.secured===LOCK_COUNT?'DOOR REPAIRED':result?.outcome==='FAILURE'||r.failure?'REINFORCEMENT FAILURE':r.positioned?'HEAD FITTED — NOT SECURED':r.outcome==='SUCCESS'?'LOCK SECURED':'FIT A LOCKING HEAD';
  get('repair-status-detail').textContent=r.secured===LOCK_COUNT?'PERMANENT MECHANICAL LOCKS SECURED · YOU CAN LEAVE THIS STATION':r.failure?'ALL FOUR LOCKS LOST · FIT A HEAD TO REBUILD':r.positioned?'Watch the pin. Engage only inside the matching catch.':'Each secured lock permanently reduces future door leakage.';
  get('repair-hint').textContent=!active()?'Waiting for a fresh, running session. No penalty.':r.secured===LOCK_COUNT?'All four locks secured. You can leave.':r.positioned?'WATCH THE MOVING PIN. PRESS ENGAGE WHEN INSIDE THE CATCH.':moving?'Move the mouse, then click to place. Rotate using the buttons.':selected?'Rotate to match the outline. Drag again to adjust, or use MOVE & PLACE.':'DRAG A LOCKING HEAD INTO ITS MATCHING MOUNT → ROTATE → ENGAGE PIN. SECURE ALL FOUR.';
  if(r.positioned&&!t&&!feedback){get('repair-stop').textContent='RESUME PIN TIMING';get('repair-instruction').textContent='HEAD FITTED — RESUME PIN TIMING';get('repair-hint').textContent='THE FITTED HEAD IS RETAINED. PRESS RESUME PIN TIMING TO CONTINUE.';}
 }
 function releaseGesture(){const old=gesture;gesture=null;if(old)try{svg.releasePointerCapture(old.id);}catch{}return old;}
 function localCancel(){releaseGesture();moving=false;keyHeld=false;}
 function clearFeedback(reason){diagnosticsDirty=true;if(stopFeedback&&!stopFeedback.result){stopFeedback.record.status='cancelled';stopFeedback.record.reason=reason;}stopFeedback=null;paintedAttempt=null;}
 function cancel(preserve=false){clearFeedback('Focus, visibility or explicit cancellation');localCancel();if(active()&&state.repair.secured<LOCK_COUNT)send({type:preserve?'repair_suspend':'repair_cancel',revision:state.repair.revision});online=false;pending=null;message='Repair cancelled safely. Installed locks retained.';paint();}
 function select(id){if(!fitting()||state.repair.locks[id].status!=='LOOSE')return false;selected=id;moving=false;message='';syncPose();paint();return true;}
 function down(id,e){if(e.button!==0||!fitting())return;if(gesture){if(e.pointerId!==gesture.id||e.timeStamp<=gesture.stamp)return;releaseGesture();}if(!select(id))return;
  e.preventDefault();const p=drawingPoint(svg,e),pose=poses[id];gesture={id:e.pointerId,stamp:e.timeStamp,lockId:id,dx:p.x-pose.x,dy:p.y-pose.y,start:p,moved:false};try{svg.setPointerCapture(e.pointerId);}catch{}paint();
 }
 function sample(e){if(!gesture||e.pointerId!==gesture.id||e.timeStamp<gesture.stamp)return;const p=drawingPoint(svg,e),g=gesture;g.moved ||= Math.hypot(p.x-g.start.x,p.y-g.start.y)>2;movePiece(g.lockId,p.x-g.dx,p.y-g.dy);paint();}
 for(const shape of lockShapes){const node=get('repair-piece-'+shape.id);node.addEventListener('pointerdown',e=>down(shape.id,e));node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(shape.id);}});}
 root.addEventListener('pointermove',e=>{if(!active()){localCancel();return;}if(gesture)sample(e);else if(moving&&fitting()&&e.target!==get('repair-left')&&e.target!==get('repair-right')&&e.target!==get('repair-move')){const p=drawingPoint(svg,e);movePiece(selected,p.x,p.y);paint();}},true);
 root.addEventListener('pointerup',e=>{if(!gesture||e.pointerId!==gesture.id||e.timeStamp<gesture.stamp)return;if(!fitting()){localCancel();return;}sample(e);const g=releaseGesture();if(g.moved)tryFit();else syncPose();paint();},true);
 root.addEventListener('pointercancel',e=>{if(gesture&&e.pointerId===gesture.id&&e.timeStamp>=gesture.stamp){localCancel();message='Drag cancelled — no locks lost.';paint();}},true);
 // Capture loss is not a cancellation: window pointerup still terminates this exact gesture.
 svg.addEventListener('pointerdown',e=>{if(e.button===0&&moving&&fitting()&&!gesture){e.preventDefault();const p=drawingPoint(svg,e);movePiece(selected,p.x,p.y);moving=false;tryFit();}});
 for(const [id,delta] of [['repair-left',-ROTATION_STEP],['repair-right',ROTATION_STEP]])get(id).addEventListener('click',()=>{if(!fitting()||!selected)return;poses[selected].angle=((poses[selected].angle+delta)%360+360)%360;message='';if(!moving)tryFit();else syncPose();paint();});
 get('repair-move').addEventListener('click',()=>{if(!fitting()||!selected)return;moving=!moving;message='';paint();});
 function stop(event){if(!active()||pending||stopFeedback||!state.repair.positioned)return;const t=state.repair.attempt;if(!t){submit({type:'repair_begin'});return;}
  const position=timingPosition(displayTime-t.start,t.speed),handlerAt=now(),pressedAt=Number.isFinite(event?.timeStamp)&&event.timeStamp>=0&&event.timeStamp<=handlerAt?event.timeStamp:handlerAt,record={epoch:state.epoch,seq:null,pressedAt,eventHandlerDelayMs:handlerAt-pressedAt,attemptId:t.id,configuredSpeed:t.baseSpeed??t.speed,speed:t.speed,
   targetLower:t.center-t.width/2,targetUpper:t.center+t.width/2,clientPosition:position,frameAgeMs:handlerAt-paintedAt,
   serverPosition:null,discrepancy:null,ackLatencyMs:null,status:'pending',reason:null};
  diagnosticsDirty=true;timingHistory.push(record);if(timingHistory.length>30)timingHistory.shift();
  stopFeedback={attempt:{...t},position,pressedAt,epoch:state.epoch,record,seq:null};
  const seq=submit({type:'repair_stop',attemptId:t.id,sampleTime:displayTime,position});
  if(stopFeedback){stopFeedback.seq=seq;record.seq=seq;if(seq===null){record.status='unconfirmed';record.reason='Input not sent';stopFeedback=null;}}
  paint();
 }
 get('repair-stop').addEventListener('pointerdown',e=>{if(e.button===0){e.preventDefault();stop(e);}});
 get('repair-stop').addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!keyHeld&&!e.repeat){keyHeld=true;stop(e);}}});
 get('repair-stop').addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();keyHeld=false;}});
 // No click/up handler: a single physical press resolves at most one attempt.
 root.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});root.addEventListener('blur',()=>cancel(true));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel(true);});
 function tick(){frame=null;if(!active())localCancel();paint(true);if(online)frame=requestFrame(tick);}
 return {update(next){const previous=state,predicted=state?time():next.elapsed,fresh=online&&now()-received<500;state=next;
  anchor=fresh&&previous?.epoch===next.epoch&&previous.status==='running'&&next.status==='running'?Math.max(next.elapsed,Math.min(predicted,next.elapsed+.15)):next.elapsed;at=received=now();online=true;
  const interrupted=previous&&(previous.epoch!==next.epoch||previous.stations.DOOR_REPAIR!==next.stations.DOOR_REPAIR||previous.status!==next.status);
  if(interrupted)clearFeedback('Session or station changed');
  const changed=!previous||previous.epoch!==next.epoch||previous.repair.revision!==next.repair.revision||previous.stations.DOOR_REPAIR!==next.stations.DOOR_REPAIR;
  if(changed){localCancel();if(!stopFeedback)pending=null;copyPoses();message='';if(!next.repair.attempt)paintedAttempt=null;}
  if(!active())localCancel();
  if(previous&&previous.epoch===next.epoch){if(next.repair.failures>previous.repair.failures&&!stopFeedback)onFailure();if(next.repair.secured>previous.repair.secured){const el=get('repair-progress');el.classList.remove('repair-success');void el.offsetWidth;el.classList.add('repair-success');if(!stopFeedback)onSuccess(next.repair.secured===LOCK_COUNT);}else if(!previous.repair.positioned&&next.repair.positioned)onSuccess(false);}
  paint();if(frame===null)frame=requestFrame(tick);
 },onResult(result){
  const history=timingHistory.find(r=>r.seq===result.seq&&r.epoch===result.epoch);
  if(history&&history.ackLatencyMs===null){diagnosticsDirty=true;const evidence=result.timing;Object.assign(history,{
   cancelledBeforeAck:history.status==='cancelled',ackLatencyMs:now()-history.pressedAt,status:result.status,
   reason:result.code+': '+result.message,serverPosition:evidence?.position??null,serverOutcome:evidence?.outcome??null,
   serverTargetLower:evidence?.lower??null,serverTargetUpper:evidence?.upper??null,
   discrepancy:evidence?evidence.position-history.clientPosition:null,
   materialDiscrepancy:evidence?Math.abs(evidence.position-history.clientPosition)>.01:false});}
  if(stopFeedback&&!stopFeedback.result&&result.seq===stopFeedback.seq&&result.epoch===stopFeedback.epoch){
   const f=stopFeedback,e=result.timing;
   pending=null;
   if(result.status==='accepted'&&e?.attemptId===f.attempt.id&&['SUCCESS','FAILURE'].includes(e.outcome)){
    f.result={...e};f.until=now()+(e.outcome==='SUCCESS'?700:1000);onImpact(e.outcome);paint();return;
   }
   stopFeedback=null;message=result.status==='accepted'?'Authoritative timing result missing. Check diagnostics.':result.code+': '+result.message;
   paint();return;
  }
  if(history&&!stopFeedback)paint();
  if(result.seq===latestFitSeq&&result.status!=='accepted'){message=result.code+': '+result.message;paint();}if(result.seq===pending){pending=null;if(result.status!=='accepted')message=result.code+': '+result.message;paint();}},
 suspend(){clearFeedback('Disconnected or switched station');online=false;pending=null;localCancel();if(frame!==null)cancelFrame(frame);frame=null;paint();},cancel};
}
