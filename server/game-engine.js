import crypto from "node:crypto";
import { ACTIONS, ACT1_TRANSMISSIONS, ACT2_SYSTEMS, ACT3_LOCATIONS, ACT3_REPAIR_TOOLS, ACT3_STAGE2_COSTS, ACT3_SUPPORT_ITEMS, ACT3_VALID_DEPLOYMENTS, ACT6_HISTORY_ARCHIVE, ACT6_R12_MANUALS, ACT7_R12_CAMERAS, ACT7_R12_DIALOGUE, DEBRIEF_STEPS, FIELD_EQUIPMENT, FIELD_GAMES, FINALE_BALANCE, INFORMATION_JOINS, LARK_ARCHIVE, OUTSIDE_LOCATIONS, PARTICIPANT_CARE, PLAYTEST_CRITERIA, PRE_STRIKE_ARCHIVE, READINESS_PROFILES, REPAIR_SYSTEMS, ROLES, SIGNAL_TRANSMISSIONS, STAGES, roleCard, roleIdsForCount, roleMapForCount, rolesForCount } from "./game-content.js";
import {ACT4_MODULES,act4Procedure,createAct4Board,verifyAct4Module} from "./act4-content.js";
import {
  applyAction as applyAct5StationAction,
  advanceSimulation as advanceAct5Simulation,
  createGame as createAct5Game,
  getActionError as getAct5ActionError,
  getGameResult as getAct5Result,
  getPublicState as getAct5PublicState,
} from "./act5/engine.js";

const codeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ACT1_LEAD_IN_MS = 30_016;
const ACT2_OPENING_MS = 20_000;
const ACT3_OPENING_MS = 35_000;
const ACT4_OPENING_MS = 40_000;
const ACT4_TRAVEL_MS = 8_000;
const ACT4_RESOLVED_MS = 4_000;
const ACT4_RETURN_MS = 5_000;
const ACT4_MARA_REVEAL_MS = 10_000;
const ACT5_OPENING_MS = 35_000;
const ACT5_DURATION_SECONDS = 300;
const ACT6_OPENING_MS = 12_000;
const ACT7_PRESSURE_MIN = 1.00;
const ACT7_PRESSURE_MAX = 1.30;
const ACT6_NIGHTMARE_MS = 15_000;
const ACT7_WALK_MS = 8_000;
const ACT7_POWER_FAILURE_MS = 10_000;
// The handoff deliberately reserves this value for whole-act playtesting.
// Keep the current visual calibration as a safe development default, while
// allowing production to tune it without changing the game implementation.
const environmentNumber=(name,fallback)=>{const value=Number(process.env[name]??fallback);return Number.isFinite(value)?value:fallback;};
const DEFAULT_ACT6_CONFIG=Object.freeze({
  gasThreshold:environmentNumber("ACT5_GAS_THRESHOLD",30_000),
  shortSeconds:environmentNumber("ACT6_SHORT_SECONDS",180),
  longSeconds:environmentNumber("ACT6_LONG_SECONDS",240),
  archiveSeconds:environmentNumber("ACT6_ARCHIVE_SECONDS",90),
  warningSeconds:environmentNumber("ACT6_WARNING_SECONDS",60),
  criticalSeconds:environmentNumber("ACT6_CRITICAL_SECONDS",30),
});
function validateAct6Config(input={},current=DEFAULT_ACT6_CONFIG){
  const value=key=>Number(input[key]??current[key]),config={gasThreshold:value("gasThreshold"),shortSeconds:value("shortSeconds"),longSeconds:value("longSeconds"),archiveSeconds:value("archiveSeconds"),warningSeconds:value("warningSeconds"),criticalSeconds:value("criticalSeconds")};
  if(!Number.isFinite(config.gasThreshold)||config.gasThreshold<0||config.gasThreshold>1_000_000)throw new Error("Act 6 gas threshold must be between 0 and 1,000,000");
  if(!Number.isInteger(config.shortSeconds)||config.shortSeconds<120||config.shortSeconds>3600)throw new Error("Act 6 SHORT window must be 120–3600 seconds");
  if(!Number.isInteger(config.longSeconds)||config.longSeconds<=config.shortSeconds||config.longSeconds>3600)throw new Error("Act 6 LONG window must be greater than SHORT and no more than 3600 seconds");
  if(!Number.isInteger(config.archiveSeconds)||config.archiveSeconds<45||config.archiveSeconds>config.shortSeconds-45)throw new Error("Movement 1 must leave at least 45 seconds for R-12 manuals in the SHORT path");
  if(!Number.isInteger(config.criticalSeconds)||config.criticalSeconds<10||config.criticalSeconds>=config.warningSeconds)throw new Error("Critical warning must be at least 10 seconds and earlier than the warning point");
  if(!Number.isInteger(config.warningSeconds)||config.warningSeconds>=config.shortSeconds||config.warningSeconds>300)throw new Error("Warning point must be below the SHORT window and no more than 300 seconds");
  return config;
}
const SAFE_DEFAULT_ACT6_CONFIG=validateAct6Config(DEFAULT_ACT6_CONFIG,{gasThreshold:30_000,shortSeconds:180,longSeconds:240,archiveSeconds:90,warningSeconds:60,criticalSeconds:30});
const STAGE_HINTS = {
  1:"ACCOUNTED FOR = DEPARTED / A completed task or missing exception is not, by itself, evidence that someone left Blackout Ridge.",
  2:"REPAIR RULE / Assign one different failed system to every player. Each repair has one submission and no retry.",
  3:"DEPLOYMENT RULE / Choose two locations in order, one approved repair tool for each, one support item, then add Stage 1 + Stage 2 + Stage 3 filter units.",
  4:"FIELD SERVICE / Runner operates six apparatus modules. Cabin players interpret their private procedures aloud. All six modules must be complete before the shared repair clock expires.",
  5:"CABIN AIR / Choose any free work location. Stabilise future ingress, treat the plume and return when recurring equipment needs attention.",
  6:"ARCHIVE LOOP / Search or follow a lead, inspect one short record, share the useful fact, then pursue the next question. Every player must learn DISTRESS → EXTRACTION MESSAGE → RELEASE CONFIGURATION.",
  7:"GET BELOW / The active player follows the physical sequence. Players below decide independently whether to purge. The final operator must remember all three surface tasks.",
};
const token = () => crypto.randomBytes(24).toString("base64url");
export const createCode = () => Array.from({ length: 6 }, () => codeChars[crypto.randomInt(codeChars.length)]).join("");

const initialDraft = (stage, playerCount = 7) => ({
  1: { handover: Object.fromEntries(STAGES[1].options.map(([id]) => [id, ""])) },
  2: { repairs: Object.fromEntries(activeRoleIds(playerCount).map(id => [id, ""])) },
  3: { firstLocation:"", secondLocation:"", tool1:"", tool2:"", supportItem:"", filterUse:"", runner:"" },
  4: { runner: "operations" },
  5: {},
  6: {},
  7: {},
}[stage]);

const activeRoleIds = playerCount => roleIdsForCount(playerCount);

export function createSession({ code = createCode(), playerCount = 7 } = {}) {
  if(![4,5,6,7].includes(playerCount))throw new Error("Blackout Ridge requires 4–7 players");
  return {
    code, facilitatorToken: token(), revision: 0, playerCount,
    status: "lobby", stage: 0, stageStatus: "briefing", players: {}, act1Intro: null, act2Intro: null, act3Intro: null, act4Intro: null, act5Intro: null, act6Intro: null, act1ActiveTransmission: null,
    clock: { duration: 0, remaining: 0, running: false, endAt: null },
    reports: {}, chatMessages: [], draft: {}, hint: null, safetyPaused: false, testMode: null, fieldRun: null, repairRun: null, act3Run: null, cabinRun: null, archiveRun: null, finaleRun: null, act6Config:{...SAFE_DEFAULT_ACT6_CONFIG},
    global: { upperAir: 0, trust: 0, official: 0, systems: [], systemStatus: {}, externalStatus: {}, outsidePlan: null, fieldServices: {}, respirator: "partial", evidence: [], lockKnowledge: 0, mara: "missing", correction: "none", lockRisk: false, act6InvestigationTime: null, act6AllowanceClass:null },
    resources: { airHandlingBuffer: 0, safetyGuard: 0, interlockOverride: "available" },
    flags: { assumptions: {}, signal: {}, physical: {}, human: { mara_missing: true }, system: {}, correction: {} },
    interventions: {}, interventionFeedback: {}, absentRoles: {}, outcomes: {}, decisions: {}, history: [], ending: null, pendingEnding: null,
    safetyBriefed: false, debrief: { currentStep: 1, notes: {}, firstSteps: {}, profileSignals: [] },
    playtest: { ratings: {}, notes: "", disposition: "unreviewed", updatedAt: null }, metrics: { startedAt: null, endedAt: null, contributions: {} },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

function ensureSession(session) {
  session.resources ||= { airHandlingBuffer: 0, safetyGuard: 0, interlockOverride: "available" };
  session.resources.airHandlingBuffer ??= 0; session.resources.safetyGuard ??= 0; session.resources.interlockOverride ||= "available";
  session.flags ||= { assumptions: {}, signal: {}, physical: {}, human: {}, system: {}, correction: {} };
  for (const group of ["assumptions","signal","physical","human","system","correction"]) session.flags[group] ||= {};
  session.interventionFeedback ||= {}; session.absentRoles ||= {}; session.decisions ||= {}; session.chatMessages ||= [];
  session.testMode ??= null;
  session.fieldRun ??= null; session.repairRun ??= null; session.act3Run ??= null; session.cabinRun ??= null; session.archiveRun ??= null; session.finaleRun ??= null; session.act6Config=validateAct6Config(session.act6Config||SAFE_DEFAULT_ACT6_CONFIG);session.global.systemStatus ||= {}; session.global.externalStatus ||= {}; session.global.outsidePlan ??= null; session.global.fieldServices ||= {}; session.global.act6InvestigationTime ??= null;session.global.act6AllowanceClass??=null; session.pendingEnding ??= null;
  if(session.finaleRun?.phase&&!session.finaleRun.crew)initialiseFinaleExposure(session,session.finaleRun);
  session.safetyBriefed ??= false; session.debrief ||= { currentStep: 1, notes: {}, firstSteps: {}, profileSignals: [] }; session.debrief.notes ||= {}; session.debrief.firstSteps ||= {}; session.debrief.profileSignals ||= []; session.debrief.currentStep ||= 1;
  session.playtest ||= { ratings: {}, notes: "", disposition: "unreviewed", updatedAt: null }; session.playtest.ratings ||= {}; session.playtest.notes ||= ""; session.playtest.disposition ||= "unreviewed"; session.playtest.updatedAt ??= null;
  session.metrics ||= { startedAt: null, endedAt: null, contributions: {} }; session.metrics.startedAt ??= null; session.metrics.endedAt ??= null; session.metrics.contributions ||= {};
  session.act1Intro ??= null;
  session.act2Intro ??= null;
  session.act3Intro ??= null;
  session.act4Intro ??= null;
  session.act5Intro ??= null;
  session.act6Intro ??= null;
  session.act1ActiveTransmission ??= null;
  if(session.stage===5&&session.stageStatus==="live"&&!session.cabinRun?.engine)initialiseCabinRun(session);
  if(session.stage===6&&session.stageStatus==="live"&&!session.archiveRun)initialiseArchiveRun(session);
  if(session.stage===7&&session.stageStatus==="live"&&!session.finaleRun)initialiseFinaleRun(session);
  return session;
}

export function addPlayer(session, { name, role }) {
  ensureSession(session);
  if(session.status==="ending")throw new Error("This shift has ended");
  if (!ROLES[role] || !activeRoleIds(session.playerCount).includes(role)) throw new Error("Role is not available");
  if (session.players[role]) throw new Error("Role is already occupied");
  const player = { name: String(name || ROLES[role].name).slice(0, 40), role, token: token(), joinedAt: Date.now() };
  session.players[role] = player;
  bump(session, `${ROLES[role].name} joined as ${player.name}`);
  return player;
}

const remaining = (clock, now = Date.now()) => clock.running && clock.endAt ? Math.max(0, Math.ceil((clock.endAt - now) / 1000)) : clock.remaining;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const addEvidence = (session, ...items) => { for (const item of items) if (item && !session.global.evidence.includes(item)) session.global.evidence.push(item); };
const touch = session => { session.revision += 1; session.updatedAt = Date.now(); };
const bump = (session, text) => { touch(session); session.history.push({ at: Date.now(), stage: session.stage, text }); };
const setFlag = (session, group, key, value = true) => { ensureSession(session).flags[group][key] = value; };
const advanceOfficial = (session, amount = 1) => { session.global.official = clamp(session.global.official + amount, 0, 3); };
function advanceAir(session, reason = "Air pressure worsened") {
  ensureSession(session);
  if (session.resources.safetyGuard > 0) { session.resources.safetyGuard--; bump(session, `Safety condition absorbed exposure: ${reason}`); return false; }
  if (session.resources.airHandlingBuffer > 0) { session.resources.airHandlingBuffer--; bump(session, `Air Handling delayed contamination: ${reason}`); return false; }
  session.global.upperAir = clamp(session.global.upperAir + 1, 0, 3); return true;
}

function signalTransmission(session, viewer = { kind: "public" }) {
  if (!session.stage) return null;
  const base = SIGNAL_TRANSMISSIONS[session.stage];
  if (!base) return null;
  const quality = Number(session.outcomes.signalQuality ?? (session.flags.signal?.recovered_fragment ? 1 : 0));
  if (session.stage === 1) {
    const active = ACT1_TRANSMISSIONS.find(item => item.id === session.act1ActiveTransmission);
    return active ? { ...active, kind:"routine", integrity:100, instruction:"ROUTINE TRAFFIC / STORED FOR LATER", preserved:true, quality:0, privateClarity:false } : null;
  }
  if (session.stage === 2 && session.repairRun?.traffic?.length) {
    const latest=session.repairRun.traffic.at(-1);
    return { source:latest.source, integrity:latest.clarity==="clear"?88:28, transcript:latest.text, instruction:`${latest.ref} / ${latest.stored?"STORED":"NOT STORED"}`, preserved:latest.stored, quality:latest.clarity==="clear"?2:0, privateClarity:false };
  }
  if(session.stage===3&&!session.act3Run?.impossibleVoicePlayed)return null;
  if (session.stage === 3) return {
    id:"act3-impossible-voice",
    source:"SOURCE NOT IDENTIFIED",
    integrity:7,
    transcript:"Can anyone hear me?",
    instruction:"IMPOSSIBLE VOICE / NO SOURCE / NOT LOGGED / CANNOT REPLAY",
    audio:base.audio,
    preserved:false,
    quality:0,
    privateClarity:false,
  };
  if(session.stage===4){
    const run=session.fieldRun,current=run?.active?outsideLocation(run.route[run.currentIndex]):null;
    return {kind:"local",source:"BLACKOUT RIDGE / LOCAL FIELD RADIO",integrity:100,transcript:run?.active?`${roleName(session,run.runner)} at ${current.name}. ${run.instruction?"Station instruction received; field action pending.":"Runner observation and station interpretation in progress."}`:"Runner assignment pending; locked route held from the Outside Plan.",instruction:"LOCAL LINK CLEAR / INDEPENDENT OF EXTERNAL COMMUNICATIONS",preserved:true,quality:3,privateClarity:false};
  }
  if(session.stage===5){
    const communications=derivedCommunications(session);
    if(communications.inbound==="OFF")return {kind:"ambient",source:"EXTERNAL RECEIVER",integrity:0,transcript:"No inbound traffic available. Cabin controls and the isolation sweep remain local.",instruction:"INBOUND OFF / NO REQUIRED INFORMATION LOST",preserved:false,quality:0,privateClarity:false};
    const degraded=communications.inbound==="DEGRADED";
    return {...base,kind:"ambient",integrity:degraded?38:82,transcript:degraded?"…plume reached Ridge… concentrations rising… Ridge still… no active distress…":base.transcript,instruction:degraded?"FRAGMENTED AMBIENT CONTEXT / CABIN GAME UNAFFECTED":base.instruction,preserved:false,quality:degraded?1:2,privateClarity:false};
  }
  if(session.stage===6){
    const communications=derivedCommunications(session);
    if(communications.inbound==="OFF")return {kind:"ambient",source:"EXTERNAL RECEIVER",integrity:0,transcript:"No inbound traffic available. Historical and technical archives remain complete and local.",instruction:"INBOUND OFF / NO REQUIRED INFORMATION LOST",preserved:false,quality:0,privateClarity:false};
    const degraded=communications.inbound==="DEGRADED";
    return {...base,kind:"ambient",integrity:degraded?34:76,transcript:degraded?"…specialist response… access restrictions… surface concentrations rising…":base.transcript,instruction:degraded?"FRAGMENTED AMBIENT CONTEXT / ARCHIVE UNAFFECTED":base.instruction,preserved:false,quality:degraded?1:2,privateClarity:false};
  }
  const retainedEarly = session.flags.signal?.handover_voice_retained || session.flags.signal?.raw_preserved || quality > 0;
  let transcript = base.transcript, integrity = base.integrity, instruction = base.instruction;
  if (session.stage >= 3 && quality === 0 && !retainedEarly) {
    transcript = session.stage >= 5 ? "…hold… [carrier loss] …safe… [unresolved human cadence]…" : "[checksum only] …lower… [source header missing]…";
    integrity = Math.min(14, base.integrity);
    instruction = "SOURCE CONTEXT LOST / PHYSICAL CORROBORATION REQUIRED";
  } else if (session.stage >= 4 && quality === 1) {
    transcript = session.stage >= 5 ? "…do not… blind… hold… [dropout]…" : "…not road… under… [dropout]…";
    integrity = Math.min(36, base.integrity);
    instruction = "PARTIAL RECONSTRUCTION / LOW CONFIDENCE";
  } else if (session.stage >= 4 && quality === 2) {
    integrity = Math.min(68, base.integrity);
    instruction = `${base.instruction} / TWO SOURCES AGREE`;
  }
  if (session.global.mara === "located" && session.stage >= 5) integrity = Math.max(integrity, 76);

  // Shared / non-analyst views stay ambiguous until the buried-station join lands.
  // Signal / Systems / Comms / facilitator get the reconstructed private clarity.
  const analystRoles = new Set(["signal", "systems", "comms"]);
  const canSeePrivateClarity = viewer.kind === "facilitator" || analystRoles.has(viewer.role);
  if (!canSeePrivateClarity && session.stage < 5) {
    return {
      source: base.source,
      integrity: Math.min(integrity, session.stage < 3 ? 18 : 28),
      transcript: session.stage < 3 ? "…[sub-carrier]…[unresolved]…" : "…lower… route… [context incomplete]…",
      instruction: "PUBLIC INTERCEPT / PRIVATE ROLE RECONSTRUCTION REQUIRED",
      preserved: retainedEarly,
      quality,
      privateClarity: false,
    };
  }
  return { ...base, transcript, integrity, instruction, preserved: retainedEarly, quality, privateClarity: canSeePrivateClarity };
}

function environmentState(session) {
  if (!session.stage) return null;
  if (session.stage === 1) return {
    airMeterPpm: 0,
    airStatus: "NORMAL",
    outsideWindow: true,
    roadStatus: "OPEN / ROUTINE CONDITIONS",
    cordonStatus: "ROUTINE TRAFFIC",
    stormStatus: "APPROACHING / MAST WATCH",
    respirator: session.global.respirator,
  };
  const basePpm = [0,2,3,5,9,14,17,22][session.stage] || 22;
  const activeFieldStop=session.stage===4&&session.fieldRun?.active
    ? session.fieldRun.forecast?.[session.fieldRun.currentIndex]
    : null;
  const airMeterPpm = activeFieldStop?.ppm ?? clamp(basePpm + session.global.upperAir * 2, 0, 40);
  const airStatus = airMeterPpm >= 22 ? "CRITICAL" : airMeterPpm >= 18 ? "COMPROMISED" : airMeterPpm >= 8 ? "ELEVATED" : "TRACE";
  const roadStatus = session.stage < 4 ? "RISING WATER / ROUTE UNCERTAIN" : session.stage === 4 ? "FLOODED / SHORT WINDOW" : "FLOODED / RIDGE ISOLATED";
  const cordonStatus = session.global.trust >= 2 ? "RESCUE CHANNEL CREDIBLE" : session.global.trust === 1 ? "RIDGE TRAFFIC HEARD" : session.stage < 2 ? "MATERIALS ALERT" : "PERIMETER ACTIVE / RIDGE UNVERIFIED";
  return {
    airMeterPpm, airStatus,
    outsideWindow: session.stage <= 4 && airMeterPpm < 18,
    fieldStop:activeFieldStop?{...activeFieldStop}:null,
    roadStatus, cordonStatus,
    stormStatus: session.stage < 2 ? "SEVERE / MAST EXPOSED" : "SEVERE / RELAY DEGRADED",
    respirator: session.global.respirator,
  };
}

function officialStatus(session) {
  if (session.stage === 1) return {
    code: "PERSONNEL EXCEPTIONS: NONE RAISED",
    detail: session.stageStatus === "live" ? "AUTOMATED THRESHOLD / HANDOVER REVIEW OPEN" : "OUTGOING RECORDS ROLLED OVER",
  };
  if(session.stage===2)return {code:"BLACKOUT RIDGE: OPERATIONAL / NO ACTIVE DISTRESS",detail:session.global.systemStatus.status_beacon==="working"?"STATUS CONTROL RESTORED / HEARTBEAT ACTIVE":"FAIL-SAFE LATCH / LAST VALID STATUS REPEATING"};
  if(session.stage===3)return {code:"BLACKOUT RIDGE: OPERATIONAL / NO ACTIVE DISTRESS",detail:"AUTOMATIC HEARTBEAT CONTINUES / HUMAN STATUS NOT VERIFIED"};
  if (session.global.correction === "accepted") return { code: "HUMAN RESCUE SITE", detail: "CORRECTION ACCEPTED / RESCUE REQUIRED" };
  if (session.global.official >= 3) return { code: "OPERATIONAL / ALL ACCOUNTED FOR", detail: "HUMAN STATUS FILED BY AUTOMATION" };
  if (session.global.official >= 2) return { code: "NO ACTIVE DISTRESS", detail: "FALSE STATUS HARDENING" };
  if (session.global.official >= 1) return { code: "RIDGE RELAY: OPERATIONAL", detail: "UNVERIFIED DEFAULTS REPEATING" };
  return { code: "RIDGE RELAY: OPERATIONAL", detail: "HUMAN STATUS NOT VERIFIED" };
}

const repairSystem = id => REPAIR_SYSTEMS.find(system => system.id === id);
const repairSystemIds = () => new Set(REPAIR_SYSTEMS.map(system => system.id));
const REPAIR_PRESENTATION_ORDER = ACT2_SYSTEMS.map(system=>system.id);
function initialiseRepairs(session) {
  const systemStatus = Object.fromEntries(ACT2_SYSTEMS.map(system=>[system.id,system.initialState]));
  for (const system of REPAIR_SYSTEMS) {
    const minimumPlayers=Math.max(4,(system.rank||5)-1);
    systemStatus[system.id] = system.consequential && session.playerCount < minimumPlayers ? "working" : "broken";
  }
  session.global.systemStatus = systemStatus;
  session.repairRun = {
    phase:"planning",
    attempts:session.playerCount,
    available:REPAIR_SYSTEMS.filter(system => systemStatus[system.id] === "broken").map(system => system.id),
    assignments:{}, assignmentMethod:{}, results:{}, traffic:[], personnelLevel:0, planningStartedAt:Date.now(), planningClosedAt:null, repairStartedAt:null,
  };
}

const REPAIR_SOLUTIONS = {
  inbound_receive:"c",
  human_outbound:"d",
  status_beacon:"c",
  tower_monitoring:"c",
  air_quality:"c",
  received_traffic_log:"c",
  source_identification:"c",
  fire_suppression:"b",
  road_flood_monitoring:"c",
  site_access_control:"d",
};
const normaliseRepairAnswer = value => Array.isArray(value)
  ? [...value].map(String).sort()
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,String(item)]))
    : typeof value === "number" ? value : String(value ?? "");
