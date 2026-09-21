import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import {
  addPlayer,
  applyAction,
  authorize,
  createSession,
  expireIfNeeded,
  outsidePlanPreview,
  publicState,
} from "../server/game-engine.js";
import {
  ACT1_EVIDENCE_SCREENS,
  ACT1_TRANSMISSIONS,
  ACT2_SYSTEMS,
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
  plannedInbound: "a",
  plannedOutbound: "b",
  firstTarget: "a",
  equipment: ["gas_mask", "service_toolkit"],
  ...overrides,
});
const fieldSolutions={a:["vent_turn","vent_turn_reseat"],b:["isolate_dark","isolate_blue_bridge"],c:["drain_north","north_lower_upper"],d:["equalise_bypass","bypass_discharge_close"]};
function completeActiveFieldRun(session,{fail=[]}={}){
  while(session.stage===4&&session.fieldRun?.active){
    const id=session.fieldRun.route[session.fieldRun.currentIndex],[instruction,action]=fieldSolutions[id];
    applyAction(session,facilitator,"FIELD_INSTRUCTION",{instruction:fail.includes(id)?"ground_braid":instruction});
    applyAction(session,facilitator,"FIELD_SERVICE",{action});
  }
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
    session.clock.endAt=Date.now()-1;
    expireIfNeeded(session,Date.now());
    if(session.stageStatus==="resolved")applyAction(session,facilitator,"ADVANCE_STAGE");
    return;
  }
  applyAction(session, facilitator, "COMMIT_STAGE");
  if (session.stage === 4 && session.fieldRun?.active) completeActiveFieldRun(session);
  if (session.stage < 7 && session.stageStatus === "resolved") applyAction(session, facilitator, "ADVANCE_STAGE");
}

function confirmEnding(session) {
  assert.equal(session.stageStatus, "resolved");
  assert.ok(session.pendingEnding);
  applyAction(session, facilitator, "CONFIRM_ENDING");
}

