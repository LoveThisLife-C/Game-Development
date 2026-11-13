import {createDemister,cancelDemister,advanceDemister,demisterView,demisterMultiplier,demisterError,applyDemister} from './demister.js';
import {createAirSupply,cancelAirSupply,advanceAirSupply,airSupplyView,airSupplyEffectiveness,airSupplyError,applyAirSupply} from './air-supply.js';
import {createPurge,cancelPurge,advancePurge,purgeView,purgeError,applyPurge,airborneGas,purgeAvailable} from './emergency-purge.js';
import {stationStatuses} from '../../prototype/act5/station-status.js';
import {createScrubber,cancelScrubber,advanceScrubber,openScrubber,scrubberView,scrubberEffectiveness,scrubberError,applyScrubber} from './chemical-scrubber.js';
import {createLiveWire,cancelLiveWire,syncLiveWire,liveWireView,electricalMultiplier,liveWireError,applyLiveWire,advanceLiveWire} from './live-wire.js';
import {createPneumatic,cancelPneumatic,syncPneumatic,pneumaticEffectiveness,pneumaticView,pneumaticError,applyPneumatic,advancePneumatic} from './pneumatic.js';
import {createFilter,filterView,filterMultiplier,filterError,fireFilter,advanceFilter} from './filter.js';
import {createService,cancelService,serviceView,serviceMetrics,serviceError,applyService} from './service.js';
import {createIntake,intakeView,intakeError,rotateIntake,REFERENCE} from './intake.js';
import {createRepair,repairView,repairMultiplier,repairError,applyRepair,invalidateRepair,advanceRepair} from './repair.js';
import {accumulatedGasVisual} from './gas-visual.js';
export const STATIONS = Object.freeze({ DOOR_BRACE: { name: 'Door Brace' }, DOOR_REPAIR: { name: 'Door Repair' }, INTAKE_DIVERSION: { name: 'Intake Diversion' }, SERVICE_SEAL: { name: 'Service Seal' }, FILTER_BANK: { name: 'Filter Bank' }, LIVE_WIRE: { name: 'Live Wire' }, CHEMICAL_SCRUBBER: { name: 'Chemical Scrubber' }, EMERGENCY_PURGE: { name: 'Emergency Purge' }, AIR_SUPPLY: { name: 'Positive-Pressure Air Supply' }, DEMISTER_DRAINAGE: { name: 'Demister Drainage' } });
export const DEFAULT_CONFIG = Object.freeze({ UPPER_RIDGE_SERVICE:null,demisterMaxRestriction:.40,demisterStableMin:45,demisterStableMax:60,airSupplyIngressReduction:.20,airSupplyStableMin:45,airSupplyStableMax:60,purgeRemovalFraction:.30,purgeStableMin:45,purgeStableMax:60,scrubberRemovalFraction:.25,liveWireDisturbance:1,liveWireCatchScale:1,liveWireProtected:50,liveWireWarning:5,maxPowerPenalty:.24, filterPulseStrength:1000,filterCapacity:100,filterPulseCost:25,filterRecharge:12,filterCleanInterval:42,filterLoadInterval:4,maxFilterPenalty:1,filterGravity:55,filterDamping:.08,filterRestitution:.6,filterCirculation:110,filterEddyStrength:15, serviceCapacity:505,serviceApplication:4,serviceConsumption:6,serviceMaxSpeed:110,serviceTolerance:12,serviceHazardRate:35, intakeHazardRate:40, repairSpeed1:85,repairWidth1:15,repairSpeed2:110,repairWidth2:12,repairSpeed3:140,repairWidth3:10,repairSpeed4:170,repairWidth4:8,repairPositionTolerance:6,repairAngleTolerance:6,repairBraceSpeedFactor:.75,repairBraceWidthBonus:6,  airQuality: 'WORKING', outsideHazardStart: 100, hazardGrowth: 0.15, wheelDrive:6,wheelInertia:1,wheelDrag:.9,compressorRate:7.5,compressorLag:.8,pressureLeak:.6,reliefRate:18,seed:1,lockedMultiplier:.55,noEffectiveMultiplier:1,visualSensitivity:1,duration:0 });
const bounds = { demisterMaxRestriction:[0,.8],demisterStableMin:[10,180],demisterStableMax:[10,180],airSupplyIngressReduction:[0,.4],airSupplyStableMin:[10,180],airSupplyStableMax:[10,180],purgeRemovalFraction:[0,.6],purgeStableMin:[10,180],purgeStableMax:[10,180],scrubberRemovalFraction:[0,.5],liveWireDisturbance:[.4,1.6],liveWireCatchScale:[.6,1],liveWireProtected:[5,120],liveWireWarning:[1,10],maxPowerPenalty:[0,.5], filterCirculation:[0,300],filterEddyStrength:[0,150],filterPulseStrength:[50,1500],filterCapacity:[25,200],filterPulseCost:[5,100],filterRecharge:[1,50],filterCleanInterval:[10,180],filterLoadInterval:[1,15],maxFilterPenalty:[0,3],filterGravity:[0,500],filterDamping:[0,3],filterRestitution:[0,.9], serviceCapacity:[20,1500],serviceApplication:[1,12],serviceConsumption:[2,20],serviceMaxSpeed:[40,250],serviceTolerance:[5,25],serviceHazardRate:[0,1000], intakeHazardRate:[0,1000], repairSpeed1:[10,200],repairWidth1:[2,60],repairSpeed2:[10,200],repairWidth2:[2,60],repairSpeed3:[10,200],repairWidth3:[2,60],repairSpeed4:[10,200],repairWidth4:[2,60],repairPositionTolerance:[1,15],repairAngleTolerance:[1,15],repairBraceSpeedFactor:[.2,1],repairBraceWidthBonus:[0,30], outsideHazardStart:[0,1000], hazardGrowth:[0,10], wheelDrive:[1,15],wheelInertia:[.5,3],wheelDrag:[.2,3],compressorRate:[1,15],compressorLag:[.1,3],pressureLeak:[.1,3],reliefRate:[5,40],seed:[0,4294967295],lockedMultiplier:[.1,.95],noEffectiveMultiplier:[1,1],visualSensitivity:[.1,5],duration:[0,36000] };
export function validateConfig(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Error('Invalid configuration');
  for (const [k,v] of Object.entries(patch)) {
    if(k==='UPPER_RIDGE_SERVICE'){if(v!==null&&!['RESTORED','NOT_RESTORED'].includes(v))throw Error('UPPER_RIDGE_SERVICE must be RESTORED, NOT_RESTORED or not supplied');}
    else if (k === 'airQuality') { if (!['WORKING','BROKEN'].includes(v)) throw Error('Invalid air quality'); }
    else if (!Object.hasOwn(bounds,k) || !Number.isFinite(v) || v < bounds[k][0] || v > bounds[k][1]) throw Error(`Invalid setting: ${k}`);
  }
  if(patch.demisterStableMin>patch.demisterStableMax)throw Error('Demister stable minimum exceeds maximum');
  if(patch.airSupplyStableMin>patch.airSupplyStableMax)throw Error('Air Supply stable minimum exceeds maximum');
  if(patch.purgeStableMin>patch.purgeStableMax)throw Error('Purge stable minimum exceeds maximum');
  if (patch.filterPulseCost > patch.filterCapacity) throw Error('Pulse cost must not exceed reservoir capacity');
  if ('seed' in patch && !Number.isInteger(patch.seed)) throw Error('Seed must be a uint32 integer');
  if(patch.reliefRate<=patch.compressorRate-patch.pressureLeak)throw Error('Relief must exceed maximum net compressor charge');
  if(patch.lockedMultiplier>patch.noEffectiveMultiplier)throw Error('Brace protection must reduce leakage');
}
export function createGame(config = {}) {
  validateConfig(config);
  validateConfig({...DEFAULT_CONFIG,...config});
  const settings={...DEFAULT_CONFIG,...config};
  const state={ demister:createDemister(settings.seed),airSupply:createAirSupply(),purge:createPurge(),totalGasPurged:0,chemicalExposure:0,scrubber:createScrubber(),liveWire:createLiveWire(settings),filter:createFilter(settings),service:createService(settings),intake:createIntake(),repair:createRepair(),pneumatic:createPneumatic(),locked:false,config:settings,status:'ready',ticks:0,remainder:0,elapsed:0,totalGas:0,totalGasAdmitted:0,outsideHazard:settings.outsideHazardStart,stations:Object.fromEntries(Object.keys(STATIONS).map(id=>[id,null])) };
  state.gasRateHistory=[{at:0,rate:gasMetrics(state).gasRate}];return state;
}