function repairAnswerCorrect(systemId, answer) {
  const system=repairSystem(systemId), expected=REPAIR_SOLUTIONS[systemId];
  if(!system||expected===undefined)return false;
  if(system.puzzle.type==="sequence")return JSON.stringify((Array.isArray(answer)?answer:[]).map(String))===JSON.stringify(expected);
  if(system.puzzle.type==="balance"){
    const loads=new Map(system.puzzle.loads.map(([id,,value])=>[id,value])),selected=[...new Set(Array.isArray(answer)?answer.map(String):[])];
    return selected.length>0&&selected.every(id=>loads.has(id))&&selected.reduce((sum,id)=>sum+loads.get(id),0)===system.puzzle.target;
  }
  return JSON.stringify(normaliseRepairAnswer(answer))===JSON.stringify(normaliseRepairAnswer(expected));
}
function syncLegacySystems(session) {
  const s=session.global.systemStatus;
  const aliases={inbound_receive:"buffer",human_outbound:"military",tower_monitoring:"lock",air_quality:"air",received_traffic_log:"road",source_identification:"lower"};
  session.global.systems=Object.entries(aliases).filter(([id])=>s[id]==="working").map(([,legacy])=>legacy);
  setFlag(session,"system","signal_buffer_available",s.inbound_receive==="working");
  setFlag(session,"system","military_channel_available",s.human_outbound==="working");
  setFlag(session,"system","lock_control_available",s.tower_monitoring==="working");
  setFlag(session,"system","air_quality_available",s.air_quality==="working");
  setFlag(session,"system","traffic_log_available",s.received_traffic_log==="working");
  setFlag(session,"system","source_identification_available",s.source_identification==="working");
}
function emitRepairTraffic(session, ref) {
  const run=session.repairRun;if(!run||run.traffic.some(item=>item.ref===ref))return false;
  const status=session.global.systemStatus, clear=status.inbound_receive==="working", attributed=status.source_identification==="working", stored=status.received_traffic_log==="working";
  const definitions={
    "COMM-01":{title:"CALDER VALE CONTAINMENT FAILURE",alwaysDegraded:true,source:"CALDER VALE MATERIALS / EMERGENCY",clear:"Calder Vale Materials. Containment failure. Airborne release moving upslope. Emergency crews require respiratory protection.",degraded:"Calder Vale Materials … [signal loss] … containment failure … airborne release … moving upslope … [signal loss] … emergency crews … respiratory protection …",audio:"./assets/audio/act2-comm-01.wav"},
    "COMM-02":{title:"LOWER ROUTE FLOODING",source:"CALDER HIGHWAYS",clear:"Calder Highways. Heavy runoff has overwhelmed drainage. Water is crossing Lower Road around the Lower Route access.",degraded:"Calder Highways … runoff … drainage lost … water … Lower Road … route access …",audio:"./assets/audio/act2-comm-02.wav"},
    "COMM-03":{title:"UPPER RIDGE DAMAGE",source:"CALDER MOUNTAIN RESCUE",clear:"Storm damage confirmed at the Blackout Ridge installation on Upper Ridge. The foot approach is unusable. Any service team will need a high-access kit to reach the equipment.",degraded:"…storm damage confirmed… Blackout Ridge installation… Upper Ridge… [extended signal loss]… reach the equipment.",audio:"./assets/audio/act2-comm-03.wav"},
    "COMM-04A":{title:"GENERIC FILTER ADVISORY",source:"EMERGENCY CONTROL",clear:"Respiratory equipment advisory. Standard canister service life is thirty-three minutes under rated conditions. Use that figure for preliminary deployment planning. Further advisories will follow.",degraded:"Respiratory equipment advisory… [signal loss]… standard canister service life… thirty-three minutes… rated conditions… [signal loss]… preliminary planning."},
    "COMM-04B":{title:"INCIDENT ATMOSPHERE ADVISORY",source:"CALDER VALE MATERIALS SITE CHANNEL",clear:"Respiratory equipment advisory. Under current exposure, filter media are degrading faster than rated. Assume twenty minutes of protected service life in this atmosphere, rather than the standard thirty-three.",degraded:"Respiratory equipment advisory… filter media… [signal loss]… degrading faster than rated… twenty minutes… protected service life… this atmosphere."},
  };
  const d=definitions[ref], isClear=clear&&!d.alwaysDegraded;
  const receiptStartAt=Date.now(),capturedSource=attributed?d.source:"SOURCE UNRESOLVED",displayedTranscript=isClear?d.clear:d.degraded;
  run.traffic.push({ref,title:d.title,at:receiptStartAt,receiptStartAt,completedAt:receiptStartAt,clarity:isClear?"clear":"degraded",source:capturedSource,capturedSource,stored,storageState:stored?"direct":"buffered",text:displayedTranscript,displayedTranscript,audio:d.audio,audioVariant:`${ref}-${isClear?"clear":"degraded"}`,captionVariant:`${ref}-${isClear?"clear":"degraded"}`,capturedReception:clear?"working":"fault"});
  bump(session,`${ref} arrived: ${isClear?"clear":"degraded"}${stored?" / stored":" / not stored"}`);
  return true;
}
function refreshRepairTraffic(session, now=Date.now(), force=false) {
  const run=session.repairRun;if(session.stage!==2||run?.phase!=="repair")return false;
  let changed=false, elapsed=(now-(run.repairStartedAt||now))/1000;
  if(force||elapsed>=90)changed=emitRepairTraffic(session,"COMM-02")||changed;
  if(force||elapsed>=230)changed=emitRepairTraffic(session,"COMM-03")||changed;
  if(force||elapsed>=255)changed=emitRepairTraffic(session,"COMM-04A")||changed;
  if(force||elapsed>=275)changed=emitRepairTraffic(session,"COMM-04B")||changed;
  return changed;
}
function refreshRepairPlanning(session,now=Date.now()){
  const run=session.repairRun;if(session.stage!==2||run?.phase!=="planning")return false;
  const elapsed=(now-(run.planningStartedAt||now))/1000;let changed=false;
  if(elapsed>=30)changed=emitRepairTraffic(session,"COMM-01")||changed;
  const level=elapsed>=120?2:elapsed>=60?1:0;
  if(level>run.personnelLevel){run.personnelLevel=level;bump(session,level===2?"Personnel exception raised: M. Venn / field task overdue":"M. Venn field task overdue");changed=true;}
  return changed;
}
function closeRepairPlanning(session) {
  const run=session.repairRun;if(!run||run.phase!=="planning")return false;
  run.phase="dispatch";run.planningClosedAt=Date.now();
  session.clock={duration:180,remaining:0,running:false,endAt:null};
  bump(session,"Prioritisation closed: assignments locked for dispatch");return true;
}
function fillRemainingRepairs(session) {
  const run=session.repairRun,roles=activeRoleIds(session.playerCount),assignments={...session.draft.repairs},used=new Set(Object.values(assignments).filter(Boolean));
  const pool=run.available.filter(id=>!used.has(id));
  for(let index=pool.length-1;index>0;index--){const swap=crypto.randomInt(index+1);[pool[index],pool[swap]]=[pool[swap],pool[index]];}
  for(const role of roles)if(!assignments[role]){assignments[role]=pool.pop();run.assignmentMethod[role]="random";}
  session.draft.repairs=assignments;bump(session,"Remaining repair assignments filled randomly without replacement");
}
function beginRepairPhase(session) {
  const run=session.repairRun, roles=activeRoleIds(session.playerCount), available=new Set(run.available), assignments={...session.draft.repairs};
  const used=new Set();
  for(const role of roles){const id=assignments[role];if(!available.has(id)||used.has(id))assignments[role]="";else used.add(id);}
  if(roles.some(role=>!assignments[role]))throw new Error("Assign one different failed system to every player");
  session.draft.repairs=assignments;run.assignments={...assignments};for(const role of roles)run.assignmentMethod[role]||="chosen";run.planningClosedAt=Date.now();run.phase="repair";run.repairStartedAt=Date.now();
  session.clock={duration:300,remaining:300,running:true,endAt:Date.now()+300000};
  emitRepairTraffic(session,"COMM-01");bump(session,"Repair window opened: five minutes / no retries");
}
function submitRepair(session, viewer, answer) {
  const run=session.repairRun;
  if(session.stage!==2||session.stageStatus!=="live"||run?.phase!=="repair")throw new Error("The repair window is not open");
  if(viewer.kind!=="player")throw new Error("Only the assigned player can submit this repair");
  const systemId=run.assignments[viewer.role];if(!systemId)throw new Error("No repair is assigned to this terminal");
  if(run.results[viewer.role])throw new Error("This repair was already submitted; there are no retries");
  const success=repairAnswerCorrect(systemId,answer);
  run.results[viewer.role]={systemId,success,at:Date.now(),confirmedAt:Date.now(),answer:normaliseRepairAnswer(answer)};
  session.global.systemStatus[systemId]=success?"working":"broken";syncLegacySystems(session);
  if(success&&systemId==="received_traffic_log"){
    for(const item of run.traffic)if(item.storageState==="buffered"){
      item.storageState="recovered";item.stored=true;item.recoveredAt=Date.now();
    }
  }
  recordContribution(session,viewer.role,"repairs");bump(session,`${repairSystem(systemId).name} repair submitted: ${success?"WORKING":"FAULT"}`);
}

function startStage(session, stage) {
  ensureSession(session);
  const definition = STAGES[stage];
  session.status = "stage"; session.stage = stage; session.stageStatus = "live";
  session.reports = {}; session.draft = initialDraft(stage, session.playerCount); session.hint = null;
  if (stage === 2) initialiseRepairs(session);
  if (stage === 3) session.global.externalStatus = {
    external_inbound:"offline",
    external_human_outbound:"offline",
    lower_road_camera_history:"offline",
    ventilation_path:"offline",
  };
  if(stage===3)session.act3Run={phase:"planning",impossibleVoicePlayed:false,impossibleVoiceAt:null,finalCall:false,resolution:null};
  if (stage === 4) {
    session.fieldRun = null;
    if(session.global.outsidePlan?.RUNNER)session.draft.runner=session.global.outsidePlan.RUNNER;
    session.global.fieldServices={external_inbound_path:"not_restored",external_outbound_path:"not_restored",lower_road_camera_service:"not_restored",upper_ridge_service:"not_restored"};
  }
  if (stage === 5) initialiseCabinRun(session);
  if (stage === 6) initialiseArchiveRun(session);
  if (stage === 7) session.pendingEnding = null;
  const duration=stage===5?ACT5_DURATION_SECONDS:stage===6&&session.global.act6InvestigationTime?session.global.act6InvestigationTime:definition.duration;
  const now=Date.now();
  session.act1Intro=stage===1?{startedAt:now,endsAt:now+ACT1_LEAD_IN_MS}:null;
  session.act2Intro=stage===2?{startedAt:now,endsAt:now+ACT2_OPENING_MS}:null;
  session.act3Intro=stage===3?{startedAt:now,endsAt:now+ACT3_OPENING_MS}:null;
  session.act4Intro=null;
  session.act5Intro=stage===5?{startedAt:now,endsAt:now+ACT5_OPENING_MS}:null;
  session.act6Intro=stage===6?{startedAt:now,endsAt:now+ACT6_OPENING_MS}:null;
  if(stage===2)session.repairRun.planningStartedAt=now+ACT2_OPENING_MS;
  session.act1ActiveTransmission=null;
  session.clock = { duration, remaining: duration, running: stage!==6, endAt: stage===6?null:now + duration * 1000 + (stage===1?ACT1_LEAD_IN_MS:stage===2?ACT2_OPENING_MS:stage===3?ACT3_OPENING_MS:stage===5?ACT5_OPENING_MS:0) };
  if(stage===7)initialiseFinaleRun(session);
  bump(session, `Stage ${stage} started: ${definition.title}`);
  if ([4,7].includes(stage)) advanceAir(session, `${definition.kicker} pressure`);
}

function restartCompletedSession(session) {
  const players=session.players,facilitatorToken=session.facilitatorToken,code=session.code,playerCount=session.playerCount,createdAt=session.createdAt;
  const fresh=createSession({code,playerCount});
  Object.assign(session,fresh,{players,facilitatorToken,createdAt});
  session.metrics.startedAt=Date.now();
  startStage(session,1);
  bump(session,"Completed session restarted with the same crew");
}

const outsideLocation = id => OUTSIDE_LOCATIONS.find(location=>location.id===id);
const outsideEquipmentName = id => FIELD_EQUIPMENT.find(([value])=>value===id)?.[1] || String(id||"NOT SET").toUpperCase();
function derivedCommunications(session){
  const services=session.global.fieldServices||{};
  return {
    inbound:services.external_inbound_path!=="restored"?"OFF":session.global.systemStatus.inbound_receive==="working"?"FULL":"DEGRADED",
    outbound:services.external_outbound_path!=="restored"?"OFF":session.global.systemStatus.human_outbound==="working"?"FULL":"DEGRADED",
  };
}

const cabinControlValues = {
  intake:new Set(["sealed","metered","open"]),
  airflow:new Set(["recirculate","exhaust","idle"]),
  filter:new Set(["a","b"]),
};
const round1 = value => Math.round(value * 10) / 10;
function cabinRoles(session){
  const present=activeRoleIds(session.playerCount).filter(role=>session.players[role]&&!session.absentRoles[role]);
  return present.length?present:activeRoleIds(session.playerCount);
}
function initialiseCabinRun(session, now=Date.now()){
  const upperRidgeRestored=session.global.fieldServices.upper_ridge_service==="restored";
  const airQuality=session.global.systemStatus.air_quality==="working"?"WORKING":"BROKEN";
  const game=createAct5Game({UPPER_RIDGE_SERVICE:upperRidgeRestored?"RESTORED":"NOT_RESTORED",airQuality,duration:ACT5_DURATION_SECONDS});
  game.status="ready";
  session.cabinRun={active:true,startedAt:now,lastTickAt:now+ACT5_OPENING_MS,engine:game,preFlushAirborneGas:null,legacyHoldTriggered:false};
}
function tickCabin(session,now=Date.now()){
  const run=session.cabinRun;
  if(session.stage!==5||session.stageStatus!=="live"||!run?.active||!session.clock.running)return false;
  if(session.act5Intro?.endsAt>now)return false;
  if(run.engine.status==="ready")run.engine.status="running";
  const seconds=Math.max(0,Math.min((now-run.lastTickAt)/1000,10));
  if(seconds<.04)return false;
  advanceAct5Simulation(run.engine,seconds);
  run.lastTickAt=now;
  touch(session);
  return true;
}
function act5PlayerId(session,role){
  const index=activeRoleIds(session.playerCount).indexOf(role);
  return index<0?null:String(index+1);
}
function submitAct5StationAction(session,viewer,payload){
  const run=session.cabinRun;
  if(session.stage!==5||session.stageStatus!=="live"||!run?.active||!run.engine)throw new Error("The Act 5 cabin game is not active");
  if(viewer.kind!=="player")throw new Error("Only a player terminal can operate an Act 5 work location");
  if(session.act5Intro?.endsAt>Date.now())throw new Error("Act 5 work locations unlock when the opening sequence ends");
  if(!session.clock.running)throw new Error("Cabin controls are paused");
  tickCabin(session,Date.now());
  const playerId=act5PlayerId(session,viewer.role),action=payload?.action;
  const rejection=getAct5ActionError(run.engine,playerId,action);
  if(rejection)throw Object.assign(new Error(rejection.message),{code:rejection.code});
  applyAct5StationAction(run.engine,playerId,action);
  recordContribution(session,viewer.role,"cabinActions");
  touch(session);
}
function cabinPublicState(session,viewer){
  const run=session.cabinRun;if(!run)return null;
  const role=viewer.kind==="facilitator"?"admin":viewer.kind==="player"?"player":"screen";
  return {active:run.active,playerId:viewer.kind==="player"?act5PlayerId(session,viewer.role):null,engine:getAct5PublicState(run.engine,role),preFlushAirborneGas:run.preFlushAirborneGas,legacyHoldTriggered:run.legacyHoldTriggered};
}
function initialiseArchiveRun(session,now=Date.now()){
  session.archiveRun={phase:"opening",openedAt:null,nightmareAt:null,nightmareStartedAt:null,nightmareEndsAt:null,technicalOpenedAt:null};
}
function refreshArchivePhase(session,now=Date.now()){
  const run=session.archiveRun;
  if(session.stage!==6||session.stageStatus!=="live"||!run||run.phase==="technical")return false;
  if(run.pausedCinematic)return false;
  if(run.phase==="opening"){
    if(session.act6Intro?.endsAt>now)return false;
    run.phase="history";run.openedAt=now;run.nightmareAt=now+session.act6Config.archiveSeconds*1000;
    session.clock.running=true;session.clock.endAt=now+session.clock.remaining*1000;
    bump(session,"Legacy Hold reveal complete; the six-page Lark Shift archive is open");
    return true;
  }
  if(run.phase==="nightmare"){
    if(now<run.nightmareEndsAt)return false;
    run.phase="technical";run.technicalOpenedAt=now;
    session.clock.running=true;session.clock.endAt=now+session.clock.remaining*1000;
    bump(session,"The nightmare recedes; R-12 technical archive unlocked");
    return true;
  }
  if(now<run.nightmareAt)return false;
  run.phase="nightmare";run.nightmareStartedAt=now;run.nightmareEndsAt=now+ACT6_NIGHTMARE_MS;
  session.clock.remaining=remaining(session.clock,now);session.clock.running=false;session.clock.endAt=null;
  bump(session,"The Lark Shift returns through the live station feed");
  return true;
}
function archivePublicState(session){
  const run=session.archiveRun;if(!run)return null;
  const exactDeadline=session.global.systemStatus.air_quality==="working";
  const source=run.phase==="technical"?ACT6_R12_MANUALS:ACT6_HISTORY_ARCHIVE;
  const documents=source.map(item=>({...item,tags:[...item.tags]}));
  const seconds=remaining(session.clock),warning=seconds<=session.act6Config.warningSeconds,critical=seconds<=session.act6Config.criticalSeconds;
  return {phase:run.phase,exactDeadline,warning,critical,allowanceClass:session.global.act6AllowanceClass||"TEST",documents,historyCount:ACT6_HISTORY_ARCHIVE.length,technicalCount:ACT6_R12_MANUALS.length,checklist:["ACCESS HATCH","CHAMBER SEAL","EMERGENCY PURGE"],navigation:documents.map(item=>({id:item.id,title:item.title,type:item.type})),opening:run.phase==="opening"?{startedAt:session.act6Intro?.startedAt,endsAt:session.act6Intro?.endsAt}:null,nightmare:run.phase==="nightmare"?{startedAt:run.nightmareStartedAt,endsAt:run.nightmareEndsAt}:null};
}

