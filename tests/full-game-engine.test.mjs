import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import {
  addPlayer,
  act3PlanPreview,
  applyAction,
  authorize,
  createSession,
  expireIfNeeded,
  outsidePlanPreview,
  publicState,
} from "../server/game-engine.js";
import {createAct4Board} from "../server/act4-content.js";
import {
  ACT1_EVIDENCE_SCREENS,
  ACT1_TRANSMISSIONS,
  ACT2_SYSTEMS,
  ACT6_HISTORY_ARCHIVE,
  FIELD_GAMES,
  INFORMATION_JOINS,
  INFORMATION_MATRIX,
  LARK_ARCHIVE,
  PRIVATE_PHRASE_OWNERS,
  PRE_STRIKE_ARCHIVE,
  REPAIR_SYSTEMS,
  STAGES,
  roleCard,
  roleIdsForCount,
} from "../server/game-content.js";

const facilitator = { kind: "facilitator" };
const rolesByCount={
  2:["lead","signal"],
  4:["lead","signal","systems","operations"],
  5:["lead","signal","systems","operations","field"],
  6:["lead","signal","systems","operations","field","protocol"],
  7:["lead","signal","systems","operations","field","protocol","comms"],
};
function connectCrew(session){
  for(const role of rolesByCount[session.playerCount])if(!session.players[role])addPlayer(session,{name:`QA ${role}`,role});
}

function startShift(session){
  applyAction(session,facilitator,"START_GAME");
}

function update(session, payload) {
  applyAction(session, facilitator, "UPDATE_DRAFT", payload);
}

const completeOutsidePlan = (session, overrides = {}) => update(session, {
  firstLocation:"a",
  secondLocation:"b",
  tool1:"signal_meter",
  tool2:"insulated_driver",
  supportItem:"emergency_filter",
  filterUse:111,
  ...overrides,
});
function finishAct4Opening(session){
  if(!session.act4Intro)return;
  session.act4Intro.endsAt=0;
  if(session.fieldRun?.phase==="travel")session.fieldRun.transitionAt=0;
  expireIfNeeded(session);
  session.clock.endAt=Date.now()+session.clock.duration*1000;
}
function completeActiveFieldRun(session,{fail=[]}={}){
  finishAct4Opening(session);
  while(session.stage===4&&session.fieldRun?.active){
    if(session.fieldRun.phase!=="service"){session.fieldRun.transitionAt=0;expireIfNeeded(session);continue;}
    const id=session.fieldRun.route[session.fieldRun.currentIndex];
    if(fail.includes(id)){session.clock.endAt=Date.now()-1;expireIfNeeded(session);continue;}
    if(session.fieldRun.currentIndex===0)completeAct4Board1(session);else completeAct4Board2(session);
  }
}

const act4Input=(session,moduleId,op,value,extra={})=>applyAction(session,facilitator,"FIELD_MODULE_INPUT",{moduleId,op,value,...extra});
const act4Verify=(session,moduleId)=>applyAction(session,facilitator,"FIELD_MODULE_VERIFY",{moduleId});
function completeAct4Board1(session){
  for(const value of [2,0,1,1,0,2,1,0])act4Input(session,"three_buttons","append",value);act4Verify(session,"three_buttons");
  for(const value of ["right","right","down","down","right","down","right","right"])act4Input(session,"route_controls","append",value);act4Verify(session,"route_controls");
  [6,4,5].forEach((value,index)=>act4Input(session,"calibration_dials","set",value,{index}));act4Verify(session,"calibration_dials");
  for(const [source,target] of Object.entries({PWR:"CTRL-A",DATA:"AUX-D",CTRL:"PWR-B",AUX:"DATA-C"})){act4Input(session,"patch_matrix","select_source",source);act4Input(session,"patch_matrix","connect",undefined,{target});}act4Verify(session,"patch_matrix");
  for(const index of [0,2,5])act4Input(session,"switch_bank","toggle",index,{index});act4Input(session,"switch_bank","sample");act4Input(session,"switch_bank","toggle",2,{index:2});act4Verify(session,"switch_bank");
  for(const value of ["RESET","CONFIRM","CONFIRM","RESET","CONFIRM","CONFIRM","RESET","CONFIRM"])act4Input(session,"diagnostic_recovery","append",value);act4Verify(session,"diagnostic_recovery");
}
function completeAct4Board2(session){
  [7,3,5,9].forEach((value,index)=>act4Input(session,"level_sliders","set",value,{index}));act4Verify(session,"level_sliders");
  [1,5,8,7].forEach((value,index)=>act4Input(session,"alignment_discs","set",value,{index}));act4Verify(session,"alignment_discs");
  act4Input(session,"component_order","select",0,{index:0});act4Input(session,"component_order","select",1,{index:1});act4Verify(session,"component_order");
  for(const value of [0,3,7,4,5,1,2,6])act4Input(session,"service_plate","append",value);act4Verify(session,"service_plate");
  for(const [circuit,fuse] of Object.entries({PUMP:"15A_DELAY",HEATER:"20A_FAST",COMMS:"15A_FAST",FAN:"10A_DELAY"})){act4Input(session,"fuse_allocation","select",fuse);act4Input(session,"fuse_allocation","assign",undefined,{target:circuit});}act4Verify(session,"fuse_allocation");
  const fault=session.fieldRun.boards[2].modules.load_test.fault,followUp=["BEARING","DRIVE"].includes(fault)?"B":"C";
  act4Input(session,"load_test","test","A");act4Input(session,"load_test","test","A");act4Input(session,"load_test","test",followUp);act4Input(session,"load_test","test",followUp);act4Input(session,"load_test","select",fault);act4Verify(session,"load_test");
}

const completeHandover = (session, overrides = {}) => update(session, {
  handover: {
    ellie: "yes",
    noor: "yes",
    jamie: "yes",
    saira: "yes",
    kai: "yes",
    mara: "no",
    ...overrides,
  },
});

const repairAnswers = {
  inbound_receive: "c",
  human_outbound: "d",
  status_beacon: "c",
  tower_monitoring: "c",
  air_quality: "c",
  received_traffic_log: "c",
  source_identification: "c",
  fire_suppression: "b",
  road_flood_monitoring: "c",
  site_access_control: "d",
};

function completeRepairStage(session, { systems, fail = [] } = {}) {
  const roles = rolesByCount[session.playerCount];
  const selected = systems || session.repairRun.available.slice(0, roles.length);
  assert.equal(selected.length, roles.length);
  update(session, { repairs: Object.fromEntries(roles.map((role, index) => [role, selected[index]])) });
  closePlanningAndDispatch(session);
  assert.equal(session.repairRun.phase, "repair");
  assert.equal(session.clock.duration, 300);
  for (const role of roles) {
    const systemId = session.repairRun.assignments[role];
    applyAction(session, authorize(session, session.players[role].token), "REPAIR_SUBMIT", {
      answer: fail.includes(systemId) ? [] : repairAnswers[systemId],
    });
  }
  applyAction(session,facilitator,"COMMIT_STAGE");
  assert.equal(session.stageStatus, "resolved");
  applyAction(session, facilitator, "ADVANCE_STAGE");
}

function closePlanningAndDispatch(session,{fill=false}={}){
  session.clock.endAt=10;assert.equal(expireIfNeeded(session,11),true);
  assert.equal(session.repairRun.phase,"dispatch");
  if(fill)applyAction(session,facilitator,"FILL_REMAINING_REPAIRS");
  applyAction(session,facilitator,"DISPATCH_REPAIRS");
}

function commitAndAdvance(session) {
  if([5,6].includes(session.stage)&&session.stageStatus==="live"){
    if(session.stage===6&&session.archiveRun?.phase==="opening")expireIfNeeded(session,session.act6Intro.endsAt+1);
    session.clock.endAt=Date.now()-1;
    expireIfNeeded(session,Date.now());
    if(session.stage===6&&session.archiveRun?.phase==="nightmare"){
      expireIfNeeded(session,session.archiveRun.nightmareEndsAt+1);
      session.clock.endAt=Date.now()-1;
      expireIfNeeded(session,Date.now());
    }
    if(session.stageStatus==="resolved")applyAction(session,facilitator,"ADVANCE_STAGE");
    return;
  }
  if(session.stage===3){
    applyAction(session,facilitator,"ACT3_COMMIT_DEPLOYMENT");
    applyAction(session,facilitator,"ACT3_NOMINATE_RUNNER",{runner:"operations"});
    applyAction(session,facilitator,"ADVANCE_STAGE");
    return;
  }
  applyAction(session, facilitator, "COMMIT_STAGE");
  if (session.stage === 4 && session.fieldRun?.active) completeActiveFieldRun(session);
  if (session.stage < 7 && session.stageStatus === "resolved") applyAction(session, facilitator, "ADVANCE_STAGE");
}

function confirmEnding(session) {
  assert.equal(session.status,"ending");
  assert.equal(session.stageStatus, "resolved");
  assert.ok(session.ending);
  assert.equal(session.pendingEnding,null);
}

function claimNextTransfer(session,role=session.finaleRun.roles.find(item=>!session.finaleRun.below.includes(item))){
  const viewer=authorize(session,session.players[role].token);applyAction(session,viewer,"BEGIN_DESCENT");expireIfNeeded(session,session.finaleRun.walkEndsAt+1);return viewer;
}

function completePhysicalTransfer(session,viewer){
  const mechanics=session.finaleRun.mechanics,key=mechanics.keys.find(item=>item.correct);
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"select_key",keyId:key.id});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"insert_key"});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"turn_key"});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"set_hatch",value:1});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"enter_hatch"});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"set_close",value:1});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"set_clamp",value:1});
  for(let index=0;index<8;index++)applyAction(session,viewer,"ACT7_MECHANIC",{action:"fill"});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"hold"});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"test_seal"});
  let purge=session.finaleRun.mechanics.purge;
  while(purge.charge<purge.target){applyAction(session,viewer,"ACT7_MECHANIC",{action:"shake",amount:4});purge=session.finaleRun.mechanics.purge;}
  session.finaleRun.capsuleReceiverReadyAt=0;
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"fire_purge"});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"enter_r12"});
}

function completeProductionFinale(session,{good=true,messageRating=good?"clear":"poor",timeouts=false,controls=null,confirm=true}={}){
  while(session.stage===7&&session.stageStatus==="live"){
    const run=session.finaleRun;
    if(run.phase==="queue")claimNextTransfer(session);
    else if(run.phase==="walk")expireIfNeeded(session,run.walkEndsAt+1);
    else if(run.phase==="transfer"){
      if(timeouts){session.clock.endAt=1;expireIfNeeded(session,2);}
      else completePhysicalTransfer(session,authorize(session,session.players[run.currentRole].token));
    }else if(run.phase==="power_failure")expireIfNeeded(session,run.powerFailureEndsAt+1);
    else if(run.phase==="console"){
      const viewer=authorize(session,session.players[run.below[0]].token);
      const finalControls=controls||(good?{red:true,white:true,amber:true,green:true,message:"ALL CREW IN R-12. SURFACE ATMOSPHERE UNSAFE. EXTERNAL EXTRACTION REQUIRED."}:{blue:true});
      applyAction(session,viewer,"UPDATE_SURFACE",finalControls);
      if(!finalControls.green)applyAction(session,viewer,"SUBMIT_SURFACE");
    }else if(run.phase==="blackout"){
      if(!run.messageRating)applyAction(session,facilitator,"CLASSIFY_MESSAGE",{rating:messageRating});
      applyAction(session,facilitator,"CALCULATE_ENDING");
    }
    else break;
  }
  if(confirm&&session.stage===7&&session.stageStatus==="resolved"&&session.pendingEnding)applyAction(session,facilitator,"CONFIRM_ENDING");
  return session.ending;
}

test("complete strong path reaches Clean Rescue after the Lark investigation", () => {
  const session = createSession({ code: "TEST01", playerCount: 7 });
  for (const role of ["lead", "signal", "systems", "operations", "field", "protocol", "comms"]) addPlayer(session, { role, name: role });

  startShift(session);
  assert.equal(session.stage, 1);
  completeHandover(session);
  commitAndAdvance(session);

  completeRepairStage(session);

  completeOutsidePlan(session);
  commitAndAdvance(session);
  assert.equal(session.decisions[3].FIRST_LOCATION,"a");
  assert.equal(session.decisions[3].SECOND_LOCATION,"b");
  assert.equal(session.decisions[3].REPAIR_ALLOWANCE,360);
  assert.equal(session.decisions[3].RUNNER,"operations");

  update(session, { runner: "operations" });
  commitAndAdvance(session);
  assert.equal(session.global.fieldServices.external_inbound_path,"restored");
  assert.equal(session.global.fieldServices.external_outbound_path,"restored");

  commitAndAdvance(session);
  assert.equal(session.global.mara, "located");
  assert.equal(session.global.lockKnowledge, 1);
  assert.ok(session.global.act6InvestigationTime>=180);
  assert.equal(session.stage,6);
  assert.equal(session.clock.duration,session.global.act6InvestigationTime);

  commitAndAdvance(session);
  assert.equal(session.global.correction, "none");
  assert.deepEqual(Object.keys(session.decisions[6]),["investigationWindow"]);

  completeProductionFinale(session);
  confirmEnding(session);
  assert.equal(session.status, "ending");
  assert.equal(session.ending.title, "SHUTTERS OPEN");
  assert.equal(session.ending.calculation.status,"DISTRESS");
  assert.equal(session.ending.calculation.message,"CLEAR");
  assert.equal(session.ending.calculation.release,"OPEN");
  for (let stage = 1; stage <= 7; stage++) {
    const result = session.outcomes[stage];
    assert.ok(result.decision.length > 15, `stage ${stage} missing committed-decision explanation`);
    assert.ok(result.impacts.length >= 2, `stage ${stage} missing explicit impacts`);
    assert.ok(result.next.length > 20, `stage ${stage} missing narrative bridge`);
  }
});

test("decision previews explain benefits, tradeoffs, warnings, and readiness before commit", () => {
  const session = createSession({ code: "CLEAR1", playerCount: 7 });
  connectCrew(session); startShift(session);

  let state = publicState(session, authorize(session, session.players.lead.token));
  assert.equal(state.decisionPreview.ready, false);
  assert.match(state.decisionPreview.summary, /0 of 6/);
  assert.match(state.decisionPreview.warnings.join(" "), /6 staff records/i);
  assert.equal(state.decisionPreview.positiveLabel, "ANSWERED YES / DEPARTURE ESTABLISHED");

  completeHandover(session);
  state = publicState(session, authorize(session, session.players.lead.token));
  assert.equal(state.decisionPreview.ready, true);
  assert.ok(state.decisionPreview.keeps.some(item => /ELLIE HART/i.test(item)));
  assert.ok(state.decisionPreview.costs.some(item => /MARA VENN/i.test(item)));
  applyAction(session, facilitator, "COMMIT_STAGE");
  assert.match(session.outcomes[1].decision, /6 of 6 staff reviewed/i);
  assert.ok(session.outcomes[1].impacts.some(item => /No correctness result/i.test(item)));
  assert.equal(session.global.evidence.length, 0, "Act 1 creates no persistent mechanical evidence");

  applyAction(session, facilitator, "ADVANCE_STAGE");
  update(session, { repairs: Object.fromEntries(rolesByCount[7].map((role,index)=>[role,session.repairRun.available[index]])) });
  state = publicState(session, facilitator);
  assert.equal(state.decisionPreview.ready, true);
  assert.equal(state.decisionPreview.keeps.length, 7);
  assert.ok(state.decisionPreview.costs.some(item => /BACKUP POWER|FIRE SUPPRESSION/i.test(item)));
});