const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
export function configureGame(state,patch){
 validateConfig(patch);validateConfig({...state.config,...patch});
 if(Object.hasOwn(patch,'UPPER_RIDGE_SERVICE')&&patch.UPPER_RIDGE_SERVICE!==state.config.UPPER_RIDGE_SERVICE&&state.status!=='ready')throw Object.assign(Error('Upper Ridge is fixed for this act. Reset to initialise another session.'),{code:'ACT4_STATE_LOCKED'});
 Object.assign(state.config,patch);
 if(!purgeAvailable(state)&&state.stations.EMERGENCY_PURGE!==null){cancelPurge(state);state.stations.EMERGENCY_PURGE=null;}
 state.filter.reserve=Math.min(state.filter.reserve,state.config.filterCapacity);
 if(state.filter.nextLoadAt!==null&&('filterCleanInterval' in patch||'filterLoadInterval' in patch))state.filter.nextLoadAt=state.filter.phase==='CLEAR'?Math.max(state.elapsed+.01,state.filter.lastClearAt+state.config.filterCleanInterval):state.elapsed+state.config.filterLoadInterval;
 syncLiveWire(state);state.pneumatic.output=Math.min(state.pneumatic.output,state.config.compressorRate);syncPneumatic(state);
}
export function braceMetrics(state) {
  const c=state.config,effectiveness=pneumaticEffectiveness(state),multiplier=effectiveness?c.lockedMultiplier:1;
  return {effectiveness,multiplier,outsideHazard:state.outsideHazard,gasRate:state.outsideHazard*multiplier*repairMultiplier(state)};
}
export function gasMetrics(state){
 const doorRate=braceMetrics(state).gasRate,intakeRate=state.intake.complete?0:state.config.intakeHazardRate,serviceRate=state.config.serviceHazardRate*serviceMetrics(state).unsealedFraction;
 const multiplier=filterMultiplier(state),electricalFactor=electricalMultiplier(state),ingressBeforePressure=intakeRate+(doorRate+serviceRate)*multiplier*electricalFactor;
 const pressureEffectiveness=airSupplyEffectiveness(state),pressureMultiplier=1-state.config.airSupplyIngressReduction*pressureEffectiveness,grossIngressRate=ingressBeforePressure*pressureMultiplier;
 // Legacy score remains cumulative burden. Scrubber treats a
 // bounded share of incoming burden BEFORE it accumulates; never erase history.
 const demisterFactor=demisterMultiplier(state),effectiveness=scrubberEffectiveness(state),scrubberRemovalFraction=state.config.scrubberRemovalFraction*effectiveness*demisterFactor,treatmentRate=grossIngressRate*scrubberRemovalFraction;
 return {demisterMultiplier:demisterFactor,ingressBeforePressure,pressureEffectiveness,pressureMultiplier,doorRate,intakeRate,serviceRate,filterMultiplier:multiplier,electricalMultiplier:electricalFactor,grossIngressRate,scrubberEffectiveness:effectiveness,scrubberRemovalFraction,treatmentRate,gasRate:grossIngressRate-treatmentRate};
}
export function getActionError(state, playerId, action) {
  const fail=(code,message)=>({code,message});
  if (typeof playerId!=='string' || !/^\d{1,3}$/.test(playerId)) return fail('INVALID_PLAYER','Invalid player identity');
  if (!action || !['claim','release','demister_hover','demister_grab','demister_move','demister_end','demister_cancel','air_grab','air_move','air_valve','air_end','air_cancel','brace_begin','brace_turn','brace_clutch','brace_end','repair_select','repair_place','repair_begin','repair_stop','repair_cancel','repair_suspend','intake_rotate','service_select','service_begin','service_apply','service_reanchor','service_end','filter_shot','wire_begin','wire_move','wire_end','wire_cancel','scrubber_move','scrubber_down','scrubber_up','scrubber_cancel','purge_begin','purge_move','purge_end','purge_cancel'].includes(action.type)) return fail('INVALID_ACTION','Unsupported player action');
  if (action.type==='claim') {
    if (!Object.hasOwn(STATIONS,action.station)) return fail('INVALID_STATION','Unknown station');
    if(action.station==='EMERGENCY_PURGE'&&!purgeAvailable(state))return fail('STATION_OFFLINE','Upper Ridge service unavailable — Emergency Purge is offline');
    if (state.stations[action.station] && state.stations[action.station]!==playerId) return fail('STATION_OCCUPIED','Station is occupied by another player');
    return null;
  }
  if (action.type==='release') {
    const station=action.station??Object.keys(state.stations).find(k=>state.stations[k]===playerId);
    return Object.hasOwn(STATIONS,station)&&state.stations[station]===playerId?null:fail('NOT_OWNER','You do not occupy this station');
  }
  if (action.type.startsWith('demister_')) return demisterError(state,playerId,action);
  if (action.type.startsWith('air_')) return airSupplyError(state,playerId,action);
  if (action.type.startsWith('purge_')) return purgeError(state,playerId,action);
  if (action.type.startsWith('scrubber_')) return scrubberError(state,playerId,action);
  if (action.type.startsWith('wire_')) return liveWireError(state,playerId,action);
  if (action.type==='filter_shot') return filterError(state,playerId,action);
  if (action.type.startsWith('service_')) return serviceError(state,playerId,action);
  if (action.type==='intake_rotate') return intakeError(state,playerId,action);
  if (action.type.startsWith('repair_')) return repairError(state,playerId,action);
  return pneumaticError(state,playerId,action);
}