function shuffledRoles(session){
  const roles=activeRoleIds(session.playerCount).filter(role=>session.players[role]&&!session.absentRoles?.[role]);
  for(let index=roles.length-1;index>0;index--){const swap=crypto.randomInt(index+1);[roles[index],roles[swap]]=[roles[swap],roles[index]];}
  return roles;
}
function setFinaleClock(session,seconds){session.clock={duration:seconds,remaining:seconds,running:true,endAt:Date.now()+seconds*1000};}
function pauseFinaleTransfer(session,now=Date.now()){
  const run=session.finaleRun;if(session.stage!==7||run?.phase!=="transfer"||!run.transferStartedAt)return;
  run.transferElapsedBeforePause=clamp((now-run.transferStartedAt)/1000,0,FINALE_BALANCE.transferSeconds);
}
function resumeFinaleTransfer(session,now=Date.now()){
  const run=session.finaleRun;if(session.stage!==7||run?.phase!=="transfer"||run.transferElapsedBeforePause===undefined)return;
  run.transferStartedAt=now-run.transferElapsedBeforePause*1000;delete run.transferElapsedBeforePause;
}
function pauseSharedCinematic(session,now=Date.now()){
  if(session.stage===6&&session.archiveRun?.phase==="opening"&&session.act6Intro?.endsAt>now){session.archiveRun.pausedCinematic={phase:"opening",remaining:session.act6Intro.endsAt-now};return true;}
  if(session.stage===6&&session.archiveRun?.phase==="nightmare"&&session.archiveRun.nightmareEndsAt>now){session.archiveRun.pausedCinematic={phase:"nightmare",remaining:session.archiveRun.nightmareEndsAt-now};return true;}
  if(session.stage===7&&session.finaleRun?.phase==="walk"&&session.finaleRun.walkEndsAt>now){session.finaleRun.pausedCinematic={phase:"walk",remaining:session.finaleRun.walkEndsAt-now};return true;}
  if(session.stage===7&&session.finaleRun?.phase==="power_failure"&&session.finaleRun.powerFailureEndsAt>now){session.finaleRun.pausedCinematic={phase:"power_failure",remaining:session.finaleRun.powerFailureEndsAt-now};return true;}
  return false;
}
function resumeSharedCinematic(session,now=Date.now()){
  const archivePause=session.archiveRun?.pausedCinematic;
  if(archivePause){if(archivePause.phase==="opening")session.act6Intro.endsAt=now+archivePause.remaining;else session.archiveRun.nightmareEndsAt=now+archivePause.remaining;delete session.archiveRun.pausedCinematic;return true;}
  const finalePause=session.finaleRun?.pausedCinematic;
  if(finalePause){if(finalePause.phase==="walk")session.finaleRun.walkEndsAt=now+finalePause.remaining;else session.finaleRun.powerFailureEndsAt=now+finalePause.remaining;delete session.finaleRun.pausedCinematic;return true;}
  return false;
}
function r12Condition(run){
  const pressure=run.contamination+(100-run.reserve)*.35;
  return pressure<28?"CLEAN":pressure<65?"STRAINED":pressure<105?"HAZARDOUS":"CRITICAL";
}
function finaleCrewRoles(session){
  return activeRoleIds(session.playerCount).filter(role=>session.players[role]&&!session.absentRoles?.[role]);
}
function initialiseFinaleExposure(session,run){
  const roles=finaleCrewRoles(session);
  const initial=Math.round(clamp(session.global.upperAir||0,0,3)*12);
  run.masks=Array.from({length:Math.max(1,Math.ceil((roles.length-1)/2))},(_,index)=>({id:index+1,role:null}));
  run.crew=Object.fromEntries(roles.map((role,index)=>{const multiplier=.85+(index%7)*.05,offset=Math.round(initial*((index%3)-1)*.06);const exposure=Math.max(0,initial+offset);return [role,{role,initialExposure:exposure,exposure,multiplier,maskId:null,requestingMask:false,status:finaleExposureStatus(exposure)}]}));
  run.hotspots=Object.fromEntries(roles.map(role=>[role,{}]));
  run.dialogue=Object.fromEntries(roles.map(role=>[role,null]));
  run.cameras=Object.fromEntries(ACT7_R12_CAMERAS.map(camera=>[camera.id,{status:"locked",arrival:camera.arrival}]));
  run.exposureUpdatedAt=Date.now();
}
const R12_HOTSPOTS=new Set(["mara","cctv","receiver","manuals","console"]);
function r12Hotspot(session,viewer,payload){
  const run=session.finaleRun,role=viewer.role,id=String(payload?.hotspot||"");
  if(session.stage!==7||session.stageStatus!=="live"||viewer.kind!=="player"||!run?.below.includes(role))throw new Error("Only crew inside R-12 can inspect the refuge room");
  if(!R12_HOTSPOTS.has(id))throw new Error("Unknown R-12 hotspot");
  run.hotspots||={};run.hotspots[role]||={};run.hotspots[role][id]={visitedAt:Date.now()};
  bump(session,`${roleName(session,role)} inspected R-12 ${id.toUpperCase()} hotspot`);
}
function r12Dialogue(session,viewer,payload){
  const run=session.finaleRun,role=viewer.role,index=Number(payload?.index);
  if(session.stage!==7||session.stageStatus!=="live"||viewer.kind!=="player"||!run?.below.includes(role))throw new Error("Only crew inside R-12 can speak with Mara");
  if(!Number.isInteger(index)||!ACT7_R12_DIALOGUE[index])throw new Error("Mara dialogue option is invalid");
  run.dialogue||={};run.dialogue[role]=index;bump(session,`${roleName(session,role)} asked Mara question ${index+1}`);
}
function r12Camera(session,viewer,payload){
  const run=session.finaleRun,role=viewer.role,id=Number(payload?.camera),camera=ACT7_R12_CAMERAS.find(item=>item.id===id),state=run?.cameras?.[id];
  if(session.stage!==7||session.stageStatus!=="live"||viewer.kind!=="player"||!run?.below.includes(role))throw new Error("Only crew inside R-12 can inspect CCTV");
  if(!camera||!state)throw new Error("CCTV feed is invalid");
  if(run.below.length<camera.arrival)throw new Error("That CCTV event is not unlocked yet");
  if(state.status==="locked")throw new Error("That CCTV event is not unlocked yet");
  if(payload?.watch&&state.status==="available")state.status="offline";
  bump(session,`${roleName(session,role)} inspected ${camera.label}`);
}
function finaleExposureStatus(value){
  return value>=300?"critical":value>=180?"severe":value>=80?"compromised":"stable";
}
function updateFinaleExposure(session,now=Date.now()){
  const run=session.finaleRun;if(session.stage!==7||!run?.crew)return;
  const last=run.exposureUpdatedAt||now,seconds=Math.max(0,(now-last)/1000);if(!seconds)return;
  for(const crew of Object.values(run.crew)){
    if(run.below.includes(crew.role))continue;
    const rate=(crew.maskId?0.035:0.7)*(crew.multiplier||1);
    crew.exposure=round1(crew.exposure+seconds*rate);
    crew.status=finaleExposureStatus(crew.exposure);
  }
  run.exposureUpdatedAt=now;
}
function releaseFinaleMask(run,role){
  const crew=run.crew?.[role];if(!crew?.maskId)return false;
  const mask=run.masks?.find(item=>item.id===crew.maskId);if(mask)mask.role=null;
  crew.maskId=null;return true;
}
function act7Mask(session,viewer,payload){
  const run=session.finaleRun,role=viewer.role,crew=run?.crew?.[role];
  if(session.stage!==7||session.stageStatus!=="live"||!run||!crew)throw new Error("Mask triage is not active");
  if(viewer.kind!=="player")throw new Error("Only a crew terminal can operate mask triage");
  updateFinaleExposure(session,Date.now());
  if(run.below.includes(role)||run.currentRole===role)throw new Error("This crew member is not available for cabin mask triage");
  const action=String(payload?.action||"");
  if(action==="request_mask"){
    if(crew.maskId)throw new Error("A mask is already connected");
    if(crew.requestingMask)throw new Error("Mask request already active");
    crew.requestingMask=true;
  } else if(action==="cancel_mask_request")crew.requestingMask=false;
  else if(action==="release_mask"){
    if(!releaseFinaleMask(run,role))throw new Error("No mask is connected");
    crew.requestingMask=false;
  } else if(action==="connect_mask"){
    const mask=run.masks.find(item=>item.id===Number(payload.maskId));
    if(!mask||mask.role)throw new Error("Mask unavailable");
    if(crew.maskId)throw new Error("Release the connected mask first");
    mask.role=role;crew.maskId=mask.id;crew.requestingMask=false;
  } else throw new Error("Unknown mask triage action");
  crew.status=finaleExposureStatus(crew.exposure);bump(session,`${roleName(session,role)} ${action.replaceAll("_"," ")}`);
}
function createAct7Mechanics(contamination,ordinal){
  const profiles=["A","B","C","D"],correct=profiles[crypto.randomInt(profiles.length)];
  for(let index=profiles.length-1;index>0;index--){const swap=crypto.randomInt(index+1);[profiles[index],profiles[swap]]=[profiles[swap],profiles[index]];}
  return {phase:"keys",keys:profiles.map((profile,index)=>({id:`key-${index+1}`,profile,correct:profile===correct})),selectedKey:null,keyInserted:false,keyTurned:false,hatchOpen:0,entered:false,seal:{closure:0,closed:false,clampProgress:0,clamped:false,pressure:0,valve:"hold",misSeated:false,tested:false,passed:false},purge:{charge:0,target:Math.round(36+Math.min(42,contamination*.35)+ordinal*3),ready:true,fired:false,startedAt:null,lastShakeAt:null}};
}
function decayFinalePurge(session,now=Date.now()){
  const purge=session.finaleRun?.mechanics?.purge;
  if(session.finaleRun?.phase!=="transfer"||session.finaleRun.mechanics?.phase!=="purge"||!purge||purge.fired||!purge.lastShakeAt)return false;
  const elapsed=Math.max(0,(now-purge.lastShakeAt)/1000);if(elapsed<.25)return false;
  const next=Math.max(0,Math.round((purge.charge-elapsed*5)*10)/10);if(next===purge.charge)return false;
  purge.charge=next;purge.lastShakeAt=now;touch(session);return true;
}
function beginFinaleDescent(session,viewer,now=Date.now()){
  const run=session.finaleRun,role=viewer.role;
  if(session.stage!==7||session.stageStatus!=="live"||viewer.kind!=="player"||run?.phase!=="queue"||run.currentRole)throw new Error("The transfer chamber is not available");
  if(run.below.includes(role)||!run.crew?.[role])throw new Error("This crew member is already protected in R-12");
  updateFinaleExposure(session,now);releaseFinaleMask(run,role);run.crew[role].requestingMask=false;
  run.currentRole=role;run.currentOrdinal=run.arrivalOrder.length+1;run.phase="walk";run.walkStartedAt=now;run.walkEndsAt=now+ACT7_WALK_MS;run.transferStep=0;run.transferMistakes=0;
  session.clock={duration:0,remaining:0,running:false,endAt:null};
  bump(session,`${roleName(session,role)} claimed the transfer chamber as arrival ${run.currentOrdinal}`);
}
function completeFinaleWalk(session,now=Date.now()){
  const run=session.finaleRun;if(run?.phase!=="walk"||run.pausedCinematic||now<run.walkEndsAt)return false;
  run.phase="transfer";run.transferStartedAt=now;delete run.transferElapsedBeforePause;run.mechanics=createAct7Mechanics(run.contamination,run.currentOrdinal-1);setFinaleClock(session,FINALE_BALANCE.transferSeconds);
  bump(session,`${roleName(session,run.currentRole)} reached the closed square upper hatch`);return true;
}
function act7Mechanic(session,viewer,payload){
  const run=session.finaleRun,m=run?.mechanics;
  if(session.stage!==7||session.stageStatus!=="live"||run?.phase!=="transfer"||!m)throw new Error("The physical transfer is not active");
  if(viewer.kind!=="player"||viewer.role!==run.currentRole)throw new Error("Only the active player can operate the transfer chamber");
  const action=String(payload?.action||"");
  if(action==="select_key"){if(!m.keys.some(key=>key.id===payload.keyId))throw new Error("That key is not on the tether");m.selectedKey=payload.keyId;}
  else if(action==="insert_key"){if(!m.selectedKey)throw new Error("Select a key profile first");m.keyInserted=true;}
  else if(action==="turn_key"){const key=m.keys.find(item=>item.id===m.selectedKey);if(!m.keyInserted)throw new Error("Insert the selected key first");if(!key?.correct){m.keyInserted=false;m.selectedKey=null;run.transferMistakes++;throw new Error("The key profile does not match the lock");}m.keyTurned=true;m.phase="hatch";}
  else if(action==="set_hatch"||action==="open_hatch"){if(!m.keyTurned)throw new Error("Release the upper hatch lock first");m.hatchOpen=action==="open_hatch"?1:clamp(Number(payload.value)||0,0,1);if(m.hatchOpen>=1)m.phase="enter";}
  else if(action==="enter_hatch"){if(m.hatchOpen<1)throw new Error("The square upper hatch is not fully open");m.entered=true;m.phase="seal";}
  else if(action==="set_close"||action==="close_hatch"){if(!m.entered)throw new Error("Enter the transfer chamber first");if((m.seal.clamped||m.seal.pressure>0)&&action==="set_close"&&Number(payload.value)<1)throw new Error("Do not reopen the hatch while the clamp or gasket is engaged");m.seal.closure=action==="close_hatch"?1:clamp(Number(payload.value)||0,0,1);m.seal.closed=m.seal.closure>=1;}
  else if(action==="set_clamp"||action==="clamp"){if(!m.seal.closed)throw new Error("Close the hatch before clamping");if(m.seal.misSeated||m.seal.pressure>0)throw new Error("The gasket was inflated early. VENT fully to zero before clamping");m.seal.clampProgress=action==="clamp"?1:clamp(Number(payload.value)||0,0,1);m.seal.clamped=m.seal.clampProgress>=1;}
  else if(action==="fill"){if(!m.seal.closed)throw new Error("Close the hatch before operating the gasket valve");m.seal.valve="fill";if(!m.seal.clamped)m.seal.misSeated=true;m.seal.pressure=Math.round(Math.min(ACT7_PRESSURE_MAX+.1,m.seal.pressure+.15)*100)/100;}
  else if(action==="vent"){m.seal.valve="vent";m.seal.pressure=Math.round(Math.max(0,m.seal.pressure-.15)*100)/100;if(m.seal.pressure===0)m.seal.misSeated=false;}
  else if(action==="hold"){m.seal.valve="hold";}
  else if(action==="test_seal"){if(!m.seal.closed||!m.seal.clamped||m.seal.misSeated)throw new Error("Close, fully vent any early inflation, and clamp before TEST");if(m.seal.pressure<ACT7_PRESSURE_MIN||m.seal.pressure>ACT7_PRESSURE_MAX)throw new Error("Gasket pressure must remain between 1.00 and 1.30 bar");m.seal.tested=true;m.seal.passed=true;m.phase="purge";}
  else if(action==="shake"){if(!m.seal.passed)throw new Error("Pass the chamber seal before charging purge");const now=Date.now();decayFinalePurge(session,now);m.purge.startedAt??=now;const elapsed=(now-m.purge.startedAt)/1000,assist=elapsed>30?2:elapsed>15?1.45:1;m.purge.charge=Math.min(m.purge.target,m.purge.charge+Number(payload.amount||4)*assist);m.purge.charge=Math.round(m.purge.charge*10)/10;m.purge.lastShakeAt=now;}
  else if(action==="fire_purge"){decayFinalePurge(session,Date.now());if(m.purge.charge<m.purge.target)throw new Error("Continue shaking until the live purge target is reached");if((run.capsuleReceiverReadyAt||0)>Date.now())throw new Error("The purge receiver is still recovering");m.purge.fired=true;m.purge.ready=false;m.purge.removal=FINALE_BALANCE.purgeFullBenefit;m.phase="r12";run.capsuleReceiverReadyAt=Date.now()+10_000;run.reserve=round1(Math.max(0,run.reserve-FINALE_BALANCE.purgeReserveBaseCost-m.purge.target*FINALE_BALANCE.purgeReserveTargetCost));}
  else if(action==="enter_r12"){if(!m.purge.fired)throw new Error("Complete one purge discharge before entering R-12");completeFinaleTransfer(session,false,Date.now());return;}
  else throw new Error("Unknown transfer operation");
  touch(session);
}
function initialiseFinaleRun(session){
  const roles=finaleCrewRoles(session);if(!roles.length)return;
  session.finaleRun={phase:"queue",roles,order:roles,baselineUpperAir:session.global.upperAir,arrivalOrder:[],currentIndex:0,currentOrdinal:0,currentRole:null,below:[],transfers:[],contamination:0,reserve:100,capsuleReceiverReadyAt:0,surfaceDraft:{red:false,white:false,blue:false,amber:false,green:false,message:""},surfaceCommitted:null,messageRating:null,calculation:null};
  initialiseFinaleExposure(session,session.finaleRun);
  session.clock={duration:0,remaining:0,running:false,endAt:null};
  bump(session,"Act 7 cabin exposure active; transfer chamber open to the first volunteer");
}
function completeFinaleTransfer(session,timedOut=false,now=Date.now()){
  const run=session.finaleRun;if(run?.phase!=="transfer")return false;
  updateFinaleExposure(session,now);
  const elapsed=timedOut?FINALE_BALANCE.transferSeconds:clamp(Math.ceil((now-run.transferStartedAt)/1000),1,FINALE_BALANCE.transferSeconds);
  const chamberContamination=timedOut?FINALE_BALANCE.baseTransferContamination+FINALE_BALANCE.timeContamination:Math.min(FINALE_BALANCE.baseTransferContamination+FINALE_BALANCE.timeContamination,FINALE_BALANCE.baseTransferContamination+FINALE_BALANCE.timeContamination*(elapsed/FINALE_BALANCE.transferSeconds)+run.transferMistakes*FINALE_BALANCE.mistakeContamination);
  const purgeRemoval=timedOut?0:Number(run.mechanics?.purge?.removal||0),added=Math.max(0,chamberContamination-purgeRemoval);
  const crew=run.crew?.[run.currentRole];if(crew){crew.exposure=round1(crew.exposure+chamberContamination*1.5+run.transferMistakes*4);crew.status=finaleExposureStatus(crew.exposure);releaseFinaleMask(run,run.currentRole);crew.requestingMask=false;}
  run.contamination=round1(run.contamination+added);if(run.mechanics)run.mechanics.phase="complete";run.transfers.push({role:run.currentRole,ordinal:run.currentOrdinal,seconds:elapsed,mistakes:run.transferMistakes,chamberContamination:round1(chamberContamination),purgeRemoval:round1(purgeRemoval),contamination:round1(added),exposure:crew?.exposure??null,timedOut});run.below.push(run.currentRole);run.arrivalOrder.push(run.currentRole);
  for(const camera of ACT7_R12_CAMERAS){const state=run.cameras?.[camera.id];if(state?.status==="locked"&&run.below.length>=camera.arrival)state.status="available";}
  bump(session,`${roleName(session,run.currentRole)} entered R-12; refuge air ${r12Condition(run)}`);run.currentIndex++;
  run.currentRole=null;run.mechanics=null;session.clock={duration:0,remaining:0,running:false,endAt:null};
  if(run.below.length>=run.roles.length){run.phase="power_failure";run.powerFailureStartedAt=now;run.powerFailureEndsAt=now+ACT7_POWER_FAILURE_MS;bump(session,"All active crew reached R-12; emergency power failure sequence started");}
  else{run.phase="queue";bump(session,"Transfer chamber released for the next volunteer");}
  return true;
}
function submitTransferStep(session,viewer,step){
  const run=session.finaleRun;if(session.stage!==7||session.stageStatus!=="live"||run?.phase!=="transfer")throw new Error("No personnel transfer is active");
  if(viewer.kind!=="player"||viewer.role!==run.currentRole)throw new Error("Only the active player can operate the transfer route");
  if(run.mechanics)throw new Error("Use the physical key, hatch, seal and purge controls");
  const expected=ACTIONS.transferSteps[run.transferStep]?.[0];if(step!==expected){run.transferMistakes++;bump(session,`${roleName(session,viewer.role)} lost time correcting a transfer action`);return;}
  run.transferStep++;bump(session,`${roleName(session,viewer.role)} completed transfer action ${run.transferStep} of ${ACTIONS.transferSteps.length}`);
  if(run.transferStep===ACTIONS.transferSteps.length)completeFinaleTransfer(session,false,Date.now());
}
function updateSurface(session,viewer,payload){
  const run=session.finaleRun;if(session.stage!==7||session.stageStatus!=="live"||run?.phase!=="console")throw new Error("The final R-12 console is not active");
  if(viewer.kind!=="player"||!run.below.includes(viewer.role))throw new Error("Only crew inside R-12 can use the final console");
  const next={...run.surfaceDraft};
  if("message" in payload)next.message=String(payload.message||"").slice(0,180);
  for(const control of ["red","white","blue","amber","green"])if(payload[control]===true)next[control]=true;
  run.surfaceDraft=next;
  if(payload.green===true){commitSurface(session,viewer,false);return;}
  touch(session);
}
function commitSurface(session,viewer,timedOut=false){
  const run=session.finaleRun;if(run?.phase!=="console")throw new Error("The final R-12 console is not active");
  if(!timedOut&&(viewer.kind!=="player"||!run.below.includes(viewer.role)))throw new Error("Only crew inside R-12 can close the final console");
  run.surfaceCommitted={...run.surfaceDraft,timedOut,at:Date.now()};run.phase="blackout";session.clock={duration:0,remaining:0,running:false,endAt:null};
  if(!run.surfaceCommitted.white||!run.surfaceCommitted.message.trim())run.messageRating="none";
  bump(session,`Final console closed${timedOut?" at reserve expiry":" by GREEN"}; all crew displays blacked out`);
}
function classifyMessage(session,viewer,rating){
  const run=session.finaleRun;if(viewer.kind!=="facilitator"||session.stage!==7||session.stageStatus!=="live"||!run?.surfaceCommitted)throw new Error("No committed extraction message is ready for classification");
  if(!["clear","partial","poor","none","effective","ineffective"].includes(rating))throw new Error("Message classification is invalid");run.messageRating=rating==="effective"?"clear":rating==="ineffective"?"poor":rating;bump(session,`Extraction message verdict saved as ${run.messageRating.toUpperCase()}`);
}
function finaleCalculation(session){
  const run=session.finaleRun,b=FINALE_BALANCE;
  const surface=run.surfaceCommitted,outbound=derivedCommunications(session).outbound;
  const status=surface.red&&session.global.systemStatus.status_beacon==="working"?"DISTRESS":"OPERATIONAL / NO ACTIVE DISTRESS";
  const contentUseful=["clear","partial"].includes(run.messageRating),messageUseful=surface.white&&outbound!=="OFF"&&contentUseful;
  const message=!surface.white||!surface.message.trim()||outbound==="OFF"?"NONE":outbound==="FULL"&&run.messageRating==="clear"?"CLEAR":"DEGRADED";
  let rescueHours;
  if(outbound==="FULL"&&messageUseful)rescueHours=status==="DISTRESS"?.8:1.6;
  else if(outbound==="DEGRADED"&&messageUseful)rescueHours=status==="DISTRESS"?1.2:2;
  else rescueHours=status==="DISTRESS"?2.4:5.3;
  if(run.messageRating==="partial"&&messageUseful)rescueHours+=.4;
  if(surface.blue&&messageUseful)rescueHours+=2;
  if(!surface.blue&&!surface.green)rescueHours+=.6-(surface.amber?0.2:0);
  const fates=run.roles.map(role=>{const exposure=run.crew[role].exposure,tolerance=Math.min(8,Math.max(.25,6-Math.max(0,exposure-80)/85));let survived=rescueHours<=tolerance&&rescueHours<=4.5;if(surface.green&&!surface.blue)survived=true;if(surface.blue&&!messageUseful)survived=false;return {role,name:roleName(session,role),exposure:round1(exposure),toleranceHours:round1(tolerance),survived};});
  const survivors=fates.filter(item=>item.survived).length;
  const film=surface.green&&!surface.blue?"F01":surface.blue&&!messageUseful?"F04":surface.blue&&messageUseful?(survivors?"F03":"F05"):(survivors?"F02":"F05");
  const band=film==="F01"?"clean":film==="F04"?"lark":survivors===run.roles.length?"severe":survivors?"casualties":"lark";
  return {film,band,status,message,outbound,messageUseful,rescueHours:round1(rescueHours),rescueTime:Math.round(rescueHours*3600),survivalTime:Math.round(4.5*3600),survivors,deaths:fates.length-survivors,fates,occupancy:run.roles.length,finalAir:round1(clamp(100-run.contamination*.9-(100-run.reserve)*.35,0,100)),release:surface.blue?"SECURE ISOLATION":"OPEN"};
}
function sealFinale(session){
  const run=session.finaleRun;if(run.phase!=="blackout"||!run.messageRating)throw new Error("The blackout verdict is not ready");run.calculation=finaleCalculation(session);run.phase="sealed";resolveStage(session,false);
}
function finalePublicState(session,viewer){
  const run=session.finaleRun;if(!run)return null;const player=viewer.kind==="player",below=player&&run.below.includes(viewer.role),current=player&&viewer.role===run.currentRole;
  updateFinaleExposure(session,Date.now());
  const mode=viewer.kind==="facilitator"?"facilitator":viewer.kind==="public"?"shared":run.phase==="blackout"?"blackout":run.phase==="power_failure"?"power_failure":run.phase==="console"&&below?"console":current&&run.phase==="walk"?"walk":current&&run.phase==="transfer"?"transfer":below?"below":"waiting";
  const exposure=Object.values(run.crew||{}).map(crew=>({role:crew.role,exposure:viewer.kind==="facilitator"||crew.role===viewer.role?crew.exposure:null,status:crew.status,maskId:crew.maskId,requestingMask:crew.requestingMask}));
  const hotspots=viewer.kind==="facilitator"?run.hotspots||{}:below?run.hotspots?.[viewer.role]||{}:null;
  const command=["facilitator","public"].includes(viewer.kind)?{contamination:run.contamination,reserve:run.reserve,receiverReadyAt:run.capsuleReceiverReadyAt||0,currentRole:run.currentRole,mechanicPhase:run.mechanics?.phase||null,arrivalOrder:[...run.arrivalOrder],crew:run.roles.map(role=>({role,name:roleName(session,role),location:run.below.includes(role)?"R-12":run.currentRole===role?"TRANSFER":"CABIN",transfer:run.below.includes(role)?"COMPLETE":run.currentRole===role?(run.mechanics?.phase||run.phase).toUpperCase():"WAITING"})),transfers:run.transfers.map(item=>({role:item.role,name:roleName(session,item.role),ordinal:item.ordinal,seconds:item.seconds,mistakes:item.mistakes,contamination:item.contamination,timedOut:item.timedOut}))}:null;
  const mechanics=current&&run.phase==="transfer"&&viewer.kind==="player"?structuredClone(run.mechanics):null;if(mechanics){mechanics.keys=mechanics.keys.map(({correct,...key})=>key);mechanics.receiverReady=(run.capsuleReceiverReadyAt||0)<=Date.now();}
  return {phase:run.phase,mode,belowCount:run.below.length,total:run.roles.length,currentName:run.currentRole?roleName(session,run.currentRole):null,currentOrdinal:run.currentOrdinal,reserve:run.reserve,canBegin:player&&run.phase==="queue"&&!below&&!run.currentRole,walk:current&&run.phase==="walk"?{ordinal:run.currentOrdinal,startedAt:run.walkStartedAt,endsAt:run.walkEndsAt}:null,powerFailure:run.phase==="power_failure"?{startedAt:run.powerFailureStartedAt,endsAt:run.powerFailureEndsAt}:null,airCondition:r12Condition(run),masks:run.masks?.map(mask=>({id:mask.id,occupied:Boolean(mask.role),role:["facilitator","public"].includes(viewer.kind)?mask.role:null}))||[],exposure,command,hotspots,transfer:current&&run.phase==="transfer"?{step:run.transferStep,mistakes:run.transferMistakes,steps:ACTIONS.transferSteps.map(item=>[...item])}:null,mechanics,surface:run.phase==="console"&&(below||viewer.kind==="facilitator"||viewer.kind==="public")?{...run.surfaceDraft}:null,surfaceCommitted:viewer.kind==="facilitator"&&run.surfaceCommitted?{...run.surfaceCommitted}:null,messageNeedsRating:viewer.kind==="facilitator"&&Boolean(run.surfaceCommitted&&!run.messageRating&&run.surfaceCommitted.white&&run.surfaceCommitted.message.trim()),messageRating:viewer.kind==="facilitator"?run.messageRating:null,canCalculate:viewer.kind==="facilitator"&&run.phase==="blackout"&&Boolean(run.messageRating),communicationLocked:below&&!["console","power_failure"].includes(run.phase),calculation:viewer.kind==="facilitator"&&run.calculation?structuredClone(run.calculation):null,r12:below?{arrivalCount:run.below.length,dialogue:run.dialogue?.[viewer.role]??null,cameras:Object.fromEntries(ACT7_R12_CAMERAS.map(camera=>[camera.id,{...run.cameras?.[camera.id],label:camera.label}])),content:{dialogue:ACT7_R12_DIALOGUE.map(item=>({...item})),cameras:ACT7_R12_CAMERAS.map(item=>({...item}))}}:null};
}