function completeProductionFinale(session,{good=true,messageRating=good?"effective":"ineffective",timeouts=false,purgeAfterFirst=false}={}){
  while(session.stage===7&&session.stageStatus==="live"){
    const run=session.finaleRun;
    if(run.phase==="transfer"){
      if(purgeAfterFirst&&run.below.length&&run.purgeRemaining){const role=run.below.at(-1);run.purgeLockedUntil=0;applyAction(session,authorize(session,session.players[role].token),"R12_PURGE");}
      if(timeouts){session.clock.endAt=1;expireIfNeeded(session,2);}
      else{const viewer=authorize(session,session.players[run.currentRole].token);for(const step of ["harness","wheel","ladder","inner"])applyAction(session,viewer,"TRANSFER_STEP",{step});}
    }else if(run.phase==="surface"){
      const viewer=authorize(session,session.players[run.currentRole].token);
      applyAction(session,viewer,"UPDATE_SURFACE",good?{status:"distress",message:"ALL CREW IN R-12. SURFACE ATMOSPHERE UNSAFE. EXTERNAL EXTRACTION REQUIRED.",isolation:"engaged",authority:"authorised",releaseTest:true}:{status:"operational",message:"",isolation:"released",authority:"secure",releaseTest:false});
      applyAction(session,viewer,"SUBMIT_SURFACE");applyAction(session,facilitator,"CLASSIFY_MESSAGE",{rating:messageRating});
    }else if(run.phase==="adjudication")applyAction(session,facilitator,"CLASSIFY_MESSAGE",{rating:messageRating});
    else break;
  }
  return session.pendingEnding;
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
  assert.deepEqual(session.decisions[3], {PLANNED_INBOUND_LOCATION:"a",PLANNED_OUTBOUND_LOCATION:"b",RUNNER_FIRST_TARGET:"a",FIELD_EQUIPMENT:["gas_mask","service_toolkit"]});

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
  assert.equal(session.ending.title, "CLEAN RESCUE");
  assert.equal(session.ending.calculation.status,"DISTRESS");
  assert.equal(session.ending.calculation.message,"CLEAR");
  assert.equal(session.ending.calculation.release,"ENABLED");
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

test("production Act 3 implements the specified outside-plan feasibility matrix", () => {
  const plan=(plannedInbound,plannedOutbound,firstTarget,equipment)=>outsidePlanPreview({plannedInbound,plannedOutbound,firstTarget,equipment});
  for(const firstTarget of ["a","b"])assert.equal(plan("a","b",firstTarget,["gas_mask","service_toolkit"]).ready,true);
  for(const firstTarget of ["a","c"])assert.equal(plan("a","c",firstTarget,["gas_mask","flood_kit"]).ready,true);
  for(const firstTarget of ["a","d"])assert.equal(plan("a","d",firstTarget,["gas_mask","high_access"]).ready,true);
  for(const firstTarget of ["b","c"])assert.equal(plan("b","c",firstTarget,["gas_mask","service_toolkit"]).ready,false);
  for(const firstTarget of ["b","d"])assert.equal(plan("b","d",firstTarget,["gas_mask","service_toolkit"]).ready,false);
  assert.equal(plan("c","d","c",["flood_kit","high_access"]).ready,true);
  const reverse=plan("c","d","d",["flood_kit","high_access"]);
  assert.equal(reverse.ready,false);
  assert.ok(reverse.required.includes("gas_mask"));
  assert.equal(reverse.stops.find(stop=>stop.id==="c").ppm>=18,true);
});

test("Act 3 exposes separate red field outages and accepts only a practical facilitator plan", () => {
  const session=createSession({code:"PLAN03",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  assert.equal(session.stage,3);
  assert.equal(STAGES[3].mechanic,"outside_plan");
  assert.equal(STAGES[3].duration,420);
  assert.deepEqual(Object.values(session.global.externalStatus),["offline","offline","offline","offline"]);
  assert.equal(session.global.systemStatus.tower_monitoring,"working");
  const lead=authorize(session,session.players.lead.token);
  assert.throws(()=>applyAction(session,lead,"UPDATE_DRAFT",{plannedInbound:"a"}),/not available/);
  update(session,{plannedInbound:"a",plannedOutbound:"a",firstTarget:"a",equipment:["gas_mask","service_toolkit"]});
  assert.throws(()=>applyAction(session,facilitator,"COMMIT_STAGE"),/two different service locations/);
  completeOutsidePlan(session);
  const preview=publicState(session,{kind:"public"}).decisionPreview;
  const publicLocations=publicState(session,{kind:"public"}).outsideLocations;
  assert.equal(publicLocations.some(location=>"requirement" in location||"serviceNote" in location),false);
  assert.equal(preview.ready,true);
  assert.match(preview.footer,/physical feasibility only/i);
  assert.doesNotMatch(JSON.stringify(preview),/correct|incorrect|right location|wrong location/i);
  applyAction(session,facilitator,"COMMIT_STAGE");
  assert.match(session.outcomes[3].detail,/physically serviceable.*unscored/i);
  assert.deepEqual(Object.keys(session.decisions[3]).sort(),["FIELD_EQUIPMENT","PLANNED_INBOUND_LOCATION","PLANNED_OUTBOUND_LOCATION","RUNNER_FIRST_TARGET"].sort());
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
  completeOutsidePlan(session,{plannedInbound:"c",plannedOutbound:"d",firstTarget:"c",equipment:["flood_kit","high_access"]}); commitAndAdvance(session);
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

test("Outside Run keeps the Act 3 mission locked and resolves two asymmetric one-shot services", () => {
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
  assert.deepEqual(session.fieldRun.route,["a","b"]);
  const runnerState=publicState(session,authorize(session,operations.token));
  const stationState=publicState(session,authorize(session,signal.token));
  const sharedState=publicState(session,{kind:"public"});
  assert.match(runnerState.fieldGame.observation,/RETURN needle/);
  assert.equal(runnerState.fieldGame.manual,undefined);
  assert.equal(stationState.fieldGame.observation,undefined);
  assert.equal(stationState.fieldGame.manual.length,3);
  assert.equal(sharedState.fieldGame,null);
  assert.equal(runnerState.environment.airMeterPpm,runnerState.fieldRun.forecast[0].ppm,"Act 4 must display the locked Act 3 service-point forecast as current reality");
  assert.equal(runnerState.environment.fieldStop.id,"a");
  assert.notEqual(runnerState.fieldGame.actions[0][1],FIELD_GAMES.a.manual[0][1],"runner controls should require translation from station terminology");
  assert.throws(()=>applyAction(session,authorize(session,operations.token),"FIELD_INSTRUCTION",{instruction:"vent_turn"}),/station crew/);
  assert.throws(()=>applyAction(session,authorize(session,operations.token),"FIELD_SERVICE",{action:"vent_turn_reseat"}),/Wait for a station instruction/);
  applyAction(session,authorize(session,signal.token),"FIELD_INSTRUCTION",{instruction:"vent_turn"});
  assert.throws(()=>applyAction(session,authorize(session,signal.token),"FIELD_INSTRUCTION",{instruction:"vent_turn"}),/already locked/);
  applyAction(session,authorize(session,operations.token),"FIELD_SERVICE",{action:"vent_turn_reseat"});
  assert.equal(session.fieldRun.currentIndex,1);
  applyAction(session,authorize(session,signal.token),"FIELD_INSTRUCTION",{instruction:"isolate_dark"});
  applyAction(session,authorize(session,operations.token),"FIELD_SERVICE",{action:"isolate_blue_bridge"});
  assert.equal(session.stageStatus, "resolved");
  assert.equal(session.metrics.contributions.signal.stationInstructions,2);
  assert.equal(session.metrics.contributions.operations.serviceAttempts,2);
  assert.deepEqual(session.global.fieldServices,{external_inbound_path:"restored",external_outbound_path:"restored",lower_road_camera_service:"not_restored",upper_ridge_service:"not_restored"});
  assert.equal(publicState(session,facilitator).communications.inbound,"FULL");
  assert.equal(publicState(session,facilitator).communications.outbound,"FULL");
  assert.deepEqual(session.decisions[4].route,["a","b"]);
  assert.equal(session.decisions[4].results.length,2);
});

test("all four field games are distinct and create only the specified operational outcomes", () => {
  assert.equal(new Set(Object.values(FIELD_GAMES).map(game=>game.type)).size,4);
  for(const game of Object.values(FIELD_GAMES)){
    assert.equal(game.manual.length,3);
    assert.equal(game.actions.length,3);
  }

  const cd=createSession({code:"FIELD2",playerCount:4});connectCrew(cd);startShift(cd);
  completeHandover(cd);commitAndAdvance(cd);completeRepairStage(cd);
  completeOutsidePlan(cd,{plannedInbound:"c",plannedOutbound:"d",firstTarget:"c",equipment:["flood_kit","high_access"]});commitAndAdvance(cd);
  update(cd,{runner:"operations"});applyAction(cd,facilitator,"COMMIT_STAGE");completeActiveFieldRun(cd);
  assert.equal(cd.global.fieldServices.lower_road_camera_service,"restored");
  assert.equal(cd.global.fieldServices.upper_ridge_service,"restored");
  assert.equal(cd.global.externalStatus.lower_road_camera_history,"working");
  assert.equal(cd.global.externalStatus.ventilation_path,"working");
  const knowledge=cd.fieldRun.results.flatMap(result=>result.knowledge).join(" ");
  assert.match(knowledge,/Mara reached Lower Route.*headed back toward Blackout Ridge/i);
  assert.doesNotMatch(knowledge,/current location|trapped|beneath the cabin|R-12/i);

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
  session.global.systemStatus.air_quality="broken";session.global.fieldServices.upper_ridge_service="restored";
  session.clock={duration:240,remaining:240,running:false,endAt:null};
  const history=publicState(session,facilitator);
  assert.equal(history.archive.phase,"history");
  assert.equal(history.archive.exactDeadline,false);
  assert.equal(history.archive.purgeAvailable,true);
  assert.ok(history.archive.documents.some(item=>item.id==="newsreel"&&item.audio));
  assert.ok(history.archive.documents.every(item=>item.phase==="history"));
  assert.throws(()=>applyAction(session,facilitator,"COMMIT_STAGE"),/automatically/);
  assert.throws(()=>applyAction(session,facilitator,"UPDATE_DRAFT",{invalid:"operational"}),/read-only archive/);
  session.clock.running=true;session.clock.endAt=240_000;
  assert.equal(expireIfNeeded(session,121_000),true);
  const technical=publicState(session,facilitator);
  assert.equal(technical.archive.phase,"technical");
  assert.deepEqual(technical.archive.checklist,["DISTRESS","EXTRACTION MESSAGE","RELEASE CONFIGURATION"]);
  const archiveText=technical.archive.documents.map(item=>`${item.title} ${item.summary} ${item.detail}`).join(" ");
  for(const phrase of ["refuge, not an escape tunnel","three shared purge cycles","sixty seconds","separate tanks","AUTHORISED RESPONSE","EXTERNAL RELEASE TEST","ISOLATION HELD","RESPONDER RELEASE ARMED","obsolete internal emergency circuit"] ) assert.match(archiveText,new RegExp(phrase,"i"));
  assert.equal(expireIfNeeded(session,240_001),true);
  assert.equal(session.stageStatus,"resolved");
  assert.equal(session.global.correction,"none");
  assert.deepEqual(session.decisions[6],{investigationWindow:240});
  assert.equal("documents" in session.decisions[6],false);
});

test("Act 6 archive is identical for all members and independent of inbound traffic", () => {
  const session=createSession({code:"LARK02",playerCount:4});connectCrew(session);
  session.status="stage";session.stage=6;session.stageStatus="live";session.clock={duration:180,remaining:180,running:false,endAt:null};
  session.global.fieldServices.external_inbound_path="not_restored";
  const facilitatorArchive=publicState(session,facilitator).archive;
  for(const role of rolesByCount[4])assert.deepEqual(publicState(session,authorize(session,session.players[role].token)).archive,facilitatorArchive);
  assert.equal(publicState(session,{kind:"public"}).signalTransmission.integrity,0);
  assert.equal(facilitatorArchive.documents.length,LARK_ARCHIVE.filter(item=>item.phase==="history").length);
  assert.ok(existsSync(new URL("../prototype/assets/audio/act6-lark-newsreel.wav",import.meta.url)));
});

test("the finale is previewed before the facilitator confirms the final record", () => {
  const session = createSession({ code: "FINAL1", playerCount: 4 });
  connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";session.global.systemStatus.status_beacon="working";session.global.systemStatus.human_outbound="working";session.global.fieldServices.external_outbound_path="restored";session.global.fieldServices.upper_ridge_service="restored";
  publicState(session,facilitator);completeProductionFinale(session);
  assert.equal(session.status,"stage");
  assert.equal(session.pendingEnding.title,"CLEAN RESCUE");
  confirmEnding(session);
  assert.equal(session.status,"ending");
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
  const session=createSession({code:"A2OPEN",playerCount:4});connectCrew(session);
  applyAction(session,facilitator,"START_GAME");
  completeHandover(session);applyAction(session,facilitator,"COMMIT_STAGE");applyAction(session,facilitator,"ADVANCE_STAGE");
  const state=publicState(session,facilitator);
  assert.equal(state.stage,2);
  assert.equal(state.act2Intro.endsAt-state.act2Intro.startedAt,35_000);
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
  update(session,{plannedInbound:"b",plannedOutbound:"d",firstTarget:"b",equipment:["gas_mask","service_toolkit"]});
  assert.throws(()=>applyAction(session,facilitator,"COMMIT_STAGE"),/Missing: HIGH-ACCESS KIT/);
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
  const signal=publicState(session,{kind:"public"}).signalTransmission;
  assert.equal(signal.source,"SOURCE NOT IDENTIFIED");
  assert.equal(signal.preserved,false);
  assert.match(signal.transcript,/twelve.*twelve.*route/i);
  assert.match(signal.instruction,/NOT STORED.*OBSOLETE INTERNAL/i);
  assert.doesNotMatch(signal.transcript,/Mara|North Mast|East Service/i);
});

test("finale distinguishes clean rescue from a catastrophic Lark Shift echo", () => {
  const make=(code,good)=>{const session=createSession({code,playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";session.global.systemStatus.status_beacon=good?"working":"broken";session.global.systemStatus.human_outbound=good?"working":"broken";session.global.fieldServices.external_outbound_path=good?"restored":"not_restored";session.global.fieldServices.upper_ridge_service=good?"restored":"not_restored";publicState(session,facilitator);completeProductionFinale(session,{good,timeouts:!good});return session;};
  const clean=make("COST01",true);assert.equal(clean.pendingEnding.title,"CLEAN RESCUE");assert.equal(clean.pendingEnding.calculation.release,"ENABLED");assert.ok(clean.decisions[7].survivalTime>clean.decisions[7].rescueTime);
  const lark=make("JOIN01",false);assert.equal(lark.pendingEnding.title,"LARK SHIFT ECHO");assert.equal(lark.pendingEnding.calculation.release,"INHIBITED");assert.ok(lark.decisions[7].survivalTime<lark.decisions[7].rescueTime);
});

test("all four production finale bands are reachable from distinct consequence combinations",()=>{
  const finale=(code,{beacon="working",outbound="working",path="restored",upper="not_restored",good=true,rating="effective",timeouts=false}={})=>{
    const session=createSession({code,playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";
    session.global.systemStatus.status_beacon=beacon;session.global.systemStatus.human_outbound=outbound;session.global.fieldServices.external_outbound_path=path;session.global.fieldServices.upper_ridge_service=upper;
    publicState(session,facilitator);completeProductionFinale(session,{good,messageRating:rating,timeouts});return session.pendingEnding;
  };
  assert.equal(finale("BANDC1",{upper:"restored"}).band,"clean");
  assert.equal(finale("BANDS1",{beacon:"broken",rating:"partial"}).band,"severe");
  assert.equal(finale("BANDX1",{timeouts:true}).band,"casualties");
  assert.equal(finale("BANDL1",{beacon:"broken",outbound:"broken",path:"not_restored",good:false,rating:"ineffective",timeouts:true}).band,"lark");
});

test("every supported crew size can complete all seven production acts",()=>{
  for(const playerCount of [4,5,6,7]){
    const session=createSession({code:`SIZE${playerCount}X`,playerCount});connectCrew(session);startShift(session);
    completeHandover(session);commitAndAdvance(session);completeRepairStage(session);completeOutsidePlan(session);commitAndAdvance(session);
    update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");completeActiveFieldRun(session);
    applyAction(session,facilitator,"ADVANCE_STAGE");commitAndAdvance(session);commitAndAdvance(session);completeProductionFinale(session);
    assert.equal(session.stage,7);assert.equal(session.stageStatus,"resolved");assert.ok(session.pendingEnding?.band);
  }
});

test("Act 7 keeps random order hidden and isolates each player after transfer", () => {
  const session=createSession({code:"ISO701",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";publicState(session,facilitator);
  const first=session.finaleRun.currentRole,firstViewer=authorize(session,session.players[first].token),other=rolesByCount[4].find(role=>role!==first),otherViewer=authorize(session,session.players[other].token);
  assert.equal(publicState(session,firstViewer).finale.mode,"transfer");assert.equal(publicState(session,otherViewer).finale.mode,"waiting");
  assert.equal("order" in publicState(session,{kind:"public"}).finale,false);
  assert.throws(()=>applyAction(session,otherViewer,"TRANSFER_STEP",{step:"harness"}),/active player/);
  applyAction(session,firstViewer,"TRANSFER_STEP",{step:"wheel"});assert.equal(session.finaleRun.transferMistakes,1);
  for(const step of ["harness","wheel","ladder","inner"])applyAction(session,firstViewer,"TRANSFER_STEP",{step});
  const isolated=publicState(session,firstViewer);assert.equal(isolated.finale.mode,"below");assert.equal(isolated.finale.communicationLocked,true);assert.deepEqual(isolated.chatMessages,[]);
  assert.throws(()=>applyAction(session,firstViewer,"CHAT_MESSAGE",{message:"coach"}),/isolated/);
});

test("R-12 purge is shared, finite and weaker when repeated before recovery", () => {
  const session=createSession({code:"PURG71",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";session.global.fieldServices.upper_ridge_service="restored";publicState(session,facilitator);
  const first=session.finaleRun.currentRole,viewer=authorize(session,session.players[first].token);for(const step of ["harness","wheel","ladder","inner"])applyAction(session,viewer,"TRANSFER_STEP",{step});
  session.finaleRun.contamination=80;session.finaleRun.purgeLockedUntil=0;applyAction(session,viewer,"R12_PURGE");const firstRemoved=session.finaleRun.purges.at(-1).removed;
  session.finaleRun.purgeLockedUntil=0;applyAction(session,viewer,"R12_PURGE");const earlyRemoved=session.finaleRun.purges.at(-1).removed;
  assert.equal(session.finaleRun.purgeRemaining,1);assert.ok(earlyRemoved<firstRemoved);assert.equal(session.finaleRun.reserve,88);
});

test("pausing the finale freezes transfer exposure time", () => {
  const session=createSession({code:"PAUS71",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";publicState(session,facilitator);
  const role=session.finaleRun.currentRole,viewer=authorize(session,session.players[role].token);
  session.finaleRun.transferStartedAt=Date.now()-20000;
  applyAction(session,facilitator,"PAUSE");
  const frozen=session.finaleRun.transferElapsedBeforePause;
  assert.ok(frozen>=19&&frozen<=21);
  session.finaleRun.transferStartedAt=Date.now()-59000;
  applyAction(session,facilitator,"RESUME");
  for(const step of ["harness","wheel","ladder","inner"])applyAction(session,viewer,"TRANSFER_STEP",{step});
  assert.ok(session.finaleRun.transfers[0].seconds>=19&&session.finaleRun.transfers[0].seconds<=22);
});

test("final surface tasks propagate independently and timeout never strands the operator", () => {
  const session=createSession({code:"SURF71",playerCount:4});connectCrew(session);session.status="stage";session.stage=7;session.stageStatus="live";session.global.systemStatus.status_beacon="broken";session.global.systemStatus.human_outbound="working";session.global.fieldServices.external_outbound_path="restored";publicState(session,facilitator);
  while(session.finaleRun.currentIndex<session.finaleRun.order.length-1){const viewer=authorize(session,session.players[session.finaleRun.currentRole].token);for(const step of ["harness","wheel","ladder","inner"])applyAction(session,viewer,"TRANSFER_STEP",{step});}
  assert.equal(session.finaleRun.phase,"surface");const final=authorize(session,session.players[session.finaleRun.currentRole].token);
  assert.equal(publicState(session,final).finale.communicationLocked,true);assert.deepEqual(publicState(session,final).chatMessages,[]);
  assert.throws(()=>applyAction(session,final,"CHAT_MESSAGE",{message:"Can anyone hear me?"}),/isolated/);
  applyAction(session,final,"UPDATE_SURFACE",{status:"distress",message:"CREW R-12. TOXIC SURFACE. EXTERNAL EXTRACTION REQUIRED.",isolation:"engaged",authority:"authorised",releaseTest:true});
  session.clock.endAt=1;expireIfNeeded(session,2);assert.equal(session.finaleRun.phase,"transfer");assert.equal(session.finaleRun.surfaceCommitted.timedOut,true);
  applyAction(session,facilitator,"CLASSIFY_MESSAGE",{rating:"effective"});session.clock.endAt=2;expireIfNeeded(session,3);
  assert.equal(session.stageStatus,"resolved");assert.equal(session.decisions[7].external.status,"OPERATIONAL / NO ACTIVE DISTRESS");assert.equal(session.decisions[7].external.message,"CLEAR");assert.equal(session.decisions[7].external.release,"ENABLED");assert.equal(session.finaleRun.transfers.length,4);
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

test("Outside Run timeout fails both unresolved services forward without route substitution", () => {
  const session=createSession({code:"TIME41",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  completeOutsidePlan(session,{plannedInbound:"c",plannedOutbound:"d",firstTarget:"c",equipment:["flood_kit","high_access"]});commitAndAdvance(session);
  update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");
  session.clock.running=true;session.clock.endAt=Date.now()-1;
  assert.equal(expireIfNeeded(session),true);
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

  const signal = publicState(session, authorize(session, session.players.signal.token));
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

test("Act 5 rotates one cabin move per player and exposes exact values only with Air Quality", () => {
  const session=createSession({code:"CABIN1",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  completeOutsidePlan(session,{plannedInbound:"c",plannedOutbound:"d",firstTarget:"c",equipment:["flood_kit","high_access"]});commitAndAdvance(session);
  update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");completeActiveFieldRun(session);
  applyAction(session,facilitator,"ADVANCE_STAGE");
  assert.equal(session.stage,5);assert.equal(session.clock.duration,240);
  session.global.systemStatus.air_quality="broken";
  const lead=authorize(session,session.players.lead.token),signal=authorize(session,session.players.signal.token);
  let leadState=publicState(session,lead);
  assert.equal(leadState.cabinRun.canAct,true);assert.equal(leadState.cabinRun.purgeAvailable,true);
  assert.equal(typeof leadState.cabinRun.toxin,"string");
  applyAction(session,lead,"CABIN_MOVE",{control:"intake",value:"sealed"});
  assert.throws(()=>applyAction(session,lead,"CABIN_MOVE",{control:"filter",value:"b"}),/Wait for/i);
  assert.equal(publicState(session,signal).cabinRun.canAct,true);
  applyAction(session,signal,"CABIN_MOVE",{control:"airflow",value:"exhaust"});
  applyAction(session,facilitator,"PAUSE");
  assert.throws(()=>applyAction(session,authorize(session,session.players.systems.token),"CABIN_MOVE",{control:"filter",value:"b"}),/paused/i);
  applyAction(session,facilitator,"RESUME");
  session.global.systemStatus.air_quality="working";
  assert.equal(typeof publicState(session,signal).cabinRun.toxin,"number");
});

test("Act 5 purge is conditional and timeout always reveals R-12 and grants a viable Act 6 window", () => {
  const session=createSession({code:"CABIN2",playerCount:4});connectCrew(session);startShift(session);
  completeHandover(session);commitAndAdvance(session);completeRepairStage(session);
  completeOutsidePlan(session);commitAndAdvance(session);update(session,{runner:"operations"});applyAction(session,facilitator,"COMMIT_STAGE");completeActiveFieldRun(session);applyAction(session,facilitator,"ADVANCE_STAGE");
  assert.equal(session.cabinRun.purgeAvailable,false);
  assert.throws(()=>applyAction(session,{kind:"public"},"END_CABIN_WINDOW",{note:"forge timeout"}),/not available/i);
  assert.throws(()=>applyAction(session,facilitator,"END_CABIN_WINDOW"),/Record why/i);
  assert.throws(()=>applyAction(session,authorize(session,session.players.lead.token),"CABIN_MOVE",{control:"purge"}),/Upper Ridge/i);
  session.clock.endAt=10;assert.equal(expireIfNeeded(session,11),true);
  assert.equal(session.stageStatus,"resolved");assert.equal(session.global.mara,"located");
  assert.ok(session.global.evidence.includes("R-12 protected volume sealed and stable"));
  assert.ok(session.global.act6InvestigationTime>=180&&session.global.act6InvestigationTime<=360);
  applyAction(session,facilitator,"ADVANCE_STAGE");
  assert.equal(session.clock.duration,session.global.act6InvestigationTime);
});

test("Act 5 sustained performance, not final switches or move count, determines Act 6 time", () => {
  const make=score=>{const session=createSession({playerCount:4});connectCrew(session);session.status="stage";session.stage=5;session.stageStatus="live";session.clock={duration:240,remaining:240,running:true,endAt:10};publicState(session,facilitator);session.cabinRun.performanceTotal=score*240;session.cabinRun.performanceSeconds=240;session.cabinRun.moves=[];expireIfNeeded(session,11);return session;};
  const strong=make(95),weak=make(20);
  assert.ok(strong.global.act6InvestigationTime>weak.global.act6InvestigationTime);
  assert.equal(strong.decisions[5].moves.length,0);assert.equal(weak.decisions[5].moves.length,0);
  assert.ok(weak.global.act6InvestigationTime>=180);assert.ok(strong.global.act6InvestigationTime<=360);
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