test("production Act 1 reconciles six staff without scoring or persistent mechanical consequences", () => {
  assert.equal(STAGES[1].duration, 360);
  assert.equal(STAGES[1].mechanic, "handover");
  assert.deepEqual(STAGES[1].options.map(([, name]) => name), [
    "ELLIE HART", "NOOR HALE", "MARA VENN", "JAMIE ARLEN", "SAIRA ROWAN", "KAI KESSLER",
  ]);

  const session = createSession({ code: "HAND01", playerCount: 7 });
  connectCrew(session); startShift(session);
  const initialGlobal = structuredClone(session.global);
  const sharedBefore = publicState(session, { kind: "public" });
  assert.deepEqual(Object.values(sharedBefore.draft.handover), ["", "", "", "", "", ""]);
  assert.equal(sharedBefore.officialStatus.code, "PERSONNEL EXCEPTIONS: NONE RAISED");
  assert.equal(sharedBefore.signalTransmission, null, "traffic stays hidden until its scheduled time");
  assert.equal(ACT1_EVIDENCE_SCREENS.length,7);
  const assigned=roleIdsForCount(7).flatMap(role=>roleCard(1,role,7).act1Screens);
  assert.deepEqual(assigned.map(screen=>screen.id),ACT1_EVIDENCE_SCREENS.map(screen=>screen.id));
  for(const playerCount of [4,5,6]){
    const all=roleIdsForCount(playerCount).flatMap(role=>roleCard(1,role,playerCount).act1Screens);
    assert.deepEqual(all.map(screen=>screen.id).sort(),ACT1_EVIDENCE_SCREENS.map(screen=>screen.id).sort(),`${playerCount}-player pagination must retain every screen`);
  }
  assert.equal(ACT1_TRANSMISSIONS.length,4);
  for(const item of ACT1_TRANSMISSIONS)assert.ok(existsSync(new URL(`../prototype/${item.audio.replace(/^\.\//,"")}`,import.meta.url)));

  completeHandover(session, { ellie: "no", noor: "no", jamie: "no", saira: "no", kai: "no", mara: "yes" });
  applyAction(session, facilitator, "COMMIT_STAGE");
  assert.equal(session.outcomes[1].headline, "Night shift handover accepted");
  assert.equal(session.outcomes[1].quality, "mixed");
  assert.deepEqual(session.global, initialGlobal, "Act 1 answers must not branch later mechanical state");
  assert.match(session.outcomes[1].detail, /no score/i);
  assert.match(session.outcomes[1].next, /lightning strikes the mast/i);
});

test("production Act 2 scales failed systems and keeps consequential ranking secret", () => {
  assert.equal(STAGES[2].duration, 180);
  assert.equal(STAGES[2].mechanic, "repairs");
  assert.equal(ACT2_SYSTEMS.length, 12);
  assert.equal(REPAIR_SYSTEMS.length, 10);
  assert.equal(new Set(REPAIR_SYSTEMS.map(system => JSON.stringify(system.puzzle))).size, 10, "every repair must be a distinct reasoning game");

  for (const playerCount of [4, 5, 6, 7]) {
    const session=createSession({code:`SCALE${playerCount}`,playerCount});connectCrew(session);startShift(session);
    completeHandover(session);commitAndAdvance(session);
    const consequential=REPAIR_SYSTEMS.filter(system=>system.consequential);
    const consequentialFaultCount={4:5,5:6,6:7,7:8}[playerCount];
    assert.deepEqual(consequential.filter(system=>session.global.systemStatus[system.id]==="broken").map(system=>system.rank),Array.from({length:consequentialFaultCount},(_,index)=>index+1));
    assert.ok(REPAIR_SYSTEMS.filter(system=>!system.consequential).every(system=>session.global.systemStatus[system.id]==="broken"));
    assert.equal(session.repairRun.available.length,{4:7,5:8,6:9,7:10}[playerCount]);
    assert.equal(session.global.systemStatus.road_flood_monitoring,playerCount===7?"broken":"working");
    assert.equal(session.global.systemStatus.lower_road_camera,"working");
    assert.equal(session.global.systemStatus.ventilation_control,"working");
    const publicSystems=publicState(session,{kind:"public"}).repairSystems;
    assert.ok(publicSystems.every(system=>!("rank" in system)&&!("consequential" in system)),"ranking and later importance must not reach clients");
    assert.equal(publicSystems.length,12);
    assert.deepEqual(publicSystems.map(system=>system.panelId),Array.from({length:12},(_,index)=>index+1));
    assert.deepEqual(publicSystems.slice(0,3).map(system=>system.id),["lower_road_camera","received_traffic_log","air_quality"]);
    assert.equal(publicSystems.find(system=>system.id==="lower_road_camera").selectable,false);
    assert.equal(publicSystems.find(system=>system.id==="ventilation_control").selectable,false);
    assert.equal(publicSystems.some(system=>system.id==="backup_power"),false);
    assert.equal(publicState(session,{kind:"public"}).preStrikeArchive[0].ref,PRE_STRIKE_ARCHIVE[0].ref);
  }
});