const act3Location = id => ACT3_LOCATIONS.find(location=>location.id===id);
const act3Label = (entries,id) => entries.find(([value])=>value===id)?.[1] || "NOT SELECTED";
const samePair = (row,first,second) => new Set([row.first,row.second]).size===2 && new Set([row.first,row.second]).has(first) && new Set([row.first,row.second]).has(second);

export function act3PlanPreview(draft = {}) {
  const first=act3Location(draft.firstLocation),second=act3Location(draft.secondLocation);
  const filterUse=draft.filterUse===""||draft.filterUse===null||draft.filterUse===undefined?null:Number(draft.filterUse);
  const complete=Boolean(first&&second&&draft.tool1&&draft.tool2&&draft.supportItem&&Number.isFinite(filterUse));
  const duplicate=Boolean(first&&second&&first.id===second.id);
  const supportConflict=Boolean(first&&second&&new Set([first.id,second.id]).has("c")&&new Set([first.id,second.id]).has("d"));
  const ordered=first&&second?ACT3_VALID_DEPLOYMENTS.find(row=>row.first===first.id&&row.second===second.id):null;
  const pair=first&&second?ACT3_VALID_DEPLOYMENTS.find(row=>samePair(row,first.id,second.id)):null;
  const errors=[];
  if(!first)errors.push("Select the first repair location.");
  if(!second)errors.push("Select the second repair location.");
  if(duplicate)errors.push("The deployment must visit two different locations.");
  if(!draft.tool1)errors.push("Select the repair tool for the first location.");
  if(!draft.tool2)errors.push("Select the repair tool for the second location.");
  if(!draft.supportItem)errors.push("Select one support item.");
  if(filterUse===null||!Number.isFinite(filterUse))errors.push("Enter the complete three-stage filter use.");
  if(supportConflict)errors.push("CAM-01 and AUX-01 require two different specialist support items; choose another pair.");
  if(first&&second&&!duplicate&&!supportConflict&&!pair)errors.push("This location pair cannot be completed within the published route and support limits.");
  const canonical=ordered||pair||null;
  const planningErrors=[];
  if(canonical&&complete&&!duplicate&&!supportConflict){
    if(!ordered)planningErrors.push(`Reverse the route to ${act3Location(canonical.first).code} → ${act3Location(canonical.second).code}.`);
    if(!canonical.tool1.includes(draft.tool1))planningErrors.push(`Tool 1 corrected to ${act3Label(ACT3_REPAIR_TOOLS,canonical.tool1[0])}.`);
    if(!canonical.tool2.includes(draft.tool2))planningErrors.push(`Tool 2 corrected to ${act3Label(ACT3_REPAIR_TOOLS,canonical.tool2[0])}.`);
    if(canonical.support!==draft.supportItem)planningErrors.push(`Support item corrected to ${act3Label(ACT3_SUPPORT_ITEMS,canonical.support)}.`);
    if(canonical.filterUse!==filterUse)planningErrors.push(`Filter use corrected to ${canonical.filterUse} units.`);
  }
  const stageCosts=first&&second&&!duplicate?{
    stage1:first.stage1,
    stage2:ACT3_STAGE2_COSTS[`${first.id}>${second.id}`]??null,
    stage3:second.stage3,
  }:null;
  const calculated=stageCosts&&stageCosts.stage2!==null?stageCosts.stage1+stageCosts.stage2+stageCosts.stage3:null;
  const capacity=draft.supportItem==="emergency_filter"?115:100;
  const exact=Boolean(complete&&ordered&&!planningErrors.length);
  return {
    complete,submittable:complete&&!duplicate&&!supportConflict&&Boolean(pair),exact,
    first:first?.id||null,second:second?.id||null,tool1:draft.tool1||null,tool2:draft.tool2||null,supportItem:draft.supportItem||null,
    filterUse,capacity,stageCosts,calculated,errors,planningErrors,
    canonical:canonical?{
      first:canonical.first,second:canonical.second,
      tool1:canonical.tool1.includes(draft.tool1)?draft.tool1:canonical.tool1[0],
      tool2:canonical.tool2.includes(draft.tool2)?draft.tool2:canonical.tool2[0],
      supportItem:canonical.support,filterUse:canonical.filterUse,
    }:null,
  };
}

function lockAct3Deployment(session,canonical,{mode="correct",submitted=null}={}){
  // Act 4 handoff v0.4 supersedes the earlier 5/4-minute planning handoff.
  // A clean Act 3 plan receives six minutes per repair; corrected or random
  // deployment receives five. The two repair clocks remain independent.
  const allowance=mode==="correct"?360:300;
  const plan={
    FIRST_LOCATION:canonical.first,
    SECOND_LOCATION:canonical.second,
    REPAIR_TOOL_1:canonical.tool1,
    REPAIR_TOOL_2:canonical.tool2,
    SUPPORT_ITEM:canonical.supportItem,
    FILTER_USE:canonical.filterUse,
    REPAIR_ALLOWANCE:allowance,
    RUNNER:null,
    // Compatibility fields consumed by the current Act 4 runtime.
    PLANNED_INBOUND_LOCATION:canonical.first,
    PLANNED_OUTBOUND_LOCATION:canonical.second,
    RUNNER_FIRST_TARGET:canonical.first,
    FIELD_EQUIPMENT:[canonical.tool1,canonical.tool2,canonical.supportItem],
  };
  session.global.outsidePlan=plan;
  session.act3Run.phase="runner";
  session.act3Run.resolution={mode,allowance,submitted:submitted?{...submitted}:null,confirmed:{...plan,FIELD_EQUIPMENT:[...plan.FIELD_EQUIPMENT]},at:Date.now()};
  session.clock.remaining=remaining(session.clock);session.clock.running=false;session.clock.endAt=null;
  bump(session,mode==="correct"?"Act 3 deployment accepted without correction":mode==="corrected"?"Act 3 deployment corrected; four-minute repair allowance applied":"Act 3 deployment assigned after final call; four-minute repair allowance applied");
}

function submitAct3Deployment(session,viewer){
  if(session.stage!==3||session.stageStatus!=="live"||!session.act3Run||!["planning","final_call"].includes(session.act3Run.phase))throw new Error("The Act 3 deployment window is not accepting submissions");
  if(viewer.kind!=="facilitator")throw new Error("Only the facilitator can commit the crew's deployment");
  const preview=act3PlanPreview(session.draft);
  if(preview.errors.some(error=>/CAM-01 and AUX-01/.test(error))){
    if(session.act3Run.finalCall){const random=ACT3_VALID_DEPLOYMENTS[crypto.randomInt(ACT3_VALID_DEPLOYMENTS.length)];return lockAct3Deployment(session,{first:random.first,second:random.second,tool1:random.tool1[0],tool2:random.tool2[0],supportItem:random.support,filterUse:random.filterUse},{mode:"random",submitted:session.draft});}
    throw new Error("CAM-01 and AUX-01 require different support items. Choose another pair; no penalty has been applied.");
  }
  if(!preview.complete)throw new Error(preview.errors[0]||"Complete every deployment field before committing");
  if(!preview.submittable)throw new Error(preview.errors[0]||"Choose a viable two-location deployment");
  // The one-time unexplained voice must happen before an early plan closes.
  // Auto-deliver it here if the facilitator has not triggered it manually;
  // it deliberately creates no source, traffic-log entry or replay record.
  if(!session.act3Run.impossibleVoicePlayed){
    session.act3Run.impossibleVoicePlayed=true;
    session.act3Run.impossibleVoiceAt=Date.now();
  }
  lockAct3Deployment(session,preview.canonical,{mode:preview.exact?"correct":"corrected",submitted:session.draft});
}

function assignRandomAct3Deployment(session){
  if(session.stage!==3||session.stageStatus!=="live"||session.act3Run?.phase!=="final_call")throw new Error("Random assignment is available only after the Act 3 final call");
  const row=ACT3_VALID_DEPLOYMENTS[crypto.randomInt(ACT3_VALID_DEPLOYMENTS.length)];
  lockAct3Deployment(session,{first:row.first,second:row.second,tool1:row.tool1[0],tool2:row.tool2[0],supportItem:row.support,filterUse:row.filterUse},{mode:"random",submitted:null});
}

function nominateAct3Runner(session,viewer,runner){
  if(viewer.kind!=="facilitator")throw new Error("The facilitator records the crew's runner nomination");
  if(session.stage!==3||session.stageStatus!=="live"||session.act3Run?.phase!=="runner"||!session.global.outsidePlan)throw new Error("Resolve the deployment before nominating the runner");
  if(!activeRoleIds(session.playerCount).includes(runner)||!session.players[runner]||session.absentRoles[runner])throw new Error("Choose a connected crew member as runner");
  session.draft.runner=runner;session.global.outsidePlan.RUNNER=runner;session.act3Run.resolution.runner=runner;
  resolveStage(session,false);
}

function triggerImpossibleVoice(session,viewer){
  if(viewer.kind!=="facilitator")throw new Error("Only the facilitator can trigger the Impossible Voice");
  if(session.stage!==3||session.stageStatus!=="live"||session.act3Run?.phase!=="planning")throw new Error("The Impossible Voice can be triggered only during active Act 3 planning");
  if(session.act3Run.impossibleVoicePlayed)throw new Error("The Impossible Voice has already played and cannot be replayed");
  session.act3Run.impossibleVoicePlayed=true;session.act3Run.impossibleVoiceAt=Date.now();
  bump(session,"Impossible Voice played once; no source or traffic-log entry created");
}

export function outsidePlanPreview(draft = {}) {
  const inbound=outsideLocation(draft.plannedInbound),outbound=outsideLocation(draft.plannedOutbound),equipment=Array.isArray(draft.equipment)?draft.equipment:[];
  const chosen=[inbound,outbound].filter(Boolean),distinct=chosen.length===2&&inbound.id!==outbound.id;
  const first=distinct&&[inbound.id,outbound.id].includes(draft.firstTarget)?outsideLocation(draft.firstTarget):null;
  const second=first?(first.id===inbound.id?outbound:inbound):null;
  const stops=[];
  if(first){
    const finish=first.travel+first.service,ppm=Number((first.concentration+first.rise*finish).toFixed(1));
    stops.push({id:first.id,name:first.name,order:1,arrival:first.travel,finish,ppm});
    const secondFinish=finish+(first.transfer[second.id]||0)+second.service,secondPpm=Number((second.concentration+second.rise*secondFinish).toFixed(1));
    stops.push({id:second.id,name:second.name,order:2,arrival:finish+(first.transfer[second.id]||0),finish:secondFinish,ppm:secondPpm});
  }
  const required=[];
  for(const stop of stops){
    const location=outsideLocation(stop.id);
    for(const item of location.requirement)if(!required.includes(item))required.push(item);
    if(stop.id==="c"&&stop.ppm>=18&&!required.includes("gas_mask"))required.push("gas_mask");
  }
  const missing=required.filter(item=>!equipment.includes(item));
  const warnings=[];
  if(!inbound)warnings.push("Choose a planned inbound-service location.");
  if(!outbound)warnings.push("Choose a planned outbound-service location.");
  if(inbound&&outbound&&inbound.id===outbound.id)warnings.push("The two failed functions require two different service locations.");
  if(distinct&&!first)warnings.push("Choose which selected location the runner visits first.");
  if(equipment.length!==2)warnings.push(`Select exactly two specialist items; ${equipment.length} currently selected.`);
  if(missing.length)warnings.push(`Route cannot be serviced with the selected loadout. Missing: ${missing.map(outsideEquipmentName).join(" + ")}.`);
  const ready=Boolean(distinct&&first&&equipment.length===2&&!missing.length);
  return {ready,inbound:inbound?.id||null,outbound:outbound?.id||null,first:first?.id||null,second:second?.id||null,equipment:[...equipment],required,missing,stops,warnings};
}

const optionLabel = (entries, id) => entries.find(([value]) => value === id)?.[1] || String(id || "NOT SET").toUpperCase();
const roleName = (session, id) => session.players[id]?.name || rolesForCount(session.playerCount)[id]?.name || String(id || "UNASSIGNED").toUpperCase();