export function applyAction(state, playerId, action) {
  if (getActionError(state,playerId,action)) return false;
  if (action.type==='claim') {
    for(const station of Object.keys(state.stations))if(state.stations[station]===playerId&&station!==action.station){
      state.stations[station]=null;if(station==='DOOR_BRACE')cancelPneumatic(state);if(station==='DOOR_REPAIR')invalidateRepair(state);if(station==='SERVICE_SEAL')cancelService(state);if(station==='LIVE_WIRE')cancelLiveWire(state);if(station==='CHEMICAL_SCRUBBER')cancelScrubber(state);if(station==='EMERGENCY_PURGE')cancelPurge(state);if(station==='AIR_SUPPLY')cancelAirSupply(state);if(station==='DEMISTER_DRAINAGE')cancelDemister(state);
    }
    state.stations[action.station]=playerId;
    if(action.station==='CHEMICAL_SCRUBBER')openScrubber(state);
  } else if (action.type==='release') {
    const station=action.station??Object.keys(state.stations).find(k=>state.stations[k]===playerId);
    state.stations[station]=null;if(station==='DOOR_BRACE')cancelPneumatic(state);if(station==='DOOR_REPAIR')invalidateRepair(state);if(station==='SERVICE_SEAL')cancelService(state);if(station==='LIVE_WIRE')cancelLiveWire(state);if(station==='CHEMICAL_SCRUBBER')cancelScrubber(state);if(station==='EMERGENCY_PURGE')cancelPurge(state);if(station==='AIR_SUPPLY')cancelAirSupply(state);if(station==='DEMISTER_DRAINAGE')cancelDemister(state);
  } else if(action.type.startsWith('demister_')) applyDemister(state,action);
  else if(action.type.startsWith('air_')) applyAirSupply(state,action);
  else if(action.type.startsWith('purge_')) return applyPurge(state,action);
  else if(action.type.startsWith('scrubber_')) applyScrubber(state,action);
  else if(action.type.startsWith('wire_')) applyLiveWire(state,playerId,action);
  else if(action.type==='filter_shot') fireFilter(state,action);
  else if(action.type.startsWith('service_')) applyService(state,action);
  else if(action.type==='intake_rotate') rotateIntake(state,action);
  else if(action.type.startsWith('repair_')) applyRepair(state,action);
  else applyPneumatic(state,action);
  return true;
}
export function advanceSimulation(state, seconds) {
  if (state.status!=='running' || !Number.isFinite(seconds) || seconds<0) return;
  state.remainder+=seconds;
  // 10 ms fixed integration makes different caller frequencies produce identical results.
  while (state.remainder+1e-9>=0.01 && state.status==='running') {
    state.remainder=Math.max(0,state.remainder-0.01);
    const before=gasMetrics(state);
    state.elapsed=++state.ticks/100;
    if(state.stations.SERVICE_SEAL!==null)state.service.elapsedInStation+=.01;
    state.outsideHazard+=state.config.hazardGrowth*0.01;
    advancePneumatic(state,.01);
    advanceFilter(state,.01);
    advanceLiveWire(state,.01);
    advanceScrubber(state,.01);
    advancePurge(state,.01);
    advanceAirSupply(state,.01);
    advanceDemister(state,.01);
    const after=gasMetrics(state);
    state.totalGas+=(before.gasRate+after.gasRate)*0.005;
    state.totalGasAdmitted+=(before.grossIngressRate+after.grossIngressRate)*0.005;
    state.chemicalExposure+=airborneGas(state)/100*.01;
    advanceRepair(state);
    // A bounded one-second history is instrumentation, not a second scoring model.
    if(state.ticks%10===0){state.gasRateHistory.push({at:state.elapsed,rate:gasMetrics(state).gasRate});if(state.gasRateHistory.length>11)state.gasRateHistory.shift();}
    if (state.config.duration>0 && state.elapsed>=state.config.duration){cancelPneumatic(state);cancelLiveWire(state);cancelScrubber(state);cancelPurge(state);cancelAirSupply(state);cancelDemister(state);state.status='stopped';}
  }
}
export function getGameResult(state) { return state.status==='stopped'?{elapsed:state.elapsed,totalGas:state.totalGas,currentAirborneGas:airborneGas(state),totalGasPurged:state.totalGasPurged,chemicalExposure:state.chemicalExposure,totalGasAdmitted:state.totalGasAdmitted,totalGasTreated:state.totalGasAdmitted-state.totalGas,serviceSealCoverage:serviceMetrics(state).coverage,serviceSealUnsealedFraction:serviceMetrics(state).unsealedFraction,serviceSealantRemaining:state.service.remaining,serviceSealComplete:state.service.complete}:null; }
export function getPublicState(state, role='screen') {
  const m=braceMetrics(state), c=state.config,g=gasMetrics(state);
  const view={ act4:{UPPER_RIDGE_SERVICE:c.UPPER_RIDGE_SERVICE},availableStationCount:Object.keys(STATIONS).length-(purgeAvailable(state)?0:1),status:state.status, elapsed:state.elapsed, stations:{...state.stations}, airQuality:c.airQuality,
    demister:demisterView(state),airSupply:airSupplyView(state),purge:purgeView(state,role),scrubber:scrubberView(state),liveWire:liveWireView(state),filter:filterView(state),service:serviceView(state),intake:intakeView(state),repair:repairView(state),
    brace:pneumaticView(state),
    visual:{doorLeak:clamp(m.gasRate/Math.max(1,m.outsideHazard*c.noEffectiveMultiplier),0,1),servicePlume:Math.min(1,c.serviceHazardRate/70)*serviceMetrics(state).unsealedFraction,intakePlume:state.intake.complete?0:clamp(c.intakeHazardRate/80,0,1),plume:Math.pow(clamp(g.grossIngressRate/Math.max(160,(m.outsideHazard*c.noEffectiveMultiplier+c.serviceHazardRate)*(1+c.maxFilterPenalty)+c.intakeHazardRate),0,1),1/c.visualSensitivity),haze:accumulatedGasVisual(airborneGas(state),c.visualSensitivity)} };
  view.stationStatus=stationStatuses(view);
  if (c.airQuality==='WORKING' || role==='admin') view.air={contamination:airborneGas(state)/100,historicalBurden:state.totalGas/100,chemicalExposure:state.chemicalExposure,totalPurged:state.totalGasPurged/100,ingressRate:g.gasRate,rateTrend:state.status!=='running'||Math.abs(g.gasRate-state.gasRateHistory[0].rate)<1e-6?'STEADY':g.gasRate>state.gasRateHistory[0].rate?'RISING':'FALLING',grossIngressRate:g.grossIngressRate,treatmentRate:g.treatmentRate,scrubberEffectiveness:g.scrubberEffectiveness,demisterMultiplier:g.demisterMultiplier,pressureEffectiveness:g.pressureEffectiveness,pressureMultiplier:g.pressureMultiplier,sources:{door:g.doorRate*g.filterMultiplier*g.electricalMultiplier*g.pressureMultiplier,intake:g.intakeRate*g.pressureMultiplier,service:g.serviceRate*g.filterMultiplier*g.electricalMultiplier*g.pressureMultiplier},electricalMultiplier:g.electricalMultiplier,filterMultiplier:g.filterMultiplier,trend:state.status==='running'&&g.gasRate>0?'RISING':'STEADY',scale:'Provisional CU · 1 CU = 100 gas units'};
  if (role==='admin') { view.intake.solution={...REFERENCE}; view.config={...c}; view.debug={...m,...gasMetrics(state),repairMultiplier:repairMultiplier(state),totalGas:state.totalGas,currentAirborneGas:airborneGas(state),totalGasPurged:state.totalGasPurged,chemicalExposure:state.chemicalExposure,totalGasAdmitted:state.totalGasAdmitted,totalGasTreated:state.totalGasAdmitted-state.totalGas}; view.result=getGameResult(state); }
  else if (state.status==='stopped' && c.airQuality==='WORKING') view.result=getGameResult(state);
  return view;
}
