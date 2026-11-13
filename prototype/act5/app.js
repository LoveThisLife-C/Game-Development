import {attachDemister} from '/demister-ui.js';
import {attachAirSupply} from '/air-supply-ui.js';
import {attachPurge} from '/emergency-purge-ui.js';
import {stationOverviewMarkup,paintStationOverview} from '/station-status.js';
import {attachScrubber} from '/chemical-scrubber-ui.js';
import {attachLiveWire} from '/live-wire-ui.js';
import {attachGasMonitor,gasReadout} from '/gas-monitor.js';
import {attachFilter} from '/filter-ui.js';
import {attachService} from '/service-ui.js';
import {attachIntake} from '/intake-ui.js';
import {attachRepair} from '/repair-ui.js';
import {attachPneumatic} from '/pneumatic-ui.js';
import {createActionChannel} from '/actions.js';
const role=document.body.dataset.view, $=id=>document.getElementById(id),pageParams=new URLSearchParams(location.search);
const player=pageParams.get('seat')||location.pathname.split('/').filter(Boolean).at(-1)||'1';
const integratedSession=pageParams.get('session')||'';
const integratedToken=pageParams.get('token')||'';
let client=sessionStorage.getItem('br-client');
if(!client){client=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');sessionStorage.setItem('br-client',client);}
let seq=Number(sessionStorage.getItem('br-seq')||0), epoch=0, state, ws, retry, gasMonitor=null, pneumaticUI=null, repairUI=null, intakeUI=null, serviceUI=null, filterUI=null, liveWireUI=null, scrubberUI=null, purgeUI=null, airSupplyUI=null, demisterUI=null, configLoaded=false, configShown={}, audioContext, lastRevision=-1;
let endingInput=false,leavingStation=false;
let localDevelopment=false, connectionAttempt=0, connectionTimer;
let stateReceivedAt=performance.now(),clockLive=false;
const localInputs=[], gestures=new Map();
function drawInputs(){
  if($('input-events'))$('input-events').textContent=[...gestures.values()].reverse().map(g=>JSON.stringify(g,null,2)).join('\n')+'\n'+localInputs.join('\n');
}
function traceGesture(record){
  if(!gestures.has(record.id)&&record.kind!=='POINTERDOWN')return; // Late receipts must not evict newer complete histories.
  gestures.set(record.id,{...gestures.get(record.id),...record});
  if(gestures.size>40)gestures.delete(gestures.keys().next().value);
  drawInputs();
}
function inputDiagnostic(message){localInputs.push(message);if(localInputs.length>12)localInputs.shift();drawInputs();}
const actions=createActionChannel({
  nextSequence:()=>{seq++;sessionStorage.setItem('br-seq',seq);return seq;},getEpoch:()=>epoch,
  transmit:message=>{if(message.gestureId)traceGesture({id:message.gestureId,actionSequence:message.seq,actionEpoch:message.epoch,sent:false});if(ws?.readyState!==WebSocket.OPEN)return false;try{ws.send(JSON.stringify(message));if(message.gestureId)traceGesture({id:message.gestureId,sent:true});return true;}catch{return false;}},
  onPending:count=>{if($('input-pending'))$('input-pending').textContent=`${count} awaiting acknowledgement`;},
  onResult:result=>{
    demisterUI?.onResult(result);airSupplyUI?.onResult(result);purgeUI?.onResult(result);scrubberUI?.onResult(result);liveWireUI?.onResult(result);pneumaticUI?.onResult(result);filterUI?.onResult(result);repairUI?.onResult(result);intakeUI?.onResult(result);serviceUI?.onResult(result);
    if(result.gestureId)traceGesture({id:result.gestureId,ack:result.status,code:result.code,reason:result.message,finalAuthoritativePressure:result.pressureAfter,ackRevision:result.state?.revision});
    inputDiagnostic(`#${result.seq} ${result.status} ${result.code}: ${result.message}`);
    if(result.action==='release'&&result.status!=='accepted')leavingStation=false;
    if(result.status!=='accepted')error(result.message);
    else error('');
  }
});
function send(action){if(endingInput||(leavingStation&&action.type!=='release'))return null;return actions.send(action);}
function leaveStation(){
 if(leavingStation)return;leavingStation=true;endingInput=true;
 // Local teardown cannot flush an extra stroke, cut or deployment. The one
 // authoritative release below cancels all server input and preserves progress.
 try{repairUI?.suspend();intakeUI?.suspend();serviceUI?.suspend('STATION_LEAVE');filterUI?.suspend();cancelGesture('LEAVE_STATION');}finally{endingInput=false;}
 $('release').disabled=true;$('release').textContent='LEAVING…';send({type:'release'});
}
function error(message){if($('error'))$('error').textContent=message;}
function connectionFailure(kind,message){
  clockLive=false;clearTimeout(connectionTimer);demisterUI?.suspend();airSupplyUI?.suspend();purgeUI?.suspend();scrubberUI?.suspend();liveWireUI?.suspend();gasMonitor?.suspend();pneumaticUI?.suspend();repairUI?.suspend();intakeUI?.suspend();serviceUI?.suspend('CONNECTION_FAILURE');filterUI?.suspend();actions.clear();cancelGesture();disableControls();
  $('connection').textContent=kind;error(`${kind}: ${message}`);
  if($('retry-connection'))$('retry-connection').hidden=false;
  if(role==='admin')$('login').hidden=localDevelopment||kind!=='AUTHENTICATION REQUIRED';
  console.error('[Blackout Ridge connection]',kind,message);
}
function validateSnapshot(next){
  if(!next||next.type!=='state'||!Number.isSafeInteger(next.revision)||!Number.isSafeInteger(next.epoch)||!['ready','running','paused','stopped'].includes(next.status)||!Number.isFinite(next.elapsed)||!next.stations||!Array.isArray(next.liveWire?.wires)||next.liveWire.wires.length!==4||!Number.isSafeInteger(next.liveWire.generation)||next.liveWire.wires.some(w=>!Array.isArray(w.nodes)||w.nodes.length!==11||w.nodes.some(p=>![p.x,p.y,p.vx,p.vy].every(Number.isFinite)))||!next.scrubber||!Array.isArray(next.scrubber.pockets)||!Number.isFinite(next.scrubber.time)||!Number.isSafeInteger(next.scrubber.generation)||!Number.isFinite(next.scrubber.progress?.remaining)||!next.filter||!Array.isArray(next.filter.debris)||!Number.isFinite(next.filter.reserve)||!Number.isFinite(next.filter.obstruction)||!next.brace||!Number.isFinite(next.brace.pressure)||!Number.isFinite(next.brace.speed))throw Error('Invalid or incomplete authoritative state envelope');
  if(!next.demister||!Number.isSafeInteger(next.demister.generation)||!Array.isArray(next.demister.model?.drops)||!Number.isFinite(next.demister.modifier))throw Error('Invalid Demister snapshot');
  if(!next.airSupply||!Number.isSafeInteger(next.airSupply.generation)||next.airSupply.model?.cushions?.length!==3||!Number.isFinite(next.airSupply.model.metrics?.supply))throw Error('Invalid Air Supply snapshot');
  if(!next.purge||typeof next.purge.available!=='boolean'||!Array.isArray(next.purge.model?.nodes)||next.purge.model.nodes.length!==240||!Number.isSafeInteger(next.purge.generation))throw Error('Invalid Emergency Purge snapshot');
  if(next.airQuality==='WORKING'&&(!Number.isFinite(next.air?.contamination)||!Number.isFinite(next.air?.ingressRate)||!['RISING','FALLING','STEADY'].includes(next.air?.rateTrend)||!['door','intake','service'].every(k=>Number.isFinite(next.air?.sources?.[k]))))throw Error('Authoritative gas readings missing/invalid');
  if(role==='admin'){
    for(const key of ['demisterMaxRestriction','demisterStableMin','demisterStableMax','airSupplyIngressReduction','airSupplyStableMin','airSupplyStableMax','purgeRemovalFraction','purgeStableMin','purgeStableMax','scrubberRemovalFraction','liveWireDisturbance','liveWireCatchScale','liveWireProtected','liveWireWarning','maxPowerPenalty','filterCirculation','filterEddyStrength','filterPulseStrength','filterCapacity','filterPulseCost','filterRecharge','filterCleanInterval','filterLoadInterval','maxFilterPenalty','filterGravity','filterDamping','filterRestitution','hazardGrowth','wheelDrive','wheelInertia','wheelDrag','compressorRate','compressorLag','pressureLeak','reliefRate','repairSpeed1','repairWidth1','repairSpeed2','repairWidth2','repairSpeed3','repairWidth3','repairSpeed4','repairWidth4','repairPositionTolerance','repairAngleTolerance','repairBraceSpeedFactor','repairBraceWidthBonus','seed','lockedMultiplier','visualSensitivity','duration'])if(!Number.isFinite(next.config?.[key]))throw Error(`Initial configuration missing/invalid: ${key}`);
    if(!['WORKING','BROKEN'].includes(next.config.airQuality))throw Error('Invalid air-quality configuration');
    if(!next.debug||!next.inputDiagnostics||!Array.isArray(next.inputDiagnostics.recent))throw Error('Authoritative admin diagnostics missing');
  }
}
function connect(){
  clearTimeout(retry);clearTimeout(connectionTimer);disableControls();configLoaded=false;lastRevision=-1;
  $('connection').textContent='CONNECTING';
  let current,opened=false,synchronised=false,failed=false;
  const fail=(kind,message)=>{
    if(failed||ws!==current)return;failed=true;connectionFailure(kind,message);
    try{current.close();}catch{}
    if(role!=='admin')retry=setTimeout(startConnection,1500);
  };
  try{current=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/act5-ws?role=${role}&player=${player}&client=${client}&session=${encodeURIComponent(integratedSession)}&token=${encodeURIComponent(integratedToken)}`);ws=current;}
  catch(err){connectionFailure('CONNECTION FAILED',`WebSocket construction failed: ${err.message}`);return;}
  connectionTimer=setTimeout(()=>fail('CONNECTION FAILED','WebSocket handshake timed out after 8 seconds. Check the server upgrade log and browser Network /ws request.'),8000);
  current.onopen=()=>{
    if(ws!==current||failed)return;opened=true;clearTimeout(connectionTimer);
    $('connection').textContent='SYNCHRONISING';
    connectionTimer=setTimeout(()=>fail('INITIAL STATE FAILED','WebSocket opened but no valid authoritative state arrived within 8 seconds.'),8000);
  };
  current.onerror=()=>fail(opened&&!synchronised?'INITIAL STATE FAILED':'CONNECTION FAILED','WebSocket transport error. The browser hides HTTP rejection details; check /api/session, Network /ws, and the server upgrade log. Retry Connection rechecks authentication.');
  current.onclose=event=>{
    if(ws!==current||failed)return;
    const kind=[1008,4401,4403].includes(event.code)?'AUTHENTICATION REQUIRED':opened&&!synchronised?'INITIAL STATE FAILED':'CONNECTION FAILED';
    fail(kind,`Local connection lost or rejected (close ${event.code}${event.reason?`: ${event.reason}`:''}).`);
    document.querySelectorAll('.wisp,.haze-cloud').forEach(el=>el.style.animationPlayState='paused');
    if(event.code===4001)clearTimeout(retry);
  };
  current.onmessage=event=>{
    if(ws!==current||failed)return;
    try{
      const data=JSON.parse(event.data);
      if(data.type==='error'){fail(data.code==='AUTH_REQUIRED'?'AUTHENTICATION REQUIRED':'CONNECTION FAILED',data.message);return;}
      if(data.type==='ack')actions.receive(data);
      const next=data.type==='ack'?data.state:data;
      validateSnapshot(next);
      if(next.revision<=lastRevision)return;
      render(next,{immediate:data.type==='ack'&&data.status==='accepted'&&!data.duplicate&&['brace_begin','brace_turn','brace_end'].includes(data.action)});
      clearTimeout(connectionTimer);$('connection').textContent='CONNECTED';
      if(!synchronised){error('');console.info('[Blackout Ridge connection] Authoritative session ready', {role,epoch:next.epoch,revision:next.revision});}
      synchronised=true;if($('retry-connection'))$('retry-connection').hidden=true;
    }catch(err){fail(synchronised?'STATE UPDATE FAILED':'INITIAL STATE FAILED',`${err.name}: ${err.message}`);}
  };
}
function disableControls(){document.querySelectorAll('[data-command],#release,#switch-brace,#switch-repair,#switch-intake,#switch-service,#switch-filter,#switch-livewire,#switch-scrubber,#switch-purge,#switch-air,#switch-demister,#air-inflate,#air-vent,#relief,#config button,#config input,#config select').forEach(el=>el.disabled=true);}
function beep(kind='pull') {
  if(!$('audio')?.checked)return;
  try {
    audioContext??=new AudioContext(); audioContext.resume();
    const osc=audioContext.createOscillator(),gain=audioContext.createGain(),now=audioContext.currentTime;
    const warning=kind==='shift', locking=kind==='lock', duration=kind==='complete' ? .9 : warning ? .55 : locking ? .3 : .08;
    osc.type=warning?'square':'triangle';
    osc.frequency.setValueAtTime(kind==='complete'?660:warning?440:locking?140:300,now);
    osc.frequency.exponentialRampToValueAtTime(warning?180:locking?65:170,now+duration);
    gain.gain.setValueAtTime(warning ? .04 : .07,now);
    gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    osc.connect(gain).connect(audioContext.destination);osc.start();osc.stop(now+duration);
  }catch{}
}
// Short inharmonic resonances produce a mechanical impact; audio is optional.
function repairImpact(outcome){
 if(!$('audio')?.checked)return;
 try{audioContext??=new AudioContext();audioContext.resume();const start=audioContext.currentTime,success=outcome==='SUCCESS';
  for(const [i,f] of (success?[180,487,1031]:[95,213,371]).entries()){
   const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=i===0?'triangle':'sine';
   osc.frequency.setValueAtTime(f,start);osc.frequency.exponentialRampToValueAtTime(f*(success?.8:.35),start+.25);
   gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.06/(i+1),start+.004);
   gain.gain.exponentialRampToValueAtTime(.0001,start+(success?.35:.6));osc.connect(gain).connect(audioContext.destination);
   osc.start(start);osc.stop(start+.65);
  }
 }catch{}
}
function paintClock(){
 if(!$('clock')||!state)return;
 const extrapolated=state.elapsed+(clockLive&&state.status==='running'?Math.max(0,(performance.now()-stateReceivedAt)/1000):0),remaining=Math.max(0,300-extrapolated);
 $('clock').textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(Math.floor(remaining%60)).padStart(2,'0')}`;
}
function render(next,animationOptions={}){
  if(next.revision<=lastRevision)return;
  lastRevision=next.revision;
  const previous=state;
  if(next.epoch!==epoch) {repairUI?.cancel();cancelGesture('Session reset during gesture');actions.clear('Session reset before acknowledgement; old input will not be replayed');configLoaded=false;}
  epoch=next.epoch;state=next;stateReceivedAt=performance.now();clockLive=true;
  $('status').textContent=next.status.toUpperCase();
  paintClock();
  const b=next.brace, owner=next.stations.DOOR_BRACE;
  document.body.classList.toggle('good',b.engaged);
  document.body.classList.toggle('locked',b.engaged);
  document.body.classList.toggle('paused',next.status!=='running');
  document.body.classList.toggle('reinforcement-failure',!!next.repair.failure);
  document.body.classList.toggle('repair-complete',next.repair.secured===4);
  if($('condition'))$('condition').textContent=b.condition;
  if($('compression'))$('compression').textContent=`${b.pressure.toFixed(1)} / 100`;
  if($('brace-notice'))$('brace-notice').textContent=b.trend+' · '+(b.engaged?'RAMS / GASKETS ENGAGED':'ACCUMULATOR NEEDS CHARGE');
  document.querySelectorAll('.needle').forEach(el=>el.style.left=`${b.pressure}%`);
  if($('result'))$('result').textContent=next.status==='stopped'?(next.result?`SESSION ENDED · ${next.result.totalGas.toFixed(1)} cumulative gas units · ${next.elapsed.toFixed(1)} seconds`:'SESSION ENDED · AIR QUALITY SENSOR OFFLINE'):'';
  if(role==='screen'){
    paintStationOverview($,next.stationStatus);
    $('accumulated-haze').style.opacity=next.visual.haze.layerOpacity;
    $('scrubber-occupancy-map').textContent=next.stations.CHEMICAL_SCRUBBER?'PLAYER '+next.stations.CHEMICAL_SCRUBBER:'UNOCCUPIED';$('scrubber-map-status').textContent=next.scrubber.operatingState==='RECOVERING'?next.scrubber.progress.remaining+' TO TREAT':next.scrubber.operatingState==='EFFECTIVE'?'SCRUBBER EFFECTIVE': 'TREATMENT DETERIORATING';
    $('livewire-occupancy-map').textContent=next.stations.LIVE_WIRE?'PLAYER '+next.stations.LIVE_WIRE:'UNOCCUPIED';$('livewire-map-status').textContent=next.liveWire.condition.title;
    $('filter-occupancy-map').textContent=next.stations.FILTER_BANK?'PLAYER '+next.stations.FILTER_BANK:'UNOCCUPIED';$('filter-map-status').textContent=next.filter.phase==='CLEAR'?'FILTER BANK CLEAR':next.filter.phase==='RELOADING'?'LOADING / '+Math.round(next.filter.obstruction*100)+'%':Math.round(next.filter.obstruction*100)+'% OBSTRUCTED';$('filter-map-level').setAttribute('width',175*next.filter.obstruction);
    $('service-map-status').textContent=next.service.complete?'SEALED':Math.floor(next.service.coverage*100)+'% / '+next.service.perPanel.length+' PANELS';
    $('service-occupancy-map').textContent=next.stations.SERVICE_SEAL?'PLAYER '+next.stations.SERVICE_SEAL:'UNOCCUPIED';
    $('service-plume').style.opacity=next.visual.servicePlume;
    $('intake-map-status').textContent=next.intake.complete?'COMPLETE / BYPASS OPEN':'INCOMPLETE / LEAKING';
    $('intake-occupancy-map').textContent=next.stations.INTAKE_DIVERSION?'PLAYER '+next.stations.INTAKE_DIVERSION+' / OCCUPIED':'UNOCCUPIED';
    $('intake-plume').style.opacity=next.visual.intakePlume;
    $('intake-bypass-map').setAttribute('opacity',next.intake.complete?'1':'.15');
    $('repair-map-status').textContent=next.repair.failure?'REINFORCEMENT FAILURE':next.repair.secured+'/4 LOCKS SECURED';
    if(previous&&previous.epoch===next.epoch&&next.repair.failures>previous.repair.failures)beep('shift');
    if(previous&&previous.epoch===next.epoch&&next.repair.secured===4&&previous.repair.secured<4)beep('complete');
    $('repair-occupancy-map').textContent=next.stations.DOOR_REPAIR?'PLAYER '+next.stations.DOOR_REPAIR+' / OCCUPIED':'UNOCCUPIED';
    for(let i=0;i<4;i++)$('map-clamp-'+i).setAttribute('opacity',i<next.repair.secured?'1':'.15');
    $('brace-map-status').textContent=b.fault?'OVERPRESSURE FAULT':b.engaged?'PNEUMATIC / ENGAGED':b.deploymentReady?'READY / DEPLOY CLUTCH':b.pressure>=60?'SETTLING / UNDEPLOYED':'RECHARGE / UNBRACED';
    $('occupancy-map').textContent=owner?`PLAYER ${owner} / OCCUPIED`:'UNOCCUPIED';
    $('occupant-dot').setAttribute('fill',owner?'#b9d48b':'#778078');
    $('brace-bar').setAttribute('stroke',b.engaged?'#b9d48b':'#daab65');
    $('plume').style.opacity=.12+next.visual.plume*.8;
    $('plume').setAttribute('transform',`translate(185 325) scale(${.45+next.visual.plume*1.1} 1) translate(-185 -325)`);
    // Haze follows authoritative current airborne contamination, independently of ingress.
    const haze=next.visual.haze;
    $('haze').style.opacity=haze.baseOpacity;
    $('haze').setAttribute('rx',haze.radiusX);$('haze').setAttribute('ry',haze.radiusY);
    haze.clouds.forEach((cloud,index)=>{
      const el=$(`haze-cloud-${index}`);el.style.opacity=cloud.opacity;
      for(const name of ['cx','cy','rx','ry'])el.setAttribute(name,cloud[name]);
    });
    document.querySelectorAll('.wisp,.haze-cloud').forEach(el=>el.style.animationPlayState=next.status==='running'?'running':'paused');
    const reading=gasReadout(next);$('air-reading').textContent=reading.level;$('air-rate').textContent=reading.offline?'':reading.rate;$('air-rate-trend').textContent=reading.trend;
    $('air-trend').textContent=next.air?(next.purge.operatingState==='PURGING'?'↓ PURGING':next.status==='running'&&next.air.trend==='RISING'?'↑ RISING':'— STEADY'):'';
    $('air-scale').textContent=next.air?next.air.scale:'Use visible ingress and accumulated haze.';
  }
  if(role==='player'){
    gasMonitor?.update(next);
    if(!Object.values(next.stations).includes(player))leavingStation=false;
    for(const [key,id] of Object.entries({brace:'DOOR_BRACE',repair:'DOOR_REPAIR',intake:'INTAKE_DIVERSION',service:'SERVICE_SEAL',filter:'FILTER_BANK',livewire:'LIVE_WIRE',scrubber:'CHEMICAL_SCRUBBER',purge:'EMERGENCY_PURGE',air:'AIR_SUPPLY',demister:'DEMISTER_DRAINAGE'})){
      const button=$('switch-'+key),info=next.stationStatus[id];button.classList.toggle('needs-attention',info.attentionRequired);button.classList.toggle('station-stable',info.stable);button.classList.toggle('station-offline',info.available===false);button.dataset.state=info.state;button.dataset.occupant=info.available===false?'OFFLINE':info.occupiedBy?`PLAYER ${info.occupiedBy}`:'AVAILABLE';button.setAttribute('title',info.reason||info.state);button.setAttribute('aria-label',info.label+' — '+info.state+' — '+(info.available===false?'UNAVAILABLE':info.occupiedBy?'PLAYER '+info.occupiedBy:'AVAILABLE'));
    }
    const draining=next.stations.DEMISTER_DRAINAGE===player;document.body.classList.toggle('demister-active',draining);$('demister-panel').hidden=!draining;$('switch-demister').disabled=!!next.stations.DEMISTER_DRAINAGE;demisterUI?.update(next);
    const supplying=next.stations.AIR_SUPPLY===player;document.body.classList.toggle('air-active',supplying);$('air-panel').hidden=!supplying;$('switch-air').disabled=!!next.stations.AIR_SUPPLY;airSupplyUI?.update(next);
    const purging=next.stations.EMERGENCY_PURGE===player;document.body.classList.toggle('purge-active',purging);$('purge-panel').hidden=!purging;$('switch-purge').disabled=!next.purge.available||!!next.stations.EMERGENCY_PURGE;$('switch-purge').textContent=next.purge.available?'EMERGENCY PURGE':'PURGE — OFFLINE';purgeUI?.update(next);
    const scrubbing=next.stations.CHEMICAL_SCRUBBER===player;document.body.classList.toggle('scrubber-active',scrubbing);$('scrubber-panel').hidden=!scrubbing;$('switch-scrubber').disabled=!!next.stations.CHEMICAL_SCRUBBER;scrubberUI?.update(next);
    const wiring=next.stations.LIVE_WIRE===player;document.body.classList.toggle('livewire-active',wiring);$('livewire-panel').hidden=!wiring;$('switch-livewire').disabled=!!next.stations.LIVE_WIRE;liveWireUI?.update(next);
    const filtering=next.stations.FILTER_BANK===player;$('filter-panel').hidden=!filtering;$('switch-filter').disabled=!!next.stations.FILTER_BANK;filterUI?.update(next);
    const owned=owner===player, active=owned&&next.status==='running';document.body.classList.toggle('brace-active',owned);
    const repairing=next.stations.DOOR_REPAIR===player,diverting=next.stations.INTAKE_DIVERSION===player,sealing=next.stations.SERVICE_SEAL===player;
    document.body.classList.toggle('repair-active',repairing);document.body.classList.toggle('intake-active',diverting);document.body.classList.toggle('service-active',sealing);document.body.classList.toggle('filter-active',filtering);const monitor=$('gas-monitor'),mount=draining?$('demister-gas-slot'):supplying?$('air-gas-slot'):purging?$('purge-gas-slot'):owned?$('brace-gas-slot'):repairing?$('repair-gas-slot'):diverting?$('intake-gas-slot'):sealing?$('service-gas-slot'):filtering?$('filter-gas-slot'):wiring?$('livewire-gas-slot'):scrubbing?$('scrubber-gas-slot'):$('gas-home');if(monitor.parentNode!==mount)mount.appendChild(monitor);
    $('service-panel').hidden=!sealing;serviceUI?.update(next);$('switch-service').disabled=!!next.stations.SERVICE_SEAL;
    $('intake-panel').hidden=!diverting;intakeUI?.update(next);$('switch-intake').disabled=!!next.stations.INTAKE_DIVERSION;
    $('brace-panel').hidden=!owned;$('repair-panel').hidden=!repairing;
    $('station-summary').textContent='DOOR BRACE: '+(owner?'Player '+owner:'Vacant')+' · '+b.condition+' | DOOR REPAIR: '+(next.stations.DOOR_REPAIR?'Player '+next.stations.DOOR_REPAIR:'Vacant')+' · '+next.repair.secured+'/4 · '+next.repair.stage+' | INTAKE DIVERSION: '+(next.stations.INTAKE_DIVERSION?'Player '+next.stations.INTAKE_DIVERSION:'Vacant')+' · '+(next.intake.complete?'COMPLETE':'INCOMPLETE')+' | SERVICE SEAL: '+(next.stations.SERVICE_SEAL?'Player '+next.stations.SERVICE_SEAL:'Vacant')+' · '+Math.floor(next.service.coverage*100)+'% | FILTER BANK: '+(next.stations.FILTER_BANK?'Player '+next.stations.FILTER_BANK:'Vacant')+' · '+next.filter.phase+' | LIVE WIRE: '+(next.stations.LIVE_WIRE??'Vacant')+' · '+next.liveWire.condition.title+' | CHEMICAL SCRUBBER: '+(next.stations.CHEMICAL_SCRUBBER??'Vacant')+' · '+next.scrubber.operatingState+' · '+next.scrubber.progress.remaining+' TO TREAT | EMERGENCY PURGE: '+(next.stations.EMERGENCY_PURGE??'Vacant')+' · '+next.purge.operatingState+' | POSITIVE-PRESSURE AIR SUPPLY: '+(next.stations.AIR_SUPPLY??'Vacant')+' · '+next.airSupply.operatingState+' | DEMISTER DRAINAGE: '+(next.stations.DEMISTER_DRAINAGE??'Vacant')+' · '+next.demister.operatingState;
    $('switch-brace').disabled=!!owner;
    $('switch-repair').disabled=!!next.stations.DOOR_REPAIR;
    repairUI?.update(next);
    pneumaticUI?.update(next);
    $('occupancy').textContent=draining?'YOU ARE OPERATING DEMISTER DRAINAGE':supplying?'YOU ARE OPERATING POSITIVE-PRESSURE AIR SUPPLY':purging?'YOU ARE OPERATING EMERGENCY PURGE':scrubbing?'YOU ARE OPERATING CHEMICAL SCRUBBER':wiring?'YOU ARE OPERATING LIVE WIRE':filtering?'YOU ARE OPERATING FILTER BANK':sealing?'YOU ARE OPERATING SERVICE SEAL':diverting?'YOU ARE OPERATING INTAKE DIVERSION':repairing?'YOU ARE OPERATING DOOR REPAIR':owned?'YOU ARE OPERATING DOOR BRACE':owner?`OCCUPIED BY PLAYER ${owner}`:'STATION AVAILABLE';
    $('release').hidden=!Object.values(next.stations).includes(player);$('release').textContent=leavingStation?'LEAVING…':'LEAVE STATION';
    $('release').disabled=leavingStation||(!draining&&!supplying&&!owned&&!repairing&&!diverting&&!sealing&&!filtering&&!wiring&&!scrubbing&&!purging);

  }
  if(role==='admin'){
    localDevelopment=!!next.localDevelopment;$('local-development').hidden=!localDevelopment;$('login').hidden=true;
    document.querySelectorAll('#config input,#config select').forEach(el=>el.disabled=false);
    for(const el of document.querySelectorAll('[data-command]')){const type=el.dataset.command;el.disabled=(type==='start'&&next.status!=='ready')||(type==='pause'&&next.status!=='running')||(type==='resume'&&next.status!=='paused');}
    $('config').querySelector('button').disabled=false;
    // Refresh untouched fields without discarding drafts that still need Apply.
    for(const [key,value] of Object.entries(next.config)){const input=$('config').elements.namedItem(key);if(!input)continue;const shown=value??'';if(!configLoaded||(document.activeElement!==input&&String(input.value)===configShown[key]))input.value=shown;if(String(input.value)===String(shown))configShown[key]=String(shown);}configLoaded=true;
    $('config').elements.namedItem('UPPER_RIDGE_SERVICE').disabled=next.status!=='ready';
    for(const [name,value] of [['wheelDrive',next.config.wheelDrive],['wheelInertia',next.config.wheelInertia],['wheelDrag',next.config.wheelDrag],['compressorRate',next.config.compressorRate],['compressorLag',next.config.compressorLag],['pressureLeak',next.config.pressureLeak],['reliefRate',next.config.reliefRate],['lockedMultiplier',next.config.lockedMultiplier],['repairSpeed1',next.config.repairSpeed1],['repairWidth1',next.config.repairWidth1],['repairSpeed2',next.config.repairSpeed2],['repairWidth2',next.config.repairWidth2],['repairSpeed3',next.config.repairSpeed3],['repairWidth3',next.config.repairWidth3],['repairSpeed4',next.config.repairSpeed4],['repairWidth4',next.config.repairWidth4],['repairPositionTolerance',next.config.repairPositionTolerance],['repairAngleTolerance',next.config.repairAngleTolerance],['repairBraceSpeedFactor',next.config.repairBraceSpeedFactor],['repairBraceWidthBonus',next.config.repairBraceWidthBonus],['visualSensitivity',next.config.visualSensitivity]]){const input=$('config').elements.namedItem(name);if(document.activeElement!==input)input.value=value;$(name+'-current').textContent=`Current: ${value}`;}
    for(const key of ['demisterMaxRestriction','demisterStableMin','demisterStableMax','airSupplyIngressReduction','airSupplyStableMin','airSupplyStableMax','purgeRemovalFraction','purgeStableMin','purgeStableMax','scrubberRemovalFraction','liveWireDisturbance','liveWireCatchScale','liveWireProtected','liveWireWarning','maxPowerPenalty']){const input=$('config').elements.namedItem(key);if(document.activeElement!==input)input.value=next.config[key];}
    const d=next.debug;
    $('intake-solution').textContent=Object.entries(next.intake.solution).map(([id,turns])=>`(${Math.floor(id/next.intake.size)},${id%next.intake.size}): ${turns*90}°`).join('\n');
    const rows={'Demister occupant':next.stations.DEMISTER_DRAINAGE??'Vacant','Demister condition':next.demister.operatingState,'Demister remaining droplets':next.demister.model.drops.length,'Demister fouling':next.demister.fouling,'Demister scrubber multiplier':next.demister.modifier,'Demister clearances':next.demister.restorations,'Positive-Pressure Air Supply occupant':next.stations.AIR_SUPPLY??'Vacant','Air Supply condition':next.airSupply.operatingState,'Air Supply damage stage':next.airSupply.model.stage+1,'Air Supply leak coverage':next.airSupply.model.metrics.leaks.join(' / '),'Air Supply delivery':next.airSupply.model.metrics.supply,'Air Supply target':next.airSupply.model.target,'Air Supply restorations':next.airSupply.restorations,'Air Supply wear':next.airSupply.wear,'Air Supply protection':d.pressureEffectiveness,'Pressure ingress multiplier':d.pressureMultiplier,'Ingress before pressure':d.ingressBeforePressure,'Emergency Purge occupant':next.stations.EMERGENCY_PURGE??'Vacant','Emergency Purge state':next.purge.operatingState,'Purge filter configuration':next.purge.model.configuration,'Purge cycle':next.purge.model.cycle,'Purge accumulator':next.purge.model.toggle.charge,'Purge fouling':next.purge.fouling,'Last purge':JSON.stringify(next.purge.lastEvent),'Current airborne gas':d.currentAirborneGas,'Historical exposure (CU·s)':d.chemicalExposure,'Total gas purged':d.totalGasPurged,'Chemical Scrubber occupant':next.stations.CHEMICAL_SCRUBBER??'Vacant','Chemical Scrubber state':next.scrubber.operatingState,'Scrubber work remaining':next.scrubber.progress.remaining,'Upper Ridge service':next.act4.UPPER_RIDGE_SERVICE??'NOT SUPPLIED — PURGE OFFLINE','Available stations':next.availableStationCount,'Station ownership':JSON.stringify(next.stations),'Scrubber first visit':next.scrubber.firstVisit?JSON.stringify(next.scrubber.firstVisit):'Not yet visited','Scrubber treated / required':next.scrubber.progress.treated+' / '+next.scrubber.progress.total,'Scrubber physical targets':next.scrubber.pockets.length,'Scrubber queued penalties':next.scrubber.progress.queuedPenalties,'Scrubber penalties':next.scrubber.stats.penalties,'Scrubber loading':next.scrubber.load,'Scrubber treatment effectiveness':next.scrubber.effectiveness,'Gross gas ingress':d.grossIngressRate,'Cumulative gross gas admitted':d.totalGasAdmitted,'Cumulative burden treated':d.totalGasTreated,'Scrubber treatment rate':d.treatmentRate,'Live Wire connections':next.liveWire.wires.map(w=>`${w.id}: ${w.state} · head ${w.nodes.at(-1).x.toFixed(1)},${w.nodes.at(-1).y.toFixed(1)} · lock ${(w.progress*100).toFixed(1)}%`).join(' | '),'Live Wire holder':next.liveWire.control?.player??'None','Live Wire protection remaining':next.liveWire.protectedRemaining,'Live Wire upcoming failure':next.liveWire.upcomingFailure,'Live Wire cycle':JSON.stringify(next.liveWire.cycle),'Electrical gas multiplier':next.debug.electricalMultiplier,'Live Wire occupant':next.stations.LIVE_WIRE??'Vacant','Filter active debris':next.filter.debris.length,'Filter pieces collected':next.filter.cleared,'Filter obstruction':next.filter.obstruction,'Filter gas factor':d.filterMultiplier,'Filter air reserve':next.filter.reserve,'Filter time since cleaning':next.filter.timeSinceClear??'Not yet cleaned','Filter occupant':next.stations.FILTER_BANK??'Vacant','Filter physics':next.filter.physics,'Service panel coverage':next.service.perPanel.map(n=>(n*100).toFixed(1)+'%').join(' / '),'Service active panel':next.service.activePanel+1,'Service path length':next.service.totalPathLength,'Service active tracing time':next.service.activeTracingTime.toFixed(1)+' s','Service station elapsed time':next.service.elapsedInStation.toFixed(1)+' s','Sealant exhausted':next.service.exhausted?'YES':'NO','Sealant remaining':next.service.remaining,'Fracture coverage':next.service.perFracture.map(n=>(n*100).toFixed(1)+'%').join(' / '),'Service sealed percentage':next.service.coverage*100,'Service unsealed fraction':next.service.unsealedFraction,'Service ingress':d.serviceRate,'Service occupant':next.stations.SERVICE_SEAL??'Vacant','Intake state':next.intake.complete?'COMPLETE':'INCOMPLETE','Intake source-to-outlet':next.intake.connected?'CONNECTED':'DISCONNECTED','Intake orientations':next.intake.tiles.map(t=>`${t.id}: ${(t.turns%4)*90}°`).join(', '),'Intake rotations':next.intake.rotations,'Intake gas rate':d.intakeRate,'Door gas rate':d.doorRate,'Door ingress after filter':next.air.sources.door,'Service ingress after filter':next.air.sources.service,'Rate trend (last second)':next.air.rateTrend,'Intake occupant':next.stations.INTAKE_DIVERSION??'Vacant','Repair current lock':Math.min(4,next.repair.secured+1),'Locks secured':next.repair.secured,'Repair stage':next.repair.stage,'Assembly failures':next.repair.failures,'Timing effective speed':next.repair.attempt?next.repair.attempt.speed+' units/s':'No active attempt','Timing effective width':next.repair.attempt?next.repair.attempt.width+'%':'No active attempt','Timing brace assistance':next.repair.attempt?(next.repair.attempt.braceLocked?'LOCKED (frozen for this attempt)':'UNLOCKED (frozen for this attempt)'):'No active attempt','Repair multiplier':d.repairMultiplier,'Repair occupant':next.stations.DOOR_REPAIR??'Vacant','Wheel speed':b.speed.toFixed(3)+' rad/s','Compressor output':b.output.toFixed(3)+' pressure/s','Accumulator pressure':b.pressure.toFixed(3),'Pressure trend':b.trend,'Relief valve':b.relief?'OPEN':'CLOSED','Drive cutouts':b.trips,'Clutch position':`${b.clutchDown} down / ${b.clutchSlide} right / ${b.clutchUp} up`,'Clutch engaged':b.clutchEngaged,'Deployment eligibility':b.deploymentReason,'Overpressure latched':b.fault,'Relief recovery':b.recovered?'FAULT CLEARED':b.relief?'VENTING':b.fault?'REQUIRED':'READY','Repair brace assistance':b.engaged,'Brace engagement':b.engaged?'ENGAGED':'DISENGAGED','Inputs accepted':next.inputDiagnostics.accepted,'Inputs rejected':next.inputDiagnostics.rejected,'Duplicate inputs':next.inputDiagnostics.duplicates,'Brace state':b.condition,'Simulation elapsed':`${next.elapsed.toFixed(2)} s`,'Outside hazard':d.outsideHazard.toFixed(2),'Brace effectiveness':`${(d.effectiveness*100).toFixed(1)}%`,'Brace multiplier':`×${d.multiplier.toFixed(3)}`,'Current gas rate':`${d.gasRate.toFixed(3)} units/s`,'Cumulative gas':`${d.totalGas.toFixed(3)} units`,'Player occupancy':owner?`Player ${owner}`:'Vacant','Connections':next.connections};
    $('server-input-events').textContent=next.inputDiagnostics.recent.map(event=>`${event.elapsed.toFixed(2)}s · ${event.player} #${event.seq} ${event.action}: ${event.duplicate?'DUPLICATE ':''}${event.status} ${event.code} — ${event.message}${event.timing?' · timing '+JSON.stringify(event.timing):''}`).reverse().join('\n');
    $('diagnostics').replaceChildren(...Object.entries(rows).flatMap(([key,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;return[dt,dd];}));
  }
}
function cancelGesture(reason='Control cancelled by station/session change'){demisterUI?.suspend();airSupplyUI?.suspend();purgeUI?.suspend();scrubberUI?.suspend();liveWireUI?.suspend();pneumaticUI?.cancel(reason);}
if(role==='player'){
  if(!$('clock')){const clock=document.createElement('b');clock.id='clock';clock.textContent='05:00';document.querySelector('header .session')?.prepend(clock);}
  demisterUI=attachDemister({get:$,send,player});
  $('switch-demister').onclick=()=>{repairUI.suspend();intakeUI.suspend();serviceUI.suspend('STATION_SWITCH');filterUI.suspend();cancelGesture();send({type:'claim',station:'DEMISTER_DRAINAGE'});};
  airSupplyUI=attachAirSupply({get:$,send,player});
  $('switch-air').onclick=()=>{repairUI.suspend();intakeUI.suspend();serviceUI.suspend('STATION_SWITCH');filterUI.suspend();cancelGesture();send({type:'claim',station:'AIR_SUPPLY'});};
  purgeUI=attachPurge({get:$,send,player});
  $('switch-purge').onclick=()=>{repairUI.suspend();intakeUI.suspend();serviceUI.suspend('STATION_SWITCH');filterUI.suspend();cancelGesture();send({type:'claim',station:'EMERGENCY_PURGE'});};
  gasMonitor=attachGasMonitor({get:$,player});
  scrubberUI=attachScrubber({get:$,send,player,onRestore:()=>beep('complete')});
  $('switch-scrubber').onclick=()=>{repairUI.suspend();intakeUI.suspend();serviceUI.suspend('STATION_SWITCH');filterUI.suspend();cancelGesture();send({type:'claim',station:'CHEMICAL_SCRUBBER'});};
  liveWireUI=attachLiveWire({get:$,send,player,onImpact:kind=>beep('lock')});
  $('switch-livewire').onclick=()=>{repairUI.suspend();intakeUI.suspend();serviceUI.suspend('STATION_SWITCH');filterUI.suspend();cancelGesture();send({type:'claim',station:'LIVE_WIRE'});};
  $('repair-audio').addEventListener('change',()=>{$('audio').checked=$('repair-audio').checked;if($('audio').checked)beep('lock');});
  $('audio').addEventListener('change',()=>{$('repair-audio').checked=$('audio').checked;});
  filterUI=attachFilter({get:$,send,player,onFire:()=>beep(),onCollect:()=>beep('lock'),onClear:()=>beep('complete')});
  $('filter-audio').addEventListener('change',()=>{$('audio').checked=$('filter-audio').checked;});
  $('switch-filter').onclick=()=>{repairUI.suspend();intakeUI.suspend();serviceUI.suspend('STATION_SWITCH');filterUI.suspend();cancelGesture();send({type:'claim',station:'FILTER_BANK'});};
  serviceUI=attachService({get:$,send,player});
  $('switch-service').onclick=()=>{repairUI.suspend();intakeUI.suspend();serviceUI.suspend('STATION_SWITCH');filterUI.suspend();cancelGesture();send({type:'claim',station:'SERVICE_SEAL'});};
  intakeUI=attachIntake({get:$,send,player,onTurn:()=>beep(),onComplete:()=>beep('complete')});
  $('switch-intake').onclick=()=>{repairUI.suspend();intakeUI.suspend();serviceUI?.suspend('STATION_SWITCH');filterUI?.suspend();cancelGesture();send({type:'claim',station:'INTAKE_DIVERSION'});};
  $('intake-audio').addEventListener('change',()=>{$('audio').checked=$('intake-audio').checked;});
  repairUI=attachRepair({get:$,send,player,onSuccess:complete=>beep(complete?'complete':'lock'),onFailure:()=>beep('shift'),onImpact:outcome=>repairImpact(outcome)});
  $('switch-brace').onclick=()=>{repairUI.suspend();intakeUI.suspend();serviceUI?.suspend('STATION_SWITCH');filterUI?.suspend();cancelGesture();send({type:'claim',station:'DOOR_BRACE'});};
  $('switch-repair').onclick=()=>{repairUI.suspend();intakeUI.suspend();serviceUI?.suspend('STATION_SWITCH');filterUI?.suspend();cancelGesture();send({type:'claim',station:'DOOR_REPAIR'});};
  $('player-label').textContent=`PLAYER ${player.padStart(2,'0')} / TEN WORK LOCATIONS`;
  $('release').onclick=leaveStation;
  pneumaticUI=attachPneumatic({get:$,send,player,idPrefix:client,onDiagnostic:record=>{traceGesture(record);inputDiagnostic(JSON.stringify(record));},onTrip:kind=>beep(kind==='deploy'?'lock':'shift')});
}
if(role==='admin'){
  $('config').elements.namedItem('UPPER_RIDGE_SERVICE').addEventListener('change',e=>send({type:'config',patch:{UPPER_RIDGE_SERVICE:e.target.value||null}}));
  for(const key of ['demisterMaxRestriction','demisterStableMin','demisterStableMax','airSupplyIngressReduction','airSupplyStableMin','airSupplyStableMax','purgeRemovalFraction','purgeStableMin','purgeStableMax','scrubberRemovalFraction','liveWireDisturbance','liveWireCatchScale','liveWireProtected','liveWireWarning','maxPowerPenalty'])$('config').elements.namedItem(key).addEventListener('change',e=>{if(e.target.checkValidity())send({type:'config',patch:{[key]:Number(e.target.value)}});});
  for(const [name,key] of [['filterCirculation','filterCirculation'],['filterEddyStrength','filterEddyStrength'],['filterPulseStrength','filterPulseStrength'],['filterCapacity','filterCapacity'],['filterPulseCost','filterPulseCost'],['filterRecharge','filterRecharge'],['filterCleanInterval','filterCleanInterval'],['filterLoadInterval','filterLoadInterval'],['maxFilterPenalty','maxFilterPenalty'],['filterGravity','filterGravity'],['filterDamping','filterDamping'],['filterRestitution','filterRestitution'],['wheelDrive','wheelDrive'],['wheelInertia','wheelInertia'],['wheelDrag','wheelDrag'],['compressorRate','compressorRate'],['compressorLag','compressorLag'],['pressureLeak','pressureLeak'],['reliefRate','reliefRate'],['lockedMultiplier','lockedMultiplier'],['repairSpeed1','repairSpeed1'],['repairWidth1','repairWidth1'],['repairSpeed2','repairSpeed2'],['repairWidth2','repairWidth2'],['repairSpeed3','repairSpeed3'],['repairWidth3','repairWidth3'],['repairSpeed4','repairSpeed4'],['repairWidth4','repairWidth4'],['repairPositionTolerance','repairPositionTolerance'],['repairAngleTolerance','repairAngleTolerance'],['repairBraceSpeedFactor','repairBraceSpeedFactor'],['repairBraceWidthBonus','repairBraceWidthBonus'],['visualSensitivity','visualSensitivity']])$('config').elements.namedItem(name).addEventListener('change',event=>{if(event.target.checkValidity())send({type:'config',patch:{[key]:Number(event.target.value)}});});
  document.querySelectorAll('[data-command]').forEach(el=>el.onclick=()=>send({type:el.dataset.command}));
  $('config').onsubmit=event=>{event.preventDefault();const patch={};for(const [key,value] of new FormData(event.target))patch[key]=key==='UPPER_RIDGE_SERVICE'?(value||null):key==='airQuality'?value:Number(value);send({type:'config',patch});error('Settings submitted; authoritative values appear in diagnostics.');};
  $('login').onsubmit=async event=>{event.preventDefault();const response=await fetch('/api/admin/login',{method:'POST',body:$('token').value});$('token').value='';if(response.ok){clearTimeout(retry);startConnection();}else error('Admin authentication failed.');};
}
$('audio')?.addEventListener('change',()=>{if($('audio').checked)beep();});
async function startConnection(){
  const attempt=++connectionAttempt;clearTimeout(retry);clearTimeout(connectionTimer);
  const old=ws;ws=null;try{old?.close();}catch{}
  demisterUI?.suspend();airSupplyUI?.suspend();purgeUI?.suspend();scrubberUI?.suspend();liveWireUI?.suspend();gasMonitor?.suspend();pneumaticUI?.suspend();repairUI?.suspend();intakeUI?.suspend();serviceUI?.suspend('CONNECTION_RESTART');filterUI?.suspend();disableControls();$('connection').textContent='CHECKING SESSION';
  if(role!=='admin'){connect();return;}
  const controller=new AbortController();
  connectionTimer=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetch('/api/session',{signal:controller.signal,cache:'no-store'});
    if(attempt!==connectionAttempt)return;
    if(!response.ok)throw Error(`Session check returned HTTP ${response.status}`);
    const info=await response.json();if(attempt!==connectionAttempt)return;
    if(typeof info.localDevelopment!=='boolean'||typeof info.adminAuthorized!=='boolean')throw Error('Invalid session-check response');
    clearTimeout(connectionTimer);localDevelopment=info.localDevelopment;
    $('local-development').hidden=!localDevelopment;$('login').hidden=localDevelopment||info.adminAuthorized;
    if(info.adminAuthorized)connect();else connectionFailure('AUTHENTICATION REQUIRED','This server requires a valid admin session. Sign in, then retry.');
  }catch(err){if(attempt!==connectionAttempt)return;connectionFailure('CONNECTION FAILED',err.name==='AbortError'?'HTTP session check timed out after 8 seconds.':err.message);}
}
if($('retry-connection'))$('retry-connection').onclick=()=>startConnection();
if(role==='screen')$('station-overview').innerHTML=stationOverviewMarkup();
setInterval(paintClock,100);disableControls();startConnection();