export function decisionPreview(session) {
  ensureSession(session);
  const stage = session.stage, d = session.draft || {}, g = session.global;
  const preview = { summary: "Review the plan before committing.", keeps: [], costs: [], warnings: [], ready: true };
  if (stage === 1) {
    const answers = d.handover || {};
    const yes = STAGES[1].options.filter(([id]) => answers[id] === "yes").map(([,name]) => `${name}: departure established`);
    const no = STAGES[1].options.filter(([id]) => answers[id] === "no").map(([,name]) => `${name}: departure not established`);
    const pending = STAGES[1].options.filter(([id]) => !["yes","no"].includes(answers[id]));
    preview.summary = `${yes.length + no.length} of ${STAGES[1].options.length} outgoing staff reviewed.`;
    preview.keeps = yes;
    preview.costs = no;
    preview.positiveLabel = "ANSWERED YES / DEPARTURE ESTABLISHED";
    preview.costLabel = "ANSWERED NO / DEPARTURE NOT ESTABLISHED";
    preview.footer = "The station will accept the collective handover without revealing correctness. Reconcile the evidence before records roll over.";
    preview.ready = pending.length === 0;
    if (pending.length) preview.warnings.push(`${pending.length} staff record${pending.length === 1 ? " remains" : "s remain"} unanswered: ${pending.map(([,name]) => name).join(", ")}.`);
  } else if (stage === 2) {
    const run=session.repairRun, roles=activeRoleIds(session.playerCount), assignments=d.repairs||{}, selected=roles.map(role=>assignments[role]).filter(Boolean), unique=new Set(selected);
    if(run?.phase==="repair"){
      const completed=Object.values(run.results||{}), working=completed.filter(result=>result.success);
      preview.summary=`${completed.length} of ${run.attempts} assigned repairs submitted.`;
      preview.keeps=working.map(result=>`${repairSystem(result.systemId)?.name}: WORKING immediately.`);
      preview.costs=completed.filter(result=>!result.success).map(result=>`${repairSystem(result.systemId)?.name}: remains in FAULT; no retry.`);
      preview.ready=completed.length===run.attempts;
      if(!preview.ready)preview.warnings.push(`${run.attempts-completed.length} repair game${run.attempts-completed.length===1?" remains":"s remain"} open.`);
    }else{
      preview.summary=`${selected.length} of ${roles.length} players assigned a repair attempt.`;
      preview.keeps=roles.filter(role=>assignments[role]).map(role=>`${roleName(session,role)} → ${repairSystem(assignments[role])?.name||"UNASSIGNED"}.`);
      preview.costs=run.available.filter(id=>!selected.includes(id)).map(id=>`${repairSystem(id).name}: not selected and will remain in FAULT.`);
      preview.ready=selected.length===roles.length&&unique.size===roles.length&&selected.every(id=>run.available.includes(id));
      preview.positiveLabel="ASSIGNED REPAIR ATTEMPTS";preview.costLabel="FAILED SYSTEMS NOT SELECTED";
      preview.footer="The interface does not identify which systems matter later. Every player receives one different repair; every game has one submission and no retry.";
      if(!preview.ready)preview.warnings.push("Assign one different amber FAULT system to every player.");
    }
  } else if (stage === 3) {
    const run=session.act3Run,confirmed=run?.resolution?.confirmed;
    const visibleDraft=confirmed?{
      firstLocation:confirmed.FIRST_LOCATION,secondLocation:confirmed.SECOND_LOCATION,
      tool1:confirmed.REPAIR_TOOL_1,tool2:confirmed.REPAIR_TOOL_2,
      supportItem:confirmed.SUPPORT_ITEM,filterUse:confirmed.FILTER_USE,
    }:d;
    const plan=act3PlanPreview(visibleDraft);
    const resolutionLabel=run?.resolution?.mode==="correct"?"Deployment accepted":run?.resolution?.mode==="corrected"?"Deployment corrected":"Valid deployment assigned";
    preview.summary=run?.phase==="runner"?`${resolutionLabel}. Nominate one connected crew member as the Act 4 runner.`:run?.phase==="final_call"?"Planning time expired. Commit immediately or let the facilitator assign a valid deployment.":plan.complete?`${act3Location(plan.first)?.code||"—"} → ${act3Location(plan.second)?.code||"—"} ready for final commitment.`:"Complete all six deployment fields.";
    preview.keeps=[
      `Route: ${act3Location(plan.first)?.code||"NOT SET"} → ${act3Location(plan.second)?.code||"NOT SET"}.`,
      `Tools: ${act3Label(ACT3_REPAIR_TOOLS,visibleDraft.tool1)} / ${act3Label(ACT3_REPAIR_TOOLS,visibleDraft.tool2)}.`,
      `Support: ${act3Label(ACT3_SUPPORT_ITEMS,visibleDraft.supportItem)}.`,
      `Crew filter total: ${plan.filterUse??"NOT SET"} / capacity ${plan.capacity}.`,
    ];
    // Keep the published arithmetic as an actual player puzzle. The engine
    // validates it after commitment but never calculates it in the live UI.
    preview.costs=[run?.phase==="runner"?`${Math.round((run.resolution?.allowance||300)/60)} minutes per Act 4 repair.`:"Use the Navigation Resource to calculate all three stages; the station checks the total only after commitment."];
    preview.warnings=[...plan.errors];preview.ready=plan.submittable;
    preview.positiveLabel="SHARED DEPLOYMENT";preview.costLabel="THREE-STAGE FILTER CHECK";
    preview.footer="COMMIT DEPLOYMENT is final. A correct plan gives six minutes per Act 4 repair; any corrected or randomly assigned plan gives five minutes per repair.";
  } else if (stage === 4) {
    if (session.fieldRun?.active) {
      const run=session.fieldRun,current=outsideLocation(run.route[run.currentIndex]);
      preview.summary = `${roleName(session,run.runner)} is servicing ${current.name} — location ${run.currentIndex+1} of 2.`;
      preview.keeps = [`Locked route: ${run.route.map(id=>outsideLocation(id).name).join(" → ")}.`,`Loadout: ${run.equipment.map(outsideEquipmentName).join(" + ")}.`,`Local field radio: CLEAR.`];
      const board=run.boards?.[run.currentIndex+1],complete=Object.values(board?.modules||{}).filter(module=>module.completed).length;
      preview.costs = [`${run.results.length} of 2 services resolved.`,run.phase==="service"?`${complete} of 6 repair modules complete at this destination.`:`Field phase: ${run.phase.toUpperCase()}.`];
      preview.ready=false;preview.footer="The route and equipment cannot be changed. Incorrect module submissions remain recoverable while the shared repair clock is running.";
    } else {
      const plan=session.global.outsidePlan,first=plan?.FIRST_LOCATION||plan?.RUNNER_FIRST_TARGET,second=plan?.SECOND_LOCATION||[plan?.PLANNED_INBOUND_LOCATION,plan?.PLANNED_OUTBOUND_LOCATION].find(id=>id&&id!==first);
      preview.summary = `${roleName(session,d.runner)} will execute the locked route ${outsideLocation(first)?.name||"UNAVAILABLE"} → ${outsideLocation(second)?.name||"UNAVAILABLE"}.`;
      preview.keeps = [`Destinations and order remain locked from Act 3.`,`Loadout: ${(plan?.FIELD_EQUIPMENT||[]).map(id=>act3Label([...ACT3_REPAIR_TOOLS,...ACT3_SUPPORT_ITEMS],id)).join(" + ")||"UNAVAILABLE"}.`,`Repair allowance: ${Math.round((plan?.REPAIR_ALLOWANCE||360)/60)} minutes per repair.`,`Runner/station local radio remains clear.`];
      preview.costs = ["Each site permits one service action; failure does not reopen planning."];
      preview.ready = activeRoleIds(session.playerCount).includes(d.runner)&&Boolean(first&&second);
      if (!preview.ready) preview.warnings.push("Assign an available runner to execute the locked mission.");
      preview.footer="No route, equipment or exposure choice is reopened in Act 4.";
    }
  } else if (stage === 5) {
    const view=session.cabinRun?.engine?getAct5PublicState(session.cabinRun.engine,"admin"):null;
    const stable=Object.values(view?.stationStatus||{}).filter(item=>item.stable).length;
    const occupied=Object.values(view?.stations||{}).filter(Boolean).length;
    preview.summary = `${stable} of ${view?.availableStationCount||9} available stations stable; ${occupied} currently occupied.`;
    preview.keeps = ["Every player may claim any free available station and switch at any time.","Committed physical progress persists when a player leaves.",view?.purge.available?"Cabin Emergency Purge available because Upper Ridge was restored.":"Cabin Emergency Purge offline because Upper Ridge was not restored."];
    preview.costs = ["Gas, recurrence and unattended physics continue while stations are vacant.","Only Emergency Purge removes current airborne stock; all other stations alter future ingress or treatment."];
    preview.ready=false;preview.footer="The authoritative five-minute window closes all stations simultaneously. Pre-flush airborne gas earns either three or four minutes for Act 6.";
  } else if (stage === 6) {
    const archive=archivePublicState(session),technical=archive?.phase==="technical";
    preview.summary = technical ? "R-12 technical archive open: teach the complete final procedure to every player." : "Lark Shift historical archive open: reconstruct what happened before the technical files unlock.";
    preview.keeps = technical
      ? ["DISTRESS changes the station status.","EXTRACTION MESSAGE names R-12, unsafe surface air and the rescue request.","RELEASE CONFIGURATION preserves isolation while arming authorised response."]
      : ["Six people entered R-12 deliberately after a gradual, unexplained deterioration.","R-12 protected them; silence and secure isolation delayed recovery.","OPERATIONAL described the relay—not whether its people were safe."];
    preview.costs = ["The transfer chamber purge uses a shared serial receiver and protected-air reserve.","The act closes automatically. Archive reading does not execute any finale action."];
    preview.ready=false;
    preview.positiveLabel=technical?"EVERY PLAYER MUST LEARN":"HISTORICAL TRUTH TO RECONSTRUCT";
    preview.costLabel="FINAL CONSTRAINTS";
    preview.footer=technical?"Every player performs the same physical descent: ACCESS HATCH → CHAMBER SEAL → CAPSULE PURGE.":"Browse the six fixed records. The shared nightmare interrupts automatically without a page-completion gate.";
  } else if (stage === 7) {
    const run=session.finaleRun;
    preview.summary=run?.phase==="surface"?"The final operator is alone at the surface dashboard.":run?.phase==="adjudication"?"Everyone is sealed inside R-12; classify the committed message to reveal rescue time.":`${run?.below.length||0} of ${run?.order.length||session.playerCount} crew are inside R-12.`;
    preview.keeps=[`R-12 air: ${r12Condition(run)}.`,`${round1(run?.reserve??100)}% protected-air reserve remains.`,"Every completed transfer reaches refuge; speed changes shared contamination."];
    preview.costs=["Players below cannot coach people still above.","The final surface configuration determines rescue delay, not whether the last player gets below."];
    preview.ready=false;preview.footer="Act 7 advances automatically through individual transfers and the final surface sequence.";
  }
  preview.keeps = preview.keeps.filter(Boolean); preview.costs = preview.costs.filter(Boolean);
  return preview;
}

function resolveStage(session, expired = false) {
  if (session.stageStatus !== "live") return;
  ensureSession(session);
  const stage = session.stage, d = session.draft, g = session.global;
  let headline = "Decision recorded", detail = "The station updates its working model.", quality = "mixed", impacts = [], decision = decisionPreview(session).summary;

  if (stage === 1) {
    const answers = d.handover || {};
    const answered = STAGES[1].options.filter(([id]) => ["yes","no"].includes(answers[id]));
    const unresolved = STAGES[1].options.filter(([id]) => !["yes","no"].includes(answers[id]));
    const yes = answered.filter(([id]) => answers[id] === "yes").map(([,name]) => name);
    const no = answered.filter(([id]) => answers[id] === "no").map(([,name]) => name);
    headline = expired ? "Handover window closed" : "Night shift handover accepted";
    detail = "The incoming crew becomes active. The station provides no score and still reports PERSONNEL EXCEPTIONS: NONE RAISED.";
    quality = "mixed";
    decision = `${answered.length} of 6 staff reviewed: ${yes.length} YES / ${no.length} NO${unresolved.length ? ` / ${unresolved.length} UNRESOLVED` : ""}.`;
    impacts = [
      `Accounted for / YES: ${yes.length ? yes.join(", ") : "none recorded"}.`,
      `Not accounted for / NO: ${no.length ? no.join(", ") : "none recorded"}.`,
      "No correctness result is shown. Only what the crew noticed, shared and remembers carries forward.",
    ];
  } else if (stage === 2) {
    const run=session.repairRun;refreshRepairTraffic(session,Date.now(),true);syncLegacySystems(session);
    const working=REPAIR_SYSTEMS.filter(system=>g.systemStatus[system.id]==="working").map(system=>system.name);
    const broken=REPAIR_SYSTEMS.filter(system=>g.systemStatus[system.id]==="broken").map(system=>system.name);
    const submitted=Object.values(run?.results||{}).length;
    headline = "Repair window closed";
    detail = `${submitted} of ${run?.attempts||session.playerCount} assigned games were submitted. Successful repairs took effect immediately; every other amber fault remains broken.`;
    quality = "mixed";
    decision = `${run?.attempts||session.playerCount} repair attempts assigned; ${submitted} submitted before ${expired?"timeout":"closure"}.`;
    impacts = [
      `WORKING: ${working.join(", ") || "none"}.`,
      `FAULT: ${broken.join(", ") || "none"}.`,
      `Traffic received: ${(run?.traffic||[]).map(item=>`${item.ref} ${item.clarity.toUpperCase()} / ${item.stored?"STORED":"NOT STORED"}`).join(" · ")}.`,
      "Road/Flood Monitoring, Lower Road Camera and Ventilation Control remain operational.",
      "No score or consequential-choice marker is shown; only the true working/fault state remains.",
    ];
  } else if (stage === 3) {
    const run=session.act3Run,resolution=run?.resolution,plan=session.global.outsidePlan;
    if(!resolution||!plan?.RUNNER)throw new Error("Resolve the deployment and nominate a runner before closing Act 3");
    const first=act3Location(plan.FIRST_LOCATION),second=act3Location(plan.SECOND_LOCATION),correct=resolution.mode==="correct";
    headline = correct ? "Deployment accepted" : resolution.mode==="corrected" ? "Deployment corrected" : "Deployment assigned";
    detail = `${roleName(session,plan.RUNNER)} will run ${first.code} → ${second.code} with ${act3Label(ACT3_SUPPORT_ITEMS,plan.SUPPORT_ITEM)}. Act 4 receives ${Math.round(plan.REPAIR_ALLOWANCE/60)} minutes for each repair.`;
    quality = correct ? "strong" : "mixed";
    decision = `${first.code} → ${second.code}; ${act3Label(ACT3_REPAIR_TOOLS,plan.REPAIR_TOOL_1)} + ${act3Label(ACT3_REPAIR_TOOLS,plan.REPAIR_TOOL_2)} + ${act3Label(ACT3_SUPPORT_ITEMS,plan.SUPPORT_ITEM)}; ${plan.FILTER_USE} filter units.`;
    impacts = [
      `Route locked: ${first.code} → ${second.code} → CABIN.`,
      `Loadout locked: ${act3Label(ACT3_REPAIR_TOOLS,plan.REPAIR_TOOL_1)} / ${act3Label(ACT3_REPAIR_TOOLS,plan.REPAIR_TOOL_2)} / ${act3Label(ACT3_SUPPORT_ITEMS,plan.SUPPORT_ITEM)}.`,
      `Filter use: ${plan.FILTER_USE} of ${plan.SUPPORT_ITEM==="emergency_filter"?115:100} units.`,
      `${roleName(session,plan.RUNNER)} nominated as runner.`,
      correct?"No planning correction: six minutes per Act 4 repair.":"Corrected or random deployment: five minutes per Act 4 repair.",
    ];
  } else if (stage === 4) {
    const run=session.fieldRun,restored=(run?.results||[]).filter(result=>result.success),failed=(run?.results||[]).filter(result=>!result.success);
    if(run){run.active=false;run.phase="returned";}
    headline = `${restored.length} of 2 field services restored`;
    detail = "The runner returns to Blackout Ridge. The dashboard now shows what the locked route actually recovered; no destination is labelled right or wrong.";
    quality = restored.length===2?"strong":restored.length?"mixed":"costly";
    decision = `${roleName(session,run?.runner)} executed ${(run?.route||[]).map(id=>outsideLocation(id)?.name).join(" → ")}.`;
    impacts = [
      ...restored.map(result=>`${outsideLocation(result.locationId).name}: RESTORED.`),
      ...failed.map(result=>`${outsideLocation(result.locationId).name}: NOT RESTORED; no retry or replacement destination.`),
      `Inbound communications: ${derivedCommunications(session).inbound}. Human outbound communications: ${derivedCommunications(session).outbound}.`,
      g.fieldServices.lower_road_camera_service==="restored"?"Historical playback shows Mara reached Lower Route and headed back toward Blackout Ridge.":"Lower Road historical playback remains unavailable.",
      g.fieldServices.upper_ridge_service==="restored"?"Ventilation Control is operational; purge infrastructure is available later.":"Ventilation Control remains offline; purge is unavailable.",
    ];
  } else if (stage === 5) {
    tickCabin(session,Date.now());
    const run=session.cabinRun;
    if(run.preFlushAirborneGas===null){
      const result=getAct5Result(run.engine) || getAct5PublicState(run.engine,"admin").debug;
      run.preFlushAirborneGas=Number(result?.currentAirborneGas||0);
    }
    run.engine.status="stopped";run.active=false;run.legacyHoldTriggered=true;
    const longWindow=run.preFlushAirborneGas<session.act6Config.gasThreshold,investigationTime=longWindow?session.act6Config.longSeconds:session.act6Config.shortSeconds;
    g.act6InvestigationTime=investigationTime;g.act6AllowanceClass=longWindow?"LONG":"SHORT";g.mara="located";g.lockKnowledge=Math.max(g.lockKnowledge,1);
    addEvidence(session,"R-12 protected volume sealed and stable","Old plan identifies Lower Route beneath Blackout Ridge","Mara located alive in R-12");
    setFlag(session,"human","mara_below");setFlag(session,"system","r12_discovered");setFlag(session,"system","r12_access_sealed");
    headline = "R-12 reports SEALED / STABLE — Mara is alive";
    detail = "At exactly five minutes the modern controls lock. A legacy mechanical warning closes the shutters and releases one protected-air flush. The isolation sweep then identifies AUXILIARY RELAY HOLD — R-12; its dormant observation feed confirms Mara Venn is alive inside.";
    quality = longWindow?"strong":"costly";
    decision = `Ten-station mitigation window closed with ${Math.round(run.preFlushAirborneGas)} pre-flush airborne gas units. Legacy Atmospheric Hold fired once.`;
    impacts = [`Act 6 investigation window earned: ${Math.round(investigationTime/60)} minutes.`,`The legacy flush is a one-shot transition, not an eleventh station and not a modern-system repair.`,`R-12 is a sealed protected hold beneath Blackout Ridge; access remains locked.`,`Mara Venn is definitively located alive inside; the exterior plume continues.`];
  } else if (stage === 6) {
    refreshArchivePhase(session,Date.now());
    headline = "The Lark Shift is understood";
    detail = "R-12 saved the six from the initiating threat, but secure isolation, no extraction request and a false operational picture left them beyond authorised rescue until protected air ran out.";
    quality = "strong";
    decision = `Timed local archive investigation: ${session.clock.duration} seconds; history and R-12 operating records released in sequence.`;
    impacts = ["The initiating cause remains unresolved; the Lark Shift are not blamed for an impossible situation.","Every transfer uses the same square-hatch, chamber-seal and capsule-purge sequence.","The purge receiver and protected-air reserve persist between successive occupants.","Act 7 retains the four separate R-12 operating pages and five-control console.","The cabin reaches the common critical transition into Act 7."];
  } else if (stage === 7) {
    const c=session.finaleRun?.calculation;if(!c)throw new Error("Finale calculation is not ready");
    const endings={
      F01:["SHUTTERS OPEN","Exterior shutters retract while the internal refuge remains open. Human responders enter directly and every active crew member receives treatment."],
      F02:["FORCED RESCUE","The shutters remain closed, but responders force the exterior barrier and reach R-12. Individual survival depends on exposure before treatment."],
      F03:["THE VIGIL","A useful extraction request keeps responders at the station while secure isolation delays entry. The crew eventually recognises human voices and releases the inner barrier."],
      F04:["LARK SHIFT REPEATS","Secure isolation remains engaged without credible proof of R-12 occupancy. Responders withdraw and later recovery repeats the fatal 1988 pattern."],
      F05:["TOO LATE","A real rescue path reaches the refuge, but treatment arrives after every active crew member's exposure tolerance has been exceeded."],
    };
    [headline,detail]=endings[c.film];quality=c.film==="F01"?"strong":c.survivors?"mixed":"costly";
    const survivorNames=c.fates.filter(item=>item.survived).map(item=>item.name),deathNames=c.fates.filter(item=>!item.survived).map(item=>item.name);
    session.pendingEnding={title:headline,body:detail,band:c.band,film:c.film,mara:"unscored",crew:c.deaths?c.survivors?"casualties":"deceased":"recovered",rescueOutcome:`${c.survivors} SURVIVED / ${c.deaths} DIED`,survivalOutcome:`RESPONDER ARRIVAL ${c.rescueHours.toFixed(1)} H · R-12 AIR 4.5 H`,statusOutcome:`${c.status} / EXTRACTION ${c.message} / ${c.release}`,survivorNames,deathNames,calculation:{...c}};
    decision=`${session.finaleRun.transfers.length} transfers and capsule purge discharges; message ${session.finaleRun.messageRating.toUpperCase()}.`;
    impacts=[`R-12 final air: ${c.finalAir}/100 for ${c.occupancy} occupants.`,`Safe survival window: ${Math.ceil(c.survivalTime/60)} minutes. External rescue time: ${Math.ceil(c.rescueTime/60)} minutes.`,`Outside result: ${c.status}; extraction message ${c.message}; authorised release ${c.release}.`,`Serial transfer receiver and protected-air use persisted across all ${session.finaleRun.transfers.length} arrivals.`];
  }

  session.global.upperAir = clamp(session.global.upperAir, 0, 3);
  session.global.trust = clamp(session.global.trust, 0, 2);
  session.global.official = clamp(session.global.official + (expired && ![1,5,6,7].includes(stage) ? 1 : 0), 0, 3);
  session.decisions[stage] = stage===7 ? {surface:{...session.finaleRun.surfaceCommitted},messageRating:session.finaleRun.messageRating,external:{status:session.finaleRun.calculation.status,message:session.finaleRun.calculation.message,release:session.finaleRun.calculation.release},finalAir:session.finaleRun.calculation.finalAir,survivalTime:session.finaleRun.calculation.survivalTime,rescueTime:session.finaleRun.calculation.rescueTime,endingBand:session.finaleRun.calculation.band,film:session.finaleRun.calculation.film,fates:structuredClone(session.finaleRun.calculation.fates)} : stage===6 ? {investigationWindow:session.clock.duration} : stage===5 ? {preFlushAirborneGas:session.cabinRun.preFlushAirborneGas,act6InvestigationTime:session.global.act6InvestigationTime,legacyAtmosphericHold:true,stationStatus:getAct5PublicState(session.cabinRun.engine,"screen").stationStatus} : stage===4 ? {runner:d.runner,route:[...(session.fieldRun?.route||[])],results:(session.fieldRun?.results||[]).map(result=>({locationId:result.locationId,success:result.success,instruction:result.instruction,action:result.action,expired:Boolean(result.expired)}))} : stage===3 ? {...session.global.outsidePlan,FIELD_EQUIPMENT:[...session.global.outsidePlan.FIELD_EQUIPMENT],resolution:session.act3Run?.resolution?.mode} : { ...d };
  session.stageStatus = "resolved"; session.clock.remaining = remaining(session.clock); session.clock.running = false; session.clock.endAt = null;
  if (expired) impacts.unshift(stage === 1 ? "Time expired: unanswered records closed as unresolved; no correctness result was shown." : stage===5 ? "Five minutes elapsed: every station locked before the one-shot Legacy Atmospheric Hold transition." : stage===6 ? "The investigation window closed on schedule; the facilitator now releases Act 7." : "Time expired: official pressure advanced before the plan resolved.");
  session.outcomes[stage] = { headline, detail, quality, expired, decision, impacts, next: STAGES[stage]?.story?.next || "The incident continues.", at: Date.now() };
  bump(session, `Stage ${stage} resolved: ${headline}`);
}