test("Act 2 facilitator assigns one unique failed system per player and private puzzles stay private", () => {
  const session=createSession({code:"REPAIR1",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  const lead=authorize(session,session.players.lead.token);
  assert.throws(()=>applyAction(session,lead,"UPDATE_DRAFT",{repairs:{lead:"inbound_receive"}}),/not available/);
  assert.throws(()=>update(session,{repairs:{lead:"inbound_receive",signal:"inbound_receive"}}),/only once/);
  assert.throws(()=>update(session,{repairs:{lead:"source_identification"}}),/invalid/);
  const assignments={lead:"inbound_receive",signal:"human_outbound",systems:"status_beacon",operations:"site_access_control"};
  update(session,{repairs:assignments});
  assert.throws(()=>applyAction(session,facilitator,"COMMIT_STAGE"),/full three-minute/i);
  closePlanningAndDispatch(session);
  assert.equal(session.repairRun.phase,"repair");
  assert.equal(session.clock.duration,300);
  assert.equal(session.repairRun.traffic[0].ref,"COMM-01");
  assert.equal(session.repairRun.traffic[0].clarity,"degraded");
  assert.ok(session.repairRun.traffic[0].audio?.endsWith(".wav"));
  assert.throws(()=>applyAction(session,facilitator,"COMMIT_STAGE"),/every assigned repair|clock expire/i);
  const leadState=publicState(session,lead),signalState=publicState(session,authorize(session,session.players.signal.token)),shared=publicState(session,{kind:"public"});
  assert.equal(leadState.repairAssignment,"inbound_receive");
  assert.equal(leadState.repairPuzzle.type,"guide-choice");
  assert.equal(signalState.repairAssignment,"human_outbound");
  assert.equal(signalState.repairPuzzle.type,"guide-choice");
  assert.equal(shared.repairPuzzle,null);
  assert.equal(publicState(session,facilitator).repairPuzzle,null);
});

test("Act 2 repairs lock after one submission, take effect immediately, and alter later traffic", () => {
  const session=createSession({code:"REPAIR2",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  update(session,{repairs:{lead:"inbound_receive",signal:"human_outbound",systems:"status_beacon",operations:"site_access_control"}});
  closePlanningAndDispatch(session);
  const lead=authorize(session,session.players.lead.token);
  applyAction(session,lead,"REPAIR_SUBMIT",{answer:repairAnswers.inbound_receive});
  assert.equal(session.global.systemStatus.inbound_receive,"working");
  assert.throws(()=>applyAction(session,lead,"REPAIR_SUBMIT",{answer:repairAnswers.inbound_receive}),/already submitted|no retries/i);
  session.repairRun.repairStartedAt=1_000;
  assert.equal(expireIfNeeded(session,122_000),true);
  const comm02=session.repairRun.traffic.find(item=>item.ref==="COMM-02");
  assert.equal(comm02.clarity,"clear");
  assert.equal(comm02.stored,true,"traffic log survived at four players and must preserve the arrival");
  for(const role of ["signal","systems","operations"]){const id=session.repairRun.assignments[role];applyAction(session,authorize(session,session.players[role].token),"REPAIR_SUBMIT",{answer:repairAnswers[id]});}
  assert.equal(session.stageStatus,"live","completed repairs remain live so timed traffic can continue");
  applyAction(session,facilitator,"COMMIT_STAGE");
  assert.equal(session.stageStatus,"resolved");
  assert.match(session.outcomes[2].detail,/successful repairs took effect immediately/i);
  assert.ok(session.outcomes[2].impacts.some(item=>/no score/i.test(item)));
  assert.equal(session.global.systemStatus.site_access_control,"working","non-consequential repairs genuinely succeed");
});

test("four-player Act 2 dispatches all four puzzles together and never reassigns them after peer completion", () => {
  const session=createSession({code:"A2FOUR",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  const assignments={lead:"inbound_receive",signal:"human_outbound",systems:"status_beacon",operations:"site_access_control"};
  update(session,{repairs:assignments});closePlanningAndDispatch(session);
  const roles=["lead","signal","systems","operations"];
  const before=Object.fromEntries(roles.map(role=>{
    const state=publicState(session,authorize(session,session.players[role].token));
    assert.equal(state.repairAssignment,assignments[role]);
    assert.ok(state.repairPuzzle,"every player puzzle is available at dispatch");
    return [role,state.repairAssignment];
  }));
  for(const role of ["lead","signal"]){
    applyAction(session,authorize(session,session.players[role].token),"REPAIR_SUBMIT",{answer:repairAnswers[assignments[role]]});
  }
  for(const role of roles){
    const state=publicState(session,authorize(session,session.players[role].token));
    assert.equal(state.repairAssignment,before[role],`${role} assignment remains stable`);
    if(["lead","signal"].includes(role))assert.ok(state.repairResult,"completed player remains on their result screen");
    else assert.equal(state.repairResult,null,"unfinished player already has their original puzzle");
  }
  assert.equal(Object.keys(session.repairRun.assignments).length,4);
});

test("facilitator can dispatch complete assignments and close completed Act 2 before either timer expires", () => {
  const session=createSession({code:"A2EARLY",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  const assignments={lead:"inbound_receive",signal:"human_outbound",systems:"status_beacon",operations:"site_access_control"};
  update(session,{repairs:assignments});
  assert.equal(session.repairRun.phase,"planning");
  applyAction(session,facilitator,"DISPATCH_REPAIRS");
  assert.equal(session.repairRun.phase,"repair");
  for(const role of Object.keys(assignments)){
    applyAction(session,authorize(session,session.players[role].token),"REPAIR_SUBMIT",{answer:repairAnswers[assignments[role]]});
  }
  assert.equal(publicState(session,facilitator).decisionPreview.ready,true);
  applyAction(session,facilitator,"COMMIT_STAGE");
  assert.equal(session.stageStatus,"resolved");
});

test("facilitator dispatch after planning timeout fills open repair tasks automatically", () => {
  const session=createSession({code:"A2AUTOFILL",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  update(session,{repairs:{lead:"inbound_receive",signal:"human_outbound"}});
  session.clock.endAt=10;expireIfNeeded(session,11);
  assert.equal(session.repairRun.phase,"dispatch");
  applyAction(session,facilitator,"DISPATCH_REPAIRS");
  assert.equal(session.repairRun.phase,"repair");
  assert.equal(Object.values(session.repairRun.assignments).filter(Boolean).length,4);
  assert.equal(new Set(Object.values(session.repairRun.assignments)).size,4);
  assert.equal(session.repairRun.assignmentMethod.systems,"random");
  assert.equal(session.repairRun.assignmentMethod.operations,"random");
});

test("Received Traffic Log repair recovers completed buffered messages without rewriting them", () => {
  const session=createSession({code:"RECOVER",playerCount:5});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  update(session,{repairs:{lead:"received_traffic_log",signal:"inbound_receive",systems:"status_beacon",operations:"site_access_control",field:"fire_suppression"}});
  closePlanningAndDispatch(session);
  const buffered=session.repairRun.traffic.find(item=>item.ref==="COMM-01");
  assert.equal(buffered.storageState,"buffered");
  assert.equal(buffered.stored,false);
  const original={time:buffered.receiptStartAt,source:buffered.capturedSource,text:buffered.displayedTranscript};
  applyAction(session,authorize(session,session.players.lead.token),"REPAIR_SUBMIT",{answer:repairAnswers.received_traffic_log});
  assert.equal(buffered.storageState,"recovered");
  assert.equal(buffered.stored,true);
  assert.deepEqual({time:buffered.receiptStartAt,source:buffered.capturedSource,text:buffered.displayedTranscript},original);
  assert.ok(buffered.recoveredAt>=buffered.completedAt);
});

test("all ten revised Act 2 guide packages retain their fixed figures, option counts and answer keys", () => {
  const expected={inbound_receive:["G09",5,"c"],status_beacon:["G10",4,"c"],tower_monitoring:["G11",5,"c"],air_quality:["G12",5,"c"],received_traffic_log:["G13",5,"c"],source_identification:["G14",5,"c"],fire_suppression:["G15",5,"b"],road_flood_monitoring:["G16",5,"c"],human_outbound:["G17",5,"d"],site_access_control:["G18",5,"d"]};
  for(const system of REPAIR_SYSTEMS){
    const [figure,count,answer]=expected[system.id];
    assert.equal(system.puzzle.type,"guide-choice");assert.equal(system.puzzle.figure,figure);assert.equal(system.puzzle.options.length,count);
    assert.ok(system.puzzle.rules.length>150,`${system.id} retains complete player rules`);
    assert.ok(system.puzzle.success.length>70,`${system.id} retains its specific success consequence`);
    const session=createSession({code:`P${figure}X`,playerCount:7});connectCrew(session);startShift(session);completeHandover(session);commitAndAdvance(session);
    const roles=rolesByCount[7],selected=[system.id,...session.repairRun.available.filter(id=>id!==system.id)].slice(0,roles.length);
    update(session,{repairs:Object.fromEntries(roles.map((role,index)=>[role,selected[index]]))});closePlanningAndDispatch(session);
    applyAction(session,authorize(session,session.players.lead.token),"REPAIR_SUBMIT",{answer});
    assert.equal(session.repairRun.results.lead.success,true,`${system.id} answer key`);
    assert.equal(publicState(session,authorize(session,session.players.lead.token)).repairPuzzle.success,system.puzzle.success,`${system.id} result copy survives resolution`);
  }
});

test("Act 2 timeouts move planning forward and close unfinished repairs without retry", () => {
  const session=createSession({code:"REPAIR3",playerCount:5});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  const planningStart=session.repairRun.planningStartedAt;
  assert.equal(expireIfNeeded(session,planningStart+30001),true);
  assert.equal(session.repairRun.traffic[0].ref,"COMM-01");
  assert.equal(expireIfNeeded(session,planningStart+60001),true);assert.equal(session.repairRun.personnelLevel,1);
  assert.equal(expireIfNeeded(session,planningStart+120001),true);assert.equal(session.repairRun.personnelLevel,2);
  session.clock.endAt=10;assert.equal(expireIfNeeded(session,11),true);
  assert.equal(session.repairRun.phase,"dispatch");
  assert.equal(Object.values(session.repairRun.assignments).filter(Boolean).length,0);
  applyAction(session,facilitator,"FILL_REMAINING_REPAIRS");
  assert.equal(Object.values(session.draft.repairs).filter(Boolean).length,5);
  assert.ok(Object.values(session.repairRun.assignmentMethod).every(method=>method==="random"));
  applyAction(session,facilitator,"DISPATCH_REPAIRS");
  assert.equal(session.repairRun.phase,"repair");
  assert.equal(Object.values(session.repairRun.assignments).filter(Boolean).length,5);
  assert.equal(session.clock.duration,300);
  session.clock.endAt=20;assert.equal(expireIfNeeded(session,21),true);
  assert.equal(session.stageStatus,"resolved");
  assert.equal(Object.keys(session.repairRun.results).length,0);
  assert.match(session.outcomes[2].decision,/0 submitted before timeout/i);
});

test("Act 2 advisories carry the revised Act 3 respiratory context", () => {
  const session=createSession({code:"A3AIR1",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  const rated=session.repairRun.traffic.find(item=>item.ref==="COMM-04A"),severe=session.repairRun.traffic.find(item=>item.ref==="COMM-04B");
  assert.match(rated.text,/thirty-three minutes/i);assert.doesNotMatch(rated.text,/thirty-five/i);
  assert.match(severe.text,/twenty minutes/i);assert.match(severe.text,/standard thirty-three/i);assert.doesNotMatch(severe.text,/twenty-two/i);
});

test("facilitator can restart resolved Act 2 with the same crew links", () => {
  const session=createSession({code:"ACT2RT",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  const tokens=Object.fromEntries(Object.entries(session.players).map(([role,player])=>[role,player.token]));
  session.clock.endAt=10;expireIfNeeded(session,11);
  applyAction(session,facilitator,"FILL_REMAINING_REPAIRS");applyAction(session,facilitator,"DISPATCH_REPAIRS");
  session.clock.endAt=20;expireIfNeeded(session,21);
  assert.equal(session.stageStatus,"resolved");
  applyAction(session,facilitator,"RESTART_ACT2");
  assert.equal(session.stage,2);assert.equal(session.stageStatus,"live");assert.equal(session.repairRun.phase,"planning");
  assert.equal(session.clock.duration,180);assert.deepEqual(Object.fromEntries(Object.entries(session.players).map(([role,player])=>[role,player.token])),tokens);
  assert.equal(session.outcomes[2],undefined);assert.equal(session.decisions[2],undefined);
});

test("both credible alternative repairs genuinely succeed", () => {
  const session=createSession({code:"REPAIR4",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  update(session,{repairs:{lead:"site_access_control",signal:"fire_suppression",systems:"inbound_receive",operations:"human_outbound"}});closePlanningAndDispatch(session);
  applyAction(session,authorize(session,session.players.lead.token),"REPAIR_SUBMIT",{answer:repairAnswers.site_access_control});
  applyAction(session,authorize(session,session.players.signal.token),"REPAIR_SUBMIT",{answer:repairAnswers.fire_suppression});
  assert.equal(session.global.systemStatus.site_access_control,"working");
  assert.equal(session.global.systemStatus.fire_suppression,"working");
});

test("production Act 3 implements the six-deployment answer key", () => {
  const plans=[
    ["a","b","signal_meter","signal_meter","emergency_filter",111],
    ["b","a","insulated_driver","signal_meter","emergency_filter",111],
    ["c","a","valve_wrench","signal_meter","flood_kit",99],
    ["c","b","valve_wrench","insulated_driver","flood_kit",98],
    ["d","a","torque_wrench","signal_meter","climbing_kit",87],
    ["d","b","torque_wrench","insulated_driver","climbing_kit",87],
  ];
  for(const [firstLocation,secondLocation,tool1,tool2,supportItem,filterUse] of plans){
    const preview=act3PlanPreview({firstLocation,secondLocation,tool1,tool2,supportItem,filterUse});
    assert.equal(preview.exact,true,`${firstLocation}>${secondLocation} should match the handoff answer key`);
    assert.equal(preview.canonical.tool1,tool1,"a valid alternate first tool must be preserved");
    assert.equal(preview.canonical.tool2,tool2,"a valid alternate second tool must be preserved");
  }
  const reversed=act3PlanPreview({firstLocation:"a",secondLocation:"c",tool1:"signal_meter",tool2:"valve_wrench",supportItem:"flood_kit",filterUse:96});
  assert.equal(reversed.submittable,true);assert.equal(reversed.exact,false);assert.equal(reversed.canonical.first,"c");assert.equal(reversed.canonical.filterUse,99);
  const conflict=act3PlanPreview({firstLocation:"c",secondLocation:"d",tool1:"valve_wrench",tool2:"torque_wrench",supportItem:"flood_kit",filterUse:105});
  assert.equal(conflict.submittable,false);assert.match(conflict.errors.join(" "),/different specialist support items/i);
});

test("Act 3 exposes separate red field outages and accepts only a practical facilitator plan", () => {
  const session=createSession({code:"PLAN03",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  assert.equal(session.stage,3);
  assert.equal(STAGES[3].mechanic,"outside_plan");
  assert.equal(STAGES[3].duration,480);
  assert.deepEqual(Object.values(session.global.externalStatus),["offline","offline","offline","offline"]);
  assert.equal(session.global.systemStatus.tower_monitoring,"working");
  const lead=authorize(session,session.players.lead.token);
  applyAction(session,lead,"UPDATE_DRAFT",{firstLocation:"a"});
  update(session,{secondLocation:"a",tool1:"signal_meter",tool2:"signal_meter",supportItem:"emergency_filter",filterUse:111});
  assert.throws(()=>applyAction(session,lead,"ACT3_COMMIT_DEPLOYMENT"),/only the facilitator/i);
  assert.throws(()=>applyAction(session,facilitator,"ACT3_COMMIT_DEPLOYMENT"),/different locations/i);
  completeOutsidePlan(session);
  const preview=publicState(session,{kind:"public"}).decisionPreview;
  const publicLocations=publicState(session,{kind:"public"}).outsideLocations;
  assert.equal(publicLocations.some(location=>"requirement" in location||"serviceNote" in location),false);
  assert.equal(preview.ready,true);
  assert.doesNotMatch(preview.costs.join(" "),/46.*45.*20.*111/);
  assert.match(preview.costs.join(" "),/calculate all three stages/i);
  assert.match(preview.footer,/six minutes per Act 4 repair/i);
  applyAction(session,facilitator,"ACT3_COMMIT_DEPLOYMENT");
  assert.equal(session.act3Run.impossibleVoicePlayed,true,"an early submission must still deliver the one-time voice");
  assert.equal(session.act3Run.resolution.mode,"correct");
  applyAction(session,facilitator,"ACT3_NOMINATE_RUNNER",{runner:"operations"});
  assert.match(session.outcomes[3].detail,/6 minutes for each repair/i);
  assert.equal(session.decisions[3].FIRST_LOCATION,"a");assert.equal(session.decisions[3].REPAIR_ALLOWANCE,360);
});

test("Act 3 corrects a viable imperfect plan once and applies the five-minute allowance", () => {
  const session=createSession({code:"A3FIX1",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  completeOutsidePlan(session,{firstLocation:"a",secondLocation:"c",tool1:"torque_wrench",tool2:"signal_meter",supportItem:"flood_kit",filterUse:96});
  applyAction(session,facilitator,"ACT3_COMMIT_DEPLOYMENT");
  assert.equal(session.act3Run.resolution.mode,"corrected");
  assert.equal(session.global.outsidePlan.FIRST_LOCATION,"c");
  assert.equal(session.global.outsidePlan.SECOND_LOCATION,"a");
  assert.equal(session.global.outsidePlan.REPAIR_TOOL_1,"valve_wrench");
  assert.equal(session.global.outsidePlan.REPAIR_TOOL_2,"signal_meter");
  assert.equal(session.global.outsidePlan.FILTER_USE,99);
  assert.equal(session.global.outsidePlan.REPAIR_ALLOWANCE,300);
  const resolvedPreview=publicState(session,{kind:"public"}).decisionPreview;
  assert.match(resolvedPreview.summary,/deployment corrected/i);
  assert.match(resolvedPreview.keeps.join(" "),/CAM-01 → RX-01/);
  assert.match(resolvedPreview.costs.join(" "),/5 minutes per Act 4 repair/i);
  applyAction(session,facilitator,"ACT3_NOMINATE_RUNNER",{runner:"operations"});
  applyAction(session,facilitator,"ADVANCE_STAGE");
  assert.equal(session.draft.runner,"operations");
  applyAction(session,facilitator,"COMMIT_STAGE");
  assert.equal(session.clock.duration,300,"the corrected Act 3 allowance must control each Act 4 repair window");
});

test("facilitator can restart resolved Act 3 with the same crew links", () => {
  const session=createSession({code:"ACT3RT",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  const tokens=Object.fromEntries(Object.entries(session.players).map(([role,player])=>[role,player.token]));
  completeOutsidePlan(session,{firstLocation:"a",secondLocation:"b",tool1:"signal_meter",tool2:"insulated_driver",supportItem:"emergency_filter",filterUse:111});
  applyAction(session,facilitator,"ACT3_COMMIT_DEPLOYMENT");applyAction(session,facilitator,"ACT3_NOMINATE_RUNNER",{runner:"operations"});
  assert.equal(session.stageStatus,"resolved");assert.ok(session.global.outsidePlan);
  applyAction(session,facilitator,"RESTART_ACT3");
  assert.equal(session.stage,3);assert.equal(session.stageStatus,"live");assert.equal(session.act3Run.phase,"planning");
  assert.equal(session.clock.duration,480);assert.equal(session.global.outsidePlan,null);
  assert.equal(session.outcomes[3],undefined);assert.equal(session.decisions[3],undefined);
  assert.deepEqual(Object.fromEntries(Object.entries(session.players).map(([role,player])=>[role,player.token])),tokens);
});

test("Act 3 timeout opens a final call and random assignment remains valid", () => {
  const session=createSession({code:"A3TIME",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  session.clock.endAt=10;
  assert.equal(expireIfNeeded(session,11),true);
  assert.equal(session.act3Run.phase,"final_call");
  assert.equal(session.stageStatus,"live");
  assert.equal(session.global.outsidePlan,null);
  applyAction(session,facilitator,"ACT3_ASSIGN_RANDOM");
  assert.equal(session.act3Run.resolution.mode,"random");
  assert.equal(session.global.outsidePlan.REPAIR_ALLOWANCE,300);
  const locked=act3PlanPreview({
    firstLocation:session.global.outsidePlan.FIRST_LOCATION,
    secondLocation:session.global.outsidePlan.SECOND_LOCATION,
    tool1:session.global.outsidePlan.REPAIR_TOOL_1,
    tool2:session.global.outsidePlan.REPAIR_TOOL_2,
    supportItem:session.global.outsidePlan.SUPPORT_ITEM,
    filterUse:session.global.outsidePlan.FILTER_USE,
  });
  assert.equal(locked.exact,true);
});

test("Act 3 final-call CAM-01 plus AUX-01 conflict becomes a random valid deployment", () => {
  const session=createSession({code:"A3CALL",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  update(session,{firstLocation:"c",secondLocation:"d",tool1:"valve_wrench",tool2:"torque_wrench",supportItem:"flood_kit",filterUse:105});
  session.clock.endAt=10;assert.equal(expireIfNeeded(session,11),true);
  applyAction(session,facilitator,"ACT3_COMMIT_DEPLOYMENT");
  assert.equal(session.act3Run.resolution.mode,"random");assert.equal(session.global.outsidePlan.REPAIR_ALLOWANCE,300);
  assert.equal(new Set([session.global.outsidePlan.FIRST_LOCATION,session.global.outsidePlan.SECOND_LOCATION]).has("c")&&new Set([session.global.outsidePlan.FIRST_LOCATION,session.global.outsidePlan.SECOND_LOCATION]).has("d"),false);
});

test("Act 3 keeps every authority action facilitator-only while players edit the shared draft", () => {
  const session=createSession({code:"A3AUTH",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  const player=authorize(session,session.players.lead.token);
  applyAction(session,player,"UPDATE_DRAFT",{firstLocation:"a"});
  assert.equal(session.draft.firstLocation,"a","players retain collaborative draft editing");
  completeOutsidePlan(session);
  assert.throws(()=>applyAction(session,player,"ACT3_TRIGGER_VOICE"),/facilitator/i);
  assert.throws(()=>applyAction(session,player,"ACT3_COMMIT_DEPLOYMENT"),/only the facilitator/i);
  session.clock.endAt=10;assert.equal(expireIfNeeded(session,11),true);
  assert.equal(session.act3Run.phase,"final_call");
  assert.throws(()=>applyAction(session,player,"ACT3_ASSIGN_RANDOM"),/not available/i);
  applyAction(session,facilitator,"ACT3_ASSIGN_RANDOM");
  assert.equal(session.act3Run.phase,"runner");
  assert.throws(()=>applyAction(session,player,"ACT3_NOMINATE_RUNNER",{runner:"lead"}),/facilitator/i);
  applyAction(session,facilitator,"ACT3_NOMINATE_RUNNER",{runner:"lead"});
  assert.equal(session.stageStatus,"resolved");
  assert.throws(()=>applyAction(session,player,"ADVANCE_STAGE"),/not available/i);
  assert.throws(()=>applyAction(session,player,"RESTART_ACT3"),/not available/i);
});

test("Act 3 private evidence responds to Tower Monitoring and the exact local traffic record", () => {
  const session=createSession({code:"EVID03",playerCount:7});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  completeRepairStage(session,{fail:["tower_monitoring","received_traffic_log"]});
  const systems=publicState(session,authorize(session,session.players.systems.token)).privateCard;
  const comms=publicState(session,authorize(session,session.players.comms.token)).privateCard;
  assert.match(systems.body,/TOWER MONITORING \/ FAULT|No tower diagnostic shortcut/i);
  assert.match(systems.body,/fully solvable/i);
  assert.match(comms.body,/No Act 2 traffic was stored exactly/i);

  const working=createSession({code:"EVOK03",playerCount:4});connectCrew(working);startShift(working);
  completeHandover(working);commitAndAdvance(working);completeRepairStage(working);
  const tower=publicState(working,authorize(working,working.players.systems.token)).privateCard;
  assert.match(tower.body,/RECEIVE RETURN LOSS.*OPERATOR LINE DRIVER ISOLATION.*R-12/i);
  assert.doesNotMatch(tower.body,/R-12.*Upper Ridge|R-12.*ventilation/i);
});

test("weak decisions still fail forward through every stage", () => {
  const session = createSession({ code: "TEST02", playerCount: 6 });
  connectCrew(session);
  startShift(session);

  completeHandover(session, { ellie: "no", mara: "yes" }); commitAndAdvance(session);
  completeRepairStage(session, { fail: session.repairRun.available.slice(0, 6) });
  completeOutsidePlan(session); commitAndAdvance(session);
  update(session, { runner:"operations" }); commitAndAdvance(session);
  commitAndAdvance(session);
  commitAndAdvance(session);
  completeProductionFinale(session,{good:false,timeouts:true});
  confirmEnding(session);

  assert.equal(session.stage, 7);
  assert.equal(session.status, "ending");
  assert.notEqual(session.ending.title, "CLEAN RESCUE");
  assert.equal(session.global.official, 0);
});

test("production sessions enforce the specified four-to-seven-player range", () => {
  assert.throws(() => createSession({ code: "DUO001", playerCount: 2 }), /requires 4–7 players/);
  for (const playerCount of [4, 5, 6, 7]) assert.equal(createSession({ playerCount }).playerCount, playerCount);
});

test("private state exposes only the authenticated role card", () => {
  const session = createSession({ code: "TEST03" });
  const signal = addPlayer(session, { name: "Sam", role: "signal" });
  connectCrew(session);
  startShift(session);
  const viewer = authorize(session, signal.token);
  const state = publicState(session, viewer);
  assert.equal(state.viewer.role, "signal");
  assert.deepEqual(state.privateCard.act1Screens.map(screen=>screen.id),["movements"]);
  assert.deepEqual(Object.values(state.draft.handover), ["", "", "", "", "", ""]);
  assert.equal(JSON.stringify(state).includes(signal.token), false);
  assert.equal(JSON.stringify(state).includes(session.facilitatorToken), false);
});

test("recommendations route to the lead while preserving the submitter's editable copy", () => {
  const session = createSession({ code: "REPORT", playerCount: 4 });
  const signal = addPlayer(session, { name: "Sam", role: "signal" });
  connectCrew(session);
  startShift(session);
  completeHandover(session);commitAndAdvance(session);
  const signalViewer = authorize(session, signal.token);
  const systemsViewer = authorize(session, session.players.systems.token);
  const leadViewer = authorize(session, session.players.lead.token);

  assert.throws(
    () => applyAction(session, signalViewer, "REPORT", { note: "   " }),
    /Enter a recommendation/,
  );

  applyAction(session, signalViewer, "REPORT", {
    recommendation: "shared",
    note: `  ${"s".repeat(200)}  `,
  });
  applyAction(session, systemsViewer, "REPORT", {
    recommendation: "shared",
    note: "Lock Control is a later dependency.",
  });

  const signalState = publicState(session, signalViewer);
  assert.equal(signalState.reports.signal.note.length, 160);
  assert.equal(signalState.reports.signal.note, "s".repeat(160));
  assert.deepEqual(signalState.reports.systems, { submitted: true });

  const systemsState = publicState(session, systemsViewer);
  assert.equal(systemsState.reports.systems.note, "Lock Control is a later dependency.");
  assert.deepEqual(systemsState.reports.signal, { submitted: true });

  const leadState = publicState(session, leadViewer);
  assert.equal(leadState.reports.signal.note, "s".repeat(160));
  assert.equal(leadState.reports.systems.note, "Lock Control is a later dependency.");

  const sharedState = publicState(session, { kind: "public" });
  assert.deepEqual(sharedState.reports.signal, { submitted: true });
  assert.deepEqual(sharedState.reports.systems, { submitted: true });
});

test("crew chat is synchronized for authenticated members and hidden from public views", () => {
  const session = createSession({ code: "CHAT01", playerCount: 4 });
  const lead = addPlayer(session, { name: "Avery", role: "lead" });
  const signal = addPlayer(session, { name: "Noor", role: "signal" });
  const leadViewer = authorize(session, lead.token);
  const signalViewer = authorize(session, signal.token);
  const historyLength = session.history.length;

  applyAction(session, signalViewer, "CHAT_MESSAGE", { message: "  Preserve the voice fragment.  " });
  applyAction(session, facilitator, "CHAT_MESSAGE", { message: "Cordon window is still open." });

  assert.equal(session.chatMessages.length, 2);
  assert.equal(session.chatMessages[0].text, "Preserve the voice fragment.");
  assert.equal(session.chatMessages[0].senderName, "Noor");
  assert.equal(session.chatMessages[0].senderRole, "signal");
  assert.equal(session.chatMessages[1].senderKind, "facilitator");
  assert.equal(session.history.length, historyLength, "chat must not flood the operational audit log");

  const leadState = publicState(session, leadViewer);
  const signalState = publicState(session, signalViewer);
  assert.deepEqual(leadState.chatMessages, signalState.chatMessages);
  assert.equal(leadState.chatMessages[1].text, "Cordon window is still open.");
  assert.deepEqual(publicState(session, { kind: "public" }).chatMessages, []);

  assert.throws(
    () => applyAction(session, { kind: "public" }, "CHAT_MESSAGE", { message: "intrusion" }),
    /Action is not available/,
  );
  assert.throws(
    () => applyAction(session, signalViewer, "CHAT_MESSAGE", { message: "   " }),
    /Enter a message/,
  );

  applyAction(session, leadViewer, "CHAT_MESSAGE", { message: "x".repeat(700) });
  assert.equal(session.chatMessages.at(-1).text.length, 500);

  for (let index = 0; index < 101; index++) {
    applyAction(session, signalViewer, "CHAT_MESSAGE", { message: `bounded message ${index}` });
  }
  assert.equal(session.chatMessages.length, 100);
  assert.equal(session.chatMessages.at(-1).text, "bounded message 100");
});

test("facilitator records Act 1 collective answers while player terminals remain evidence-only", () => {
  const session = createSession({ code: "TEST04" });
  const lead = addPlayer(session, { name: "Lee", role: "lead" });
  const field = addPlayer(session, { name: "Finn", role: "field" });
  connectCrew(session);
  startShift(session);
  assert.throws(() => applyAction(session, authorize(session, lead.token), "UPDATE_DRAFT", { handover: { mara: "no" } }), /not available/);
  assert.throws(() => applyAction(session, authorize(session, field.token), "COMMIT_STAGE"), /not available/);
  completeHandover(session);
  applyAction(session, facilitator, "COMMIT_STAGE");
  assert.equal(session.stageStatus, "resolved");
});

test("Act 1 timeout closes unresolved records without creating persistent state", () => {
  const session = createSession({ code: "TEST05" });
  connectCrew(session);
  startShift(session);
  session.clock.endAt = 10;
  assert.equal(expireIfNeeded(session, 11), true);
  assert.equal(session.stageStatus, "resolved");
  assert.equal(session.outcomes[1].expired, true);
  assert.equal(session.global.official, 0);
  assert.match(session.outcomes[1].impacts.join(" "), /unanswered records closed as unresolved/i);
});

test("role intervention is limited to once per session", () => {
  const session = createSession({ code: "TEST06" });
  const lead = addPlayer(session, { name: "Lee", role: "lead" });
  connectCrew(session);
  startShift(session);
  completeHandover(session);commitAndAdvance(session);
  const viewer = authorize(session, lead.token);
  const before = session.clock.remaining;
  applyAction(session, viewer, "INTERVENTION");
  assert.ok(session.clock.remaining >= before + 60);
  assert.throws(() => applyAction(session, viewer, "INTERVENTION"), /not available/);
});

test("Outside Run keeps the Act 3 mission locked and cannot bypass either six-module repair board", () => {
  const session = createSession({ code: "FIELD1", playerCount: 7 });
  const operations = addPlayer(session, { name: "Omar", role: "operations" });
  const signal = addPlayer(session, { name: "Sia", role: "signal" });
  connectCrew(session);
  startShift(session);
  completeHandover(session); commitAndAdvance(session);
  completeRepairStage(session);
  completeOutsidePlan(session); commitAndAdvance(session);
  update(session, { runner: "operations" });
  assert.throws(()=>update(session,{destination:"c"}),/route and equipment are locked/i);
  applyAction(session, facilitator, "COMMIT_STAGE");
  assert.ok(session.act4Intro.endsAt-session.act4Intro.startedAt>=40_000,"four-part opening must sit outside the repair clock");
  assert.equal(session.clock.running,false,"opening and atmospheric travel must sit outside the repair clock");
  assert.ok(session.fieldRun.transitionAt>session.act4Intro.endsAt);
  assert.throws(()=>applyAction(session,authorize(session,signal.token),"FIELD_INSTRUCTION",{instruction:"vent_turn"}),/after the deployment sequence/i);
  finishAct4Opening(session);
  assert.deepEqual(session.fieldRun.route,["a","b"]);
  const runnerState=publicState(session,authorize(session,operations.token));
  const stationState=publicState(session,authorize(session,signal.token));
  const sharedState=publicState(session,{kind:"public"});
  assert.equal(Object.keys(runnerState.fieldGame.modules).length,6);
  assert.equal(runnerState.fieldGame.procedures,undefined);
  assert.equal(stationState.fieldGame.modules,undefined);
  assert.ok(stationState.fieldGame.procedures.length>=1);
  assert.equal(sharedState.fieldGame,null);
  assert.equal(runnerState.environment.airMeterPpm,runnerState.fieldRun.forecast[0].ppm,"Act 4 must display the locked Act 3 service-point forecast as current reality");
  assert.equal(runnerState.environment.fieldStop.id,"a");
  assert.throws(()=>applyAction(session,authorize(session,signal.token),"FIELD_INSTRUCTION",{instruction:"vent_turn"}),/six production repair modules/i);
  assert.throws(()=>applyAction(session,authorize(session,operations.token),"FIELD_SERVICE",{action:"vent_turn_reseat"}),/six production repair modules/i);
  completeAct4Board1(session);
  assert.equal(session.fieldRun.phase,"resolved");assert.equal(session.fieldRun.currentIndex,0);
  session.fieldRun.transitionAt=0;expireIfNeeded(session);assert.equal(session.fieldRun.phase,"travel");assert.equal(session.fieldRun.currentIndex,1);
  session.fieldRun.transitionAt=0;expireIfNeeded(session);assert.equal(session.fieldRun.phase,"service");
  completeAct4Board2(session);
  assert.equal(session.fieldRun.phase,"returning");session.fieldRun.transitionAt=0;expireIfNeeded(session);
  assert.equal(session.stageStatus, "resolved");
  assert.deepEqual(session.global.fieldServices,{external_inbound_path:"restored",external_outbound_path:"restored",lower_road_camera_service:"not_restored",upper_ridge_service:"not_restored"});
  assert.equal(publicState(session,facilitator).communications.inbound,"FULL");
  assert.equal(publicState(session,facilitator).communications.outbound,"FULL");
  assert.deepEqual(session.decisions[4].route,["a","b"]);
  assert.equal(session.decisions[4].results.length,2);
});

test("Act 4 production boards verify all twelve modules, retry safely, and preserve role privacy", () => {
  const session=createSession({code:"A4FULL",playerCount:5});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  completeOutsidePlan(session,{firstLocation:"c",secondLocation:"a",tool1:"valve_wrench",tool2:"signal_meter",supportItem:"flood_kit",filterUse:99});commitAndAdvance(session);
  update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");
  assert.equal(session.fieldRun.phase,"travel");assert.equal(session.clock.running,false);
  finishAct4Opening(session);
  const runner=authorize(session,session.players.operations.token),cabin=authorize(session,session.players.lead.token);
  const runnerState=publicState(session,runner),cabinState=publicState(session,cabin),sharedState=publicState(session,{kind:"public"}),facilitatorState=publicState(session,facilitator);
  assert.equal(runnerState.fieldGame.side,"runner");assert.equal(runnerState.fieldGame.modules.three_buttons.solution,undefined);
  assert.equal(runnerState.fieldGame.modules.three_buttons.guidanceOwner.role,"lead");assert.equal(runnerState.fieldGame.modules.three_buttons.guidanceOwner.name,session.players.lead.name);
  assert.equal(cabinState.fieldGame.side,"station");assert.equal(cabinState.fieldGame.modules,undefined);assert.ok(cabinState.fieldGame.procedures.length>=1);
  assert.equal(sharedState.fieldGame,null);assert.doesNotMatch(JSON.stringify(sharedState),/"solution"|RIGHT · RIGHT/);
  assert.deepEqual(facilitatorState.fieldGame.modules.three_buttons.solution,[2,0,1,1,0,2,1,0]);
  const procedureId=cabinState.fieldGame.procedures[0].id;
  applyAction(session,cabin,"FIELD_PROCEDURE_READY",{moduleId:procedureId});
  assert.equal(publicState(session,cabin).fieldGame.procedures.find(item=>item.id===procedureId).ready,true,"cabin player receives a persistent guidance action");
  assert.equal(publicState(session,runner).fieldGame.modules[procedureId].guidanceReady,true,"runner sees that cabin guidance is ready");
  assert.ok(publicState(session,facilitator).fieldGame.readiness.lead[procedureId],"facilitator sees which cabin player transmitted guidance");
  assert.throws(()=>applyAction(session,runner,"FIELD_PROCEDURE_READY",{moduleId:procedureId}),/assigned cabin player/i);
  assert.throws(()=>applyAction(session,cabin,"FIELD_PROCEDURE_READY",{moduleId:"diagnostic_recovery"}),/not assigned/i);
  act4Input(session,"three_buttons","append",0);act4Verify(session,"three_buttons");
  assert.equal(session.fieldRun.boards[1].modules.three_buttons.completed,false);assert.deepEqual(session.fieldRun.boards[1].modules.three_buttons.queue,[]);
  completeAct4Board1(session);
  assert.equal(session.fieldRun.phase,"resolved");assert.equal(session.fieldRun.currentIndex,0);assert.equal(session.global.fieldServices.lower_road_camera_service,"restored");
  session.fieldRun.transitionAt=0;expireIfNeeded(session);assert.equal(session.fieldRun.phase,"travel");assert.equal(session.fieldRun.currentIndex,1);
  session.fieldRun.transitionAt=0;expireIfNeeded(session);assert.equal(session.fieldRun.phase,"service");assert.equal(session.fieldRun.boards[2].modules.level_sliders.completed,false);
  assert.throws(()=>act4Input(session,"load_test","test","C"),/TEST A first/);
  act4Input(session,"fuse_allocation","select","10A_DELAY");act4Input(session,"fuse_allocation","assign",undefined,{target:"PUMP"});
  act4Input(session,"fuse_allocation","select","10A_DELAY");act4Input(session,"fuse_allocation","assign",undefined,{target:"FAN"});
  assert.equal(session.fieldRun.boards[2].modules.fuse_allocation.assignments.PUMP,undefined,"an assigned physical fuse can be moved before VERIFY");
  assert.equal(session.fieldRun.boards[2].modules.fuse_allocation.assignments.FAN,"10A_DELAY");
  completeAct4Board2(session);
  assert.equal(session.fieldRun.phase,"returning");session.fieldRun.transitionAt=0;expireIfNeeded(session);
  assert.equal(session.stageStatus,"resolved");assert.equal(session.global.fieldServices.external_inbound_path,"restored");assert.equal(session.fieldRun.results.length,2);
  applyAction(session,facilitator,"RESTART_ACT4");assert.equal(session.stageStatus,"live");assert.equal(session.fieldRun,null);assert.deepEqual(session.global.outsidePlan.FIRST_LOCATION,"c");assert.equal(session.draft.runner,"operations");
});

test("Act 4 cabin allocations follow the 4–7 player matrix and rebalance Repair 2", () => {
  const expected={4:[[2,2,2],[2,2,2]],5:[[2,2,1,1],[1,1,2,2]],6:[[2,1,1,1,1],[1,1,1,1,2]],7:[[1,1,1,1,1,1],[1,1,1,1,1,1]]};
  for(const playerCount of [4,5,6,7]){
    const session=createSession({code:`A4${playerCount}PX`,playerCount});connectCrew(session);startShift(session);
    completeHandover(session);commitAndAdvance(session);completeRepairStage(session);completeOutsidePlan(session);commitAndAdvance(session);
    update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");
    for(const boardNumber of [1,2]){
      const allocation=session.fieldRun.boards[boardNumber].allocations,counts=Object.values(allocation).map(ids=>ids.length);
      assert.deepEqual(counts,expected[playerCount][boardNumber-1]);assert.equal(new Set(Object.values(allocation).flat()).size,6);
    }
  }
});

test("Act 4 seeds all four deterministic Load Test branches and keeps wrong repairs recoverable", () => {
  assert.deepEqual(new Set([0,1,2,3].map(variant=>createAct4Board(2,variant).load_test.fault)),new Set(["BEARING","DRIVE","COOLING","SUPPLY"]));
  for(const index of [0,1,2,3]){
    const session=createSession({code:`LOAD${String.fromCharCode(65+index)}`,playerCount:4});connectCrew(session);startShift(session);
    completeHandover(session);commitAndAdvance(session);completeRepairStage(session);completeOutsidePlan(session);commitAndAdvance(session);
    update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");finishAct4Opening(session);completeAct4Board1(session);
    session.fieldRun.transitionAt=0;expireIfNeeded(session);session.fieldRun.transitionAt=0;expireIfNeeded(session);
    const module=session.fieldRun.boards[2].modules.load_test;
    // The session code selects the stable branch, while the four canonical
    // variants above prove that every guide-defined fault model exists.
    act4Input(session,"load_test","test","A");
    assert.notEqual(module.meters.VIBRATION==="HIGH",module.meters.TEMPERATURE==="HIGH","TEST A exposes exactly one branch");
    const followUp=module.meters.VIBRATION==="HIGH"?"B":"C";
    assert.throws(()=>act4Input(session,"load_test","test",followUp==="B"?"C":"B"),/directs this fault/);
    act4Input(session,"load_test","test",followUp);
    const wrong=["BEARING","DRIVE","COOLING","SUPPLY"].find(item=>item!==module.fault);
    act4Input(session,"load_test","select",wrong);act4Verify(session,"load_test");
    assert.equal(module.completed,false);assert.equal(module.feedback,"REJECTED / CHECK PROCEDURE");assert.ok(module.tests.includes("A"));
    act4Input(session,"load_test","select",module.fault);act4Verify(session,"load_test");assert.equal(module.completed,true);
  }
});

test("Act 4 refresh preserves the active deadline, seeds, partial input and completed modules", () => {
  const session=createSession({code:"A4SAVE",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);completeOutsidePlan(session);commitAndAdvance(session);
  update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");finishAct4Opening(session);
  for(const value of [2,0,1,1,0,2,1,0])act4Input(session,"three_buttons","append",value);act4Verify(session,"three_buttons");
  act4Input(session,"route_controls","append","right");act4Input(session,"route_controls","append","right");
  const deadline=session.clock.endAt,seed=structuredClone(session.fieldRun.boards[1].modules.calibration_dials),saved=structuredClone(session);
  const restored=publicState(saved,authorize(saved,saved.players.operations.token));
  assert.equal(saved.clock.endAt,deadline);assert.deepEqual(saved.fieldRun.boards[1].modules.calibration_dials,seed);
  assert.equal(restored.fieldGame.modules.three_buttons.completed,true);assert.deepEqual(restored.fieldGame.modules.route_controls.queue,["right","right"]);
});

test("all four field games are distinct and create only the specified operational outcomes", () => {
  assert.equal(new Set(Object.values(FIELD_GAMES).map(game=>game.type)).size,4);
  for(const game of Object.values(FIELD_GAMES)){
    assert.equal(game.manual.length,3);
    assert.equal(game.actions.length,3);
  }

  const cd=createSession({code:"FIELD2",playerCount:4});connectCrew(cd);startShift(cd);
  completeHandover(cd);commitAndAdvance(cd);completeRepairStage(cd);
  completeOutsidePlan(cd,{firstLocation:"c",secondLocation:"a",tool1:"valve_wrench",tool2:"signal_meter",supportItem:"flood_kit",filterUse:99});commitAndAdvance(cd);
  update(cd,{runner:"operations"});applyAction(cd,facilitator,"COMMIT_STAGE");completeActiveFieldRun(cd);
  assert.equal(cd.global.fieldServices.lower_road_camera_service,"restored");
  assert.equal(cd.global.externalStatus.lower_road_camera_history,"working");
  const knowledge=cd.fieldRun.results.flatMap(result=>result.knowledge).join(" ");
  assert.match(knowledge,/Mara reached Lower Route.*headed back toward Blackout Ridge/i);
  assert.doesNotMatch(knowledge,/current location|trapped|beneath the cabin|R-12/i);

  const aux=createSession({code:"FIELD5",playerCount:4});connectCrew(aux);startShift(aux);
  completeHandover(aux);commitAndAdvance(aux);completeRepairStage(aux);
  completeOutsidePlan(aux,{firstLocation:"d",secondLocation:"a",tool1:"torque_wrench",tool2:"signal_meter",supportItem:"climbing_kit",filterUse:87});commitAndAdvance(aux);
  update(aux,{runner:"operations"});applyAction(aux,facilitator,"COMMIT_STAGE");completeActiveFieldRun(aux);
  assert.equal(aux.global.fieldServices.upper_ridge_service,"restored");
  assert.equal(aux.global.externalStatus.ventilation_path,"working");

  const ab=createSession({code:"FIELD3",playerCount:4});connectCrew(ab);startShift(ab);
  completeHandover(ab);commitAndAdvance(ab);completeRepairStage(ab,{fail:["inbound_receive"]});
  completeOutsidePlan(ab);commitAndAdvance(ab);update(ab,{runner:"operations"});applyAction(ab,facilitator,"COMMIT_STAGE");
  completeActiveFieldRun(ab,{fail:["a"]});
  assert.equal(ab.global.fieldServices.external_inbound_path,"not_restored");
  assert.equal(ab.global.fieldServices.external_outbound_path,"restored");
  assert.equal(publicState(ab,facilitator).communications.inbound,"OFF");
  assert.equal(publicState(ab,facilitator).communications.outbound,"FULL");
  assert.equal(ab.fieldRun.results.length,2);
  assert.match(ab.outcomes[4].detail,/no destination is labelled right or wrong/i);
});

test("restored external paths inherit Act 2 station-side quality", () => {
  const session=createSession({code:"FIELD4",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session,{fail:["inbound_receive","human_outbound"]});
  completeOutsidePlan(session);commitAndAdvance(session);update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");completeActiveFieldRun(session);
  assert.equal(publicState(session,facilitator).communications.inbound,"DEGRADED");
  assert.equal(publicState(session,facilitator).communications.outbound,"DEGRADED");
  assert.equal(session.global.externalStatus.external_inbound,"fault");
  assert.equal(session.global.externalStatus.external_human_outbound,"fault");
});

test("Act 6 is a timed two-phase local investigation with no scored submission", () => {
  const session=createSession({code:"LARK01",playerCount:4});connectCrew(session);
  session.status="stage";session.stage=6;session.stageStatus="live";session.global.act6InvestigationTime=240;
  session.act6Intro={startedAt:0,endsAt:12_000};
  session.global.systemStatus.air_quality="broken";session.global.fieldServices.upper_ridge_service="restored";
  session.clock={duration:240,remaining:240,running:false,endAt:null};
  let history=publicState(session,facilitator);
  assert.equal(history.archive.phase,"opening");
  expireIfNeeded(session,session.act6Intro.endsAt+1);history=publicState(session,facilitator);
  assert.equal(history.archive.phase,"history");
  assert.equal(history.archive.exactDeadline,false);
  assert.equal(history.archive.documents.length,6);
  assert.ok(history.archive.documents.some(item=>item.id==="newsreel"&&item.audio));
  assert.ok(history.archive.documents.every(item=>item.phase==="history"));
  assert.throws(()=>applyAction(session,facilitator,"COMMIT_STAGE"),/automatically/);
  assert.throws(()=>applyAction(session,facilitator,"UPDATE_DRAFT",{invalid:"operational"}),/read-only archive/);
  session.archiveRun.nightmareAt=120_000;session.clock.running=true;session.clock.endAt=240_000;
  assert.equal(expireIfNeeded(session,121_000),true);
  const nightmare=publicState(session,facilitator);
  assert.equal(nightmare.archive.phase,"nightmare");
  assert.equal(nightmare.clock.running,false);
  assert.equal(expireIfNeeded(session,nightmare.archive.nightmare.endsAt+1),true);
  const technical=publicState(session,facilitator);
  assert.equal(technical.archive.phase,"technical");
  assert.deepEqual(technical.archive.checklist,["ACCESS HATCH","CHAMBER SEAL","EMERGENCY PURGE"]);
  const archiveText=technical.archive.documents.map(item=>`${item.title} ${item.summary} ${item.detail}`).join(" ");
  assert.equal(technical.archive.documents.length,3);
  for(const phrase of ["refuge, not an escape tunnel","shared serial receiver","exactly one successful capsule purge","does not purge R-12","1.00–1.30 bar","square upper hatch"] ) assert.match(archiveText,new RegExp(phrase,"i"));
  session.clock.endAt=Date.now()-1;
  assert.equal(expireIfNeeded(session,Date.now()),true);
  assert.equal(session.stage,6);
  assert.equal(session.stageStatus,"resolved");
  assert.equal(publicState(session,facilitator).facilitatorCanAdvance,true);
  assert.equal(session.global.correction,"none");
  assert.deepEqual(session.decisions[6],{investigationWindow:240});
  assert.match(session.history.at(-1).text,/Stage 6 resolved/i);
  assert.equal("documents" in session.decisions[6],false);
  applyAction(session,facilitator,"ADVANCE_STAGE");
  assert.equal(session.stage,7);assert.equal(session.stageStatus,"live");assert.ok(session.finaleRun);
});

test("Act 6 archive is identical for all members and independent of inbound traffic", () => {
  const session=createSession({code:"LARK02",playerCount:4});connectCrew(session);
  session.status="stage";session.stage=6;session.stageStatus="live";session.clock={duration:180,remaining:180,running:false,endAt:null};
  session.global.fieldServices.external_inbound_path="not_restored";
  const facilitatorArchive=publicState(session,facilitator).archive;
  for(const role of rolesByCount[4])assert.deepEqual(publicState(session,authorize(session,session.players[role].token)).archive,facilitatorArchive);
  assert.equal(publicState(session,{kind:"public"}).signalTransmission.integrity,0);
  assert.equal(facilitatorArchive.documents.length,ACT6_HISTORY_ARCHIVE.length);
  assert.ok(existsSync(new URL("../prototype/assets/audio/act6-lark-newsreel.wav",import.meta.url)));
});

test("calculating the finale opens the final consequence modal before confirmation", () => {
  const session = createSession({ code: "FINAL1", playerCount: 4 });
  connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";session.global.systemStatus.status_beacon="working";session.global.systemStatus.human_outbound="working";session.global.fieldServices.external_outbound_path="restored";session.global.fieldServices.upper_ridge_service="restored";
  publicState(session,facilitator);completeProductionFinale(session,{confirm:false});
  assert.equal(session.status,"stage");assert.equal(session.stageStatus,"resolved");assert.equal(session.ending,null);
  assert.equal(session.pendingEnding.title,"SHUTTERS OPEN");assert.equal(publicState(session,facilitator).facilitatorCanConfirmEnding,true);
  applyAction(session,facilitator,"CONFIRM_ENDING");
  assert.equal(session.status,"ending");assert.equal(session.ending.title,"SHUTTERS OPEN");assert.equal(session.pendingEnding,null);
});

test("facilitator can mark absence and reassign a connected operator with an audit trail", () => {
  const session=createSession({code:"ADMIN1",playerCount:7});
  const player=addPlayer(session,{name:"Rae",role:"operations"});
  applyAction(session,facilitator,"SET_ABSENT",{role:"operations",absent:true});
  assert.equal(session.absentRoles.operations,true);
  assert.throws(()=>applyAction(session,authorize(session,player.token),"INTERVENTION"),/observer mode/);
  applyAction(session,facilitator,"REASSIGN_PLAYER",{from:"operations",to:"field"});
  assert.equal(authorize(session,player.token).role,"field");
  assert.match(session.history.at(-1).text,/reassigned/);
});

test("a shift cannot start until every configured terminal is connected", () => {
  const session=createSession({code:"CREW01",playerCount:4});
  addPlayer(session,{name:"Avery",role:"lead"});
  assert.throws(()=>applyAction(session,facilitator,"START_GAME"),/all 4 crew terminals/);
  addPlayer(session,{name:"Noor",role:"signal"});
  addPlayer(session,{name:"Rin",role:"systems"});
  addPlayer(session,{name:"Jordan",role:"operations"});
  applyAction(session,facilitator,"START_GAME");
  assert.equal(session.stage,1);
});

test("facilitator can launch a complete direct Act 4 test only after every crew terminal is ready", () => {
  for(const part of [1,2,3,4])assert.ok(existsSync(new URL(`../prototype/assets/video/act4/4-${part}.mp4`,import.meta.url)),`Act 4 opening clip ${part} must be packaged`);
  const incomplete=createSession({code:"A4TEST",playerCount:4});
  const lead=addPlayer(incomplete,{name:"Avery",role:"lead"});
  assert.throws(()=>applyAction(incomplete,facilitator,"START_ACT4_TEST"),/all 4 crew terminals/i);
  assert.throws(()=>applyAction(incomplete,authorize(incomplete,lead.token),"START_ACT4_TEST"),/not available/i);

  const session=createSession({code:"A4READY",playerCount:4});connectCrew(session);
  applyAction(session,facilitator,"START_ACT4_TEST");
  assert.equal(session.stage,4);assert.equal(session.stageStatus,"live");assert.equal(session.testMode.act,4);
  assert.deepEqual(session.fieldRun.route,["c","a"]);assert.equal(session.fieldRun.runner,"operations");
  assert.equal(session.fieldRun.repairAllowance,360);assert.equal(session.fieldRun.phase,"travel");assert.equal(session.clock.running,false);
  assert.ok(session.act4Intro.endsAt>session.act4Intro.startedAt);
  assert.ok(session.act4Intro.endsAt-session.act4Intro.startedAt>=40_000,"all four ten-second Act 4 films must play before the field clock starts");
  assert.equal(Object.keys(session.fieldRun.boards[1].modules).length,6);assert.equal(Object.keys(session.fieldRun.boards[2].modules).length,6);
  assert.equal(publicState(session,facilitator).testMode.act,4);
  for(const role of rolesByCount[4]){
    const playerState=publicState(session,authorize(session,session.players[role].token));
    assert.equal(playerState.stage,4,`${role} must move to Act 4 with the facilitator`);
    assert.equal(playerState.act4Intro.startedAt,session.act4Intro.startedAt,`${role} must share the synchronized opening timestamp`);
  }
  const roomState=publicState(session,{kind:"public"});
  assert.equal(roomState.stage,4,"the room display must move to Act 4 with the crew");
  assert.equal(roomState.act4Intro.startedAt,session.act4Intro.startedAt,"the room display must share the synchronized opening timestamp");
  assert.equal(publicState(session,authorize(session,session.players.operations.token)).fieldGame,null,"opening keeps the runner board sealed");
});

test("Act 1 lead-in holds the complete six-minute handover window until the video ends", () => {
  const session=createSession({code:"VIDEO1",playerCount:4});connectCrew(session);
  applyAction(session,facilitator,"START_GAME");
  const state=publicState(session,facilitator);
  assert.equal(state.stage,1);
  assert.ok(state.act1Intro.endsAt-state.act1Intro.startedAt>=30_000);
  assert.equal(state.clock.duration,360);
  assert.equal(state.clock.remaining,360);
  assert.ok(session.clock.endAt-state.act1Intro.endsAt>=360_000);
});

test("Act 2 opening holds the complete three-minute prioritisation window until the strike sequence ends", () => {
  assert.ok(existsSync(new URL("../prototype/assets/video/act2.mp4",import.meta.url)),"Act 2 opening film must be packaged");
  const session=createSession({code:"A2OPEN",playerCount:4});connectCrew(session);
  applyAction(session,facilitator,"START_GAME");
  completeHandover(session);applyAction(session,facilitator,"COMMIT_STAGE");applyAction(session,facilitator,"ADVANCE_STAGE");
  const state=publicState(session,facilitator);
  assert.equal(state.stage,2);
  assert.equal(state.act2Intro.endsAt-state.act2Intro.startedAt,20_000);
  assert.equal(state.clock.duration,180);
  assert.equal(state.clock.remaining,180);
  assert.equal(session.repairRun.planningStartedAt,state.act2Intro.endsAt);
  assert.ok(session.clock.endAt-state.act2Intro.endsAt>=180_000);
});

test("Act 1 timed audio cues trigger synchronized state broadcasts and then clear", () => {
  const session=createSession({code:"AUDIO1",playerCount:4});connectCrew(session);
  applyAction(session,facilitator,"START_GAME");
  const firstCueAt=session.act1Intro.endsAt+20_000;
  assert.equal(expireIfNeeded(session,firstCueAt),true);
  assert.equal(session.act1ActiveTransmission,"carrier-check");
  assert.equal(publicState(session,facilitator).signalTransmission.id,"carrier-check");
  assert.equal(expireIfNeeded(session,firstCueAt+18_000),true);
  assert.equal(session.act1ActiveTransmission,null);
  assert.equal(publicState(session,facilitator).signalTransmission,null);
});

test("facilitator can restart a completed session with the same crew links and clean state", () => {
  const session=createSession({code:"REPLAY",playerCount:4});connectCrew(session);
  const facilitatorToken=session.facilitatorToken,playerTokens=Object.fromEntries(Object.entries(session.players).map(([role,player])=>[role,player.token]));
  session.status="ending";session.stage=7;session.stageStatus="resolved";session.ending={title:"CLEAN RESCUE"};session.chatMessages=[{text:"old run"}];session.outcomes={1:{headline:"old"}};session.decisions={1:{handover:{}}};
  assert.throws(()=>applyAction(session,authorize(session,session.players.lead.token),"RESTART_SESSION"),/not available/);
  applyAction(session,facilitator,"RESTART_SESSION");
  assert.equal(session.code,"REPLAY");assert.equal(session.facilitatorToken,facilitatorToken);assert.equal(session.stage,1);assert.equal(session.stageStatus,"live");
  assert.deepEqual(Object.fromEntries(Object.entries(session.players).map(([role,player])=>[role,player.token])),playerTokens);
  assert.deepEqual(session.chatMessages,[]);assert.deepEqual(session.outcomes,{});assert.deepEqual(session.decisions,{});assert.equal(session.ending,null);assert.equal(session.clock.running,true);
});

test("facilitator can restart from the first final outcome before confirming the final record", () => {
  const session=createSession({code:"EARLYR",playerCount:4});connectCrew(session);
  session.status="stage";session.stage=7;session.stageStatus="resolved";session.pendingEnding={title:"CLEAN RESCUE"};session.outcomes={7:{headline:"Complete"}};
  applyAction(session,facilitator,"RESTART_SESSION");
  assert.equal(session.status,"stage");assert.equal(session.stage,1);assert.equal(session.stageStatus,"live");assert.equal(session.pendingEnding,null);assert.deepEqual(session.outcomes,{});
});

test("facilitator can restart from an intermediate stage consequence", () => {
  const session=createSession({code:"ACTONE",playerCount:4});connectCrew(session);startShift(session);
  session.stageStatus="resolved";session.clock.running=false;session.outcomes={1:{headline:"Handover window closed"}};
  const player=authorize(session,session.players.lead.token);
  assert.throws(()=>applyAction(session,player,"RESTART_SESSION"),/not available/);
  applyAction(session,facilitator,"RESTART_SESSION");
  assert.equal(session.code,"ACTONE");assert.equal(session.stage,1);assert.equal(session.stageStatus,"live");
  assert.deepEqual(session.outcomes,{});assert.equal(session.clock.running,true);
});

test("server rejects forged and incomplete decision payloads", () => {
  const session=createSession({code:"RULES1",playerCount:4});connectCrew(session);startShift(session);
  assert.throws(()=>update(session,{handover:{forged:"yes"}}),/invalid/);
  update(session,{handover:{ellie:"yes",mara:"no"}});
  assert.throws(()=>applyAction(session,facilitator,"COMMIT_STAGE"),/all six outgoing staff/);
  completeHandover(session);commitAndAdvance(session);
  completeRepairStage(session);
  update(session,{firstLocation:"c",secondLocation:"d",tool1:"valve_wrench",tool2:"torque_wrench",supportItem:"flood_kit",filterUse:105});
  assert.throws(()=>applyAction(session,facilitator,"ACT3_COMMIT_DEPLOYMENT"),/different support items/i);
});

test("role interventions apply distinct persistent effects", () => {
  const session=createSession({code:"ROLEFX",playerCount:7});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  const protocol=authorize(session,session.players.protocol.token),comms=authorize(session,session.players.comms.token),systems=authorize(session,session.players.systems.token);
  applyAction(session,protocol,"INTERVENTION");
  applyAction(session,comms,"INTERVENTION");
  applyAction(session,systems,"INTERVENTION");
  assert.equal(session.resources.safetyGuard,1);
  assert.equal(session.global.trust,1);
  assert.ok(session.global.evidence.includes("Dependency traced"));
  assert.match(session.interventionFeedback.protocol,/SAFETY CONDITION/);
});

test("four- and five-player configurations expose only valid combined terminals", () => {
  const four=createSession({code:"FOUR01",playerCount:4});connectCrew(four);
  assert.deepEqual(Object.keys(publicState(four,facilitator).roles),rolesByCount[4]);
  assert.equal(publicState(four,facilitator).roles.lead.name,"Command & Protocol");
  assert.equal(publicState(four,facilitator).roles.operations.name,"Operations & Field");
  assert.throws(()=>addPlayer(four,{name:"Extra",role:"field"}),/not available/);
  startShift(four);
  const fourLead={privateCard:roleCard(2,"lead",4),debrief:publicState(four,authorize(four,four.players.lead.token)).debrief};
  assert.match(fourLead.privateCard.body,/LEAD —/);
  assert.match(fourLead.privateCard.body,/PRO —/);
  assert.doesNotMatch(fourLead.privateCard.body,/COMMS —/);
  assert.deepEqual(fourLead.debrief.roleMap.lead.areas,["Self-readiness","Risk and guardrails"]);
  four.stage=6;four.stageStatus="resolved";
  applyAction(four,facilitator,"ADVANCE_STAGE");
  assert.equal(four.finaleRun.order.length,4);

  const five=createSession({code:"FIVE01",playerCount:5});connectCrew(five);startShift(five);
  assert.equal(publicState(five,facilitator).roles.field.name,"Field & Protocol");
  assert.match(roleCard(2,"field",5).body,/FIELD —|PRO —/);
  assert.doesNotMatch(roleCard(2,"lead",5).body,/COMMS —/);
});

test("the impossible Act 3 transmission stays unidentified and cannot solve the plan", () => {
  const session=createSession({code:"SIG001",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  assert.equal(publicState(session,{kind:"public"}).signalTransmission,null);
  applyAction(session,facilitator,"ACT3_TRIGGER_VOICE");
  const signal=publicState(session,{kind:"public"}).signalTransmission;
  assert.equal(signal.source,"SOURCE NOT IDENTIFIED");
  assert.equal(signal.preserved,false);
  assert.equal(signal.transcript,"Can anyone hear me?");
  assert.match(signal.instruction,/NOT LOGGED.*CANNOT REPLAY/i);
  assert.doesNotMatch(signal.transcript,/Mara|North Mast|East Service/i);
  assert.throws(()=>applyAction(session,facilitator,"ACT3_TRIGGER_VOICE"),/already played/i);
});

test("finale distinguishes clean rescue from a catastrophic Lark Shift echo", () => {
  const make=(code,good)=>{const session=createSession({code,playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";session.global.systemStatus.status_beacon=good?"working":"broken";session.global.systemStatus.human_outbound=good?"working":"broken";session.global.fieldServices.external_outbound_path=good?"restored":"not_restored";session.global.fieldServices.upper_ridge_service=good?"restored":"not_restored";publicState(session,facilitator);completeProductionFinale(session,{good,timeouts:!good});return session;};
  const clean=make("COST01",true);assert.equal(clean.ending.title,"SHUTTERS OPEN");assert.equal(clean.ending.calculation.film,"F01");assert.equal(clean.ending.calculation.release,"OPEN");
  const lark=make("JOIN01",false);assert.equal(lark.ending.title,"LARK SHIFT REPEATS");assert.equal(lark.ending.calculation.film,"F04");assert.equal(lark.ending.calculation.release,"SECURE ISOLATION");
});

test("guide finale priority maps controls to stable F01–F05 families",()=>{
  const finale=(code,{beacon="working",outbound="working",path="restored",upper="not_restored",good=true,rating="clear",timeouts=false,controls=null}={})=>{
    const session=createSession({code,playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";
    session.global.systemStatus.status_beacon=beacon;session.global.systemStatus.human_outbound=outbound;session.global.fieldServices.external_outbound_path=path;session.global.fieldServices.upper_ridge_service=upper;
    publicState(session,facilitator);completeProductionFinale(session,{good,messageRating:rating,timeouts,controls});return session.ending;
  };
  assert.equal(finale("BANDC1",{controls:{green:true}}).calculation.film,"F01");
  assert.equal(finale("BANDL1",{good:false,controls:{blue:true}}).calculation.film,"F04");
  assert.equal(finale("BANDV1",{controls:{blue:true,white:true,message:"CREW IN R-12. UNSAFE AIR. EXTRACT US."}}).calculation.film,"F03");
  assert.equal(finale("BANDF1",{good:false,controls:{red:true}}).calculation.film,"F02");
  assert.equal(finale("BANDD1",{good:false,beacon:"broken",outbound:"broken",path:"not_restored",controls:{}}).calculation.film,"F05");
});

test("every supported crew size can complete all seven production acts",()=>{
  for(const playerCount of [4,5,6,7]){
    const session=createSession({code:`SIZE${playerCount}X`,playerCount});connectCrew(session);startShift(session);
    completeHandover(session);commitAndAdvance(session);completeRepairStage(session);completeOutsidePlan(session);commitAndAdvance(session);
    update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");completeActiveFieldRun(session);
    applyAction(session,facilitator,"ADVANCE_STAGE");commitAndAdvance(session);commitAndAdvance(session);completeProductionFinale(session);
    assert.equal(session.stage,7);assert.equal(session.stageStatus,"resolved");assert.equal(session.status,"ending");assert.ok(session.ending?.band);
  }
});

test("Act 7 accepts one voluntary claimant and isolates each player after transfer", () => {
  const session=createSession({code:"ISO701",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";publicState(session,facilitator);
  for(const role of rolesByCount[4])assert.equal(publicState(session,authorize(session,session.players[role].token)).finale.canBegin,true,`${role} can claim the free chamber`);
  const first="lead",firstViewer=authorize(session,session.players[first].token),other="signal",otherViewer=authorize(session,session.players[other].token);
  assert.equal(publicState(session,firstViewer).finale.canBegin,true);applyAction(session,firstViewer,"BEGIN_DESCENT");
  assert.equal(publicState(session,firstViewer).finale.mode,"walk");assert.equal(publicState(session,otherViewer).finale.mode,"waiting");
  assert.equal("order" in publicState(session,{kind:"public"}).finale,false);
  assert.throws(()=>applyAction(session,otherViewer,"BEGIN_DESCENT"),/not available/);
  expireIfNeeded(session,session.finaleRun.walkEndsAt+1);
  assert.throws(()=>applyAction(session,firstViewer,"TRANSFER_STEP",{step:"wheel"}),/physical key, hatch, seal and purge/i);
  const wrong=session.finaleRun.mechanics.keys.find(item=>!item.correct);applyAction(session,firstViewer,"ACT7_MECHANIC",{action:"select_key",keyId:wrong.id});applyAction(session,firstViewer,"ACT7_MECHANIC",{action:"insert_key"});assert.throws(()=>applyAction(session,firstViewer,"ACT7_MECHANIC",{action:"turn_key"}),/does not match/i);assert.equal(session.finaleRun.transferMistakes,1);
  completePhysicalTransfer(session,firstViewer);
  const isolated=publicState(session,firstViewer);assert.equal(isolated.finale.mode,"below");assert.equal(isolated.finale.communicationLocked,true);assert.deepEqual(isolated.chatMessages,[]);
  assert.throws(()=>applyAction(session,firstViewer,"CHAT_MESSAGE",{message:"coach"}),/isolated/);
});

test("Act 7 physical transfer enforces key, hatch, seal pressure and purge order", () => {
  const session=createSession({code:"PHYS07",playerCount:4});connectCrew(session);
  session.status="stage";session.stage=7;session.stageStatus="live";session.global.fieldServices.upper_ridge_service="restored";
  session.clock={duration:60,remaining:60,running:true,endAt:Date.now()+60000};
  let state=publicState(session,facilitator);const role="lead",viewer=claimNextTransfer(session,role);
  state=publicState(session,viewer);const mechanics=state.finale.mechanics;assert.equal(mechanics.keys.some(item=>"correct" in item),false);assert.equal(typeof mechanics.receiverReady,"boolean");const key=session.finaleRun.mechanics.keys.find(item=>item.correct);
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"select_key",keyId:key.id});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"insert_key"});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"turn_key"});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"set_hatch",value:.48});
  assert.equal(publicState(session,viewer).finale.mechanics.hatchOpen,.48);
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"set_hatch",value:1});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"enter_hatch"});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"set_close",value:.65});
  assert.equal(publicState(session,viewer).finale.mechanics.seal.closed,false);
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"set_close",value:1});
  assert.throws(()=>applyAction(session,viewer,"ACT7_MECHANIC",{action:"test_seal"}),/clamp|pressure/i);
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"set_clamp",value:1});
  for(let index=0;index<8;index++)applyAction(session,viewer,"ACT7_MECHANIC",{action:"fill"});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"hold"});
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"test_seal"});
  let afterSeal=publicState(session,viewer);assert.equal(afterSeal.finale.mechanics.phase,"purge");
  const target=afterSeal.finale.mechanics.purge.target;for(let charge=0;charge<target;charge+=4)applyAction(session,viewer,"ACT7_MECHANIC",{action:"shake",amount:4});
  const reserveBefore=session.finaleRun.reserve;
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"fire_purge"});
  assert.ok(session.finaleRun.reserve<reserveBefore);
  assert.equal(publicState(session,viewer).finale.mechanics.phase,"r12");
  applyAction(session,viewer,"ACT7_MECHANIC",{action:"enter_r12"});
  assert.equal(session.finaleRun.below.includes(role),true);
});

test("Act 7 purge cleans only the active capsule and preserves existing R-12 load", () => {
  const session=createSession({code:"AIR071",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";publicState(session,facilitator);
  const viewer=claimNextTransfer(session,"lead");session.finaleRun.contamination=50;
  completePhysicalTransfer(session,viewer);
  const transfer=session.finaleRun.transfers[0];
  assert.equal(session.finaleRun.contamination,50);
  assert.ok(transfer.chamberContamination>0);
  assert.equal(transfer.purgeRemoval,22);
  assert.equal(transfer.contamination,0);
});

test("Act 7 CCTV events unlock by arrival, play once, and remain offline", () => {
  const session=createSession({code:"CAM071",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";publicState(session,facilitator);
  const first=claimNextTransfer(session,"lead");completePhysicalTransfer(session,first);
  assert.equal(publicState(session,first).finale.r12.cameras[1].status,"locked");
  completePhysicalTransfer(session,claimNextTransfer(session,"signal"));
  assert.equal(publicState(session,first).finale.r12.cameras[1].status,"available");
  assert.equal(publicState(session,first).finale.r12.cameras[2].status,"locked");
  applyAction(session,first,"R12_CAMERA",{camera:1});
  assert.equal(publicState(session,first).finale.r12.cameras[1].status,"available");
  applyAction(session,first,"R12_CAMERA",{camera:1,watch:true});
  assert.equal(publicState(session,first).finale.r12.cameras[1].status,"offline");
  applyAction(session,first,"R12_CAMERA",{camera:1});
  assert.equal(publicState(session,first).finale.r12.cameras[1].status,"offline");
});

test("GREEN closes the final decision immediately on the authoritative server", () => {
  const session=createSession({code:"GRN071",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";publicState(session,facilitator);
  for(const role of rolesByCount[4])completePhysicalTransfer(session,claimNextTransfer(session,role));
  expireIfNeeded(session,session.finaleRun.powerFailureEndsAt+1);
  const viewer=authorize(session,session.players.lead.token);
  applyAction(session,viewer,"UPDATE_SURFACE",{green:true});
  assert.equal(session.finaleRun.phase,"blackout");
  assert.equal(session.finaleRun.surfaceCommitted.green,true);
  assert.throws(()=>applyAction(session,viewer,"UPDATE_SURFACE",{red:true}),/not active/i);
});

test("Act 7 keeps finite masks shared and preserves individual exposure into R-12", () => {
  const session=createSession({code:"MASK71",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";publicState(session,facilitator);
  const current="lead",waiting="signal",viewer=authorize(session,session.players[waiting].token);
  assert.equal(session.finaleRun.masks.length,2);
  applyAction(session,viewer,"ACT7_MASK",{action:"connect_mask",maskId:1});
  assert.equal(session.finaleRun.crew[waiting].maskId,1);
  assert.equal(publicState(session,viewer).finale.masks.filter(mask=>!mask.occupied).length,1);
  session.finaleRun.exposureUpdatedAt=Date.now()-1000;const masked=publicState(session,facilitator).finale.exposure.find(item=>item.role===waiting).exposure;
  applyAction(session,viewer,"ACT7_MASK",{action:"release_mask"});
  session.finaleRun.exposureUpdatedAt=Date.now()-1000;const unmasked=publicState(session,facilitator).finale.exposure.find(item=>item.role===waiting).exposure;
  assert.ok(unmasked>masked);
  const currentViewer=claimNextTransfer(session,current);completePhysicalTransfer(session,currentViewer);
  assert.equal(session.finaleRun.masks.some(mask=>mask.role===current),false);
  assert.ok(session.finaleRun.transfers[0].exposure>=session.finaleRun.crew[current].initialExposure);
  const inside=authorize(session,session.players[current].token);applyAction(session,inside,"R12_HOTSPOT",{hotspot:"mara"});
  assert.equal(publicState(session,inside).finale.hotspots.mara!==undefined,true);
  assert.throws(()=>applyAction(session,viewer,"R12_HOTSPOT",{hotspot:"mara"}),/inside R-12/);
});

test("Act 7 exposes no extra R-12 purge action after capsule transfer", () => {
  const session=createSession({code:"PURG71",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";publicState(session,facilitator);
  const first="lead",viewer=claimNextTransfer(session,first);completePhysicalTransfer(session,viewer);
  const state=publicState(session,viewer).finale;
  assert.equal("purgeRemaining" in state,false);
  assert.equal("canPurge" in state,false);
  assert.throws(()=>applyAction(session,viewer,"R12_PURGE"),/not available/i);
});

test("pausing the finale freezes transfer exposure time", () => {
  const session=createSession({code:"PAUS71",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";publicState(session,facilitator);
  const role="lead",viewer=claimNextTransfer(session,role);
  session.finaleRun.transferStartedAt=Date.now()-20000;
  applyAction(session,facilitator,"PAUSE");
  const frozen=session.finaleRun.transferElapsedBeforePause;
  assert.ok(frozen>=19&&frozen<=21);
  session.finaleRun.transferStartedAt=Date.now()-59000;
  applyAction(session,facilitator,"RESUME");
  completePhysicalTransfer(session,viewer);
  assert.ok(session.finaleRun.transfers[0].seconds>=19&&session.finaleRun.transfers[0].seconds<=22);
});

test("all-arrived console snapshots controls and timeout enters blackout", () => {
  const session=createSession({code:"SURF71",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";session.global.systemStatus.status_beacon="broken";session.global.systemStatus.human_outbound="working";session.global.fieldServices.external_outbound_path="restored";publicState(session,facilitator);
  for(const role of rolesByCount[4])completePhysicalTransfer(session,claimNextTransfer(session,role));
  assert.equal(session.finaleRun.phase,"power_failure");
  const powerFailure=publicState(session,facilitator).finale.powerFailure;
  assert.equal(powerFailure.startedAt,session.finaleRun.powerFailureStartedAt);assert.equal(powerFailure.endsAt,session.finaleRun.powerFailureEndsAt);
  expireIfNeeded(session,session.finaleRun.powerFailureEndsAt+1);assert.equal(session.finaleRun.phase,"console");
  const operator=authorize(session,session.players.lead.token);applyAction(session,operator,"UPDATE_SURFACE",{red:true,white:true,message:"CREW R-12. TOXIC SURFACE. EXTERNAL EXTRACTION REQUIRED."});
  session.clock.endAt=1;expireIfNeeded(session,2);assert.equal(session.finaleRun.phase,"blackout");assert.equal(session.finaleRun.surfaceCommitted.timedOut,true);
  applyAction(session,facilitator,"CLASSIFY_MESSAGE",{rating:"clear"});applyAction(session,facilitator,"CALCULATE_ENDING");
  assert.equal(session.stageStatus,"resolved");assert.equal(session.decisions[7].external.status,"OPERATIONAL / NO ACTIVE DISTRESS");assert.equal(session.decisions[7].external.message,"CLEAR");assert.equal(session.finaleRun.transfers.length,4);
});

test("six-step debrief is synchronized, private-safe, and captures each first action", () => {
  const session=createSession({code:"DBRF01",playerCount:4});
  const lead=addPlayer(session,{name:"Avery",role:"lead"});
  addPlayer(session,{name:"Noor",role:"signal"});
  session.status="ending";session.ending={title:"CLOSE / SEVERE RESCUE",band:"severe"};
  applyAction(session,facilitator,"SET_DEBRIEF_STEP",{step:5});
  applyAction(session,facilitator,"SAVE_DEBRIEF_NOTE",{step:5,note:"The vendor confidence label hid a human verification gap."});
  const player=authorize(session,lead.token);
  applyAction(session,player,"SAVE_FIRST_STEP",{note:"Ask who verified the weekly automated safety status."});
  const facilitatorState=publicState(session,facilitator),playerState=publicState(session,player);
  assert.equal(facilitatorState.debrief.steps.length,6);
  assert.equal(facilitatorState.debrief.currentStep,5);
  assert.match(facilitatorState.debrief.notes[5],/confidence label/);
  assert.equal(playerState.debrief.notes,undefined);
  assert.match(playerState.debrief.firstSteps.lead.note,/who verified/);
  assert.throws(()=>applyAction(session,player,"SET_DEBRIEF_STEP",{step:6}),/not available/);
});

test("readiness lenses and prototype viability evidence remain facilitator-controlled", () => {
  const session=createSession({code:"PILOT1",playerCount:4});
  const lead=addPlayer(session,{name:"Avery",role:"lead"});addPlayer(session,{name:"Noor",role:"signal"});
  session.status="ending";session.ending={title:"FILED SAFE"};
  applyAction(session,facilitator,"TOGGLE_PROFILE_SIGNAL",{id:"practical_sceptic"});
  applyAction(session,facilitator,"SAVE_PLAYTEST",{ratings:{clarity:4,thrill:4,survival:3,ai_alignment:2,facilitation:3,role_value:4,remote_fit:3},disposition:"kill_reframe",notes:"Players enjoyed the horror but could not explain the workplace transfer."});
  const facilitatorState=publicState(session,facilitator),playerState=publicState(session,authorize(session,lead.token));
  assert.deepEqual(facilitatorState.debrief.profileSignals,["practical_sceptic"]);
  assert.equal(facilitatorState.playtest.criteria.length,7);
  assert.equal(facilitatorState.playtest.needsReframe,true);
  assert.equal(playerState.playtest,undefined);
});

test("Outside Run gives each locked repair its own allowance and fails forward without route substitution", () => {
  const session=createSession({code:"TIME41",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  completeOutsidePlan(session,{firstLocation:"d",secondLocation:"a",tool1:"torque_wrench",tool2:"signal_meter",supportItem:"climbing_kit",filterUse:87});commitAndAdvance(session);
  update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");
  assert.equal(session.clock.duration,360);
  finishAct4Opening(session);
  session.clock.running=true;session.clock.endAt=Date.now()-1;
  assert.equal(expireIfNeeded(session),true);
  assert.equal(session.stageStatus,"live");
  assert.equal(session.fieldRun.phase,"resolved");assert.equal(session.fieldRun.currentIndex,0);
  assert.equal(session.fieldRun.results.length,1);
  assert.equal(session.fieldRun.results[0].locationId,"d");
  assert.equal(session.clock.duration,360);
  session.fieldRun.transitionAt=0;expireIfNeeded(session);assert.equal(session.fieldRun.phase,"travel");assert.equal(session.fieldRun.currentIndex,1);
  session.fieldRun.transitionAt=0;expireIfNeeded(session);assert.equal(session.fieldRun.phase,"service");
  session.clock.endAt=Date.now()-1;
  assert.equal(expireIfNeeded(session),true);
  assert.equal(session.fieldRun.phase,"returning");session.fieldRun.transitionAt=0;expireIfNeeded(session);
  assert.equal(session.stageStatus,"resolved");
  assert.equal(session.global.fieldServices.lower_road_camera_service,"not_restored");
  assert.equal(session.global.fieldServices.upper_ridge_service,"not_restored");
  assert.equal(session.fieldRun.results.length,2);
  assert.ok(session.fieldRun.results.every(result=>result.expired));
});

test("contribution metrics record reports and role overrides", () => {
  const session=createSession({code:"METR01",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);
  const lead=authorize(session,session.players.lead.token);
  applyAction(session,lead,"REPORT",{recommendation:"Hold Mara and voice",note:"Two inferred labels lack a current source."});
  applyAction(session,lead,"INTERVENTION");
  assert.equal(session.metrics.contributions.lead.reports,1);
  assert.equal(session.metrics.contributions.lead.interventions,1);
  assert.deepEqual(session.metrics.contributions.lead.stages,[2]);
});

test("information matrix covers every stage and core role", () => {
  for (let stage = 1; stage <= 7; stage++) {
    assert.ok(INFORMATION_MATRIX[stage], `matrix missing stage ${stage}`);
    for (const role of roleIdsForCount(7)) {
      assert.match(INFORMATION_MATRIX[stage][role], /^[PSD]$/, `matrix ${stage}/${role}`);
      const card = roleCard(stage, role, 7);
      if(stage===1){assert.equal(card.act1Screens.length,1);assert.equal(card.confidence,"RECORD");continue;}
      assert.ok(card.body.length > 20, `empty card ${stage}/${role}`);
      assert.match(card.confidence, /CONFIRMED|LIKELY|STALE|UNKNOWN|CONTRADICTED/);
      assert.ok(card.prompt, `missing speak prompt ${stage}/${role}`);
      assert.ok(card.participantGoal.length > 40, `unclear participant goal ${stage}/${role}`);
      assert.ok(card.notes.length >= 1, `missing structured participant notes ${stage}/${role}`);
      for (const note of card.notes) {
        assert.ok(note.body.length > 20, `empty structured note ${stage}/${role}`);
        assert.match(note.confidenceMeaning, /Verified|Supported|old|conflicts|evidence/i);
        assert.match(note.sharePrompt, /^Ask the crew:/);
      }
    }
  }
  assert.equal(INFORMATION_JOINS.length >= 7, true);
  assert.ok(INFORMATION_JOINS.some(join => join.id === "lower_route_beneath"));
});

test("private phrases stay with their owning role and do not appear on other terminals", () => {
  const session = createSession({ code: "INFO01", playerCount: 7 });
  connectCrew(session);
  startShift(session);
  completeHandover(session);
  commitAndAdvance(session);
  completeRepairStage(session);
  completeOutsidePlan(session);
  commitAndAdvance(session);
  assert.equal(session.stage, 4);

  const bodies = Object.fromEntries(roleIdsForCount(7).map(role => {
    const state = publicState(session, authorize(session, session.players[role].token));
    return [role, state.privateCard.body];
  }));
  for (const [owner, patterns] of Object.entries(PRIVATE_PHRASE_OWNERS)) {
    for (const pattern of patterns) {
      const ownersWithPhrase = Object.entries(bodies).filter(([, body]) => pattern.test(body)).map(([role]) => role);
      if (!ownersWithPhrase.length) continue;
      assert.ok(ownersWithPhrase.includes(owner), `${pattern} should include owner ${owner}, got ${ownersWithPhrase}`);
      for (const role of ownersWithPhrase) {
        assert.equal(role, owner, `${pattern} leaked to ${role}`);
      }
    }
  }
});

test("shared Act 4 state cannot see either side of the cooperative field puzzle", () => {
  const session = createSession({ code: "INFO02", playerCount: 7 });
  connectCrew(session);
  startShift(session);
  completeHandover(session);
  commitAndAdvance(session);
  completeRepairStage(session);
  completeOutsidePlan(session);
  commitAndAdvance(session);
  assert.equal(session.stage, 4);

  update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");
  const shared = publicState(session, { kind: "public" });
  assert.equal(shared.privateCard, null);
  assert.equal(shared.fieldGame,null);
  assert.equal(shared.fieldRun.localRadio,"clear");
  assert.deepEqual(shared.fieldRun.route,["a","b"]);

  const signalViewer=authorize(session,session.players.signal.token);
  assert.equal(publicState(session,signalViewer).fieldGame,null,"private repair material stays closed during the opening");
  finishAct4Opening(session);
  const signal = publicState(session,signalViewer);
  assert.equal(signal.fieldGame.side,"station");
  assert.equal(signal.fieldGame.observation,undefined);
  assert.match(signal.privateCard.body,/indicator behavior|functional symptom/i);
});

test("six-player Outside Run retains the reliable local-radio rule", () => {
  const card=roleCard(4,"operations",6);
  assert.match(card.body,/local field link remains clear/i);
  assert.match(card.body,/independent of the failed external communications paths/i);
  assert.doesNotMatch(card.body,/three short data bursts|channel drops/i);
});

test("Act 5 runs five minutes and lets players claim different stations simultaneously", () => {
  const session=createSession({code:"CABIN1",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  completeOutsidePlan(session,{firstLocation:"d",secondLocation:"a",tool1:"torque_wrench",tool2:"signal_meter",supportItem:"climbing_kit",filterUse:87});commitAndAdvance(session);
  update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");completeActiveFieldRun(session);
  applyAction(session,facilitator,"ADVANCE_STAGE");
  assert.equal(session.stage,5);assert.equal(session.clock.duration,300);
  session.act5Intro.endsAt=0;session.cabinRun.engine.status="running";session.cabinRun.lastTickAt=Date.now();
  const lead=authorize(session,session.players.lead.token),signal=authorize(session,session.players.signal.token);
  let leadState=publicState(session,lead);
  assert.equal(leadState.cabinRun.engine.availableStationCount,10);
  assert.equal(leadState.cabinRun.engine.purge.available,true);
  applyAction(session,lead,"ACT5_ACTION",{action:{type:"claim",station:"INTAKE_DIVERSION"}});
  applyAction(session,signal,"ACT5_ACTION",{action:{type:"claim",station:"DOOR_REPAIR"}});
  leadState=publicState(session,lead);
  assert.equal(leadState.cabinRun.engine.stations.INTAKE_DIVERSION,"1");
  assert.equal(leadState.cabinRun.engine.stations.DOOR_REPAIR,"2");
  assert.throws(()=>applyAction(session,signal,"ACT5_ACTION",{action:{type:"claim",station:"INTAKE_DIVERSION"}}),/occupied/i);
  applyAction(session,facilitator,"PAUSE");
  assert.throws(()=>applyAction(session,lead,"ACT5_ACTION",{action:{type:"intake_rotate",id:0}}),/paused/i);
  applyAction(session,facilitator,"RESUME");
});

test("Act 5 safety hold can be cleared and resumed without consuming the opening", () => {
  const session=createSession({code:"SAFE05",playerCount:4});connectCrew(session);
  applyAction(session,facilitator,"START_ACT5_TEST");
  const openingEnd=session.act5Intro.endsAt;
  applyAction(session,facilitator,"SAFETY");
  assert.equal(session.safetyPaused,true);assert.equal(session.clock.running,false);assert.equal(session.cabinRun.engine.status,"paused");
  applyAction(session,facilitator,"SAFETY");
  assert.equal(session.safetyPaused,false);assert.equal(session.clock.running,false,"clearing a safety hold must not resume without facilitator confirmation");
  applyAction(session,facilitator,"RESUME");
  assert.equal(session.clock.running,true);assert.equal(session.cabinRun.engine.status,"running");
  assert.ok(session.cabinRun.lastTickAt>=openingEnd,"resuming during the opening must not advance cabin simulation early");
});

test("direct Act 6 test opens the timed archive with restored R-12 context", () => {
  const session=createSession({code:"ARCH06",playerCount:4});connectCrew(session);
  applyAction(session,facilitator,"START_ACT6_TEST");
  assert.equal(session.stage,6);
  assert.equal(session.stageStatus,"live");
  assert.equal(session.archiveRun.phase,"opening");
  assert.equal(session.clock.duration,session.act6Config.shortSeconds);
  expireIfNeeded(session,session.act6Intro.endsAt+1);
  assert.equal(session.archiveRun.phase,"history");
  assert.equal(session.global.fieldServices.upper_ridge_service,"restored");
  assert.equal(publicState(session,facilitator).archive.documents.length,6);
});

test("Act 5 purge is conditional and timeout always reveals R-12 and grants a viable Act 6 window", () => {
  const session=createSession({code:"CABIN2",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  completeOutsidePlan(session);commitAndAdvance(session);update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");completeActiveFieldRun(session);applyAction(session,facilitator,"ADVANCE_STAGE");
  session.act5Intro.endsAt=0;session.cabinRun.engine.status="running";session.cabinRun.lastTickAt=Date.now();
  assert.equal(publicState(session,facilitator).cabinRun.engine.purge.available,false);
  assert.throws(()=>applyAction(session,{kind:"public"},"END_CABIN_WINDOW",{note:"forge timeout"}),/not available/i);
  assert.throws(()=>applyAction(session,facilitator,"END_CABIN_WINDOW"),/Record why/i);
  assert.throws(()=>applyAction(session,authorize(session,session.players.lead.token),"ACT5_ACTION",{action:{type:"claim",station:"EMERGENCY_PURGE"}}),/Upper Ridge/i);
  session.clock.endAt=10;assert.equal(expireIfNeeded(session,11),true);
  assert.equal(session.stageStatus,"resolved");assert.equal(session.global.mara,"located");
  assert.ok(session.global.evidence.includes("R-12 protected volume sealed and stable"));
  assert.ok([180,240].includes(session.global.act6InvestigationTime));
  applyAction(session,facilitator,"ADVANCE_STAGE");
  assert.equal(session.clock.duration,session.global.act6InvestigationTime);
});

test("Act 5 pre-flush airborne gas selects the configured SHORT or LONG Act 6 window", () => {
  const make=gas=>{const session=createSession({playerCount:4});connectCrew(session);session.status="stage";session.stage=5;session.stageStatus="live";const now=Date.now();session.clock={duration:300,remaining:300,running:true,endAt:now-1};publicState(session,facilitator);session.act5Intro={startedAt:0,endsAt:0};session.cabinRun.engine.status="running";session.cabinRun.engine.totalGas=gas;session.cabinRun.engine.totalGasPurged=0;session.cabinRun.lastTickAt=now;expireIfNeeded(session,now);return session;};
  const strong=make(10_000),weak=make(40_000);
  assert.equal(strong.global.act6InvestigationTime,240);
  assert.equal(weak.global.act6InvestigationTime,180);
  assert.equal(strong.decisions[5].legacyAtmosphericHold,true);
  assert.ok(weak.decisions[5].preFlushAirborneGas>=40_000);
});

test("facilitator configures Act 6 timing with manual-study and warning guardrails", () => {
  const session=createSession({code:"A6CONF",playerCount:4});
  applyAction(session,facilitator,"CONFIGURE_ACT6",{gasThreshold:500,shortSeconds:150,longSeconds:270,archiveSeconds:95,warningSeconds:50,criticalSeconds:20});
  assert.deepEqual(publicState(session,facilitator).act6Config,{gasThreshold:500,shortSeconds:150,longSeconds:270,archiveSeconds:95,warningSeconds:50,criticalSeconds:20});
  assert.throws(()=>applyAction(session,facilitator,"CONFIGURE_ACT6",{archiveSeconds:106}),/leave at least 45 seconds/i);
  assert.throws(()=>applyAction(session,facilitator,"CONFIGURE_ACT6",{longSeconds:150}),/greater than SHORT/i);
  assert.throws(()=>applyAction(session,facilitator,"CONFIGURE_ACT6",{warningSeconds:20,criticalSeconds:20}),/earlier than the warning point/i);
  connectCrew(session);applyAction(session,facilitator,"START_ACT6_TEST");session.act6Intro.endsAt=0;expireIfNeeded(session);
  assert.equal(session.clock.duration,150);
  assert.equal(session.archiveRun.nightmareAt-session.archiveRun.openedAt,95_000);
  applyAction(session,facilitator,"ADVANCE_ARCHIVE_PHASE",{note:"Facilitator verification advance"});
  assert.equal(session.archiveRun.phase,"nightmare");
  assert.throws(()=>applyAction(session,authorize(session,session.players.lead.token),"CHAT_MESSAGE",{message:"cinematic bypass"}),/locked during the synchronized Act 6 cinematic/i);
  applyAction(session,facilitator,"ADVANCE_ARCHIVE_PHASE",{note:"Facilitator verification advance"});
  assert.equal(session.archiveRun.phase,"technical");
  session.clock.running=false;session.clock.remaining=50;assert.equal(publicState(session,facilitator).archive.warning,true);assert.equal(publicState(session,facilitator).archive.critical,false);
  session.clock.remaining=20;assert.equal(publicState(session,facilitator).archive.critical,true);
});

test("facilitator can restart resolved Act 5 with the same crew links and Act 4 outcome", () => {
  const session=createSession({code:"CABIN5",playerCount:4});connectCrew(session);
  session.status="stage";session.stage=5;session.stageStatus="live";
  session.global.fieldServices.upper_ridge_service="restored";
  const now=Date.now();session.clock={duration:300,remaining:0,running:true,endAt:now-1};
  publicState(session,facilitator);session.act5Intro={startedAt:0,endsAt:0};session.cabinRun.lastTickAt=now;
  expireIfNeeded(session,now);
  const links=Object.fromEntries(Object.entries(session.players).map(([role,player])=>[role,player.token]));
  applyAction(session,facilitator,"RESTART_ACT5");
  assert.equal(session.stage,5);assert.equal(session.stageStatus,"live");assert.equal(session.clock.duration,300);
  assert.equal(session.cabinRun.engine.config.UPPER_RIDGE_SERVICE,"RESTORED");
  assert.deepEqual(Object.fromEntries(Object.entries(session.players).map(([role,player])=>[role,player.token])),links);
  assert.equal(session.outcomes[5],undefined);assert.equal(session.decisions[5],undefined);
});

test("facilitator restarts Acts 6 and 7 without returning the crew to Act 1", () => {
  const session=createSession({code:"REACT7",playerCount:5});connectCrew(session);
  const links=Object.fromEntries(Object.entries(session.players).map(([role,player])=>[role,player.token]));
  session.status="stage";session.stage=6;session.stageStatus="resolved";session.global.act6InvestigationTime=240;session.outcomes[6]={headline:"Archive complete"};session.decisions[6]={investigationWindow:240};
  applyAction(session,facilitator,"RESTART_ACT6");
  assert.equal(session.stage,6);assert.equal(session.stageStatus,"live");assert.equal(session.clock.duration,240);assert.equal(session.outcomes[6],undefined);
  session.stageStatus="resolved";applyAction(session,facilitator,"ADVANCE_STAGE");
  const baseline=session.finaleRun.baselineUpperAir,stageAir=session.global.upperAir;
  session.stageStatus="resolved";session.pendingEnding={title:"TEST"};session.outcomes[7]={headline:"Finale complete"};session.decisions[7]={film:"F01"};
  applyAction(session,facilitator,"RESTART_ACT7");
  assert.equal(session.status,"stage");assert.equal(session.stage,7);assert.equal(session.stageStatus,"live");assert.equal(session.finaleRun.phase,"queue");
  assert.equal(session.finaleRun.baselineUpperAir,baseline);assert.equal(session.global.upperAir,stageAir);assert.equal(session.pendingEnding,null);assert.equal(session.ending,null);
  session.finaleRun.crew.lead.exposure=120;session.finaleRun.crew.lead.status="compromised";
  applyAction(session,facilitator,"RESTART_ACT7");
  assert.equal(session.stageStatus,"live");assert.equal(session.finaleRun.phase,"queue");assert.equal(session.finaleRun.crew.lead.exposure,0);
  assert.deepEqual(Object.fromEntries(Object.entries(session.players).map(([role,player])=>[role,player.token])),links);
});

test("six-player mode redistributes the Act 5 false external picture", () => {
  const session = createSession({ code: "INFO03", playerCount: 6 });
  connectCrew(session);
  startShift(session);
  for (let stage = 1; stage < 5; stage++) {
    if (stage === 1) completeHandover(session);
    if (stage === 2) { completeRepairStage(session); continue; }
    if (stage === 3) completeOutsidePlan(session);
    if (stage === 4) update(session, { runner: "operations" });
    commitAndAdvance(session);
  }
  assert.equal(session.stage, 5);
  const systems = publicState(session, authorize(session, session.players.systems.token));
  assert.match(systems.privateCard.body, /outside network still treats Blackout Ridge as OPERATIONAL \/ NO ACTIVE DISTRESS/i);
  assert.equal(Object.keys(session.players).includes("comms"), false);
});

test("Act 3 clues require function, component, location, timing and equipment joins", () => {
  const field = roleCard(3, "field", 7);
  assert.doesNotMatch(field.body, /beneath rack B|beneath the cabin/i);
  const systems = roleCard(3, "systems", 7);
  assert.match(systems.body, /receive-return.*operator line driver/i);
  const signal = roleCard(3, "signal", 7);
  assert.match(signal.body, /Inbound.*receive coupler.*outbound.*send bridge/i);
  assert.doesNotMatch(signal.body,/NORTH MAST|EAST SERVICE/);
  assert.match(field.body,/A has.*sealed cabinet.*B has.*line-driver/i);
});