function canLead(session, viewer) { return viewer.kind === "facilitator" || viewer.role === "lead" && ![1,2,3].includes(session.stage); }

function recordContribution(session, role, kind) {
  if (!role) return;
  const entry = session.metrics.contributions[role] ||= { reports: 0, interventions: 0, stationInstructions: 0, serviceAttempts: 0, stages: [] };
  entry[kind] = (entry[kind] || 0) + 1;
  if (session.stage && !entry.stages.includes(session.stage)) entry.stages.push(session.stage);
}

const optionIds = entries => new Set(entries.map(([id])=>id));
function validateDraftUpdate(session, payload) {
  const stage=session.stage, next={...session.draft};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Decision update is invalid");
  if (stage===1 && "handover" in payload) {
    const allowed=optionIds(STAGES[1].options), submitted=payload.handover;
    if(!submitted||typeof submitted!=="object"||Array.isArray(submitted))throw new Error("Handover decisions are invalid");
    const answers={...(next.handover||{})};
    for(const [id,value] of Object.entries(submitted)){
      if(!allowed.has(id)||!["","yes","no"].includes(value))throw new Error("Handover decisions are invalid");
      answers[id]=value;
    }
    next.handover=answers;
  } else if(stage===2 && session.repairRun?.phase==="planning" && "repairs" in payload) {
    const submitted=payload.repairs;if(!submitted||typeof submitted!=="object"||Array.isArray(submitted))throw new Error("Repair assignments are invalid");
    const roles=new Set(activeRoleIds(session.playerCount)),allowed=new Set(session.repairRun.available),repairs={...(next.repairs||{})};
    for(const [role,id] of Object.entries(submitted)){if(!roles.has(role)||id&&!allowed.has(id))throw new Error("Repair assignment is invalid");repairs[role]=String(id||"");}
    const chosen=Object.values(repairs).filter(Boolean);if(new Set(chosen).size!==chosen.length)throw new Error("Each selected system can be assigned only once");next.repairs=repairs;
  } else if(stage===3) {
    if(!["planning","final_call"].includes(session.act3Run?.phase))throw new Error("The deployment is already locked");
    const locations=optionIds(STAGES[3].options),tools=new Set(ACT3_REPAIR_TOOLS.map(([id])=>id)),support=new Set(ACT3_SUPPORT_ITEMS.map(([id])=>id));
    for(const key of ["firstLocation","secondLocation"]){if(key in payload){if(payload[key]&&!locations.has(payload[key]))throw new Error("Field location is invalid");next[key]=String(payload[key]||"");}}
    for(const key of ["tool1","tool2"]){if(key in payload){if(payload[key]&&!tools.has(payload[key]))throw new Error("Repair tool is invalid");next[key]=String(payload[key]||"");}}
    if("supportItem" in payload){if(payload.supportItem&&!support.has(payload.supportItem))throw new Error("Support item is invalid");next.supportItem=String(payload.supportItem||"");}
    if("filterUse" in payload){const value=payload.filterUse===""?"":Number(payload.filterUse);if(value!==""&&(!Number.isInteger(value)||value<0||value>200))throw new Error("Filter use must be a whole number from 0 to 200");next.filterUse=value;}
  } else if(stage===4 && !session.fieldRun?.active) {
    if("runner" in payload){if(!activeRoleIds(session.playerCount).includes(payload.runner))throw new Error("Runner is invalid");next.runner=payload.runner;}
    for(const forbidden of ["destination","abort","route","equipment"])if(forbidden in payload)throw new Error("The Act 3 route and equipment are locked");
  } else if(stage===5) {
    throw new Error("Use the active cabin controls; Act 5 has no crew decision form");
  } else if(stage===6) {
    throw new Error("Act 6 is a read-only archive investigation; it has no decision form");
  } else if(stage===7) {
    throw new Error("Act 7 uses individual transfer and surface controls; it has no crew decision form");
  } else if(Object.keys(payload).length) throw new Error("Decision cannot be changed now");
  return next;
}

function act4Allocations(session,runner,boardNumber){
  const cabin=activeRoleIds(session.playerCount).filter(role=>role!==runner&&!session.absentRoles[role]);
  const patterns={3:[2,2,2],4:[2,2,1,1],5:[2,1,1,1,1],6:[1,1,1,1,1,1]};
  let counts=[...(patterns[cabin.length]||[])];
  if(boardNumber===2&&cabin.length===4)counts=[1,1,2,2];
  else if(boardNumber===2&&cabin.length===5)counts=[1,1,1,1,2];
  const modules=ACT4_MODULES[boardNumber].map(item=>item.id),allocations={};let cursor=0;
  cabin.forEach((role,index)=>{allocations[role]=modules.slice(cursor,cursor+(counts[index]||1));cursor+=counts[index]||1;});
  return allocations;
}

function beginFieldRun(session) {
  const d=session.draft;
  if(!activeRoleIds(session.playerCount).includes(d.runner))throw new Error("Assign an available runner");
  const plan=session.global.outsidePlan;
  if(!plan)throw new Error("The locked Outside Plan is unavailable");
  const first=plan.FIRST_LOCATION||plan.RUNNER_FIRST_TARGET,second=plan.SECOND_LOCATION||[plan.PLANNED_INBOUND_LOCATION,plan.PLANNED_OUTBOUND_LOCATION].find(id=>id!==first);
  if(!FIELD_GAMES[first]||!FIELD_GAMES[second])throw new Error("The locked field route is invalid");
  const firstLocation=outsideLocation(first),secondLocation=outsideLocation(second),firstFinish=firstLocation.travel+firstLocation.service,secondArrival=firstFinish+(firstLocation.transfer[second]||0),secondFinish=secondArrival+secondLocation.service;
  const forecast=[{id:first,name:firstLocation.name,order:1,arrival:firstLocation.travel,finish:firstFinish,ppm:Number((firstLocation.concentration+firstLocation.rise*firstFinish).toFixed(1))},{id:second,name:secondLocation.name,order:2,arrival:secondArrival,finish:secondFinish,ppm:Number((secondLocation.concentration+secondLocation.rise*secondFinish).toFixed(1))}];
  const now=Date.now();
  session.act4Intro={startedAt:now,endsAt:now+ACT4_OPENING_MS};
  const boardVariant=[...session.code].reduce((sum,char)=>sum+char.charCodeAt(0),0);
  session.fieldRun={active:true,runner:d.runner,route:[first,second],currentIndex:0,phase:"travel",transitionAt:session.act4Intro.endsAt+ACT4_TRAVEL_MS,instruction:null,results:[],forecast,equipment:[...(plan.FIELD_EQUIPMENT||[])],repairAllowance:plan.REPAIR_ALLOWANCE||360,localRadio:"clear",boards:{1:{modules:createAct4Board(1,boardVariant),allocations:act4Allocations(session,d.runner,1)},2:{modules:createAct4Board(2,boardVariant),allocations:act4Allocations(session,d.runner,2)}}};
  session.clock={duration:session.fieldRun.repairAllowance,remaining:session.fieldRun.repairAllowance,running:false,endAt:null};
  bump(session,`Runner deployed to ${outsideLocation(first).name} on the locked route`);
}

function startAct4Test(session){
  if(Object.keys(session.players).length!==session.playerCount)throw new Error(`Connect all ${session.playerCount} crew terminals before starting the Act 4 test`);
  const runner=activeRoleIds(session.playerCount).includes("operations")?"operations":activeRoleIds(session.playerCount)[0];
  session.metrics.startedAt=Date.now();
  session.testMode={act:4,startedAt:Date.now()};
  session.global.systemStatus=Object.fromEntries(ACT2_SYSTEMS.map(system=>[system.id,"working"]));
  syncLegacySystems(session);
  session.global.externalStatus={external_inbound:"offline",external_human_outbound:"offline",lower_road_camera_history:"offline",ventilation_path:"offline"};
  session.global.outsidePlan={
    FIRST_LOCATION:"c",SECOND_LOCATION:"a",REPAIR_TOOL_1:"valve_wrench",REPAIR_TOOL_2:"signal_meter",SUPPORT_ITEM:"flood_kit",FILTER_USE:99,REPAIR_ALLOWANCE:360,RUNNER:runner,
    PLANNED_INBOUND_LOCATION:"c",PLANNED_OUTBOUND_LOCATION:"a",RUNNER_FIRST_TARGET:"c",FIELD_EQUIPMENT:["valve_wrench","signal_meter","flood_kit"],
  };
  startStage(session,4);
  beginFieldRun(session);
  bump(session,"Direct Act 4 test started with CAM-01 → RX-01 and a six-minute allowance");
}

function startAct5Test(session){
  if(Object.keys(session.players).length!==session.playerCount)throw new Error(`Connect all ${session.playerCount} crew terminals before starting the Act 5 test`);
  session.metrics.startedAt=Date.now();session.testMode={act:5,startedAt:Date.now()};
  session.global.systemStatus={...Object.fromEntries(ACT2_SYSTEMS.map(system=>[system.id,"working"])),air_quality:"working"};
  session.global.fieldServices={external_inbound_path:"restored",external_outbound_path:"restored",lower_road_camera_service:"restored",upper_ridge_service:"restored"};
  syncLegacySystems(session);startStage(session,5);bump(session,"Direct Act 5 test started with Upper Ridge service restored and all ten work locations available");
}

function startAct6Test(session){
  if(Object.keys(session.players).length!==session.playerCount)throw new Error(`Connect all ${session.playerCount} crew terminals before starting the Act 6 test`);
  session.metrics.startedAt=Date.now();session.testMode={act:6,startedAt:Date.now()};
  session.global.systemStatus={...Object.fromEntries(ACT2_SYSTEMS.map(system=>[system.id,"working"])),air_quality:"working"};
  session.global.fieldServices={external_inbound_path:"restored",external_outbound_path:"restored",lower_road_camera_service:"restored",upper_ridge_service:"restored"};
  session.global.mara="located";session.global.act6InvestigationTime=session.act6Config.shortSeconds;session.global.act6AllowanceClass="TEST";
  syncLegacySystems(session);startStage(session,6);bump(session,"Direct Act 6 test started with the Lark archive and R-12 technical records available");
}

function act4RunnerRequired(session,viewer){
  const run=session.fieldRun;
  if(session.stage!==4||session.stageStatus!=="live"||!run?.active)throw new Error("No field repair is active");
  if(session.act4Intro?.endsAt>Date.now())throw new Error("The field repair opens after the deployment sequence");
  if(run.phase!=="service")throw new Error("The runner is still travelling to the field installation");
  if(viewer.kind!=="facilitator"&&viewer.role!==run.runner)throw new Error("Only the assigned runner can operate the repair board");
  return run;
}

function act4MutableModule(session,viewer,moduleId){
  const run=act4RunnerRequired(session,viewer),boardNumber=run.currentIndex+1,board=run.boards?.[boardNumber],module=board?.modules?.[moduleId];
  if(!module||!ACT4_MODULES[boardNumber].some(item=>item.id===moduleId))throw new Error("Repair module is invalid");
  if(module.completed)throw new Error("Completed modules are locked");
  return {run,boardNumber,board,module};
}

function updateAct4Module(session,viewer,payload){
  const {module}=act4MutableModule(session,viewer,String(payload.moduleId||"")),op=String(payload.op||""),value=payload.value,index=Number(payload.index);
  const append=(limit,allowed)=>{if(!allowed.includes(value)||module.queue.length>=limit)throw new Error("Module input is invalid");module.queue.push(value);};
  if(op==="clear"){
    if(Array.isArray(module.queue))module.queue=[];
    if(module.id==="service_plate")module.queue=[];
  }else if(module.solution&&Array.isArray(module.queue)&&op==="append"){
    const allowed=module.solution.every(item=>typeof item==="number")?module.id==="service_plate"?[0,1,2,3,4,5,6,7]:[0,1,2]:module.id==="route_controls"?["up","right","down","left"]:["RESET","CONFIRM"];
    append(module.solution.length,allowed);
  }else if(Array.isArray(module.values)&&op==="set"){
    if(!Number.isInteger(index)||index<0||index>=module.values.length||!Number.isInteger(Number(value)))throw new Error("Module setting is invalid");
    const numeric=Number(value),max=module.id==="alignment_discs"?8:9,min=module.id==="alignment_discs"?1:0;if(numeric<min||numeric>max)throw new Error("Module setting is invalid");module.values[index]=numeric;
  }else if(module.id==="patch_matrix"&&op==="select_source"){
    const source=String(value||"");if(!Object.hasOwn(module.leads,source))throw new Error("Patch source is invalid");module.selectedSource=source;
  }else if(module.id==="patch_matrix"&&op==="connect"){
    const source=String(payload.source||module.selectedSource||""),target=String(payload.target||"");if(!Object.hasOwn(module.leads,source)||!/^(PWR|DATA|CTRL|AUX)-[A-D]$/.test(target))throw new Error("Patch connection is invalid");
    for(const [existingSource,existingTarget] of Object.entries(module.connections))if(existingTarget===target&&existingSource!==source)delete module.connections[existingSource];
    module.connections[source]=target;module.selectedSource=null;
  }else if(module.id==="switch_bank"&&op==="toggle"){
    if(!Number.isInteger(index)||index<0||index>5)throw new Error("Switch is invalid");module.switches[index]=module.switches[index]==="UP"?"DOWN":"UP";
  }else if(module.id==="switch_bank"&&op==="sample"){
    if(JSON.stringify(module.switches)!==JSON.stringify(module.test)){module.feedback="TEST CONFIGURATION REJECTED";module.sampled=false;}else{module.feedback="LAMPS LATCHED";module.sampled=true;}
  }else if(module.id==="component_order"&&op==="select"){
    if(!Number.isInteger(index)||index<0||index>4)throw new Error("Component is invalid");if(module.selected===null)module.selected=index;else{[module.items[module.selected],module.items[index]]=[module.items[index],module.items[module.selected]];module.selected=null;}
  }else if(module.id==="fuse_allocation"&&op==="select"){
    if(!module.fuses.includes(value))throw new Error("Fuse is invalid");module.selected=value;
  }else if(module.id==="fuse_allocation"&&op==="assign"){
    const circuit=String(payload.target||"");if(!module.selected||!Object.hasOwn(module.circuits,circuit))throw new Error("Fuse assignment is invalid");for(const [key,fuse] of Object.entries(module.assignments))if(fuse===module.selected)delete module.assignments[key];module.assignments[circuit]=module.selected;module.selected=null;
  }else if(module.id==="load_test"&&op==="test"){
    if(!["A","B","C"].includes(value))throw new Error("Diagnostic test is invalid");
    if(value!=="A"&&!module.tests.includes("A"))throw new Error("Run TEST A first");
    if(value==="B"&&module.meters.TEMPERATURE==="HIGH")throw new Error("TEST A directs this fault to TEST C");
    if(value==="C"&&module.meters.VIBRATION==="HIGH")throw new Error("TEST A directs this fault to TEST B");
    if(value==="A")module.tests=["A"];else module.tests.push(value);
    if(value==="A")module.meters=["BEARING","DRIVE"].includes(module.fault)?{VIBRATION:"HIGH",TEMPERATURE:"NORMAL",CURRENT:"NORMAL"}:{VIBRATION:"NORMAL",TEMPERATURE:"HIGH",CURRENT:"NORMAL"};
    else if(value==="B")module.meters={VIBRATION:"HIGH",TEMPERATURE:"NORMAL",CURRENT:module.fault==="BEARING"?"LOW":"HIGH"};
    else module.meters={VIBRATION:"NORMAL",TEMPERATURE:"HIGH",CURRENT:module.fault==="COOLING"?"HIGH":"LOW"};
  }else if(module.id==="load_test"&&op==="select"){
    if(!["BEARING","COOLING","SUPPLY","DRIVE"].includes(value))throw new Error("Repair selection is invalid");module.selected=value;
  }else throw new Error("Module input is invalid");
  module.feedback=op==="sample"?module.feedback:"";bump(session,`Act 4 module updated: ${payload.moduleId}`);
}

function resolveAct4Stop(session){
  const run=session.fieldRun,locationId=run.route[run.currentIndex];
  run.results.push({locationId,success:true,instruction:null,action:`repair_board_${run.currentIndex+1}`,knowledge:fieldKnowledge(session,locationId,true),at:Date.now()});
  applyFieldServiceConsequence(session,locationId,true);bump(session,`${outsideLocation(locationId).name} six-module repair completed: RESTORED`);
  session.clock={duration:run.repairAllowance,remaining:run.repairAllowance,running:false,endAt:null};run.instruction=null;
  if(run.currentIndex===0){run.phase="resolved";run.nextIndex=1;run.transitionAt=Date.now()+ACT4_RESOLVED_MS;bump(session,`${outsideLocation(locationId).name} result displayed before travel resumes`);}
  else{run.phase="returning";run.transitionAt=Date.now()+(locationId==="c"?ACT4_MARA_REVEAL_MS:ACT4_RETURN_MS);bump(session,"Both locked destinations resolved; runner returning to Blackout Ridge");}
}

function verifyAct4ModuleAction(session,viewer,moduleId){
  const {run,boardNumber,board,module}=act4MutableModule(session,viewer,moduleId);
  if(module.id==="switch_bank"&&!module.sampled){module.feedback="SAMPLE REQUIRED";bump(session,"Act 4 module rejected: SAMPLE required");return;}
  const success=verifyAct4Module(module);module.feedback=success?"COMPLETE":"REJECTED / CHECK PROCEDURE";
  if(success){module.completed=true;if(viewer.role)recordContribution(session,viewer.role,"serviceAttempts");}
  else if(["three_buttons","route_controls","diagnostic_recovery","service_plate"].includes(module.id))module.queue=[];
  bump(session,`Act 4 ${ACT4_MODULES[boardNumber].find(item=>item.id===module.id).title}: ${success?"COMPLETE":"REJECTED"}`);
  if(Object.values(board.modules).every(item=>item.completed))resolveAct4Stop(session);
}

function markAct4ProcedureReady(session,viewer,moduleId){
  const run=session.fieldRun;
  if(session.stage!==4||session.stageStatus!=="live"||!run?.active||run.phase!=="service")throw new Error("No cabin procedure is active");
  if(viewer.kind!=="player"||viewer.role===run.runner)throw new Error("Only an assigned cabin player can transmit procedure guidance");
  const boardNumber=run.currentIndex+1,board=run.boards?.[boardNumber],assigned=board?.allocations?.[viewer.role]||[];
  if(!assigned.includes(moduleId))throw new Error("This procedure is not assigned to your terminal");
  board.readiness||={};board.readiness[viewer.role]||={};
  if(board.readiness[viewer.role][moduleId])return;
  board.readiness[viewer.role][moduleId]=Date.now();
  recordContribution(session,viewer.role,"stationInstructions");
  bump(session,`${roleName(session,viewer.role)} transmitted ${ACT4_MODULES[boardNumber].find(item=>item.id===moduleId)?.title||moduleId} guidance to the field runner`);
}

function applyFieldServiceConsequence(session,locationId,success){
  const services=session.global.fieldServices;
  const keys={a:"external_inbound_path",b:"external_outbound_path",c:"lower_road_camera_service",d:"upper_ridge_service"};
  services[keys[locationId]]=success?"restored":"not_restored";
  if(locationId==="a")session.global.externalStatus.external_inbound=success?(session.global.systemStatus.inbound_receive==="working"?"working":"fault"):"offline";
  if(locationId==="b")session.global.externalStatus.external_human_outbound=success?(session.global.systemStatus.human_outbound==="working"?"working":"fault"):"offline";
  if(locationId==="c"){
    session.global.externalStatus.lower_road_camera_history=success?"working":"offline";
    session.global.systemStatus.lower_road_camera=success?"working":"broken";
  }
  if(locationId==="d"){
    session.global.externalStatus.ventilation_path=success?"working":"offline";
    session.global.systemStatus.ventilation_control=success?"working":"broken";
  }
}

function fieldKnowledge(session,locationId,success){
  if(locationId==="c")return success
    ? ["Older infrastructure intersects the modern Lower Route cabinet.","Historical playback: Mara reached Lower Route, then headed back toward Blackout Ridge.","A worn paired-numeral mark repeats beside the old conduit."]
    : ["Older infrastructure is visible beneath the flooded cabinet, but historical playback remains unavailable."];
  if(locationId==="d")return [session.global.systemStatus.tower_monitoring==="working"?"The faded asset plate matches the unresolved legacy fault seen from the cabin.":"The installation is visibly older than the current operating map.",success?"Old pressure and discharge equipment returns to a steady operating rhythm.":"The old pressure and discharge equipment remains silent."];
  return [success?"The installation returns to service with stable local indicators.":"The installation remains isolated and dark."];
}

function submitFieldInstruction(session,viewer,instruction){
  const run=session.fieldRun;
  if(session.stage!==4||session.stageStatus!=="live"||!run?.active)throw new Error("No Outside Run is active");
  if(session.act4Intro?.endsAt>Date.now())throw new Error("The field repair opens after the deployment sequence");
  if(run.phase!=="service")throw new Error("The runner is still travelling to the field installation");
  if(run.boards)throw new Error("Legacy field instructions are unavailable; complete all six production repair modules");
  if(viewer.kind!=="facilitator"&&viewer.role===run.runner)throw new Error("The runner must describe the installation; station crew must interpret it");
  if(run.instruction)throw new Error("The station instruction is already locked for this service");
  const locationId=run.route[run.currentIndex],game=FIELD_GAMES[locationId];
  if(!game.manual.some(([, ,id])=>id===instruction))throw new Error("Station instruction is invalid");
  run.instruction={id:instruction,by:viewer.role||"facilitator"};
  if(viewer.role)recordContribution(session,viewer.role,"stationInstructions");
  bump(session,`Station instruction transmitted to the runner at ${outsideLocation(locationId).name}`);
}

function submitFieldService(session,viewer,action){
  const run=session.fieldRun;
  if(session.stage!==4||session.stageStatus!=="live"||!run?.active)throw new Error("No Outside Run is active");
  if(session.act4Intro?.endsAt>Date.now())throw new Error("The field repair opens after the deployment sequence");
  if(run.phase!=="service")throw new Error("The runner is still travelling to the field installation");
  if(run.boards)throw new Error("Legacy field actions are unavailable; complete all six production repair modules");
  if(viewer.kind!=="facilitator"&&viewer.role!==run.runner)throw new Error("Only the assigned runner can operate the field installation");
  if(!run.instruction)throw new Error("Wait for a station instruction before acting");
  const locationId=run.route[run.currentIndex],game=FIELD_GAMES[locationId];
  if(!game.actions.some(([id])=>id===action))throw new Error("Field action is invalid");
  const success=run.instruction.id===game.solution.instruction&&action===game.solution.action;
  const result={locationId,success,instruction:run.instruction.id,action,knowledge:fieldKnowledge(session,locationId,success),at:Date.now()};
  run.results.push(result);applyFieldServiceConsequence(session,locationId,success);
  if(viewer.role)recordContribution(session,viewer.role,"serviceAttempts");
  bump(session,`${outsideLocation(locationId).name} service completed: ${success?"RESTORED":"NOT RESTORED"}`);
  if(run.currentIndex===0){
    run.instruction=null;run.phase="resolved";run.nextIndex=1;run.transitionAt=Date.now()+ACT4_RESOLVED_MS;
    session.clock={duration:run.repairAllowance,remaining:run.repairAllowance,running:false,endAt:null};
    bump(session,`${outsideLocation(locationId).name} result displayed before travel resumes`);
  }
  else {run.phase="returning";run.transitionAt=Date.now()+ACT4_RETURN_MS;session.clock={duration:run.repairAllowance,remaining:run.repairAllowance,running:false,endAt:null};bump(session,"Both locked destinations resolved; runner returning to Blackout Ridge");}
}

function expireFieldRun(session){
  const run=session.fieldRun;
  if(!run?.active)return;
  const locationId=run.route[run.currentIndex];
  run.results.push({locationId,success:false,instruction:run.instruction?.id||null,action:null,knowledge:fieldKnowledge(session,locationId,false),at:Date.now(),expired:true});
  applyFieldServiceConsequence(session,locationId,false);
  if(run.currentIndex===0){
    run.instruction=null;run.phase="resolved";run.nextIndex=1;run.transitionAt=Date.now()+ACT4_RESOLVED_MS;
    session.clock={duration:run.repairAllowance,remaining:run.repairAllowance,running:false,endAt:null};
    bump(session,`${outsideLocation(locationId).name} repair window expired; NOT RESTORED result displayed before travel resumes`);
    return;
  }
  run.phase="returning";run.transitionAt=Date.now()+ACT4_RETURN_MS;session.clock={duration:run.repairAllowance,remaining:run.repairAllowance,running:false,endAt:null};bump(session,"Second repair expired; runner returning to Blackout Ridge");
}

function interventionMessage(session, role) {
  const stage=session.stage,d=session.draft,g=session.global;
  if(role==="lead")return "CLOCK HELD / The next minute is borrowed against station pressure.";
  if(role==="signal")return stage===3?"RECOVERY REFUSED / The impossible transmission remains unidentified and unusable; diagnose the field faults from independent component evidence.":stage<3?"PARTIAL FRAGMENT RECOVERED / Structured cadence remains beneath the clean bulletin.":"CARRIER RECOVERY ARMED / One degraded source remains usable.";
  if(role==="systems")return stage===2?`DEPENDENCY TRACE / ${session.repairRun?.phase==="planning"?"Receive, identify, store, human outbound and status control are separate functions.":"The cabin console now shows each repair's true WORKING or FAULT state."}`:stage===3?"DEPENDENCY TRACE / Receive return, operator line driver and the unresolved legacy branch are separate faults; no location is confirmed.":"DEPENDENCY TRACE / OPERATIONAL reports relay output, not human safety.";
  if(role==="operations")return stage===4?"SEQUENCE CHECK / The two locked services must resolve in order; no route, equipment or replacement decision is reopened.":"CONTROLLED TEST / The current action has a recoverable fallback if its safeguard is maintained.";
  if(role==="field")return ["Mara status challenged","Mara located below"].some(x=>g.evidence.includes(x))?"HUMAN CHECK / Mara remains named in the active record.":"HUMAN CHECK / Mara has no verified lower-road gate trace.";
  if(role==="protocol")return "SAFETY CONDITION / The next avoidable exposure escalation will be intercepted.";
  return stage===3?"READBACK UNAVAILABLE / Human outbound is red OFFLINE; the crew must commit a service plan without outside confirmation.":"READBACK REQUESTED / Cordon Control confirms it is receiving Ridge traffic.";
}

export function authorize(session, suppliedToken) {
  ensureSession(session);
  if (suppliedToken === session.facilitatorToken) return { kind: "facilitator" };
  const player = Object.values(session.players).find(p => p.token === suppliedToken);
  return player ? { kind: "player", role: player.role, name: player.name } : { kind: "public" };
}

export function applyAction(session, viewer, type, payload = {}) {
  ensureSession(session);
  if(session.stage===1&&["CHAT_MESSAGE","REPORT","INTERVENTION"].includes(type))throw new Error("This action is unavailable during the evidence-only handover");
  if(session.stage===6&&["opening","nightmare"].includes(session.archiveRun?.phase)&&viewer.kind==="player"&&type==="CHAT_MESSAGE")throw new Error("Crew chat is locked during the synchronized Act 6 cinematic");
  if(viewer.kind==="player"&&session.absentRoles[viewer.role]&&type!=="CHAT_MESSAGE")throw new Error("This role is temporarily in observer mode");
  if (type === "START_GAME" && viewer.kind === "facilitator" && session.stage === 0) { if(Object.keys(session.players).length!==session.playerCount)throw new Error(`Connect all ${session.playerCount} crew terminals before starting`);session.metrics.startedAt=Date.now();session.testMode=null;startStage(session, 1); }
  else if(type==="START_ACT4_TEST"&&viewer.kind==="facilitator"&&session.stage===0)startAct4Test(session);
  else if(type==="START_ACT5_TEST"&&viewer.kind==="facilitator"&&session.stage===0)startAct5Test(session);
  else if(type==="START_ACT6_TEST"&&viewer.kind==="facilitator"&&session.stage===0)startAct6Test(session);
  else if(type==="CONFIGURE_ACT6"&&viewer.kind==="facilitator"&&session.stage<=5){session.act6Config=validateAct6Config(payload,session.act6Config);bump(session,"Act 6 timing configuration validated and saved");}
  else if (type === "ADVANCE_STAGE" && viewer.kind === "facilitator" && session.stageStatus === "resolved" && session.stage < 7) startStage(session, session.stage + 1);
  else if (type === "CHAT_MESSAGE" && (viewer.kind === "player" || viewer.kind === "facilitator")) {
    if(session.stage===7&&viewer.kind==="player"&&(session.finaleRun?.below.includes(viewer.role)||session.finaleRun?.phase==="surface"&&session.finaleRun.currentRole===viewer.role))throw new Error("Your finale communication channel is isolated");
    const text = String(payload.message || "").trim().slice(0, 500);
    if (!text) throw new Error("Enter a message before sending it");
    const senderRole = viewer.kind === "player" ? viewer.role : null;
    const senderName = viewer.kind === "player" ? session.players[viewer.role]?.name || ROLES[viewer.role]?.name : "Facilitator";
    session.chatMessages.push({ id: crypto.randomUUID(), at: Date.now(), senderKind: viewer.kind, senderRole, senderName, text });
    if (session.chatMessages.length > 100) session.chatMessages.splice(0, session.chatMessages.length - 100);
    touch(session);
  }
  else if (type === "REPORT" && viewer.kind === "player" && session.stageStatus === "live") {
    if(session.stage===7&&session.finaleRun?.below.includes(viewer.role))throw new Error("Your R-12 communication channel is isolated");
    const note = String(payload.note || "").trim().slice(0, 160);
    if (!note) throw new Error("Enter a recommendation before sharing it");
    const recommendation = String(payload.recommendation || "shared").trim().slice(0, 80) || "shared";
    const first = !session.reports[viewer.role];
    session.reports[viewer.role] = { recommendation, note };
    if (first) recordContribution(session, viewer.role, "reports");
    bump(session, `${ROLES[viewer.role].name} shared an assessment`);
  }
  else if(type==="ACT5_ACTION"&&viewer.kind==="player")submitAct5StationAction(session,viewer,payload);
  else if(type==="END_CABIN_WINDOW"&&viewer.kind==="facilitator"&&session.stage===5&&session.stageStatus==="live"){
    const note=String(payload.note||"").trim().slice(0,160);if(note.length<8)throw new Error("Record why the cabin window is ending early");
    bump(session,`Facilitator technical recovery ended cabin window: ${note}`);resolveStage(session,true);
  }
  else if(type==="ADVANCE_ARCHIVE_PHASE"&&viewer.kind==="facilitator"&&session.stage===6&&session.stageStatus==="live"){
    const note=String(payload.note||"").trim().slice(0,160);if(note.length<8)throw new Error("Record why the archive phase is advancing early");
    const now=Date.now(),run=session.archiveRun;
    if(run.phase==="history")run.nightmareAt=now;
    else if(run.phase==="nightmare")run.nightmareEndsAt=now;
    else throw new Error("The archive is already on the final R-12 manual phase");
    bump(session,`Facilitator technical recovery advanced the archive: ${note}`);refreshArchivePhase(session,now);
  }
  else if(type==="END_ARCHIVE_WINDOW"&&viewer.kind==="facilitator"&&session.stage===6&&session.stageStatus==="live"){
    const note=String(payload.note||"").trim().slice(0,160);if(note.length<8)throw new Error("Record why the archive window is ending early");
    bump(session,`Facilitator technical recovery ended archive window: ${note}`);resolveStage(session,true);
  }
  else if(type==="ACT7_MECHANIC")act7Mechanic(session,viewer,payload);
  else if(type==="BEGIN_DESCENT")beginFinaleDescent(session,viewer,Date.now());
  else if(type==="ACT7_MASK"&&viewer.kind==="player")act7Mask(session,viewer,payload);
  else if(type==="R12_HOTSPOT")r12Hotspot(session,viewer,payload);
  else if(type==="R12_DIALOGUE")r12Dialogue(session,viewer,payload);
  else if(type==="R12_CAMERA")r12Camera(session,viewer,payload);
  else if(type==="TRANSFER_STEP")submitTransferStep(session,viewer,String(payload.step||""));
  else if(type==="UPDATE_SURFACE")updateSurface(session,viewer,payload);
  else if(type==="SUBMIT_SURFACE")commitSurface(session,viewer,false);
  else if(type==="CLASSIFY_MESSAGE")classifyMessage(session,viewer,String(payload.rating||""));
  else if(type==="CALCULATE_ENDING"&&viewer.kind==="facilitator")sealFinale(session);
  else if (type === "UPDATE_DRAFT" && session.stageStatus === "live" && (canLead(session,viewer)||session.stage===3&&(viewer.kind==="facilitator"||viewer.kind==="player"))) { session.draft = validateDraftUpdate(session,payload); bump(session, session.stage===3?"Shared Act 3 deployment updated":"Crew plan updated"); }
  else if(type==="ACT3_TRIGGER_VOICE")triggerImpossibleVoice(session,viewer);
  else if(type==="ACT3_COMMIT_DEPLOYMENT")submitAct3Deployment(session,viewer);
  else if(type==="ACT3_ASSIGN_RANDOM"&&viewer.kind==="facilitator")assignRandomAct3Deployment(session);
  else if(type==="ACT3_NOMINATE_RUNNER")nominateAct3Runner(session,viewer,String(payload.runner||""));
  else if(type==="FIELD_MODULE_INPUT")updateAct4Module(session,viewer,payload);
  else if(type==="FIELD_MODULE_VERIFY")verifyAct4ModuleAction(session,viewer,String(payload.moduleId||""));
  else if(type==="FIELD_PROCEDURE_READY")markAct4ProcedureReady(session,viewer,String(payload.moduleId||""));
  else if(type==="FIELD_ADMIN_ADD_TIME"&&viewer.kind==="facilitator"){
    const run=session.fieldRun,board=run?.currentIndex+1;if(session.stage!==4||session.stageStatus!=="live"||!run?.active||run.phase!=="service")throw new Error("No repair clock is active");
    run.adminExtensions||={};if(run.adminExtensions[board])throw new Error("Recovery time has already been used for this repair");
    run.adminExtensions[board]=true;const value=remaining(session.clock)+60;session.clock.remaining=value;session.clock.endAt=Date.now()+value*1000;bump(session,`Facilitator recovery control added 60 seconds to Repair Board ${board}`);
  }
  else if(type==="FILL_REMAINING_REPAIRS"&&viewer.kind==="facilitator"&&session.stage===2&&session.repairRun?.phase==="dispatch")fillRemainingRepairs(session);
  else if(type==="DISPATCH_REPAIRS"&&viewer.kind==="facilitator"&&session.stage===2&&["planning","dispatch"].includes(session.repairRun?.phase)){
    if(session.repairRun.phase==="dispatch")fillRemainingRepairs(session);
    beginRepairPhase(session);
  }
  else if (type === "COMMIT_STAGE" && canLead(session, viewer) && session.stageStatus === "live") {
    if (session.stage === 1 && STAGES[1].options.some(([id]) => !["yes","no"].includes(session.draft.handover?.[id]))) throw new Error("Answer YES or NO for all six outgoing staff");
    if (session.stage === 2) {
      if(session.repairRun?.phase==="planning")throw new Error("The full three-minute prioritisation window must finish before dispatch");
      if(session.repairRun?.phase==="dispatch")throw new Error("Use the Act 2 dispatch control after assignments are complete");
      if(session.repairRun?.phase==="repair"){
        if(Object.keys(session.repairRun.results).length!==session.repairRun.attempts)throw new Error("Wait for every assigned repair or let the repair clock expire");
        refreshRepairTraffic(session,Date.now(),true);return resolveStage(session,false);
      }
    }
    if (session.stage === 3) throw new Error("Use COMMIT DEPLOYMENT, then record the crew's runner nomination");
    if (session.stage === 4) {
      if (session.fieldRun?.active) throw new Error("The runner and station crew must complete both locked field services");
      if (!session.fieldRun) return beginFieldRun(session);
    }
    if(session.stage===5)throw new Error("Act 5 resolves automatically when the five-minute cabin window expires");
    if(session.stage===6)throw new Error("Act 6 resolves automatically when the investigation window expires");
    if(session.stage===7)throw new Error("Act 7 advances through the active player's transfer and surface controls");
    resolveStage(session, false);
  }
  else if(type==="REPAIR_SUBMIT") submitRepair(session,viewer,payload.answer);
  else if(type==="FIELD_INSTRUCTION") submitFieldInstruction(session,viewer,String(payload.instruction||""));
  else if(type==="FIELD_SERVICE") submitFieldService(session,viewer,String(payload.action||""));
  else if(type==="CONFIRM_ENDING" && viewer.kind==="facilitator" && session.stage===7 && session.stageStatus==="resolved" && session.pendingEnding) {
    session.ending={...session.pendingEnding};session.pendingEnding=null;session.status="ending";session.metrics.endedAt=Date.now();bump(session,`Final record confirmed: ${session.ending.title}`);
  }
  else if(type==="RESTART_SESSION" && viewer.kind==="facilitator" && (session.status==="ending"||session.status==="stage"&&session.stageStatus==="resolved")) restartCompletedSession(session);
  else if(type==="RESTART_ACT2" && viewer.kind==="facilitator" && session.stage===2 && session.stageStatus==="resolved") {
    delete session.outcomes[2];delete session.decisions[2];
    startStage(session,2);bump(session,"Act 2 restarted with the existing crew links");
  }
  else if(type==="RESTART_ACT3" && viewer.kind==="facilitator" && session.stage===3 && session.stageStatus==="resolved") {
    delete session.outcomes[3];delete session.decisions[3];session.global.outsidePlan=null;
    startStage(session,3);bump(session,"Act 3 restarted with the existing crew links");
  }
  else if(type==="RESTART_ACT4" && viewer.kind==="facilitator" && session.stage===4 && session.stageStatus==="resolved") {
    delete session.outcomes[4];delete session.decisions[4];
    startStage(session,4);bump(session,"Act 4 restarted with the existing crew links and locked Act 3 deployment");
  }
  else if(type==="RESTART_ACT5" && viewer.kind==="facilitator" && session.stage===5) {
    delete session.outcomes[5];delete session.decisions[5];session.global.act6InvestigationTime=null;
    startStage(session,5);bump(session,"Act 5 reset with the existing crew links and unchanged Act 4 service state");
  }
  else if(type==="RESTART_ACT6" && viewer.kind==="facilitator" && session.stage===6) {
    delete session.outcomes[6];delete session.decisions[6];
    startStage(session,6);bump(session,"Act 6 restarted with the existing crew links and unchanged Act 5 outcome");
  }
  else if(type==="RESTART_ACT7" && viewer.kind==="facilitator" && session.stage===7) {
    const baselineUpperAir=session.finaleRun?.baselineUpperAir??Math.max(0,session.global.upperAir-1);
    delete session.outcomes[7];delete session.decisions[7];session.ending=null;session.pendingEnding=null;session.metrics.endedAt=null;session.global.upperAir=baselineUpperAir;
    startStage(session,7);bump(session,"Act 7 restarted with the existing crew links and unchanged Act 6 outcome");
  }
  else if(type==="SET_DEBRIEF_STEP" && viewer.kind==="facilitator" && session.status==="ending") { const step=Number(payload.step);if(!DEBRIEF_STEPS.some(item=>item.id===step))throw new Error("Debrief step is invalid");session.debrief.currentStep=step;bump(session,`Debrief advanced to step ${step}`); }
  else if(type==="SAVE_DEBRIEF_NOTE" && viewer.kind==="facilitator" && session.status==="ending") { const step=Number(payload.step),note=String(payload.note||"").trim().slice(0,1200);if(!DEBRIEF_STEPS.some(item=>item.id===step))throw new Error("Debrief step is invalid");session.debrief.notes[step]=note;bump(session,`Debrief note saved for step ${step}`); }
  else if(type==="SAVE_FIRST_STEP" && viewer.kind==="player" && session.status==="ending") { const note=String(payload.note||"").trim().slice(0,280);if(note.length<5)throw new Error("Enter a specific first step");session.debrief.firstSteps[viewer.role]={name:viewer.name,note,at:Date.now()};bump(session,`${ROLES[viewer.role].name} recorded a workplace first step`); }
  else if(type==="TOGGLE_PROFILE_SIGNAL" && viewer.kind==="facilitator" && session.status==="ending") { const id=String(payload.id||"");if(!READINESS_PROFILES.some(profile=>profile.id===id))throw new Error("Readiness behavior lens is invalid");session.debrief.profileSignals=session.debrief.profileSignals.includes(id)?session.debrief.profileSignals.filter(item=>item!==id):[...session.debrief.profileSignals,id];bump(session,`Debrief behavior lens ${session.debrief.profileSignals.includes(id)?"observed":"cleared"}: ${id}`); }
  else if(type==="SAVE_PLAYTEST" && viewer.kind==="facilitator" && session.status==="ending") {
    const allowed=new Set(PLAYTEST_CRITERIA.map(item=>item.id)),ratings={};
    for(const [id,value] of Object.entries(payload.ratings||{})){const score=Number(value);if(!allowed.has(id)||!Number.isInteger(score)||score<1||score>5)throw new Error("Playtest rating is invalid");ratings[id]=score;}
    const disposition=String(payload.disposition||"unreviewed");if(!["unreviewed","proceed","revise","kill_reframe"].includes(disposition))throw new Error("Playtest disposition is invalid");
    session.playtest={ratings,notes:String(payload.notes||"").trim().slice(0,1600),disposition,updatedAt:Date.now()};bump(session,"Prototype playtest record saved");
  }
  else if (type === "PAUSE" && viewer.kind === "facilitator" && (session.clock.running||pauseSharedCinematic(session,Date.now()))) { const now=Date.now();if(session.stage===5){tickCabin(session,now);if(session.cabinRun?.engine)session.cabinRun.engine.status="paused";}if(session.clock.running){pauseFinaleTransfer(session,now);session.clock.remaining = remaining(session.clock,now);session.clock.running = false;session.clock.endAt = null;session.clock.paused=true;}bump(session, "Authoritative progression paused"); }
  else if (type === "RESUME" && viewer.kind === "facilitator" && session.stageStatus === "live" && !session.clock.running && (session.clock.paused||session.archiveRun?.pausedCinematic||session.finaleRun?.pausedCinematic)) { const now=Date.now(),cinematic=resumeSharedCinematic(session,now);if(!cinematic){session.clock.running = true;session.clock.endAt = now + session.clock.remaining * 1000;session.clock.paused=false;if(session.stage===5&&session.cabinRun){session.cabinRun.lastTickAt=Math.max(now,session.act5Intro?.endsAt||now);if(session.cabinRun.engine)session.cabinRun.engine.status="running";}resumeFinaleTransfer(session,now);}bump(session, "Authoritative progression resumed"); }
  else if (type === "ADD_TIME" && viewer.kind === "facilitator" && session.stageStatus === "live") { const value = remaining(session.clock) + 30; session.clock.remaining = value; if (session.clock.running) session.clock.endAt = Date.now() + value * 1000; bump(session, "Thirty seconds added"); }
  else if (type === "HINT" && viewer.kind === "facilitator") { session.hint = String(payload.message || STAGE_HINTS[session.stage] || "Ask what this output measures and which evidence is missing.").slice(0, 200); bump(session, "Facilitator prompt shown"); }
  else if (type === "CLEAR_HINT" && viewer.kind === "facilitator") { session.hint = null; bump(session, "Facilitator prompt cleared"); }
  else if (type === "SAFETY" && viewer.kind === "facilitator") { const now=Date.now();session.safetyPaused = !session.safetyPaused; if (session.safetyPaused) { pauseSharedCinematic(session,now);if(session.clock.running){if(session.stage===5){tickCabin(session,now);if(session.cabinRun?.engine)session.cabinRun.engine.status="paused";}pauseFinaleTransfer(session,now);session.clock.remaining=remaining(session.clock,now);session.clock.running=false;session.clock.endAt=null;session.clock.paused=true;} }if(session.stage===5&&session.cabinRun)session.cabinRun.lastTickAt=Math.max(now,session.act5Intro?.endsAt||now); bump(session, session.safetyPaused ? "Safety pause enabled" : "Safety pause cleared"); }
  else if(type==="SET_ABSENT" && viewer.kind==="facilitator") { const role=String(payload.role||"");if(!activeRoleIds(session.playerCount).includes(role))throw new Error("Role is invalid");session.absentRoles[role]=payload.absent!==false;bump(session,`${ROLES[role].name} marked ${session.absentRoles[role]?"temporarily absent":"present"}`); }
  else if(type==="REASSIGN_PLAYER" && viewer.kind==="facilitator") { const from=String(payload.from||""),to=String(payload.to||"");if(!session.players[from]||from===to||session.players[to]&&!session.absentRoles[to]||!activeRoleIds(session.playerCount).includes(to))throw new Error("Role reassignment is invalid");if(session.players[to])delete session.players[to];const player=session.players[from];delete session.players[from];player.role=to;session.players[to]=player;delete session.absentRoles[from];delete session.absentRoles[to];bump(session,`${player.name} reassigned from ${ROLES[from].name} to ${ROLES[to].name}`); }
  else if(type==="RESEND_CARD" && viewer.kind==="facilitator") { const role=String(payload.role||"");if(!session.players[role])throw new Error("Role is not connected");bump(session,`${ROLES[role].name} private card re-sent`); }
  else if(type==="OVERRIDE_DECISION" && viewer.kind==="facilitator" && session.stageStatus==="live") { const note=String(payload.note||"").trim().slice(0,160);if(note.length<5)throw new Error("An audit note is required");session.draft=validateDraftUpdate(session,payload.changes||{});bump(session,`Facilitator technical correction: ${note}`); }
  else if (type === "INTERVENTION" && viewer.kind === "player" && session.stageStatus==="live" && !session.interventions[viewer.role]) {
    session.interventions[viewer.role] = { stage: session.stage, at: Date.now() };
    recordContribution(session,viewer.role,"interventions");
    if (viewer.role === "lead") { const value = remaining(session.clock) + 60; session.clock.remaining = value; if (session.clock.running) session.clock.endAt = Date.now() + value * 1000; advanceOfficial(session); }
    if (viewer.role === "signal" && session.stage!==3) { addEvidence(session,"Recovered degraded fragment");setFlag(session,"signal","recovered_fragment"); }
    if (viewer.role === "systems") { addEvidence(session, "Dependency traced");setFlag(session,"system","dependency_traced"); }
    if (viewer.role === "field") { addEvidence(session, "Named human record exposed");setFlag(session,"human","named_record_exposed"); }
    if (viewer.role === "protocol") session.resources.safetyGuard++;
    if (viewer.role === "comms" && session.stage!==3) { session.global.trust = clamp(session.global.trust + 1, 0, 2);setFlag(session,"correction","readback_requested"); }
    session.interventionFeedback[viewer.role]=interventionMessage(session,viewer.role);
    bump(session, `${ROLES[viewer.role].intervention} used`);
  } else throw new Error("Action is not available");
  return session;
}

export function expireIfNeeded(session, now = Date.now()) {
  ensureSession(session);
  let changed=refreshRepairTraffic(session,now,false);
  if(refreshRepairPlanning(session,now))changed=true;
  if(session.stage===1&&session.stageStatus==="live"&&session.clock.running){
    const elapsed=session.clock.duration-remaining(session.clock,now);
    const active=[...ACT1_TRANSMISSIONS].reverse().find(item=>elapsed>=item.at&&elapsed<item.at+18)?.id||null;
    if(active!==session.act1ActiveTransmission){session.act1ActiveTransmission=active;touch(session);changed=true;}
  }
  if(tickCabin(session,now))changed=true;
  if(session.stage===7&&session.finaleRun?.phase)updateFinaleExposure(session,now);
  if(decayFinalePurge(session,now))changed=true;
  if(session.stage===7&&completeFinaleWalk(session,now))changed=true;
  if(session.stage===7&&session.finaleRun?.phase==="power_failure"&&!session.finaleRun.pausedCinematic&&session.finaleRun.powerFailureEndsAt<=now){session.finaleRun.phase="console";session.finaleRun.consoleStartedAt=now;setFinaleClock(session,60);bump(session,"Emergency control reserve active; final sixty-second console window opened");changed=true;}
  if(refreshArchivePhase(session,now))changed=true;
  if(session.stage===4&&session.stageStatus==="live"&&session.fieldRun?.active&&session.fieldRun.transitionAt<=now){
    const run=session.fieldRun;
    if(run.phase==="resolved"){
      run.currentIndex=run.nextIndex;run.nextIndex=null;run.phase="travel";run.transitionAt=now+ACT4_TRAVEL_MS;
      bump(session,`Runner continues to ${outsideLocation(run.route[run.currentIndex]).name}; repair board remains sealed during travel`);changed=true;
    }else if(run.phase==="travel"){
      run.phase="service";run.transitionAt=null;session.clock={duration:run.repairAllowance,remaining:run.repairAllowance,running:true,endAt:now+run.repairAllowance*1000};
      bump(session,`${outsideLocation(run.route[run.currentIndex]).name} reached; Repair Board ${run.currentIndex+1} opened`);changed=true;
    }else if(run.phase==="returning"){
      run.active=false;run.transitionAt=null;resolveStage(session,run.results.some(result=>result.expired));changed=true;
    }
  }
  if (session.stageStatus === "live" && session.clock.running && session.clock.endAt <= now) {
    if(session.stage===2&&session.repairRun?.phase==="planning")closeRepairPlanning(session);
    else if(session.stage===3&&session.act3Run?.phase==="planning"){
      session.clock.remaining=0;session.clock.running=false;session.clock.endAt=null;session.act3Run.phase="final_call";session.act3Run.finalCall=true;
      bump(session,"Act 3 planning time expired; immediate final call opened");
    }
    else if(session.stage===7&&session.finaleRun?.phase==="transfer")completeFinaleTransfer(session,true,now);
    else if(session.stage===7&&session.finaleRun?.phase==="console")commitSurface(session,{kind:"facilitator"},true);
    else {if(session.stage===4&&session.fieldRun?.active){if(session.fieldRun.phase!=="service")return changed;return expireFieldRun(session),true;}resolveStage(session,true);}
    return true;
  }
  return changed;
}

function contextualRoleCard(session, role) {
  const card=roleCard(session.stage,role,session.playerCount);
  if(session.stage!==3)return card;
  const notes=card.notes.map(note=>({...note}));
  if(role==="systems"){
    const working=session.global.systemStatus.tower_monitoring==="working";
    notes.push({
      roleId:"systems",roleName:ROLES.systems.name,
      title:working?"TOWER MONITORING / WORKING":"TOWER MONITORING / FAULT",
      body:working
        ? "Three field references are visible: current RECEIVE RETURN LOSS; current OPERATOR LINE DRIVER ISOLATION; unresolved LEGACY BRANCH R-12. The monitor identifies neither site nor purpose."
        : "No tower diagnostic shortcut survived. The outside plan remains fully solvable from function descriptions, component characteristics, site records, timing and equipment rules.",
      confidence:"CONFIRMED",confidenceMeaning:"Verified by the station's current panel state.",
      prompt:working?"Ask the crew which component and site fit each current functional fault—and keep the legacy reference unresolved.":"Ask the crew to rebuild the chain from the other private records.",
      sharePrompt:working?"Ask the crew: which component and site fit each current functional fault—and which reference remains unresolved?":"Ask the crew: can we solve this from function, component and location evidence without the diagnostic shortcut?",
    });
  }
  if(role==="comms"){
    const stored=(session.repairRun?.traffic||[]).filter(item=>item.stored);
    const baseline=PRE_STRIKE_ARCHIVE.map(item=>`${item.ref} — ${item.text}`).join(" · ");
    notes.push({roleId:"comms",roleName:ROLES.comms.name,title:"RECEIVED TRAFFIC LOG / LOCAL",body:`Pre-strike archive: ${baseline} ${stored.length?`Act 2 records stored exactly: ${stored.map(item=>`${item.ref} — ${item.text}`).join(" · ")}`:"No Act 2 traffic was stored exactly."}`,confidence:"CONFIRMED",confidenceMeaning:"This is the exact local record, not reconstructed traffic.",prompt:"Which part is incident context rather than a direct fault-location clue?",sharePrompt:"Ask the crew: which logged facts are context, and which current evidence diagnoses a component?"});
  }
  return {...card,notes,body:notes.map(note=>`${ROLES[note.roleId]?.short||note.roleId.toUpperCase()} — ${note.body}`).join("\n")};
}

function fieldRuntimeState(session,viewer){
  const run=session.fieldRun;if(!run)return null;
  const isRunner=viewer.kind==="player"&&viewer.role===run.runner;
  const {boards,...safe}=run,boardNumber=run.currentIndex+1,activeBoard=boards?.[boardNumber];
  const progress=ACT4_MODULES[boardNumber]?.map(item=>({id:item.id,title:item.title,completed:Boolean(activeBoard?.modules?.[item.id]?.completed)}))||[];
  return {...safe,equipment:[...(run.equipment||[])],route:[...(run.route||[])],forecast:(run.forecast||[]).map(stop=>({...stop})),results:(run.results||[]).map(result=>({locationId:result.locationId,success:result.success,knowledge:[...(result.knowledge||[])],at:result.at,expired:Boolean(result.expired)})),instruction:run.instruction?(isRunner||viewer.kind==="public"?{received:true}:{...run.instruction}):null,boardNumber,progress,allocation:viewer.kind==="facilitator"?structuredClone(activeBoard?.allocations||{}):undefined};
}

function fieldGameState(session,viewer){
  const run=session.fieldRun;if(session.stage!==4||!run?.active)return null;
  if(session.act4Intro?.endsAt>Date.now()||run.phase!=="service")return null;
  const locationId=run.route[run.currentIndex],game=FIELD_GAMES[locationId],isRunner=viewer.kind==="player"&&viewer.role===run.runner;
  if(viewer.kind==="public")return null;
  const boardNumber=run.currentIndex+1,board=run.boards?.[boardNumber];
  if(board){
    const readyModules=new Set(Object.values(board.readiness||{}).flatMap(items=>Object.keys(items)));
    if(isRunner){const modules=structuredClone(board.modules);for(const module of Object.values(modules)){delete module.solution;delete module.test;if(module.id==="load_test")delete module.fault;module.guidanceReady=readyModules.has(module.id);const owner=Object.entries(board.allocations||{}).find(([,ids])=>ids.includes(module.id))?.[0];module.guidanceOwner=owner?{role:owner,name:session.players[owner]?.name||roleName(session,owner)}:null;}return {locationId,title:`REPAIR BOARD ${boardNumber}`,side:"runner",boardNumber,modules};}
    if(viewer.kind==="player"){const assigned=board.allocations?.[viewer.role]||[],readiness=board.readiness?.[viewer.role]||{};return {locationId,title:`CABIN PROCEDURES / REPAIR ${boardNumber}`,side:"station",boardNumber,assigned,procedures:assigned.map(id=>({...act4Procedure(boardNumber,id),ready:Boolean(readiness[id])}))};}
    if(viewer.kind==="facilitator")return {locationId,title:`FACILITATOR / REPAIR ${boardNumber}`,side:"facilitator",boardNumber,modules:structuredClone(board.modules),allocations:structuredClone(board.allocations),readiness:structuredClone(board.readiness||{})};
  }
  if(isRunner)return {locationId,title:game.title,side:"runner",observation:game.observation,actions:game.actions.map(item=>[...item]),instructionReceived:Boolean(run.instruction)};
  if(viewer.kind==="player")return {locationId,title:game.title,side:"station",manual:game.manual.map(([condition,procedure,id])=>({condition,procedure,id})),instructionLocked:Boolean(run.instruction)};
  if(viewer.kind==="facilitator")return {locationId,title:game.title,side:"facilitator",observation:game.observation,actions:game.actions.map(item=>[...item]),manual:game.manual.map(([condition,procedure,id])=>({condition,procedure,id})),instructionLocked:Boolean(run.instruction),instructionReceived:Boolean(run.instruction)};
  return null;
}

export function publicState(session, viewer) {
  ensureSession(session);
  const stage = STAGES[session.stage] || null;
  const player = viewer.kind === "player" ? session.players[viewer.role] : null;
  const durationSeconds = session.metrics.startedAt ? Math.max(0,Math.round(((session.metrics.endedAt||Date.now())-session.metrics.startedAt)/1000)) : 0;
  return {
    code: session.code, revision: session.revision, playerCount: session.playerCount,
    status: session.status, stage: session.stage, stageStatus: session.stageStatus, testMode:session.testMode?{...session.testMode}:null,
    clock: { ...session.clock, remaining: (session.stage===1&&session.act1Intro?.endsAt>Date.now())||(session.stage===2&&session.act2Intro?.endsAt>Date.now())||(session.stage===3&&session.act3Intro?.endsAt>Date.now())||(session.stage===4&&session.act4Intro?.endsAt>Date.now())||(session.stage===5&&session.act5Intro?.endsAt>Date.now())?session.clock.duration:remaining(session.clock),cinematicActive:Boolean((session.stage===6&&["opening","nightmare"].includes(session.archiveRun?.phase))||(session.stage===7&&["walk","power_failure"].includes(session.finaleRun?.phase))),cinematicPaused:Boolean(session.archiveRun?.pausedCinematic||session.finaleRun?.pausedCinematic) }, safetyPaused: session.safetyPaused,
    act1Intro: session.stage===1&&session.act1Intro?{...session.act1Intro}:null,
    act2Intro: session.stage===2&&session.act2Intro?{...session.act2Intro}:null,
    act3Intro: session.stage===3&&session.act3Intro?{...session.act3Intro}:null,
    act4Intro: session.stage===4&&session.act4Intro?{...session.act4Intro}:null,
    act5Intro: session.stage===5&&session.act5Intro?{...session.act5Intro}:null,
    players: Object.fromEntries(Object.entries(session.players).map(([role, p]) => [role, { role, name: p.name, joinedAt: p.joinedAt }])),
    reports: viewer.kind === "facilitator" || viewer.role === "lead"
      ? session.reports
      : Object.fromEntries(Object.entries(session.reports).map(([role, report]) => [
          role,
          viewer.kind === "player" && role === viewer.role ? { ...report } : { submitted: true },
        ])),
    chatMessages: viewer.kind === "player" && session.stage===7&&(session.finaleRun?.below.includes(viewer.role)||session.finaleRun?.phase==="surface"&&session.finaleRun.currentRole===viewer.role) ? [] : viewer.kind === "player" || viewer.kind === "facilitator" ? session.chatMessages.map(message => ({ ...message })) : [],
    draft: [1,3].includes(session.stage) || viewer.kind==="facilitator" || canLead(session, viewer) || session.stageStatus === "resolved" ? session.draft : {},
    hint: session.hint, global: session.global, resources: session.resources, environment: environmentState(session), officialStatus: officialStatus(session), decisionPreview: session.stageStatus === "live" ? decisionPreview(session) : null, flags: viewer.kind==="facilitator"?session.flags:undefined, interventions: session.interventions, interventionFeedback: session.interventionFeedback, absentRoles: session.absentRoles, outcomes: session.outcomes, ending: session.ending,
    safetyBriefed: session.safetyBriefed, participantCare: PARTICIPANT_CARE, signalTransmission: signalTransmission(session, viewer),
    debrief: { currentStep: session.debrief.currentStep, steps: DEBRIEF_STEPS, notes: viewer.kind==="facilitator"?session.debrief.notes:undefined, firstSteps: session.debrief.firstSteps, profileSignals: session.debrief.profileSignals, roleMap: roleMapForCount(session.playerCount), readinessProfiles: READINESS_PROFILES },
    playtest: viewer.kind==="facilitator"&&session.status==="ending" ? { ...session.playtest, criteria: PLAYTEST_CRITERIA, needsReframe: session.playtest.disposition==="kill_reframe"||Number(session.playtest.ratings.ai_alignment||5)<=2 } : undefined,
    metrics: viewer.kind==="facilitator"||session.status==="ending" ? { ...session.metrics, durationSeconds } : undefined,
    fieldRun: fieldRuntimeState(session,viewer),
    fieldGame: fieldGameState(session,viewer),
    cabinRun: cabinPublicState(session,viewer),
    archive: session.stage===6 ? archivePublicState(session) : null,
    act6Config: viewer.kind==="facilitator" ? {...session.act6Config} : undefined,
    finale: session.stage===7 ? finalePublicState(session,viewer) : null,
    communications: derivedCommunications(session),
    repairRun: session.repairRun ? { phase:session.repairRun.phase, attempts:session.repairRun.attempts, personnelLevel:session.repairRun.personnelLevel||0, available:[...session.repairRun.available], assignments:{...session.repairRun.assignments}, assignmentMethod:{...session.repairRun.assignmentMethod}, results:Object.fromEntries(Object.entries(session.repairRun.results).map(([role,result])=>[role,{systemId:result.systemId,success:result.success,at:result.at,confirmedAt:result.confirmedAt}])), traffic:session.repairRun.traffic.map(item=>({...item})) } : null,
    act3Run: session.stage===3&&session.act3Run ? { phase:session.act3Run.phase,impossibleVoicePlayed:session.act3Run.impossibleVoicePlayed,impossibleVoiceAt:session.act3Run.impossibleVoiceAt,finalCall:session.act3Run.finalCall,resolution:session.act3Run.resolution?{mode:session.act3Run.resolution.mode,allowance:session.act3Run.resolution.allowance,confirmed:{...session.act3Run.resolution.confirmed,FIELD_EQUIPMENT:[...(session.act3Run.resolution.confirmed.FIELD_EQUIPMENT||[])]}}:null } : null,
    act3Systems: session.stage===3 ? ACT2_SYSTEMS.map(system=>{
      const forced={lower_road_camera:"lower_road_camera_history",inbound_receive:"external_inbound",human_outbound:"external_human_outbound",ventilation_control:"ventilation_path"}[system.id];
      return {id:system.id,panelId:system.panelId,name:system.name,state:forced&&session.global.externalStatus[forced]==="offline"?"offline":session.global.systemStatus[system.id]==="working"?"working":"fault"};
    }) : undefined,
    preStrikeArchive: session.stage>=2 ? PRE_STRIKE_ARCHIVE.map(item=>({...item})) : [],
    repairSystems: session.stage===2 ? ACT2_SYSTEMS.map(system=>({id:system.id,panelId:system.panelId,name:system.name,manual:system.manual,selectable:system.selectable,state:session.global.systemStatus[system.id]})).sort((a,b)=>REPAIR_PRESENTATION_ORDER.indexOf(a.id)-REPAIR_PRESENTATION_ORDER.indexOf(b.id)) : undefined,
    repairAssignment: viewer.kind==="player"&&session.stage===2&&session.repairRun?.phase==="repair" ? session.repairRun.assignments[viewer.role]||null : null,
    repairPuzzle: viewer.kind==="player"&&session.stage===2&&session.repairRun?.phase==="repair" ? repairSystem(session.repairRun.assignments[viewer.role])?.puzzle||null : null,
    repairResult: viewer.kind==="player"&&session.stage===2&&session.repairRun?.assignments[viewer.role]
      ? session.repairRun.results[viewer.role]
        ? {status:session.repairRun.results[viewer.role].success?"success":"failure",systemId:session.repairRun.assignments[viewer.role],at:session.repairRun.results[viewer.role].at}
        : session.stageStatus==="resolved" ? {status:"timeout",systemId:session.repairRun.assignments[viewer.role],at:session.updatedAt} : null
      : null,
    pendingEnding: viewer.kind==="facilitator" ? session.pendingEnding : null,
    decisions: viewer.kind==="facilitator"||session.status==="ending" ? session.decisions : undefined,
    history: viewer.kind === "facilitator" || session.status === "ending" ? session.history : session.history.slice(-3),
    stageDefinition: stage, viewer: { ...viewer, name: player?.name || viewer.name },
    privateCard: viewer.kind === "player" && session.stage ? contextualRoleCard(session, viewer.role) : null,
    informationJoins: viewer.kind === "facilitator" ? INFORMATION_JOINS : undefined,
    roles: rolesForCount(session.playerCount), actions: ACTIONS,
    outsideLocations: session.stage===3 ? ACT3_LOCATIONS.map(location=>({...location,toolOptions:[...location.toolOptions]})) : undefined,
    act3RepairTools: session.stage===3 ? ACT3_REPAIR_TOOLS.map(item=>[...item]) : undefined,
    act3SupportItems: session.stage===3 ? ACT3_SUPPORT_ITEMS.map(item=>[...item]) : undefined,
    facilitatorCanAdvance: viewer.kind === "facilitator" && session.stageStatus === "resolved" && session.stage < 7,
    facilitatorCanConfirmEnding: viewer.kind==="facilitator"&&session.stage===7&&session.stageStatus==="resolved"&&Boolean(session.pendingEnding),
  };
}
