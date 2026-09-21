import { GameClient, getContent } from "./network.js";
import { stationAudio } from "./audio.js";
import { renderAct2Dashboard } from "./act2-dashboard.js?v=20260918-alignment-1";

const app = document.querySelector("#app");
const query = new URLSearchParams(location.search);
const view = query.get("view") || "home";
const code = (query.get("session") || "").toUpperCase();
const explicitToken = query.get("token") || "";
const snapshotMode = query.get("snapshot") === "1";
const storedToken = code ? localStorage.getItem(`blackout-token-${code}`) || "" : "";
const client = new GameClient({ code, token: explicitToken || storedToken });
let content;
let error = "";
let reportError = "";
let chatOpen = snapshotMode && query.get("chat") === "open";
let chatUnread = 0;
let chatInitialized = false;
let lastChatMessageId = "";
let chatDraft = "";
let chatError = "";
let chatAlert = null;
let chatAlertTimer;
let pendingRepairAnswer=null;
let act2StatusOpen=snapshotMode&&query.get("status")==="open";
const act1PageByRole = {};
const act2ManualPageByRole = {};
const requestedEntryMode = query.get("entry");
let entryMode = snapshotMode && ["boot", "access", "host", "join"].includes(requestedEntryMode) ? requestedEntryMode : "boot";
let entryCrewSize = 7;

const ready = () => { app.dataset.ready = "1"; };
const e = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const seconds = state => state.clock.running && state.clock.endAt ? Math.max(0, Math.ceil((state.clock.endAt - Date.now()) / 1000)) : state.clock.remaining;
const time = value => `${String(Math.floor(value / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`;
const clockDisplay = state => {
  const left=seconds(state);
  if(state.stage!==6||state.archive?.exactDeadline)return time(left);
  const fraction=left/Math.max(1,state.clock.duration);
  return fraction>.75?"WINDOW OPEN":fraction>.5?"HAZE RISING":fraction>.25?"AIR STRAINED":"CRITICAL";
};
const roleList = state => Object.entries(state.roles);
const joinRole = (_id, role) => role;
const challengeNames = ["Account for shift","Repair station","Plan outside run","Execute outside run","Keep cabin breathable","Investigate Lark Shift","Get below"];
const repairBoardOrder = ["lower_road_camera","received_traffic_log","air_quality","inbound_receive","source_identification","human_outbound","status_beacon","tower_monitoring","road_flood_monitoring","ventilation_control","site_access_control","fire_suppression"];
const brandLogo = className => `<img class="brand-logo ${className || ""}" src="./assets/images/logo2.webp" alt="Blackout Ridge">`;
const gameIcon = (file, alt, className = "") => `<img class="game-icon ${className}" src="./assets/images/${file}" alt="${e(alt)}">`;
const gameImage = file => `./assets/images/${e(file)}${file === "mara-venn-below.webp" ? "?v=20260825-1" : ""}`;
const roleAsset = id => `role-${id}.webp`;
const crewAsset = count => count === 4 ? "control-four-terminals.webp" : count === 5 ? "control-five-terminals.webp" : count === 7 ? "control-seven-terminals.webp" : "control-six-terminals.webp";
const crewProtocol = count => count < 6 ? "COMBINED CREW" : count === 6 ? "CORE CREW" : "FULL CREW";
const chatIcon = () => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z"></path><path d="M8 9h8M8 12h5"></path></svg>`;

function url(nextView, session = code, token = "") {
  const result = new URL(location.origin + location.pathname);
  result.searchParams.set("view", nextView);
  if (session) result.searchParams.set("session", session);
  if (token) result.searchParams.set("token", token);
  return result.href;
}

function topbar(label, session = code) {
  return `<header class="topbar"><a class="brand" href="${url("home", "")}">${brandLogo("topbar-logo")}</a><div class="topbar-meta"><span class="meta-label">${e(label)}</span>${session ? `<span class="session-chip"><span class="status-dot"></span>${e(session)}</span>` : ""}</div></header>`;
}

function button(text, action, kind = "primary", disabled = false) {
  return `<button class="button ${kind}" data-action="${action}" ${disabled ? "disabled" : ""}>${text}</button>`;
}

function stationAccess() {
  if (entryMode === "boot") return `<section class="station-entry boot-entry"><button class="engage-device" data-entry-mode="access" aria-label="Engage Blackout Ridge station"><img src="./assets/images/device-station-engage.webp" alt="Frozen emergency station engagement lever"><span class="engage-state"><small>RIDGE RELAY LINK</small><b><i></i>OFFLINE</b><em>MANUAL AUTH REQUIRED</em></span><span class="engage-command"><b>ENGAGE STATION</b><small>ARM NIGHT-SHIFT CHANNEL</small></span><span class="engage-cursor">INTERACT&nbsp;&nbsp;›</span></button></section>`;
  if (entryMode === "access") return `<section class="station-entry access-entry"><header><span>AUTHORITY SELECT</span><b>CHOOSE CHANNEL</b><button data-entry-mode="boot">×</button></header><div class="authority-select"><button data-entry-mode="host">${gameIcon("control-host-authority.webp","Command authority key","authority-icon")}<span><b>COMMAND AUTHORITY</b><small>Initialize a new night shift</small></span><em>HOST</em></button><button data-entry-mode="join">${gameIcon("control-crew-channel.webp","Secure crew radio","authority-icon")}<span><b>CREW CHANNEL</b><small>Connect to an active station</small></span><em>JOIN</em></button></div></section>`;
  if (entryMode === "host") return `<section class="station-entry configure-entry"><header><span>COMMAND AUTHORITY</span><b>SHIFT CONFIGURATION</b><button data-entry-mode="access">←</button></header><div class="crew-selector"><span>ACTIVE TERMINALS / PRODUCTION CREW</span><div>${[4,5,6,7].map(count=>`<button class="${entryCrewSize===count?"active":""}" data-crew-size="${count}">${gameIcon(crewAsset(count),`${count} linked terminals`)}<span><i>${String(count).padStart(2,"0")}</i><small>CREW</small></span></button>`).join("")}</div></div><button class="station-confirm illustrated-control" data-create-session>${gameIcon("control-host-authority.webp","Authority key")}<span><b data-control-label>ARM NEW SESSION</b><small>GENERATE PRIVATE CREW CHANNELS</small></span><i></i></button>${error?`<p class="station-error">${e(error)}</p>`:""}</section>`;
  return `<section class="station-entry configure-entry join-entry"><header><span>CREW CHANNEL</span><b>SESSION AUTHENTICATION</b><button data-entry-mode="access">←</button></header><form data-enter>${gameIcon("control-code-auth.webp","Secure relay code lock","code-auth-icon")}<label>ENTER SIX-CHARACTER RELAY CODE<input name="code" maxlength="6" autocomplete="off" placeholder="BR2107" required autofocus></label><button class="station-confirm illustrated-control">${gameIcon("control-crew-channel.webp","Crew channel radio")}<span><b>CONNECT TERMINAL</b><small>REQUEST ROLE ASSIGNMENT</small></span><i></i></button></form>${error?`<p class="station-error">${e(error)}</p>`:""}</section>`;
}

function activateStartBackground() {
  const videos = [...document.querySelectorAll("[data-start-video]")];
  if (videos.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let active = 0;
  let transitioning = false;
  const crossfade = async () => {
    if (transitioning || !videos[active]?.isConnected) return;
    transitioning = true;
    const next = (active + 1) % videos.length;
    const currentVideo = videos[active];
    const nextVideo = videos[next];
    nextVideo.currentTime = 0;
    try { await nextVideo.play(); } catch { transitioning = false; return; }
    nextVideo.classList.add("active");
    currentVideo.classList.remove("active");
    setTimeout(() => {
      if (!currentVideo.isConnected) return;
      currentVideo.pause();
      currentVideo.currentTime = 0;
      active = next;
      transitioning = false;
    }, 1300);
  };
  videos.forEach(video => {
    video.addEventListener("timeupdate", () => {
      if (video === videos[active] && video.duration - video.currentTime < 1.35) crossfade();
    });
    video.addEventListener("ended", crossfade);
  });
  videos[0].play().catch(() => {});
}

function renderHome() {
  ready();
  app.innerHTML = `<div class="game-start">
    <img class="game-start-bg" src="./assets/images/first-screen-v2.webp" alt="Blackout Ridge relay station in a violent storm">
    ${[1,2,3,4].map((number,index)=>`<video class="start-bg-video ${index===0?"active":""}" data-start-video muted playsinline preload="auto" poster="./assets/images/first-screen-v2.webp" aria-hidden="true"><source src="./assets/video/${number}.mp4" type="video/mp4"></video>`).join("")}
    <div class="game-start-grade"></div><div class="storm-flash"></div>
    <header class="start-ident"><i></i><div><b>CALDER VALE / NODE 04</b><small>EMERGENCY RELAY · NIGHT SHIFT</small></div></header>
    <section class="start-title">${brandLogo("start-main-logo")}<h2>OPERATIONAL DOES NOT MEAN SAFE.</h2><strong>SYSTEM STARTUP REQUIRES HUMAN CREW.</strong><small>SUPPORTED SHIFT: 02 / 04 / 05 / 06 / 07 TERMINALS</small></section>
    ${stationAccess()}
    <div class="start-coordinates">CALDER VALE RELAY NETWORK / NODE 04<br>WEATHER CHANNEL: SEVERE</div>
  </div>`;
  activateStartBackground();
}

async function renderJoin() {
  try { if (!content) content = await getContent(); } catch (cause) { error = cause.message; return renderError(); }
  let session;
  try { session = await client.load(); } catch (cause) { error = cause.message; }
  if (!session) return renderError();
  ready();
  const available = Object.entries(session.roles).filter(([id]) => !session.players[id]).map(([id,role])=>[id,joinRole(id,role,session.playerCount)]);
  app.innerHTML = `<div class="game-runtime join-runtime"><div class="runtime-world"><img src="./assets/images/relay-control-room.webp" alt="Blackout Ridge control room"><div class="runtime-grade"></div><div class="scan-sweep"></div></div>
    <header class="assembly-header">${brandLogo("assembly-logo")}<div><small>CREW INTAKE / PRIVATE CHANNEL</small></div><strong>SESSION ${e(code)}</strong></header>
    <form class="join-terminal join-hardware" data-join><header>${gameIcon("control-code-auth.webp","Terminal authentication lock")}<div><span>TERMINAL ASSIGNMENT</span><h1>CLAIM A RESPONSIBILITY</h1><small>One instrument. One private evidence channel.</small></div><i>AUTH // ${e(code)}</i></header><label class="callsign-control"><span>CREW IDENTIFIER</span><input name="name" maxlength="40" required placeholder="ENTER CALLSIGN"></label><div class="participant-care-mini"><b>PARTICIPANT CARE</b><span>${e(session.participantCare)}</span></div><div class="role-choice-grid">${available.map(([id,r],i) => `<label class="role-choice role-pod"><input type="radio" name="role" value="${id}" ${i===0?"checked":""}><span class="role-art color-${r.color}">${gameIcon(roleAsset(id),`${r.name} instrument`)}<i></i></span><span class="role-data"><em>${r.short}</em><b>${r.name}</b><small>${r.lens}</small></span></label>`).join("")}</div>${error ? `<p class="inline-error">${e(error)}</p>` : ""}<button class="role-connect illustrated-control" ${available.length ? "" : "disabled"}>${gameIcon("control-crew-channel.webp","Secure crew radio")}<span><b>CONNECT ROLE TERMINAL</b><small>OPEN PRIVATE EVIDENCE CHANNEL</small></span><i></i></button></form>
    <div class="join-transmission"><span>INCOMING SHIFT</span><b>${available.length} RESPONSIBILITIES UNCLAIMED</b><small>Every crew member receives different evidence. Speak carefully.</small></div>
  </div>`;
}

function progress(state) {
  return `<nav class="stage-progress" aria-label="Game progress">${Array.from({length:7},(_,i)=>i+1).map(n => `<span class="${n < state.stage ? "done" : n === state.stage ? "active" : ""}"><i>${n}</i><b>${n===state.stage ? state.stageDefinition?.kicker : ""}</b></span>`).join("")}</nav>`;
}

function runtimeHud(state, label, role = null) {
  const stageNumber = String(state.stage).padStart(2,"0");
  const stageName = state.status === "ending" ? "MISSION COMPLETE" : state.stageDefinition?.kicker || "STANDBY";
  return `<header class="runtime-hud">
    <div class="hud-brand">${brandLogo("hud-logo")}<span><small>${e(label)}</small></span></div>
    <div class="hud-stage ${state.status === "ending" ? "complete" : ""}"><span class="hud-stage-counter"><small>STAGE</small><strong>${stageNumber}</strong><em>/ 07</em></span><div>${Array.from({length:7},(_,i)=>`<i class="${i+1<state.stage?"done":i+1===state.stage?"active":""}"></i>`).join("")}</div><b><small>CURRENT MISSION</small>${e(stageName)}</b></div>
    ${role ? `<div class="hud-role color-${role.color}"><span>${role.short}</span><b>${e(role.name)}</b></div>` : ""}
    <div class="hud-clock ${seconds(state)<=60&&state.stageStatus==="live"?"urgent":""}"><span>${state.stageStatus.toUpperCase()}</span><b data-clock>${clockDisplay(state)}</b></div>
    <button class="sound-toggle ${stationAudio.enabled?"active":""}" data-sound aria-label="Toggle station ambience"><span>◉</span> ${stationAudio.enabled?"AUDIO ON":"AUDIO"}</button>
    <div class="hud-session"><span>CREW</span><i></i>${e(state.code)}</div>
  </header>`;
}

function runtimeBackground(state) {
  return `<div class="runtime-world"><img src="${gameImage(state.stageDefinition.image)}" alt="${e(state.stageDefinition.title)}"><div class="runtime-grade"></div><div class="storm-flash"></div><div class="scan-sweep"></div></div>`;
}

function act1LeadIn(state) {
  if(state.stage!==1||!state.act1Intro||Date.now()>=state.act1Intro.endsAt)return "";
  return `<section class="act1-lead-in" aria-label="Act 1 opening video"><video data-act1-lead-in playsinline preload="auto"><source src="./assets/video/act1-lead-in.mp4" type="video/mp4"></video><div class="act1-lead-in-grade"></div><header><span>BLACKOUT RIDGE / INCOMING SHIFT</span><b>ACT 1 · NIGHT SHIFT HANDOVER</b></header><div class="act1-lead-in-status"><i></i><span>APPROACHING RELAY STATION</span><b data-intro-countdown></b></div><button data-intro-sound>${stationAudio.enabled?"FULL AUDIO ACTIVE":"ENABLE FULL AUDIO"}</button></section>`;
}

function act2Opening(state) {
  if(state.stage!==2||!state.act2Intro||Date.now()>=state.act2Intro.endsAt)return "";
  const elapsed=Math.max(0,(Date.now()-state.act2Intro.startedAt)/1000),beat=elapsed<9?0:elapsed<16?1:elapsed<25?2:3;
  const scenes=[
    ["act2-opening-storm-station-v1.webp","STORM AT THE STATION","The relay cabin holds its night watch as the storm closes in."],
    ["act2-opening-lightning-strike-v1.webp","LIGHTNING STRIKE","The mast and central station infrastructure take a direct hit."],
    ["act2-opening-emergency-lighting-v1.webp","EMERGENCY LIGHTING","Normal power collapses. Emergency lighting and backup supply survive."],
    ["act2-opening-control-returns-v1.webp","CONTROL RETURNS","Damaged instruments restart unevenly. The station still reports operational."]
  ];
  return `<section class="act2-opening" data-act2-opening aria-label="Act 2 opening sequence">${scenes.map(([src,title,copy],index)=>`<figure data-opening-beat="${index}" class="${index===beat?"active":""}"><img src="./assets/images/act2/${src}" alt=""><figcaption><small>0${index+1} / AFTER THE STRIKE</small><b>${title}</b><span>${copy}</span></figcaption></figure>`).join("")}<header><span>BLACKOUT RIDGE</span><b>ACT 2 · AFTER THE STRIKE</b></header><footer><i></i><span>STATION SYSTEMS REBOOTING</span><b data-act2-opening-countdown>${Math.max(0,Math.ceil((state.act2Intro.endsAt-Date.now())/1000))}</b></footer></section>`;
}

function activateAct1LeadIn(state) {
  const video=document.querySelector("[data-act1-lead-in]");if(!video)return;
  const elapsed=Math.max(0,(Date.now()-state.act1Intro.startedAt)/1000);
  const finish=()=>render(client.state);
  video.addEventListener("loadedmetadata",()=>{video.currentTime=Math.min(elapsed,Math.max(0,video.duration-.08));},{once:true});
  video.addEventListener("ended",finish,{once:true});
  const attempt=video.play();
  attempt?.catch(()=>{video.muted=true;video.play().catch(()=>{});});
}

function waveform(count = 46) {
  return `<div class="signal-wave" aria-hidden="true">${Array.from({length:count},(_,i)=>`<i style="--h:${18+((i*17+i*i*3)%79)}%"></i>`).join("")}</div>`;
}

function signalIntercept(state, compact = false) {
  const signal=state.signalTransmission;if(!signal)return "";
  const routine=signal.kind==="routine",local=signal.kind==="local",ambient=signal.kind==="ambient";
  return `<section class="signal-intercept ${compact?"compact":""} ${signal.integrity<30?"weak":""} ${routine||local?"routine":""}"><header><span>${local?"LOCAL FIELD RADIO":routine?"ROUTINE EXTERNAL TRAFFIC":ambient?"AMBIENT EXTERNAL TRAFFIC":"DEGRADED SIGNAL"} / STAGE ${String(state.stage).padStart(2,"0")}</span><b>${signal.integrity}% INTEGRITY</b></header>${waveform(compact?22:38)}<p>${e(signal.transcript)}</p><small>${e(signal.source)} · ${e(signal.instruction)}</small></section>`;
}

function environmentStrip(state, compact = false) {
  const x=state.environment;if(!x)return "";
  const entries=[
    ["CHEMICAL AIR",`${x.airMeterPpm} PPM / ${x.airStatus}`],
    ["LOWER ROAD",x.roadStatus],
    ["CORDON",x.cordonStatus],
    ["STORM",x.stormStatus],
  ];
  return `<section class="environment-strip ${compact?"compact":""}"><header><span>INCIDENT PRESSURES</span><b>OUTSIDE WINDOW ${x.outsideWindow?"OPEN":"CLOSED"}</b></header><div>${entries.map(([name,value])=>`<i><small>${e(name)}</small><strong>${e(value)}</strong></i>`).join("")}</div></section>`;
}

function challengeStack(state) {
  return `<aside class="challenge-stack"><header><span>THE 7 CHALLENGES</span><b>${state.stage}/7</b></header>${challengeNames.map((name,i)=>{const n=i+1,status=n<state.stage?"complete":n===state.stage?"active":"locked";return `<div class="${status}"><i>${n}</i><span>${name}</span><b>${status==="active"?"IN PROGRESS":status==="complete"?"CLEARED":"PENDING"}</b></div>`}).join("")}</aside>`;
}

function stationFeed(state) {
  const entries=state.history.slice(-3);
  return `<section class="station-feed"><header><span>AUDIO / STATION FEED</span><b>SECURE CHANNEL</b></header>${waveform()}<div>${entries.map(item=>`<p><i>${new Date(item.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</i>${e(item.text)}</p>`).join("")}</div></section>`;
}

function storyContext(state, compact = false) {
  const story=state.stageDefinition?.story||{},previous=state.stage>1?state.outcomes?.[state.stage-1]:null;
  const cause=previous?.headline||"Mara misses handover while the automated record begins to fill the gaps.";
  return `<section class="story-context ${compact?"compact":""}"><header><span>${e(story.chapter||"THE INCIDENT CONTINUES")}</span><b>STORY THREAD ${String(state.stage).padStart(2,"0")} / 07</b></header><div><article><small>${state.stage===1?"INCIDENT BEGINS":"WHAT YOUR LAST DECISION CAUSED"}</small><strong>${e(cause)}</strong></article><i>→</i><article><small>WHY THIS STAGE HAPPENS NOW</small><strong>${e(story.arrival||state.stageDefinition.scene)}</strong></article></div><p><b>IF YOU DO NOTHING:</b> ${e(story.pressure||"The automated status continues to harden.")}</p></section>`;
}

function stageWorkflow(state, compact=false){
  const repairActive=state.stage===2&&state.repairRun?.phase==="repair";
  const archiveTechnical=state.stage===6&&state.archive?.phase==="technical";
  const finaleMode=state.stage===7?state.finale?.mode:null;
  const workflows={
    1:["HOW STAGE 1 WORKS","Each player reads a different private departure record.","Discuss all six names and combine records aloud.","The facilitator marks YES only when departure is evidenced, then submits.","No answer key or score appears; what the crew understood carries forward."],
    2:repairActive?["HOW STAGE 2 WORKS / REPAIR WINDOW","Open your assigned private repair.","Complete every required choice, then submit once.","Your result locks immediately; there is no retry.","Help the crew interpret live traffic while other repairs finish."]:["HOW STAGE 2 WORKS / PRIORITISATION","Inspect the twelve panels and open the Systems Manual.","Discuss which failed capabilities matter most.","Assign one different amber FAULT system to every player.","The facilitator locks assignments; private repairs then begin together."],
    3:["HOW STAGE 3 WORKS","Players share private function, component, location, timing and equipment clues.","Choose different inbound and outbound service locations.","Choose the first stop and exactly two specialist items.","Lock only a physically viable plan; the interface does not reveal diagnostic correctness."],
    4:["HOW STAGE 4 WORKS","The runner describes the installation; the station cannot see it.","Station players match the observation to their procedure and lock one instruction.","The runner receives that instruction and commits one physical action.","Repeat at the second locked site. Neither site allows a retry."],
    6:archiveTechnical?["HOW STAGE 6 WORKS / TECHNICAL HALF","Search and open the R-12 operating records.","Every player learns DISTRESS → EXTRACTION MESSAGE → RELEASE CONFIGURATION.","Teach it aloud because the final surface operator will be alone.","There is no submission; the archive closes automatically when time expires."]:["HOW STAGE 6 WORKS / HISTORY HALF","Search and open the short Lark Shift records.","Share useful facts aloud and reconstruct why six people entered R-12.","Separate the unknown initiating threat from the known cause of death.","At midpoint, the technical R-12 archive unlocks automatically."],
    7:finaleMode==="surface"?["HOW STAGE 7 WORKS / FINAL OPERATOR","You are the last person above and cannot receive coaching from below.","Set station distress, write an extraction message and configure authorised release.","Commit the surface dashboard, then complete your own transfer.","The facilitator classifies the committed message; survival is compared with rescue time."]:finaleMode==="below"?["HOW STAGE 7 WORKS / INSIDE R-12","Your transfer is complete and surface communication is locked.","Do not coach players still above.","Watch shared refuge air and independently decide whether to use a finite purge.","Wait while the remaining transfers and final surface procedure complete."]:["HOW STAGE 7 WORKS / EVACUATION","A hidden random order activates one player at a time.","The active player completes four transfer steps; slower movement adds contamination.","Players already below lose surface communication and may use shared purge cycles.","The final person above completes the three-part surface procedure alone."],
  };
  const content=workflows[state.stage];if(!content||state.stage===5)return "";
  const [title,...steps]=content;
  return `<section class="stage-workflow ${compact?"compact":""}"><header>${e(title)}</header><ol>${steps.map(step=>`<li>${e(step)}</li>`).join("")}</ol></section>`;
}

function missionPlate(state) {
  const prior=state.stage>1?state.outcomes?.[state.stage-1]:null,story=state.stageDefinition.story||{};
  return `<section class="mission-plate"><span>${e(story.chapter||state.stageDefinition.kicker)}</span><h1>${e(state.stageDefinition.title)}</h1>${prior?`<p class="mission-cause"><b>BECAUSE:</b> ${e(prior.headline)}.</p>`:""}<p>${e(state.stageDefinition.scene)}</p><strong><b>YOUR DECISION:</b> ${e(state.stageDefinition.objective)}</strong><small><b>PRESSURE:</b> ${e(story.pressure||"")}</small></section>`;
}

function decisionImpactPanel(state, compact = false) {
  const preview=state.decisionPreview;if(!preview)return "";
  const list=(items,empty)=>items.length?`<ul>${items.map(item=>`<li>${e(item)}</li>`).join("")}</ul>`:`<p>${e(empty)}</p>`;
  return `<section class="decision-impact-panel ${compact?"compact":""} ${preview.ready?"ready":"not-ready"}"><header><span>BEFORE YOU COMMIT / CONSEQUENCE CHECK</span><b>${preview.ready?"PLAN READY":"ACTION REQUIRED"}</b></header><h3>${e(preview.summary)}</h3><div class="decision-impact-columns"><article><span>${e(preview.positiveLabel||"WHAT THIS PRESERVES OR ENABLES")}</span>${list(preview.keeps,"No capability selected yet.")}</article><article><span>${e(preview.costLabel||"WHAT THIS COSTS OR LEAVES EXPOSED")}</span>${list(preview.costs,"No tradeoff identified yet.")}</article></div>${preview.warnings.length?`<div class="decision-warnings">${preview.warnings.map(item=>`<p><b>!</b>${e(item)}</p>`).join("")}</div>`:""}<footer>${e(preview.footer||"Commit only when the crew can explain both the benefit and the tradeoff.")}</footer></section>`;
}

const ACT1_ICON_PATHS={
  closeout:"./assets/images/act1/icons/shift-closeout-v1.webp",movements:"./assets/images/act1/icons/external-movements-v1.webp",access:"./assets/images/act1/icons/site-access-v1.webp",transport:"./assets/images/act1/icons/transport-v1.webp",work:"./assets/images/act1/icons/work-maintenance-v1.webp",comms:"./assets/images/act1/icons/handover-comms-v1.webp",map:"./assets/images/act1/icons/local-map-v1.webp",roster:"./assets/images/act1/icons/handover-roster-v1.webp",read:"./assets/images/act1/icons/read-records-v1.webp",share:"./assets/images/act1/icons/share-facts-v1.webp",decide:"./assets/images/act1/icons/team-decision-v1.webp",facilitator:"./assets/images/act1/icons/facilitator-console-v1.webp",yes:"./assets/images/act1/icons/accounted-v1.webp",no:"./assets/images/act1/icons/unaccounted-v1.webp",pending:"./assets/images/act1/icons/discussion-v1.webp",verified:"./assets/images/act1/icons/verified-evidence-v1.webp",
};
const act1Icon=(id,alt="")=>`<img class="act1-item-icon" src="${ACT1_ICON_PATHS[id]||ACT1_ICON_PATHS.verified}" alt="${e(alt)}">`;

function handoverBoard(state, interactive = false) {
  const answers=state.draft?.handover||{},staff=state.stageDefinition?.options||[],complete=staff.filter(([id])=>["yes","no"].includes(answers[id])).length;
  return `<section class="handover-board ${interactive?"interactive":"readonly"}"><header>${act1Icon("roster","")}<span>SIX OUTGOING STAFF / DEPARTURE CHECK</span><b>${complete} / ${staff.length} REVIEWED</b></header><p>These are the <strong>previous shift's six staff members</strong>, not the current players. <strong>ACCOUNTED FOR</strong> means their departure is supported by the records.</p><div>${staff.map(([id,name,task])=>{const answer=answers[id]||"pending";return `<label class="handover-person ${answer}">${act1Icon(answer,"")}<span><b>${e(name)}</b><small>${e(task||"")}</small></span>${interactive?`<select data-handover-person="${id}" aria-label="Is ${e(name)} accounted for?">${choiceOptions([["","PENDING — REVIEW EVIDENCE"],["yes","YES — DEPARTURE ESTABLISHED"],["no","NO — DEPARTURE NOT ESTABLISHED"]],answer==="pending"?"":answer)}</select>`:`<strong>${answer==="yes"?"YES / ACCOUNTED FOR":answer==="no"?"NO / NOT ACCOUNTED FOR":"PENDING"}</strong>`}</label>`;}).join("")}</div></section>`;
}

const act1SystemNames = [
  "VENTILATION CONTROL","INBOUND RECEIVE","MESSAGE REPLAY","SOURCE IDENTIFICATION",
  "TOWER MONITORING","STATUS BEACON","ROAD / FLOOD MONITORING","LOWER ROAD CAMERA",
  "HUMAN OUTBOUND","BACKUP POWER BALANCE","FIRE SUPPRESSION","GENERATOR TELEMETRY",
];
const act1SystemGlyphs = ["◉","⌁","▶","▤","⌁","◈","▲","▣","●","ϟ","◆","⚙"];

function act1SystemDashboard() {
  return `<aside class="act1-system-dashboard"><header><span>SYSTEM STATUS / CONTROL</span><b><i></i>12 / 12 OPERATIONAL</b></header><div>${act1SystemNames.map((name,index)=>`<article><em>${index+1}</em><i aria-hidden="true">${act1SystemGlyphs[index]}</i><span>${e(name)}</span><b>OPERATIONAL</b></article>`).join("")}</div><footer><span>STATION SUMMARY</span><b>ALL SERVICES NOMINAL</b></footer></aside>`;
}

function act1OperationalHeader(state, mode) {
  return `<section class="act1-operational-header"><div class="act1-dashboard-title"><span>${mode==="player"?"PRIVATE OPERATIONS":"OPERATIONAL DASHBOARD"}</span><b>${mode==="player"?"RECORD REVIEW":"NIGHT SHIFT HANDOVER"}</b><small>SECURE LINK · RECORD ROLLOVER ACTIVE</small></div><div class="act1-weather-panel"><span>WEATHER CONDITIONS</span><b><i>☂</i> HEAVY RAIN</b><small>WIND: 42 MPH · VISIBILITY: LOW<br>STRIKE RISK: ELEVATED</small></div><div class="act1-station-panel"><span>21:14</span><b>STATION STATUS</b><strong>OPERATIONAL</strong><small>EXTERNAL POWER: ONLINE<br>BACKUP: STANDBY</small></div></section>`;
}

function act1Transmission(state) {
  const item=state.signalTransmission;
  return item?`<aside class="act1-transmission" role="status" aria-live="polite"><span>INCOMING / ${e(item.source)}</span><p>${e(item.transcript)}</p><small>CAPTION · STORED IN RECEIVED TRAFFIC LOG</small></aside>`:"";
}

function act1EvidenceScreen(screen) {
  if(!screen)return "";
  if(screen.kind==="map"){
    const symbols=["◆","⌂","⌁","ϟ","P","⊣","↘","▦"];
    return `<section class="act1-evidence act1-map"><header>${act1Icon("map","")}<span>PRIVATE RECORD</span><h1>${e(screen.title)}</h1><p>${e(screen.scope)}</p></header><div class="act1-map-field"><img src="./assets/images/act1/act1-local-site-map-v1.webp" alt="Illustrated operational map of the Blackout Ridge relay site and roads to Calder Vale">${screen.locations.map(([name,detail],index)=>`<article aria-label="${e(name)}: ${e(detail)}"><i aria-hidden="true"><span>${symbols[index]||"•"}</span></i><b>${e(name)}</b></article>`).join("")}</div></section>`;
  }
  const cell=(column,value)=>{
    const normalized=String(value).trim().toUpperCase();
    if(screen.id==="work"&&column==="STATUS"&&["COMPLETE","OPEN"].includes(normalized)){
      const state=normalized.toLowerCase(),icon=state==="complete"?"verified":"work";
      return `<span class="record-status ${state}">${act1Icon(icon,"")}<b>${e(value)}</b></span>`;
    }
    const classes=[];
    if(column==="TIME")classes.push("record-time");
    if(["NAME","PERSON","FROM","ASSIGNED"].includes(column)&&value!=="—")classes.push("record-person");
    if(normalized.includes("FAULT"))classes.push("record-fault");
    return `<span class="${classes.join(" ")}">${e(value)}</span>`;
  };
  return `<section class="act1-evidence screen-${e(screen.id)}"><header>${act1Icon(screen.id,"")}<span>PRIVATE RECORD</span><h1>${e(screen.title)}</h1><p>${e(screen.scope)}</p></header><div class="act1-record-table" style="--cols:${screen.columns.length}"><div class="act1-record-row heading">${screen.columns.map(value=>`<b>${e(value)}</b>`).join("")}</div>${screen.rows.map(row=>`<div class="act1-record-row">${row.map((value,index)=>cell(screen.columns[index],value)).join("")}</div>`).join("")}</div>${screen.note?`<footer>${e(screen.note)}</footer>`:""}</section>`;
}

function act1OutgoingStaffStatus(state) {
  const answers=state.draft?.handover||{},staff=state.stageDefinition?.options||[],complete=staff.filter(([id])=>["yes","no"].includes(answers[id])).length;
  return `<section class="act1-player-task staff-status-only" aria-live="polite"><header>${act1Icon("roster","")}<span>OUTGOING STAFF STATUS</span><b>${complete} / ${staff.length} REVIEWED</b></header><div>${staff.map(([id,name])=>{const answer=answers[id]||"pending";return `<span class="${answer}">${act1Icon(answer,"")}<span><b>${e(name)}</b><small>${answer==="yes"?"ACCOUNTED FOR":answer==="no"?"NOT ACCOUNTED FOR":"DISCUSS"}</small></span></span>`}).join("")}</div></section>`;
}

function act1PrivatePanel(state) {
  const screens=state.privateCard?.act1Screens||[],role=state.viewer.role,index=Math.min(act1PageByRole[role]||0,Math.max(0,screens.length-1));
  return `<main class="act1-private-main">${act1OutgoingStaffStatus(state)}${screens.length>1?`<nav aria-label="Assigned evidence screens">${screens.map((screen,page)=>`<button data-act1-page="${page}" class="${page===index?"active":""}">${act1Icon(screen.id,"")}<span>${page+1} · ${e(screen.title)}</span></button>`).join("")}</nav>`:""}${act1EvidenceScreen(screens[index])}</main>`;
}

function act1Runtime(state, mode) {
  const role=state.viewer.kind==="player"?state.roles[state.viewer.role]:null;
  const center=mode==="player"?act1PrivatePanel(state):`<main class="act1-handover-main"><header>${act1Icon("facilitator","")}<span>FACILITATOR / TEAM DECISION</span><h1>NIGHT SHIFT HANDOVER</h1><p>The current players compare their private records. Record the crew's answer for each of the six outgoing staff below; changes appear live on every player terminal.</p></header>${handoverBoard(state,mode==="facilitator")}</main>`;
  const completeControl=mode==="facilitator"&&state.stageStatus==="live"?`<button class="act1-complete-handover" data-action="COMMIT_STAGE" ${!state.decisionPreview?.ready?"disabled":""}>${act1Icon("closeout","")}<span>COMPLETE HANDOVER</span></button>`:"";
  return `<div class="game-runtime act1-runtime act1-image-console ${mode} role-${role?.color||""}">${runtimeBackground(state)}${runtimeHud(state,mode==="player"?"PRIVATE RECORD TERMINAL":mode==="facilitator"?"FACILITATOR / HANDOVER":"SHARED HANDOVER",role)}<div class="act1-shell">${act1OperationalHeader(state,mode)}<div class="act1-layout">${center}${act1SystemDashboard()}</div><footer class="act1-secure-footer"><span>BLACKOUT RIDGE CONTROL SYSTEMS&nbsp;&nbsp;//&nbsp;&nbsp;SECURE LINK</span><div class="act1-rollover-control"><b>RECORD ROLLOVER — <i data-clock>${time(seconds(state))}</i></b>${completeControl}</div><small>FOR OPERATIONAL USE ONLY</small></footer></div>${act1Transmission(state)}${state.hint?`<div class="runtime-alert"><b>FACILITATOR</b><span>${e(state.hint)}</span></div>`:""}${state.stageStatus==="resolved"?immersiveOutcome(state,mode==="facilitator"):""}${safety(state)}${observerMode(state)}${act1LeadIn(state)}</div>`;
}

function repairTraffic(state){
  const traffic=state.repairRun?.traffic||[];
  const archive=state.preStrikeArchive||[];
  return `<section class="repair-traffic"><header><span>EXTERNAL TRAFFIC / LIVE</span><b>${traffic.length} / 5 RECEIVED</b></header>${archive.length?`<details class="pre-strike-archive" open><summary>RECEIVED TRAFFIC LOG / PRE-STRIKE ARCHIVE · ${archive.length}</summary>${archive.map(item=>`<article class="archive"><header><b>${e(item.ref)}</b><i>STORED</i></header><strong>${e(item.title)}</strong><p>${e(item.text)}</p><small>${e(item.source)} · CLEAR / ATTRIBUTED</small></article>`).join("")}</details>`:""}${traffic.length?traffic.map(item=>`<article class="${item.clarity}"><header><b>${e(item.ref)}</b><i>${e(item.clarity.toUpperCase())}</i></header><strong>${e(item.title)}</strong><p>${e(item.text)}</p><small>${e(item.source)} · ${item.stored?"STORED EXACTLY AS RECEIVED":"NOT STORED"}</small></article>`).join(""):`<p>Traffic carrier open. Waiting for the first emergency transmission.</p>`}</section>`;
}

function act2ReceivedTrafficLog(state){
  const logWorking=(state.repairSystems||[]).find(system=>system.id==="received_traffic_log")?.state==="working";
  const traffic=state.repairRun?.traffic||[],rows=traffic.filter(item=>item.stored||["direct","recovered"].includes(item.storageState));
  const clock=value=>value?new Date(value).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}):"--:--:--";
  if(!logWorking)return `<section class="act2-recovered-log unavailable"><header>${act2SystemIcon("received_traffic_log","Received Traffic Log")}<span><small>02 / RECEIVED TRAFFIC LOG</small><h2>LOG UNAVAILABLE</h2></span><b>BUFFER SEALED</b></header><div class="traffic-log-offline"><i>!</i><span><b>NO READABLE ACT 2 ENTRIES</b><small>Incoming traffic is held in the receiver buffer while this panel remains faulty.</small></span></div><footer>EXISTING HISTORY PRESERVED · REPAIR REQUIRED FOR ACCESS</footer></section>`;
  const archive=(state.preStrikeArchive||[]).map(item=>`<div class="traffic-log-row archive"><time>${e(item.time||"PRE-STRIKE")}</time><strong>${e(item.source)}</strong><p>${e(item.text)}</p><i>ARCHIVE</i></div>`).join("");
  const live=rows.map(item=>`<div class="traffic-log-row ${item.clarity} ${item.storageState||"direct"}"><time>${clock(item.receiptStartAt||item.at)}</time><strong>${e(item.capturedSource||item.source)}</strong><p>${e(item.displayedTranscript||item.text)}</p><i>${item.storageState==="recovered"?"RECOVERED":"LOGGED"}</i></div>`).join("");
  return `<section class="act2-recovered-log"><header>${act2SystemIcon("received_traffic_log","Received Traffic Log")}<span><small>02 / RECEIVED TRAFFIC LOG</small><h2>RECOVERED RECEIVED TRAFFIC LOG</h2></span><b>${rows.filter(item=>item.storageState==="recovered").length} RECOVERED</b></header><div class="traffic-log-columns"><b>RECEIPT TIME</b><b>CAPTURED SOURCE</b><b>MESSAGE AS RECEIVED</b><b>STATE</b></div><div class="traffic-log-rows" data-act2-traffic-log>${archive}${live||`<p class="traffic-log-empty">LOG RESTORED · WAITING FOR THE NEXT COMPLETED TRANSMISSION</p>`}</div><footer>ORIGINAL RECEIPT ORDER · SOURCE AND TEXT ARE NEVER RETROACTIVELY IMPROVED · NO REPLAY</footer></section>`;
}

function repairSystemBoard(state, compact=false){
  const assigned=state.repairRun?.assignments||{},results=state.repairRun?.results||{},ownerBySystem=Object.fromEntries(Object.entries(assigned).map(([role,id])=>[id,role]));
  const systems=[...(state.repairSystems||[])].sort((a,b)=>repairBoardOrder.indexOf(a.id)-repairBoardOrder.indexOf(b.id));
  return `<section class="repair-system-board ${compact?"compact":""}"><header><span>CABIN CONSOLE / 12 SYSTEMS</span><b>${state.repairRun?.phase==="repair"?"REPAIRS ACTIVE":"PRIORITISATION"}</b></header><div>${systems.map(system=>{const role=ownerBySystem[system.id],result=role&&results[role],status=system.state||"broken";return `<article class="${status} ${role?"assigned":""}"><i></i><span><b>${e(system.name)}</b><small>${e(system.manual)}</small></span><strong>${status==="working"?"WORKING":"FAULT"}</strong>${role?`<em>${e(state.players[role]?.name||state.roles[role]?.name||role)}${result?` / ${result.success?"RESTORED":"FAILED"}`:" / ASSIGNED"}</em>`:""}</article>`}).join("")}</div></section>`;
}

function repairAssignmentControls(state){
  const assignments=state.draft?.repairs||{},systems=(state.repairSystems||[]).filter(system=>system.selectable&&state.repairRun?.available.includes(system.id)).sort((a,b)=>repairBoardOrder.indexOf(a.id)-repairBoardOrder.indexOf(b.id));
  return `<div class="repair-assignment"><header><span>ONE REPAIR PER PLAYER</span><b>${Object.values(assignments).filter(Boolean).length} / ${state.playerCount} ASSIGNED</b></header><div>${roleList(state).map(([role,definition])=>`<label><span><b>${e(state.players[role]?.name||definition.name)}</b><small>${e(definition.short)}</small></span><select data-repair-role="${role}">${choiceOptions([["","SELECT FAILED SYSTEM"],...systems.map(system=>[system.id,system.name])],assignments[role]||"")}</select></label>`).join("")}</div><details><summary>OPEN SYSTEMS MANUAL</summary>${systems.map(system=>`<article><b>${e(system.name)}</b><p>${e(system.manual)}</p></article>`).join("")}</details></div>`;
}

function outsidePlanBoard(state,interactive=false){
  const d=state.draft||{},locations=state.outsideLocations||[],equipment=state.fieldEquipment||[],external=state.global.externalStatus||{};
  const choices=[["","CHOOSE LOCATION"],...locations.map(location=>[location.id,location.name])];
  return `<section class="outside-plan-board ${interactive?"interactive":"readonly"}"><header><span>FIELD DEPLOYMENT / RUNNER LEAVES AT T+0</span><b>RESPIRATORY THRESHOLD 18 PPM</b></header><div class="outside-heartbeat"><span>AUTOMATIC HEARTBEAT</span><b>${e(state.officialStatus.code)}</b><small>${e(state.officialStatus.detail)}</small></div><div class="external-failures">${[["external_inbound","EXTERNAL INBOUND"],["external_human_outbound","HUMAN OUTBOUND"],["lower_road_camera_history","LOWER ROAD CAMERA + HISTORY"],["ventilation_path","VENTILATION CONTROL"]].map(([id,label])=>`<article><i></i><span>${e(label)}</span><b>${e((external[id]||"offline").toUpperCase())}</b></article>`).join("")}</div><div class="outside-location-grid">${locations.map(location=>`<article><header><b>${e(location.name)}</b><i>SITE FAULT CONFIRMED</i></header><p>Cabin → site ${location.travel} min · service ${location.service} min</p><small>T+0 AIR ${location.concentration} PPM · RISE ${location.rise} PPM/MIN</small></article>`).join("")}</div>${interactive?`<div class="outside-plan-inputs"><label><span>PLANNED INBOUND LOCATION</span><select data-field="plannedInbound">${choiceOptions(choices,d.plannedInbound)}</select></label><label><span>PLANNED HUMAN OUTBOUND LOCATION</span><select data-field="plannedOutbound">${choiceOptions(choices,d.plannedOutbound)}</select></label><label><span>RUNNER FIRST TARGET</span><select data-field="firstTarget">${choiceOptions(choices,d.firstTarget)}</select></label><fieldset><legend>FIELD EQUIPMENT / SELECT EXACTLY TWO</legend>${equipment.map(([id,label])=>`<label><input type="checkbox" data-array="equipment" value="${id}" ${(d.equipment||[]).includes(id)?"checked":""}><span>${e(label)}</span></label>`).join("")}</fieldset></div>`:`<footer>All four sites contain genuine faults. The shared map shows physical constraints only; private role notes hold the diagnostic and service evidence.</footer>`}</section>`;
}

function repairPuzzleFields(puzzle){
  if(!puzzle)return `<section class="repair-puzzle-loading" role="status"><i></i><b>SECURE REPAIR PACKAGE IN TRANSIT</b><span>Synchronising the assigned diagnostic with this terminal…</span></section>`;
  if(puzzle.type==="guide-choice"){
    const table=puzzle.table?`<div class="repair-evidence-table" style="--cols:${puzzle.table.head.length}"><div>${puzzle.table.head.map(cell=>`<b>${e(cell)}</b>`).join("")}</div>${puzzle.table.rows.map(row=>`<div>${row.map(cell=>`<span>${e(cell)}</span>`).join("")}</div>`).join("")}</div>`:"";
    const visual=repairTechnicalVisual(puzzle.visual);
    return `<section class="repair-client-rules"><b>PLAYER TASK / RULES</b><p>${e(puzzle.rules||puzzle.instruction)}</p></section><div class="repair-guide-workspace">${visual}<section class="repair-evidence"><header>EVIDENCE / SAVED DIAGNOSTIC</header><div class="repair-facts">${puzzle.facts.map((fact,index)=>`<p><i>${String(index+1).padStart(2,"0")}</i>${e(fact)}</p>`).join("")}</div>${table}</section><fieldset class="repair-guide-options"><legend>SELECT REPAIR CONFIGURATION</legend>${puzzle.options.map(([id,label])=>`<label><input type="radio" name="choice" value="${id}" required><i>${id.toUpperCase()}</i><span>${e(label)}</span><b>SELECT REPAIR</b></label>`).join("")}</fieldset></div>`;
  }
  if(puzzle.type==="sequence")return `<div class="repair-sequence">${puzzle.tokens.map((_,index)=>`<label><span>${index+1}</span><select name="slot${index}" required>${choiceOptions([["","SELECT STEP"],...puzzle.tokens],"")}</select></label>`).join("")}</div>`;
  if(puzzle.type==="path")return `<div class="repair-path">${puzzle.fields.map(field=>`<fieldset><legend>${e(field.label)}</legend>${field.options.map(([id,label])=>`<label><input type="radio" name="${field.id}" value="${id}" required><span>${e(label)}</span></label>`).join("")}</fieldset>`).join("")}</div>`;
  if(puzzle.type==="logic")return `<fieldset class="repair-logic">${puzzle.choices.map(([id,label])=>`<label><input type="radio" name="choice" value="${id}" required><span>${e(label)}</span></label>`).join("")}</fieldset>`;
  if(puzzle.type==="match")return `<div class="repair-match">${puzzle.rows.map(row=>`<label><span>${e(row.label)}</span><select name="${row.id}" required>${choiceOptions([["","MATCH COMPONENT"],...puzzle.options],"")}</select></label>`).join("")}</div>`;
  if(puzzle.type==="calibrate")return `<label class="repair-calibrate"><output data-repair-output>42 ${e(puzzle.unit)}</output><input name="value" type="range" min="${puzzle.min}" max="${puzzle.max}" value="42" data-repair-range><span>${puzzle.min} ${e(puzzle.unit)} <i>APPLY CORRECTION</i> ${puzzle.max} ${e(puzzle.unit)}</span></label>`;
  if(puzzle.type==="balance")return `<fieldset class="repair-balance"><legend>TARGET LOAD / ${puzzle.target} UNITS</legend>${puzzle.loads.map(([id,label,value])=>`<label><input type="checkbox" name="selected" value="${id}" data-repair-load="${value}"><span>${e(label)} <b>${value}</b></span></label>`).join("")}<output data-repair-total>0 / ${puzzle.target}</output></fieldset>`;
  return `<fieldset class="repair-zones">${puzzle.zones.map(([id,label])=>`<label><input type="checkbox" name="selected" value="${id}"><span>${e(label)}</span></label>`).join("")}</fieldset>`;
}

function repairTechnicalVisual(type){
  const art={
    "module-chain":"./assets/images/act2/puzzles/act2-puzzle-inbound-receive-art-v2.webp",
    "beacon-tests":"./assets/images/act2/puzzles/act2-puzzle-status-beacon-art-v2.webp",
    "channel-map":"./assets/images/act2/puzzles/act2-puzzle-tower-monitoring-art-v2.webp",
    "sensor-calibration":"./assets/images/act2/puzzles/act2-puzzle-air-quality-art-v2.webp",
    "switch-routing":"./assets/images/act2/puzzles/act2-puzzle-traffic-log-art-v2.webp",
    "timing-axis":"./assets/images/act2/puzzles/act2-puzzle-source-id-art-v2.webp",
    "valve-network":"./assets/images/act2/puzzles/act2-puzzle-fire-suppression-art-v2.webp",
    "relay-circuit":"./assets/images/act2/puzzles/act2-puzzle-road-flood-art-v2.webp",
    "signal-graphs":"./assets/images/act2/puzzles/act2-puzzle-human-outbound-art-v2.webp",
    "reader-grid":"./assets/images/act2/puzzles/act2-puzzle-site-access-art-v2.webp"
  }[type];
  const artwork=art?`<img class="repair-generated-art" src="${art}" alt="">`:"";
  // Generated guide artwork replaces the original code-drawn diagnostic.
  // Never stack both layers: it duplicates labels, lines and symbols.
  if(art)return `<div class="repair-technical-visual visual-${e(type)} generated-only" aria-hidden="true">${artwork}</div>`;
  const open=`<div class="repair-technical-visual visual-${e(type)}" aria-hidden="true"><svg viewBox="0 0 360 260" role="presentation">`,close=`</svg></div>`;
  if(type==="module-chain")return `${open}<g class="lines"><path d="M28 78H92M124 78H188M220 78H284"/><path d="M28 182H92M124 182H188M220 182H284"/><path d="M108 94V166M204 94V166"/></g>${[[28,62,"A"],[28,166,"B"],[92,62,"B1"],[92,166,"B2"],[188,62,"F1"],[188,166,"F2"],[284,114,"RX"]].map(([x,y,t])=>`<g class="node"><rect x="${x}" y="${y}" width="44" height="32"/><text x="${x+22}" y="${y+21}">${t}</text></g>`).join("")}<text x="180" y="30" class="title">RECEIVE ROUTING</text><text x="180" y="244" class="note">SEVERE WEATHER / SURGE FILTER REQUIRED</text>${close}`;
  if(type==="signal-graphs")return `${open}<g class="grid"><path d="M25 45H335M25 95H335M25 145H335M25 195H335M25 35V215M85 35V215M145 35V215M205 35V215M265 35V215M325 35V215"/></g><g class="signal"><path d="M25 78 C45 45 65 45 85 78 S125 111 145 78 S185 45 205 78 S245 111 265 78 S305 45 335 78"/><path d="M25 178 C45 125 65 125 85 178 S125 231 145 178 S185 125 205 178 S245 231 265 178 S305 125 335 178"/></g><text x="30" y="25" class="title left">QUIET TEST</text><text x="30" y="128" class="title left">STRONG TEST / LIMIT ±4</text>${close}`;
  if(type==="beacon-tests")return `${open}<g class="tower"><path d="M180 52L145 210H215Z M166 112H194M157 153H203M149 193H211"/><circle cx="180" cy="48" r="8"/><path d="M155 40Q132 48 155 56M205 40Q228 48 205 56M140 29Q102 48 140 67M220 29Q258 48 220 67"/></g><text x="180" y="238" class="title">CONTROL LINK / BROADCAST ACTIVE</text>${close}`;
  if(type==="channel-map")return `${open}<g class="lines"><path d="M82 57H278M82 107H278M82 157H278M82 207H278"/></g>${["A","B","C","D"].map((t,i)=>`<g class="node"><rect x="28" y="${40+i*50}" width="54" height="34"/><text x="55" y="${62+i*50}">CH ${t}</text><rect x="278" y="${40+i*50}" width="54" height="34"/><text x="305" y="${62+i*50}">?</text></g>`).join("")}<text x="180" y="24" class="title">LOST EQUIPMENT LABEL MAP</text>${close}`;
  if(type==="sensor-calibration")return `${open}${["A","B","C","D","E"].map((t,i)=>`<g class="sensor"><path d="M${35+i*66} 86v92h42V86l-8-18h-26z"/><line x1="${40+i*66}" y1="118" x2="${72+i*66}" y2="118"/><line x1="${40+i*66}" y1="142" x2="${72+i*66}" y2="142"/><text x="${56+i*66}" y="205">${t}</text></g>`).join("")}<path class="signal" d="M34 48H326"/><text x="180" y="26" class="title">SAME REFERENCE AIR / ±1 STEP</text>${close}`;
  if(type==="switch-routing")return `${open}<g class="lines">${[55,100,145,190].map(y=>`<path d="M20 ${y}H340"/>`).join("")}</g>${[1,2,3,4,5,6].map((n,i)=>`<g class="switch"><rect x="${38+i*51}" y="80" width="30" height="84"/><text x="${53+i*51}" y="124">S${n}</text></g>`).join("")}<text x="180" y="25" class="title">FOUR BUFFER LINES / SIX SWITCHES</text><text x="180" y="230" class="note">REVERSE EXACTLY THREE</text>${close}`;
  if(type==="timing-axis")return `${open}<line class="axis" x1="22" y1="156" x2="338" y2="156"/>${Array.from({length:9},(_,i)=>`<g><line class="tick" x1="${28+i*38}" y1="145" x2="${28+i*38}" y2="168"/><text x="${28+i*38}" y="187">${i+1}</text><rect class="slot" x="${29+i*38}" y="80" width="36" height="46"/></g>`).join("")}<line class="marker" x1="104" y1="55" x2="104" y2="170"/><line class="marker" x1="256" y1="55" x2="256" y2="170"/><text x="104" y="45">64 ms</text><text x="256" y="45">160 ms</text><text x="180" y="225" class="title">SAMPLE EACH DIGIT AT MIDPOINT</text>${close}`;
  if(type==="valve-network")return `${open}<g class="lines"><path d="M75 130L180 55L285 130L180 205Z M75 130L180 205M180 55L180 205"/></g>${[[75,130,"A"],[180,55,"B"],[180,205,"C"],[285,130,"D"]].map(([x,y,t])=>`<g class="node"><circle cx="${x}" cy="${y}" r="28"/><text x="${x}" y="${y+5}">${t}</text></g>`).join("")}<text x="125" y="82" class="valve">V1</text><text x="188" y="130" class="valve">V2</text><text x="115" y="177" class="valve">V3</text><text x="235" y="82" class="valve">V4</text><text x="238" y="178" class="valve">V5</text>${close}`;
  if(type==="relay-circuit")return `${open}<g class="lines"><path d="M24 130H58M58 130V72H135V130M58 130V188H135V130H172M172 130V72H250V130M172 130V188H250V130H292M292 130H337"/></g>${[[82,72,"R1"],[82,188,"R2"],[198,72,"R3"],[198,188,"R4"],[286,130,"R5"]].map(([x,y,t])=>`<g class="node"><rect x="${x}" y="${y-17}" width="48" height="34"/><text x="${x+24}" y="${y+5}">${t}</text></g>`).join("")}<circle class="lamp" cx="337" cy="130" r="16"/><text x="180" y="30" class="title">PARALLEL WARNING RELAYS</text>${close}`;
  if(type==="reader-grid")return `${open}<g class="card">${["BWBBWBW","WWWWWWW","BBBBWBB","BBBBWWW","WWBBBBW"].map((row,r)=>[...row].map((cell,c)=>`<rect class="${cell==="B"?"black":"white"}" x="${54+c*34}" y="${38+r*34}" width="31" height="31"/>`).join("")).join("")}<rect class="head" x="${54+4*34}" y="38" width="65" height="65"/><rect class="target" x="${54+3*34}" y="${38+2*34}" width="65" height="65"/><path class="move" d="M250 120v64h-36"/></g><text x="180" y="230" class="title">CARD 2 · CURRENT COLS 5–6 → TARGET ROWS 3–4 / COLS 4–5</text>${close}`;
  return `${open}<text x="180" y="130" class="title">DIAGNOSTIC DISPLAY</text>${close}`;
}

function repairPlayerPanel(state){
  const id=state.repairAssignment||state.repairResult?.systemId,system=(state.repairSystems||[]).find(item=>item.id===id),result=state.repairResult,puzzle=state.repairPuzzle;
  if(result){const success=result.status==="success",timeout=result.status==="timeout";return `<section class="repair-player-console submitted ${success?"success":timeout?"timeout":"failed"}"><div class="repair-result-mark"><i>${success?"✓":timeout?"00:00":"×"}</i><span><small>${timeout?"REPAIR WINDOW CLOSED":"REPAIR CONFIRMED / NO RETRY"}</small><h1>${e(system?.name||id)}</h1></span></div><strong>${success?(id==="received_traffic_log"?"BUFFER TRANSFER COMPLETE · TRAFFIC LOG RESTORED":"SYSTEM RESTORED"):timeout?"NO REPAIR APPLIED":"FAULT REMAINS"}</strong><p>${success?e(puzzle?.success||"Your confirmed repair took effect immediately. Remain on this terminal while the shared window continues."):timeout?"No confirmation was accepted before the deadline. The system remains faulty.":"The confirmed repair did not restore the system. No further attempt is available."}</p>${act2PrivateCaptions(state)}<footer>${state.stageStatus==="resolved"?"REPAIR WINDOW CLOSED":"WAITING FOR THE SHARED REPAIR WINDOW TO CLOSE"}</footer></section>`;}
  if(!id||!puzzle)return `<section class="repair-player-console awaiting-package">${repairPuzzleFields(null)}</section>`;
  return `<form class="repair-player-console puzzle-${e(id)}" data-repair-submit data-repair-type="${e(puzzle.type)}" novalidate><header class="repair-puzzle-head"><span>${e(puzzle.figure||"PRIVATE REPAIR")} / ONE ATTEMPT</span><h1>${e(system?.name||id)}</h1><p>${e(puzzle.instruction||"")}</p></header>${repairPuzzleFields(puzzle)}<p class="repair-submit-guidance" role="status">Select one repair configuration. Selection opens confirmation; it does not submit immediately.</p><button type="submit">REVIEW SELECTED REPAIR</button><small>THE SHARED REPAIR CLOCK CONTINUES DURING CONFIRMATION</small></form>`;
}

function act2PrivateCaptions(state){
  const traffic=state.repairRun?.traffic||[];
  return `<section class="act2-private-captions"><header>INCOMING CAPTIONS / LIVE</header>${traffic.length?traffic.slice(-3).map(item=>`<article><time>${e(item.ref)}</time><span><b>${e(item.capturedSource||item.source)}</b><p>${e(item.displayedTranscript||item.text)}</p></span></article>`).join(""):`<p>Carrier open. Waiting for incoming traffic.</p>`}</section>`;
}

const ACT2_SYSTEM_ICONS={
  lower_road_camera:"lower-road-camera-v2.webp",received_traffic_log:"received-traffic-log-v2.webp",air_quality:"air-quality-v2.webp",inbound_receive:"inbound-receive-v2.webp",source_identification:"source-identification-v2.webp",human_outbound:"human-outbound-v2.webp",status_beacon:"status-beacon-v2.webp",tower_monitoring:"tower-monitoring-v2.webp",road_flood_monitoring:"road-flood-monitoring-v2.webp",ventilation_control:"ventilation-control-v2.webp",site_access_control:"site-access-control-v2.webp",fire_suppression:"fire-suppression-v2.webp",
};
const act2SystemIcon=(id,alt="")=>`<img src="./assets/images/act2/system-icons/${ACT2_SYSTEM_ICONS[id]||"tower-monitoring-v1.webp"}" alt="${e(alt)}">`;

function act2World(){return `<div class="runtime-world act2-world"><img src="./assets/images/act2-control-room-post-strike-v1.webp" alt="Blackout Ridge control room immediately after the lightning strike"><div class="runtime-grade"></div><div class="storm-flash"></div><div class="scan-sweep"></div></div>`;}

function act2StatusHeader(state,mode){
  const assignments=Object.values(state.repairRun?.phase==="planning"?state.draft?.repairs||{}:state.repairRun?.assignments||{}).filter(Boolean).length;
  const phase=state.repairRun?.phase;
  return `<header class="act2-status-header"><div class="act2-identity">${brandLogo("act2-logo")}<span><small>${mode==="facilitator"?"COMMAND AUTHORITY":mode==="player"?"PRIVATE OPERATIONS":"SHARED OPERATIONS"}</small><b>SYSTEM RECOVERY</b></span></div><div class="act2-heartbeat"><small>AUTOMATIC STATION STATUS</small><b>OPERATIONAL</b><span>NO ACTIVE DISTRESS</span></div><div class="act2-weather"><small>HEAVY RAIN / STRIKE DAMAGE</small><b>${phase==="planning"?"PRIORITISATION":phase==="dispatch"?"ASSIGNMENTS LOCKED":"REPAIRS ACTIVE"}</b><span>${phase==="repair"?`${Object.keys(state.repairRun?.results||{}).length} / ${state.playerCount} COMPLETE`:`${assignments} / ${state.playerCount} ASSIGNED`}</span></div><div class="act2-phase"><small>ACT 02 / ${e(state.code)}</small><b data-clock>${time(seconds(state))}</b></div></header>`;
}

function act2InstrumentBoard(state){
  return renderAct2Dashboard(state);
}

function act2Manual(state){
  const role=state.viewer.role,page=act2ManualPageByRole[role]||0;
  const pageIds=page?["source_identification","ventilation_control","road_flood_monitoring","lower_road_camera","site_access_control","fire_suppression"]:["inbound_receive","human_outbound","status_beacon","tower_monitoring","air_quality","received_traffic_log"];
  const byId=Object.fromEntries((state.repairSystems||[]).map(system=>[system.id,system])),systems=pageIds.map(id=>byId[id]).filter(Boolean);
  const instruction="Several station systems are faulty. You have three minutes to choose one repair for each crew member. Consult the Station Systems Manual and assign different faulty systems. You will then have five minutes to attempt your repairs independently. Choose an answer and confirm it to submit your only attempt. Unfilled assignments will be allocated randomly when planning ends.";
  return `<section class="act2-manual"><header><div><small>STATION REFERENCE / SYSTEM FUNCTIONS</small><h1>STATION SYSTEMS MANUAL</h1></div><nav><button data-act2-manual-page="0" class="${page===0?"active":""}">PAGE 1</button><button data-act2-manual-page="1" class="${page===1?"active":""}">PAGE 2</button><button class="status-tab" data-act2-status-open>12 SYSTEMS</button></nav></header><p class="act2-manual-instruction">${instruction}</p><div>${systems.map(system=>`<article>${act2SystemIcon(system.id,system.name)}<span><i>${String(system.panelId).padStart(2,"0")} /</i><b>${e(system.name)}</b><small>FUNCTION</small><p>${e(system.manual)}</p></span></article>`).join("")}</div><footer><span>DISCUSS CAPABILITIES · DO NOT ASSUME FUTURE PAYOFFS</span><b>PAGE ${page+1} / 2</b></footer></section>`;
}

function act2AssignmentDeck(state){
  const assignments=state.draft?.repairs||{},systems=(state.repairSystems||[]).filter(system=>system.selectable&&state.repairRun?.available.includes(system.id)),locked=state.repairRun?.phase!=="planning";
  return `<section class="act2-assignment-deck ${locked?"locked":""}"><div class="act2-assignment-title">${gameIcon("control-host-authority.webp","Command assignment control")}<span><small>FACILITATOR CONTROL</small><h1>${locked?"PRIORITISATION CLOSED":"ASSIGN THE REPAIR CREW"}</h1><p>${locked?"Selections are locked. Fill any empty terminals randomly, then dispatch every repair together.":"One different failed instrument per operator. Choices remain live for the full three-minute window."}</p></span></div><div class="act2-assignment-lines">${roleList(state).map(([role,definition])=>{const selected=systems.find(system=>system.id===assignments[role]);return `<label>${gameIcon(roleAsset(role),definition.name)}<span><small>${e(definition.short)}</small><b>${e(state.players[role]?.name||definition.name)}</b></span><i>→</i><span class="assignment-system-icon">${selected?act2SystemIcon(selected.id,selected.name):gameIcon("control-code-auth.webp","Unassigned system")}</span><select data-repair-role="${role}" ${locked?"disabled":""}>${choiceOptions([["","SELECT FAILED INSTRUMENT"],...systems.map(system=>[system.id,system.name])],assignments[role]||"")}</select></label>`;}).join("")}</div><div class="act2-assignment-footer"><span><b>${Object.values(assignments).filter(Boolean).length} / ${state.playerCount}</b> OPERATORS ASSIGNED</span><small>${locked?"LOCKED AT 00:00":"THE SYSTEM CONSOLE DOES NOT REVEAL WHICH REPAIRS MATTER LATER"}</small></div></section>`;
}

function act2AvailableSystems(state){
  const assigned=state.repairRun?.phase==="planning"?state.draft?.repairs||{}:state.repairRun?.assignments||{};
  const taken=new Set(Object.values(assigned).filter(Boolean));
  const systems=(state.repairSystems||[]).filter(system=>system.selectable&&state.repairRun?.available.includes(system.id));
  return `<section class="act2-available-systems"><header><small>AVAILABLE SYSTEMS</small><b>${systems.length-taken.size} UNASSIGNED</b></header><div>${systems.map(system=>`<article class="${taken.has(system.id)?"assigned":""}">${act2SystemIcon(system.id,system.name)}<span><i>${String(system.panelId).padStart(2,"0")}</i><b>${e(system.name)}</b><small>${taken.has(system.id)?"ASSIGNED":"LOCAL FAULT"}</small></span></article>`).join("")}</div></section>`;
}

function act2RepairMonitor(state){
  const assignments=state.repairRun?.assignments||{},results=state.repairRun?.results||{};
  return `<section class="act2-repair-monitor"><header><small>REPAIR PROGRESS</small><b>${Object.keys(results).length} / ${state.playerCount} ATTEMPTS COMPLETE</b></header><div>${roleList(state).map(([role,definition])=>{const id=assignments[role],system=(state.repairSystems||[]).find(item=>item.id===id),result=results[role],status=result?result.success?"SUCCEEDED":"FAILED":state.stageStatus==="resolved"?"TIMED OUT":state.repairRun?.phase==="repair"?"IN PROGRESS":"ASSIGNED",method=state.repairRun?.assignmentMethod?.[role]==="random"?"RANDOM":"CREW CHOICE";return `<article>${gameIcon(roleAsset(role),definition.name)}<span><small>${e(state.players[role]?.name||definition.name)} · ${method}</small><b>${e(system?.name||"AWAITING ASSIGNMENT")}</b></span><strong class="${result?result.success?"restored":"failed":"active"}">${status}</strong></article>`;}).join("")}</div></section>`;
}

function act2StatusModal(state){
  if(!act2StatusOpen)return "";
  return `<section class="station-status-dialog" role="dialog" aria-modal="true" aria-label="Station Status and Control"><header class="station-status-toolbar"><span>STATION STATUS / LIVE <small>· Scroll to explore on smaller screens</small></span><button type="button" data-act2-status-close aria-label="Close station status"><i aria-hidden="true"></i><span>CLOSE PANEL<small>RETURN TO TERMINAL</small></span></button></header><div class="station-status-viewport" tabindex="0" aria-label="Scrollable station dashboard"><div class="station-status-live">${act2InstrumentBoard(state)}</div></div></section>`;
}

function act2DispatchWait(){return `<section class="act2-dispatch-wait">${gameIcon("control-code-auth.webp","Dispatch lock")}<small>PRIORITISATION CLOSED</small><h1>REPAIR ASSIGNMENTS LOCKED</h1><p>The facilitator is completing the assignment pool. Every private repair will open simultaneously.</p><b>STAND BY FOR DISPATCH</b></section>`;}

function act2Runtime(state,mode){
  const role=mode==="player"?state.roles[state.viewer.role]:null,phase=state.repairRun?.phase,planning=phase==="planning",dispatch=phase==="dispatch";
  const filled=Object.values(state.draft?.repairs||{}).filter(Boolean).length===state.playerCount;
  const dispatchReady=filled||dispatch;
  const allFinished=phase==="repair"&&Object.keys(state.repairRun?.results||{}).length===state.playerCount;
  const dispatchControls=(planning||dispatch)?`<div class="act2-dispatch-controls ${dispatchReady?"ready":"waiting"}"><button data-action="DISPATCH_REPAIRS" ${dispatchReady?"":"disabled"}>${gameIcon(dispatchReady?"control-start-emergency.webp":"control-code-auth.webp",dispatchReady?"Dispatch repair crew":"Dispatch locked")}<span>${dispatch?"DISPATCH / AUTO-ASSIGN OPEN TASKS":filled?"DISPATCH ALL REPAIRS":"DISPATCH LOCKED"}<small>${dispatch?"PLANNING CLOSED · START FIVE-MINUTE CLOCK":filled?"ALL TASKS ASSIGNED · READY":"ASSIGN EVERY OPERATOR OR WAIT FOR 00:00"}</small></span></button></div>`:"";
  const completionControl=allFinished?`<div class="act2-completion-control"><button data-action="COMMIT_STAGE">${gameIcon("control-start-emergency.webp","Complete Act 2")}<span>COMPLETE ACT 2<small>ALL ${state.playerCount} ATTEMPTS RECORDED</small></span></button></div>`:"";
  const playerPrimary=mode!=="player"?"":planning?act2Manual(state):dispatch?act2DispatchWait():`<section class="act2-player-game">${repairPlayerPanel(state)}</section>`;
  const center=mode==="shared"?act2InstrumentBoard(state):mode==="facilitator"?`<section class="act2-facilitator-console">${phase==="repair"?act2RepairMonitor(state):act2AssignmentDeck(state)}</section><aside class="act2-fac-system-view">${act2AvailableSystems(state)}</aside>`:`<div class="act2-player-primary">${playerPrimary}</div>`;
  const terminalHeader=mode==="player"?runtimeHud(state,"PRIVATE REPAIR TERMINAL",role):mode==="facilitator"?runtimeHud(state,"FACILITATOR / SYSTEM RECOVERY"):"";
  const secureControl=mode==="facilitator"&&(dispatchControls||completionControl)?dispatchControls||completionControl:`<span>BLACKOUT RIDGE CONTROL SYSTEMS // SECURE LINK</span>`;
  const statusControl=mode!=="shared"?`<button class="act2-status-control" data-act2-status-open aria-label="Open station status dashboard"><img class="act2-status-control-icon" src="./assets/images/act2/station-status-control-icon-v1.webp" alt="Twelve-system station console"><span>OPEN STATION STATUS<small>12-SYSTEM LIVE CONTROL</small></span><strong>›</strong></button>`:"";
  return `<div class="game-runtime act2-runtime ${mode} phase-${phase} role-${role?.color||""}">${mode==="shared"?act2World():""}${terminalHeader}<div class="act2-shell">${mode==="shared"?act2StatusHeader(state,mode):""}<main>${center}</main><footer>${secureControl}<b>${planning?(filled?"ASSIGNMENTS COMPLETE · DISPATCH READY":"PRIORITISE FAILED SYSTEMS"):dispatch?"PRIORITISATION CLOSED · DISPATCH READY":"INDEPENDENT REPAIRS ACTIVE"}</b>${statusControl}<small>FOR OPERATIONAL USE ONLY</small></footer></div>${state.hint?`<div class="runtime-alert"><b>FACILITATOR</b><span>${e(state.hint)}</span></div>`:""}${state.stageStatus==="resolved"&&mode!=="player"?immersiveOutcome(state,mode==="facilitator"):""}${safety(state)}${observerMode(state)}${act2Opening(state)}${mode!=="shared"?act2StatusModal(state):""}</div>`;
}

function immersiveOutcome(state, facilitator = false) {
  const result=state.outcomes[state.stage]; if(!result)return "";
  const outcomeHeadline=state.stage===2?"Repair window closed":result.headline;
  const facilitatorControl=facilitator&&state.stage===7&&state.stageStatus==="resolved"?`<div class="final-outcome-actions"><button class="button danger" data-action="CONFIRM_ENDING"><img src="./assets/images/ending/icons/confirm-record-v1.webp" alt="">CONFIRM FINAL RECORD</button><button class="outcome-restart-control" data-restart-open><img src="./assets/images/ending/icons/restart-session-v1.webp" alt="">RESTART FORMER SESSION</button></div>`:facilitator&&state.stage<7&&state.stageStatus==="resolved"?`<div class="stage-consequence-actions"><button class="stage-advance-control" data-action="ADVANCE_STAGE"><img src="./assets/images/control-start-emergency.webp" alt=""><span>CONTINUE EMERGENCY<small>ADVANCE TO STAGE ${String(state.stage+1).padStart(2,"0")}</small></span></button><button class="outcome-restart-control" ${state.stage===2?"data-restart-act2":"data-restart-open"}><img src="./assets/images/ending/icons/restart-session-v1.webp" alt=""><span>${state.stage===2?"RESTART ACT 2":"RESTART FORMER SESSION"}<small>SAME LINKS · ${state.stage===2?"RETURN TO ACT 2 PRIORITISATION":"RETURN TO ACT 1"}</small></span></button></div>`:"";
  const maraFeed=state.stage===5?`<figure class="mara-observation-feed"><img src="${gameImage("mara-venn-below.webp")}" alt="R-12 observation feed showing Mara Venn alive"><figcaption><span>R-12 OBSERVATION / LIVE</span><b>MARA VENN</b><small>LIFE SIGNS CONFIRMED · ACCESS SEALED</small></figcaption></figure>`:"";
  const impacts=(result.impacts||[]).slice(0,2);
  return `<section class="consequence-overlay stage-${state.stage} ${result.quality}${facilitatorControl?" has-facilitator-controls":""}"><div class="consequence-scan"></div><div class="consequence-inner"><div class="consequence-surface"></div><div class="consequence-visual"><img class="consequence-scene" src="${gameImage(state.stageDefinition.consequenceImage||state.stageDefinition.image)}" alt="${e(state.stageDefinition.title)} consequence scene"></div><div class="consequence-copy">${maraFeed}<header class="outcome-record-head"><img src="./assets/images/ending/icons/confirm-record-v1.webp" alt=""><span><small>${state.stage===7?"FINAL INCIDENT RECORD":"STAGE CONSEQUENCE"}</small><b>STAGE ${String(state.stage).padStart(2,"0")} · ${result.expired?"TIME EXPIRED":"SUBMITTED"}</b></span></header><h2>${e(outcomeHeadline)}</h2><div class="outcome-cause"><span><img src="./assets/images/ending/icons/confirm-record-v1.webp" alt="">RECORDED DECISION</span><b>${e(result.decision||"Stage decision recorded.")}</b></div>${impacts.length?`<div class="outcome-impacts"><span><img src="./assets/images/ending/icons/preserve-record-v1.webp" alt="">IMMEDIATE EFFECT</span>${impacts.map(item=>`<p><i>→</i>${e(item)}</p>`).join("")}</div>`:""}<div class="outcome-next"><span><img src="./assets/images/control-start-emergency.webp" alt="">${state.stage===7?"FINAL RECORD":"NEXT"}</span><b>${e(result.next||"")}</b></div>${!facilitatorControl?`<small>${state.stage===7?"AWAITING FACILITATOR CONFIRMATION":"AWAITING FACILITATOR"}</small>`:""}</div><img class="modal-frame-art" src="./assets/images/ui/consequence-modal-frame-v1.webp" alt=""></div>${facilitatorControl}</section>`;
}

function tracks(state) {
  if(state.stage===1)return `<div class="handover-status-stack"><div><span>STATION SERVICE</span><b>OPERATIONAL</b></div><div><span>PERSONNEL EXCEPTIONS</span><b>NONE RAISED</b></div><div><span>HANDOVER</span><b>${state.stageStatus==="resolved"?"ACCEPTED":"REVIEW OPEN"}</b></div></div>`;
  const item = (name, value, max, labels, tone) => `<div class="full-track"><div><span>${name}</span><b class="tone-${tone}">${labels[value]}</b></div><div>${Array.from({length:max+1},(_,i)=>`<i class="${i<=value?`on ${tone}`:""}"></i>`).join("")}</div></div>`;
  const officialTrack=item("FALSE STATUS",state.global.official,3,["DRAFTING","REPEATING","HARDENING","FILED"],"green");
  return `<div class="full-tracks">${item("UPPER AIR",state.global.upperAir,3,["STABLE","TRACE","UNSAFE","CRITICAL"],"amber")}${item("EXTERNAL TRUST",state.global.trust,2,["UNVERIFIED","HEARD","CREDIBLE"],"cyan")}${officialTrack}</div>`;
}

function scene(state, compact = false) {
  const s = state.stageDefinition;
  if (!s) return "";
  return `<section class="game-scene ${compact?"compact":""}"><img src="${gameImage(s.image)}" alt="${e(s.title)}"><div class="game-scene-shade"></div><div class="game-scene-copy"><p class="eyebrow">STAGE ${String(state.stage).padStart(2,"0")} / ${e(s.kicker)}</p><h1>${e(s.title)}</h1><p>${e(s.scene)}</p><strong>${e(s.objective)}</strong></div><div class="game-clock ${seconds(state)<=60?"urgent":""}"><span>${state.stageStatus.toUpperCase()}</span><b data-clock>${time(seconds(state))}</b></div></section>`;
}

function roster(state) {
  return `<div class="full-roster">${roleList(state).map(([id,r])=>{const p=state.players[id], ready=state.reports[id], absent=state.absentRoles?.[id];return `<div class="${absent?"absent":""}"><span class="role-code color-${r.color}">${r.short}</span><span><b>${p?e(p.name):r.name}</b><small>${absent?"Temporarily absent":ready?"Assessment shared":p?"Connected":"Awaiting player"}</small></span><i class="${absent?"":ready?"ready":p?"online":""}"></i></div>`}).join("")}</div>`;
}

function assemblyRoster(state) {
  return `<div class="assembly-roster">${roleList(state).map(([id,r])=>{const p=state.players[id];return `<article class="${p?"connected":""}">${gameIcon(roleAsset(id),`${r.name} instrument`)}<span><em>${r.short}</em><b>${p?e(p.name):r.name}</b><small>${p?"CHANNEL LOCKED":"AWAITING OPERATOR"}</small></span><i></i></article>`}).join("")}</div>`;
}

function evidence(state) {
  return `<div class="evidence-ledger">${state.global.evidence.length ? state.global.evidence.slice(-8).map(x=>`<span>${e(x)}</span>`).join("") : "<p>No verified evidence entered</p>"}</div>`;
}

function outcome(state) {
  const result = state.outcomes[state.stage];
  if (!result) return "";
  return `<section class="full-outcome ${result.quality}"><p class="eyebrow">CONSEQUENCE / ${result.expired?"TIME EXPIRED":"CREW DECISION"}</p><h2>${e(result.headline)}</h2><p>${e(result.detail)}</p>${(result.impacts||[]).map(item=>`<small>→ ${e(item)}</small>`).join("")}<strong>NEXT: ${e(result.next||"")}</strong><div>${tracks(state)}</div></section>`;
}

function safety(state) { return state.safetyPaused ? `<div class="safety-screen"><div><span>SESSION PAUSED</span><h2>Take the time you need.</h2><p>The game clock is stopped. The facilitator will resume when the group is ready.</p></div></div>` : ""; }
function observerMode(state){return state.viewer.kind==="player"&&state.absentRoles?.[state.viewer.role]?`<div class="observer-screen"><div><span>OBSERVER MODE</span><h2>Your controls are safely isolated.</h2><p>You remain connected. The facilitator can restore this role without requiring an explanation.</p></div></div>`:"";}

function renderShared(state) {
  if (state.status === "lobby") return renderWaiting(state, "SHARED STATION DISPLAY");
  if (state.status === "ending") return renderEnding(state, "shared");
  if (state.stage === 1) { app.innerHTML=act1Runtime(state,"shared"); return; }
  if (state.stage === 2) { app.innerHTML=act2Runtime(state,"shared"); return; }
  app.innerHTML = `<div class="game-runtime shared-runtime stage-${state.stage}">${runtimeBackground(state)}${runtimeHud(state,"SHARED STATION")}
    ${challengeStack(state)}
    ${missionPlate(state)}
    <aside class="shared-decision-preview ${state.stage===6?"archive-view":state.stage===7?"finale-view":""}">${[1,2,3,4].includes(state.stage)?stageWorkflow(state,true):""}${state.stage===1?handoverBoard(state):state.stage===2?repairSystemBoard(state,true):state.stage===3?`${outsidePlanBoard(state)}${decisionImpactPanel(state,true)}`:state.stage===5?cabinAirPanel(state):state.stage===6?archivePanel(state):state.stage===7?finalePanel(state):decisionImpactPanel(state,true)}</aside>
    <aside class="telemetry-rack"><header><span>STATION TELEMETRY</span><i>LIVE</i></header>${tracks(state)}<div class="telemetry-evidence"><span>${state.stage===1?"PLAYER KNOWLEDGE / DISTRIBUTED":`VERIFIED / ${state.global.evidence.length}`}</span>${state.stage===1?"<p>Operational records remain on private terminals. The crew must communicate what it notices.</p>":evidence(state)}</div></aside>
    <aside class="crew-rack"><header>NIGHT CREW / ${Object.keys(state.players).length}.${state.playerCount}</header>${roster(state)}</aside>
    ${state.stage===7?"":environmentStrip(state)}
    ${state.stage===2?repairTraffic(state):state.stage===7?"":signalIntercept(state)}
    ${state.stage===7?"":stationFeed(state)}
    <section class="system-broadcast ${state.global.official>=2?"degraded":""}"><span>STATION STATUS</span><strong>${e(state.officialStatus.code)}</strong><i>${e(state.officialStatus.detail)}</i></section>
    ${state.hint?`<div class="runtime-alert"><b>FACILITATOR</b><span>${e(state.hint)}</span></div>`:""}
    ${state.stageStatus==="resolved"?immersiveOutcome(state):""}${safety(state)}
  </div>`;
}

function renderWaiting(state, label) {
  const full=Object.keys(state.players).length===state.playerCount,ready=full;
  app.innerHTML = `<div class="game-runtime assembly-runtime"><div class="runtime-world"><img src="./assets/images/station-exterior.webp" alt="Blackout Ridge"><div class="runtime-grade"></div><div class="storm-flash"></div></div>
    <header class="assembly-header">${brandLogo("assembly-logo")}<div><small>${e(label)}</small></div><strong>SESSION ${e(state.code)}</strong></header>
    <section class="assembly-console assembly-machine"><header>${gameIcon(crewAsset(state.playerCount),`${state.playerCount} terminal station ring`)}<div><span>SHIFT AUTHENTICATION / ${crewProtocol(state.playerCount)}</span><h1>${state.playerCount<6?"COMBINED CREW":"NIGHT CREW"} ASSEMBLING</h1><p><b>${Object.keys(state.players).length}</b> / ${state.playerCount} TERMINALS LOCKED</p></div><i></i></header>${assemblyRoster(state)}${state.viewer.kind==="facilitator"?`<div class="assembly-tools"><button data-copy-view="join">${gameIcon("control-copy-link.webp","Crew link connector")}<span><b>TRANSMIT CREW LINK</b><small>COPY SECURE INTAKE ADDRESS</small></span><i></i></button><a href="${url("shared",state.code)}" target="_blank">${gameIcon("control-shared-display.webp","Shared command display")}<span><b>ROOM DISPLAY</b><small>OPEN STATION WORLD VIEW</small></span><i></i></a></div><button class="assembly-start illustrated-control" data-action="START_GAME" ${ready?"":"disabled"}>${gameIcon("control-start-emergency.webp","Emergency start lever")}<span><b>${!full?"AWAITING FULL CREW":"INITIATE EMERGENCY"}</b><small>LOCK ROLES · START STAGE 01</small></span><i></i></button>`:`<div class="assembly-wait">${gameIcon("control-crew-channel.webp","Crew radio waiting")}<span><b>CHANNEL SECURED</b><small>AWAITING COMMAND AUTHORITY</small></span><i></i></div>`}</section>
  </div>`;
}

function choiceOptions(entries, selected) { return entries.map(([id,label])=>`<option value="${id}" ${selected===id?"selected":""}>${label}</option>`).join(""); }

function archivePanel(state) {
  const archive=state.archive;if(!archive)return "";
  const technical=archive.phase==="technical";
  const cards=archive.documents.map(item=>`<article class="archive-record ${item.featured?"featured":""}" data-archive-record data-search="${e([item.title,item.type,item.source,item.summary,item.detail,item.tags.join(" ")].join(" ").toLowerCase())}"><header><span>${e(item.type)}</span><b>${e(item.date)}</b></header><h3>${e(item.title)}</h3><p>${e(item.summary)}</p>${item.detail?`<details><summary>OPEN FULL RECORD</summary><p>${e(item.detail)}</p></details>`:""}${item.audio?`<div class="archive-audio"><audio controls preload="metadata" src="${e(item.audio)}"></audio><small>ACCESSIBLE TRANSCRIPT</small><p>${e(item.transcript)}</p></div>`:""}<footer>${e(item.source)}</footer></article>`).join("");
  const checklist=technical?`<aside class="archive-checklist"><span>FINAL SURFACE OPERATOR / MEMORISE</span>${archive.checklist.map((item,index)=>`<b><i>${index+1}</i>${e(item)}</b>`).join("")}<p>Do not execute these actions yet. Once a player descends, their microphone will be muted.</p></aside>`:`<aside class="archive-locked"><span>R-12 TECHNICAL FILES / LOCKED</span><b>UNLOCKS AT MIDPOINT</b><p>First establish why the Lark Shift entered the refuge and why rescue arrived too late.</p></aside>`;
  return `<section class="lark-archive ${technical?"technical":"history"}">${stageWorkflow(state,true)}<header><div><span>${technical?"PHASE 2 / R-12 OPERATING ARCHIVE":"PHASE 1 / THE LARK SHIFT"}</span><b>${archive.documents.length} LOCAL RECORDS AVAILABLE</b></div><label>SEARCH ARCHIVE<input type="search" data-archive-search placeholder="Try: isolation, six, operational, purge…"></label></header><div class="archive-rule"><b>${archive.exactDeadline?`EXACT WINDOW / <span data-clock>${time(seconds(state))}</span>`:"AIR QUALITY OFFLINE / DEADLINE SHOWN AS CONDITION ONLY"}</b><span>${archive.purgeAvailable?"UPPER RIDGE RESTORED / 3 R-12 PURGE CYCLES":"UPPER RIDGE OFFLINE / NO R-12 PURGE"}</span></div>${checklist}<div class="archive-grid">${cards}</div><p class="archive-empty" hidden data-archive-empty>No local record matches that search.</p><footer>READ → SHARE THE USEFUL FACT ALOUD → FOLLOW THE NEXT LEAD · SEARCHES AND OPENED FILES ARE NOT SCORED OR STORED</footer></section>`;
}

function decisionControls(state) {
  if (state.stageStatus !== "live") return "";
  const s=state.stageDefinition,d=state.draft,a=state.actions;
  if (s.mechanic === "handover") return handoverBoard(state,true);
  if (s.mechanic === "repairs") return state.repairRun?.phase==="planning"?repairAssignmentControls(state):`${repairSystemBoard(state,true)}${repairTraffic(state)}`;
  if (s.mechanic === "outside_plan") return outsidePlanBoard(state,true);
  if (s.mechanic === "outside") {
    if(state.fieldRun?.active)return fieldServicePanel(state);
    return `<div class="locked-run-preflight"><span>LOCKED FROM ACT 3</span><b>${(state.global.outsidePlan?[state.global.outsidePlan.RUNNER_FIRST_TARGET,[state.global.outsidePlan.PLANNED_INBOUND_LOCATION,state.global.outsidePlan.PLANNED_OUTBOUND_LOCATION].find(id=>id!==state.global.outsidePlan.RUNNER_FIRST_TARGET)]:[]).map(id=>state.stageDefinition.options.find(([value])=>value===id)?.[1]||id).join(" → ")}</b><small>${(state.global.outsidePlan?.FIELD_EQUIPMENT||[]).map(id=>state.fieldEquipment?.find(([value])=>value===id)?.[1]||id.replaceAll("_"," ").toUpperCase()).join(" + ")}</small><label><span>ASSIGNED RUNNER</span><select data-field="runner">${choiceOptions(roleList(state).map(([id,r])=>[id,state.players[id]?.name||r.name]),d.runner)}</select></label><p>Destinations, order and equipment cannot be changed in Act 4.</p></div>`;
  }
  if (s.mechanic === "cabin_air") return cabinAirPanel(state,true);
  if (s.mechanic === "archive") return archivePanel(state);
  if (s.mechanic === "finale") return finalePanel(state);
  return "";
}

function refugeStatus(state,interactive=false){
  const run=state.finale;if(!run)return "";
  return `<section class="r12-status ${run.airCondition.toLowerCase()}"><header><span>R-12 PROTECTED ATMOSPHERE</span><b>${e(run.airCondition)}</b></header><div><strong>${run.belowCount} / ${run.total} CREW BELOW</strong><i>${run.purgeAvailable?`${run.purgeRemaining} SHARED PURGE CYCLES`:"PURGE OFFLINE / UPPER RIDGE NOT RESTORED"}</i></div>${interactive?`<button data-r12-purge ${run.canPurge?"":"disabled"}>${run.purgeLocked?"PURGE CYCLE RUNNING":"TRIGGER R-12 PURGE"}</button><small>No recharge countdown. A repeat before about 60 seconds is less effective.</small>`:""}</section>`;
}
function transferPanel(state){
  const transfer=state.finale?.transfer;if(!transfer)return "";
  const active=transfer.steps[transfer.step],steps=transfer.steps.map(([id,label],index)=>`<button data-transfer-step="${id}" class="${index<transfer.step?"done":index===transfer.step?"active":"locked"}" ${index===transfer.step?"":"disabled"}><i>${index+1}</i><span>${e(label)}</span></button>`).join("");
  return `<section class="r12-transfer"><header><span>YOUR TRANSFER IS ACTIVE</span><b>MOVE CLEANLY / EVERY SECOND ADMITS CONTAMINATION</b></header><div class="hatch-route"><i></i><strong>${e(active?.[1]||"TRANSFER COMPLETE")}</strong></div><div class="transfer-steps">${steps}</div><footer>Mistakes cost time. Timeout still gets you below but applies maximum contamination.</footer></section>`;
}
function surfacePanel(state){
  const surface=state.finale?.surface;if(!surface)return "";
  return `<form class="surface-console" data-surface-form><header><span>FINAL SURFACE OPERATOR / ALONE</span><b>COMPLETE ALL THREE FROM MEMORY</b></header><fieldset><legend>1 / STATION DISTRESS</legend><select name="status">${choiceOptions(state.actions.surfaceStatus,surface.status)}</select><small>Local configuration is accepted; Status Beacon determines external propagation.</small></fieldset><fieldset><legend>2 / EXTRACTION MESSAGE</legend><textarea name="message" maxlength="180" placeholder="Where are the crew? What is unsafe? What response is required?">${e(surface.message)}</textarea><small>Spelling and style do not matter. Responders need occupancy, unsafe surface conditions and external extraction.</small></fieldset><fieldset><legend>3 / RELEASE CONFIGURATION</legend><select name="isolation">${choiceOptions(state.actions.releaseIsolation,surface.isolation)}</select><select name="authority">${choiceOptions(state.actions.releaseAuthority,surface.authority)}</select><label><input type="checkbox" name="releaseTest" ${surface.releaseTest?"checked":""}> PULL EXTERNAL RELEASE TEST</label></fieldset><button>COMMIT SURFACE DASHBOARD / BEGIN FINAL TRANSFER</button></form>`;
}
function messageRubric(state){
  const run=state.finale;if(!run?.messageNeedsRating)return "";
  return `<section class="message-rubric"><header><span>FACILITATOR / POST-SUBMISSION</span><b>CLASSIFY CONTENT, NOT WRITING QUALITY</b></header><blockquote>${e(run.surfaceCommitted?.message||"[BLANK]")}</blockquote><div><button data-message-rating="effective"><b>EFFECTIVE</b><small>R-12 occupancy + unsafe surface + external extraction</small></button><button data-message-rating="partial"><b>PARTIAL</b><small>Useful emergency information; one essential element missing</small></button><button data-message-rating="ineffective"><b>INEFFECTIVE</b><small>Blank, irrelevant or no usable extraction request</small></button></div></section>`;
}
function finalePanel(state){
  const run=state.finale;if(!run)return "";
  const workflow=stageWorkflow(state,true);
  if(run.mode==="transfer")return `${workflow}${transferPanel(state)}${refugeStatus(state)}`;
  if(run.mode==="surface")return `${workflow}${surfacePanel(state)}${refugeStatus(state)}`;
  if(run.mode==="below")return `${workflow}<section class="r12-isolated"><span>YOU ARE INSIDE R-12</span><h2>MICROPHONE / CREW CHAT MUTED</h2><p>You cannot coach anyone above. Watch the shared air condition and decide independently whether to spend a purge cycle.</p>${refugeStatus(state,true)}</section>`;
  if(run.mode==="waiting")return `${workflow}<section class="r12-waiting"><span>WAIT TO DESCEND</span><h2>${e(run.currentName||"TRANSFER PREPARING")} IS MOVING</h2><p>Your position in the hidden order is not shown. Stay ready; your terminal activates automatically.</p>${refugeStatus(state)}</section>`;
  return `${workflow}<section class="finale-overview"><header><span>${run.phase==="surface"?"FINAL OPERATOR ACTIVE":run.phase==="adjudication"?"R-12 SEALED / MESSAGE REVIEW":"SEQUENTIAL EVACUATION"}</span><b>${run.belowCount} / ${run.total} BELOW</b></header><h2>${run.phase==="surface"?`${e(run.currentName)} remains alone above`:run.phase==="adjudication"?"Everyone reached R-12":`${e(run.currentName||"Crew member")} is descending`}</h2><p>The random order remains hidden. Every transfer completes; slower movement worsens the shared refuge atmosphere.</p>${refugeStatus(state)}${messageRubric(state)}</section>`;
}

function cabinAirPanel(state,interactive=false){
  const run=state.cabinRun;if(!run)return "";
  const show=value=>typeof value==="number"?value.toFixed(1):value;
  const meter=(label,value,unit="")=>`<article><span>${e(label)}</span><b>${e(show(value))}${typeof value==="number"?unit:""}</b></article>`;
  const controls=Object.entries(state.actions.cabinControls).map(([control,entries])=>`<fieldset><legend>${e(control.toUpperCase())}</legend>${entries.map(([value,label])=>`<button type="button" data-cabin-control="${control}" data-cabin-value="${value}" class="${run.controls[control]===value?"selected":""}" ${!interactive||!run.canAct||run.controls[control]===value?"disabled":""}>${e(label)}</button>`).join("")}</fieldset>`).join("");
  const precision=run.exactMonitoring?"AIR QUALITY / EXACT MONITORING":"AIR QUALITY OFFLINE / VISUAL WARNINGS ONLY";
  const facilitator=state.viewer?.kind==="facilitator";
  const turnLabel=!interactive?`NOW ACTING: ${run.activeName}`:facilitator?`FACILITATOR OVERRIDE: ACTING FOR ${run.activeName}`:run.canAct?"YOUR TURN — CHOOSE EXACTLY ONE CHANGE":`WAIT — ${run.activeName} MUST MAKE ONE CHANGE`;
  const recent=(run.recentMoves||[]).slice(-3).reverse().map(move=>`<li><b>${e(state.players?.[move.role]?.name||state.roles?.[move.role]?.name||move.role)}</b><span>${e(move.control==="purge"?"USED EMERGENCY PURGE":`${move.control} → ${String(move.value||"").replaceAll("_"," ")}`)}</span><i>${e(String(move.health))}% after move</i></li>`).join("");
  return `<section class="cabin-air-panel ${run.band}"><header><span>CABIN SURVIVAL / STRICT ROTATION</span><b>${e(run.band.toUpperCase())}</b></header><div class="cabin-how"><strong>HOW STAGE 5 WORKS</strong><ol><li>Discuss which pressure is most dangerous.</li><li>The named player selects one enabled control.</li><li>That single change applies immediately and the turn passes.</li><li>Repeat until the stage timer ends. Sustained breathability determines Act 6 time.</li></ol><p>There is no perfect permanent setting: sealing raises CO₂; outside air raises toxin; recirculation loads the active filter.</p></div><div class="cabin-turn ${run.canAct&&interactive?"your-turn":"waiting"}"><small>${interactive?"TURN STATUS":"ACTIVE OPERATOR"}</small><strong>${e(turnLabel)}</strong><i>${run.moveCount} MOVES COMPLETE</i></div><div class="cabin-meters">${meter("OUTSIDE PLUME",run.outside," PPM")}${meter("CABIN TOXIN",run.toxin," PPM")}${meter("CABIN CO₂",run.co2," PPM")}${meter("FILTER A LOAD",run.filterLoad.a,"%")}${meter("FILTER B LOAD",run.filterLoad.b,"%")}${meter("BREATHABILITY",run.health,typeof run.health==="number"?"%":"")}</div><p class="cabin-precision">${precision} · GREEN BUTTON = CURRENT SETTING · DIM BUTTONS = WAITING OR ALREADY SELECTED</p><div class="cabin-controls">${controls}<fieldset class="purge-control"><legend>EMERGENCY PURGE</legend><button type="button" data-cabin-control="purge" ${!interactive||!run.canAct||!run.purgeAvailable||run.purgeRemaining<1?"disabled":""}>PURGE NOW / ${run.purgeRemaining} LEFT</button><small>${run.purgeAvailable?"Best with SEALED intake + RECIRCULATE. A finite emergency action, not a reset.":"OFFLINE — Upper Ridge was not restored during the Outside Run."}</small></fieldset></div>${recent?`<aside class="cabin-recent"><strong>RECENT CHANGES</strong><ul>${recent}</ul></aside>`:""}<footer>${run.canAct&&interactive?"SELECT ONE DIFFERENT SETTING — YOUR TURN ENDS AUTOMATICALLY":"KEEP DISCUSSING — CONTROLS ENABLE ONLY FOR THE NAMED PLAYER"}</footer></section>`;
}

function playerReport(state) {
  const report=state.reports[state.viewer.role];
  return state.stageStatus==="live"?`<form class="role-report" data-report><label><span>4. YOUR RECOMMENDATION</span><small id="report-route">ONE CLEAR SENTENCE · ROUTED TO STATION LEAD + FACILITATOR</small><textarea name="note" maxlength="160" placeholder="Because [evidence], we should [action], otherwise [risk]." aria-describedby="report-route report-status" required>${e(report?.note||"")}</textarea></label><p class="report-formula">BECAUSE <b>WHAT I KNOW</b> → WE SHOULD <b>WHAT I RECOMMEND</b> → OTHERWISE <b>THE RISK</b></p><button class="button secondary full" type="submit">${report?"Update recommendation":"Share with Station Lead"}</button>${reportError?`<p class="report-error" id="report-status" role="alert">${e(reportError)}</p>`:report?`<p class="report-confirm" id="report-status" role="status"><b>✓ RECOMMENDATION SHARED</b><span>The Station Lead and facilitator can see it now. You may update it until the decision closes.</span></p>`:""}</form>`:`<p class="closed-copy">Decision window closed.</p>`;
}

function participantNotes(state,card,role){
  const notes=card.notes?.length?card.notes:[{roleName:role.name,title:card.title,body:card.body,confidence:card.confidence,confidenceMeaning:card.confidenceMeaning,sharePrompt:`Ask the crew: ${card.prompt}`}];
  return `<div class="participant-note-guide"><header><span>PARTICIPANT NOTE / ONLY YOU SEE THIS</span><b>READ → EXPLAIN → RECOMMEND</b></header><section class="participant-story-line"><span>${state.stage===1?"INCIDENT BEGINS":"PREVIOUS CONSEQUENCE"}</span><p>${e(state.stage===1?state.stageDefinition.story?.arrival:state.outcomes?.[state.stage-1]?.headline||state.stageDefinition.story?.arrival)}</p><b>NOW: ${e(state.stageDefinition.story?.chapter||state.stageDefinition.title)}</b></section><div class="participant-evidence"><span>1. WHAT YOU KNOW</span>${notes.map(note=>`<article><header><b>${e(note.roleName)} / ${e(note.title)}</b><i>${e(note.confidence)}</i></header><p>${e(note.body)}</p><small>${e(note.confidenceMeaning||"")}</small></article>`).join("")}</div><div class="participant-guidance"><article><span>2. WHY IT MATTERS TO THIS DECISION</span><p>${e(card.participantGoal)}</p></article><article><span>3. WHAT TO SAY OUT LOUD</span>${notes.map(note=>`<p>${e(note.sharePrompt)}</p>`).join("")}</article></div></div>`;
}

function fieldServicePanel(state) {
  const run=state.fieldRun,game=state.fieldGame;if(!run?.active)return "";
  const location=state.stageDefinition.options.find(([id])=>id===run.route[run.currentIndex])?.[1]||run.route[run.currentIndex];
  const route=`${run.route.map((id,index)=>`<i class="${index<run.currentIndex?"done":index===run.currentIndex?"active":""}">${index+1} · ${e(state.stageDefinition.options.find(([value])=>value===id)?.[1]||id)}${index<run.results.length?` / ${run.results[index].success?"RESTORED":"NOT RESTORED"}`:""}</i>`).join("")}`;
  const forecast=run.forecast?.[run.currentIndex];
  const conditions=forecast?`<div class="field-conditions"><span>LOCKED ACT 3 FORECAST / NOW</span><b>ARRIVE T+${forecast.arrival} · SERVICE COMPLETE T+${forecast.finish} · ${forecast.ppm} PPM</b><small>${forecast.id==="d"?"UPPER RIDGE REMAINS BELOW THE RESPIRATORY THRESHOLD.":forecast.ppm>=18?"PLUME AT SERVICE POINT / ASSIGNED RESPIRATORY EQUIPMENT IN USE.":"SERVICE POINT REMAINS BELOW THE RESPIRATORY THRESHOLD."}</small></div>`:"";
  const observation=game?.observation?`<article class="runner-observation"><span>RUNNER SEES / DESCRIBE ALOUD</span><p>${e(game.observation)}</p></article>`:"";
  const manual=game?.manual?`<article class="station-manual"><span>STATION PROCEDURE / INTERPRET</span>${game.manual.map(row=>`<button type="button" data-field-instruction="${row.id}" ${game.instructionLocked?"disabled":""}><b>${e(row.condition)}</b><small>${e(row.procedure)}</small></button>`).join("")}</article>`:"";
  const actions=game?.actions?`<article class="runner-actions"><span>RUNNER ACTION / ONE ATTEMPT</span>${game.actions.map(([id,label])=>`<button type="button" data-field-service="${id}" ${!game.instructionReceived?"disabled":""}>${e(label)}</button>`).join("")}</article>`:"";
  return `<section class="field-service-panel"><header><span>LOCAL FIELD RADIO / CLEAR</span><b>SERVICE ${run.currentIndex+1} / 2 · ${e(location)}</b></header><div class="field-route">${route}</div>${conditions}<h3>${e(game?.title||"FIELD SERVICE IN PROGRESS")}</h3><div class="field-service-split">${observation}${manual}${actions}</div><footer>${run.instruction?"STATION INSTRUCTION LOCKED · RUNNER MUST COMMIT ONE ACTION":"RUNNER DESCRIBES → STATION INTERPRETS → STATION INSTRUCTS → RUNNER ACTS"}</footer></section>`;
}

function fieldPlayerControl(state) {
  if(state.stage!==4||state.stageStatus!=="live"||!state.fieldRun?.active)return "";
  return `<section class="field-player-control ${state.viewer.role===state.fieldRun.runner?"runner":"crew"}">${fieldServicePanel(state)}</section>`;
}

function renderPlayer(state) {
  if (state.status === "lobby") return renderWaiting(state,"PRIVATE ROLE TERMINAL");
  if (state.status === "ending") return renderEnding(state,"player");
  const role=state.roles[state.viewer.role], card=state.privateCard, isLead=state.viewer.role==="lead";
  if(state.stage===1){app.innerHTML=act1Runtime(state,"player");return;}
  if(state.stage===2){app.innerHTML=act2Runtime(state,"player");return;}
  if(state.stage===7&&state.stageStatus==="live"){
    app.innerHTML=`<div class="game-runtime player-runtime finale-runtime role-${role.color}">${runtimeBackground(state)}${runtimeHud(state,state.finale?.mode==="surface"?"SURFACE ISOLATED TERMINAL":state.finale?.communicationLocked?"R-12 ISOLATED TERMINAL":"EVACUATION TERMINAL",role)}<section class="finale-player-stage">${finalePanel(state)}</section>${state.hint?`<div class="runtime-alert"><b>FACILITATOR</b><span>${e(state.hint)}</span></div>`:""}${safety(state)}${observerMode(state)}</div>`;
    return;
  }
  app.innerHTML=`<div class="game-runtime player-runtime stage-${state.stage} role-${role.color}">${runtimeBackground(state)}${runtimeHud(state,"PRIVATE TERMINAL",role)}
    <section class="role-instrument clear-participant-notes"><header><span>${e(state.viewer.name)} / ${role.lens}</span><i>${card.confidence}</i></header>${[1,3,4].includes(state.stage)?stageWorkflow(state,true):""}${participantNotes(state,card,role)}<div class="instrument-prompt"><span>Download this stage note.</span><button data-download-role>ARCHIVE ROLE NOTE</button></div></section>
    <aside class="role-actions"><section><header>CREW LINK <b>${Object.keys(state.reports).length}/${state.playerCount}</b></header>${playerReport(state)}</section><section><header>ROLE OVERRIDE <b>${state.viewer.role in (state.interventions||{})?"USED":"READY"}</b></header><h2>${e(card.intervention)}</h2>${state.interventionFeedback?.[state.viewer.role]?`<p class="intervention-feedback">${e(state.interventionFeedback[state.viewer.role])}</p>`:button("Execute override","INTERVENTION","secondary",state.stageStatus!=="live"||state.viewer.role in (state.interventions||{}))}</section>${!isLead?decisionImpactPanel(state,true):""}</aside>
    ${fieldPlayerControl(state)}
    ${state.stage===5&&state.stageStatus==="live"?`<section class="cabin-player-control">${cabinAirPanel(state,true)}</section>`:""}
    ${state.stage===6&&state.stageStatus==="live"?`<section class="archive-player-control">${archivePanel(state)}</section>`:""}
    ${isLead&&![1,2,3,5,6,7].includes(state.stage)&&state.stageStatus==="live"&&!(state.stage===4&&state.fieldRun?.active)?`<section class="lead-command"><header><span>CREW COMMITMENT / STAGE ${state.stage}</span><b>${state.stageDefinition.objective}</b></header><div class="lead-controls">${decisionControls(state)}</div>${decisionImpactPanel(state)}${button("Commit crew decision","COMMIT_STAGE","danger",!state.decisionPreview?.ready)}</section>`:""}
    ${state.hint?`<div class="runtime-alert"><b>FACILITATOR</b><span>${e(state.hint)}</span></div>`:""}${state.stageStatus==="resolved"?immersiveOutcome(state):""}${safety(state)}${observerMode(state)}
  </div>`;
}

function facReports(state) { return `<div class="fac-full-reports">${roleList(state).map(([id,r])=>{const p=state.players[id],report=state.reports[id],absent=state.absentRoles?.[id];return `<div class="${absent?"absent":""}"><span class="role-code color-${r.color}">${r.short}</span><span><b>${p?e(p.name):r.name}</b><small>${absent?"Temporarily absent":report?e(report.note||report.recommendation||"Assessment shared"):p?"No assessment":"Not connected"}</small></span></div>`}).join("")}</div>`; }

function facilitatorRoleTools(state){
  const connected=roleList(state).filter(([id])=>state.players[id]&&!state.absentRoles?.[id]),empty=roleList(state).filter(([id])=>!state.players[id]||state.absentRoles?.[id]);
  return `<div class="fac-role-tools"><span>CREW RECOVERY</span>${connected.map(([id,r])=>`<div><b>${r.short}</b><button data-absent-role="${id}">${state.absentRoles?.[id]?"MARK PRESENT":"MARK ABSENT"}</button><button data-resend-role="${id}">RE-SEND CARD</button></div>`).join("")}${connected.length&&empty.length?`<form data-reassign><select name="from">${choiceOptions(connected.map(([id,r])=>[id,state.players[id].name||r.name]),connected[0][0])}</select><select name="to">${choiceOptions(empty.map(([id,r])=>[id,r.name]),empty[0][0])}</select><button>REASSIGN ROLE</button></form>`:""}</div>`;
}

function renderFacilitator(state) {
  if (state.status === "lobby") return renderWaiting(state,"FACILITATOR CONTROL");
  if (state.status === "ending") return renderEnding(state,"facilitator");
  if(state.stage===1){app.innerHTML=act1Runtime(state,"facilitator");return;}
  if(state.stage===2){app.innerHTML=act2Runtime(state,"facilitator");return;}
  app.innerHTML=`<div class="game-runtime director-runtime stage-${state.stage}">${runtimeBackground(state)}${runtimeHud(state,"FACILITATOR / GAME MASTER")}
    <aside class="director-left"><header>LIVE CONTROL</header><div class="director-buttons">${state.clock.running?button("Pause","PAUSE","secondary"):button("Resume","RESUME","secondary",state.stageStatus!=="live")}${button("+30 sec","ADD_TIME","secondary",state.stageStatus!=="live")}${button(state.safetyPaused?"Clear safety":"Safety pause","SAFETY","secondary")}${state.hint?button("Clear prompt","CLEAR_HINT","secondary"):button("Send prompt","HINT","secondary")}</div><div class="director-reports"><span>ROLE COMMS</span>${facReports(state)}</div>${facilitatorRoleTools(state)}</aside>
    <section class="director-center ${state.stage===6?"archive-director":state.stage===7?"finale-director":""}"><div class="director-mission"><span>STAGE ${String(state.stage).padStart(2,"0")} / ${state.stageDefinition.kicker}</span><h1>${e(state.stageDefinition.title)}</h1><p>${e(state.stageDefinition.objective)}</p>${storyContext(state,true)}</div><div class="director-decision"><header><span>${state.stage===1?"COLLECTIVE HANDOVER":state.stage===2?state.repairRun?.phase==="repair"?"SIMULTANEOUS REPAIRS":"REPAIR PRIORITISATION":state.stage===3?"OUTSIDE PLAN / PHYSICAL CHECK":state.stage===5?"CABIN SURVIVAL / ROTATION":state.stage===6?"LOCAL ARCHIVE / TIMED INVESTIGATION":state.stage===7?"R-12 EVACUATION / LIVE":"CREW DECISION ENGINE"}</span><b>${state.stageStatus.toUpperCase()}</b></header>${state.stageStatus==="live"?`${[1,2,3,4].includes(state.stage)?stageWorkflow(state,true):""}${decisionControls(state)}${[5,6,7].includes(state.stage)?"":decisionImpactPanel(state)}`:`<h2>${e(state.outcomes[state.stage]?.headline||"")}</h2><p>${e(state.outcomes[state.stage]?.detail||"")}</p>`}${state.stageStatus==="live"&&![5,6,7].includes(state.stage)&&!(state.stage===4&&state.fieldRun?.active)?button(state.stage===1?"Submit completed handover":state.stage===2&&state.repairRun?.phase==="planning"?"Lock assignments / begin repairs":state.stage===2?"Close repair window":state.stage===3?"Lock plan / deploy runner":"Resolve decision","COMMIT_STAGE","danger",!state.decisionPreview?.ready):state.facilitatorCanConfirmEnding?button("Confirm final record","CONFIRM_ENDING","danger"):state.facilitatorCanAdvance?button("Trigger next stage","ADVANCE_STAGE","primary"):""}</div></section>
    <aside class="director-right"><div class="station-state-head">${gameIcon("runtime-telemetry-rack.webp","Station telemetry rack","station-state-icon")}<div><header>STATION STATE</header>${tracks(state)}</div></div><div class="director-resources"><span>RESPIRATOR <b>${e(state.global.respirator.toUpperCase())}</b></span><span>LOCK KNOWLEDGE <b>${state.global.lockKnowledge}/2</b></span><span>AIR BUFFER <b>${state.resources.airHandlingBuffer}</b></span><span>SAFEGUARD <b>${state.resources.safetyGuard}</b></span></div>${environmentStrip(state,true)}${signalIntercept(state,true)}<div class="director-evidence"><span>EVIDENCE / ${state.global.evidence.length}</span>${evidence(state)}</div><div class="director-log"><span>EVENT LOG</span>${state.history.slice(-6).reverse().map(h=>`<p><b>${new Date(h.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</b>${e(h.text)}</p>`).join("")}</div></aside>
    ${state.stageStatus==="resolved"?immersiveOutcome(state,true):""}${safety(state)}
  </div>`;
}

const compactValue=value=>Array.isArray(value)?value.map(compactValue).join("+"):value&&typeof value==="object"?Object.entries(value).map(([key,item])=>`${key}:${compactValue(item)}`).join(", "):String(value);
const decisionSummary=decision=>Array.isArray(decision)?decision.map((round,index)=>`R${index+1}: ${decisionSummary(round)}`).join(" / "):Object.entries(decision||{}).map(([key,value])=>`${key}=${compactValue(value)}`).join(" · ");

function debriefContext(state,current,mode){
  if(current?.id===2)return `<section class="debrief-context status-failure-map">${[["OPERATIONAL","Relay transmitting—not people safe"],["GREEN","May describe a stale frozen feed"],["NO ACTIVE DISTRESS","Silence compressed into certainty"],["LOWER ROUTE","Legacy station route—not downhill road"]].map(([label,meaning])=>`<article><b>${label}</b><span>${meaning}</span></article>`).join("")}</section>`;
  if(current?.id===3)return `<section class="debrief-context role-map-grid">${Object.entries(state.debrief?.roleMap||{}).map(([role,item])=>`<article><header><i>${e(item.short)}</i><b>${e(item.name)}</b></header><strong>${item.areas.map(e).join(" · ")}</strong><p>${item.questions.map(e).join(" ")}</p></article>`).join("")}</section>`;
  if(current?.id===4){const active=state.debrief?.profileSignals||[];return `<section class="debrief-context readiness-grid"><header>OBSERVED BEHAVIOUR LENSES — NOT PERSONALITY SCORES</header>${(state.debrief?.readinessProfiles||[]).map(profile=>`${mode==="facilitator"?`<button class="${active.includes(profile.id)?"active":""}" data-profile-signal="${profile.id}">`:`<article class="${active.includes(profile.id)?"active":""}">`}<b>${e(profile.title)}</b><span>${e(profile.prompt)}</span><small>WATCH: ${e(profile.risk)}</small>${mode==="facilitator"?"</button>":"</article>"}`).join("")}</section>`;}
  if(current?.id===5)return `<section class="debrief-context ai-bridge"><article><b>FIND THE FALSE PROXY</b><span>Which dashboard or AI label measures system activity rather than the human outcome?</span></article><article><b>NAME THE MISSING SOURCE</b><span>What evidence, user, colleague, or operating context is absent?</span></article><article><b>BOUND THE TEST</b><span>What is the smallest safeguarded action that could challenge the label?</span></article></section>`;
  return "";
}

function debriefPanel(state, mode) {
  const steps=state.debrief?.steps||[],current=steps.find(item=>item.id===state.debrief.currentStep)||steps[0];
  const submitted=state.viewer.kind==="player"?state.debrief?.firstSteps?.[state.viewer.role]:null;
  return `<section class="ending-debrief"><header><span>AFTER-ACTION SIGNAL</span><b>AI-READY LEADER DEBRIEF · STEP ${String(current?.id||1).padStart(2,"0")} / 06</b></header><h2>${e(current?.title||"Immediate reactions")}</h2><p class="debrief-current-prompt">${e(current?.prompt||"")}</p><div class="debrief-step-rail">${steps.map(step=>`<i data-step="${step.id}" class="${step.id===current?.id?"active":step.id<current?.id?"done":""}"><b>${e(step.title)}</b></i>`).join("")}</div>${debriefContext(state,current,mode)}${mode==="player"&&current?.id===6?`<form class="first-step-form" data-first-step><label>YOUR BOUNDED WORKPLACE ACTION<textarea name="note" maxlength="280" required placeholder="I will challenge or clarify…">${e(submitted?.note||"")}</textarea></label><button>${submitted?"UPDATE FIRST STEP":"RECORD FIRST STEP"}</button></form>`:""}</section>`;
}

function playtestForm(state){
  const record=state.playtest||{ratings:{},criteria:[],disposition:"unreviewed"};
  const options=[["","—"],["1","1 / FAILED"],["2","2 / WEAK"],["3","3 / MIXED"],["4","4 / STRONG"],["5","5 / EXCELLENT"]];
  const dispositions=[["unreviewed","NOT REVIEWED"],["proceed","PROCEED"],["revise","REVISE & RETEST"],["kill_reframe","STOP / HEAVILY REFRAME"]];
  return `<details class="playtest-record" ${record.updatedAt?"open":""}><summary>PROTOTYPE PLAYTEST RECORD ${record.updatedAt?"/ SAVED":"/ REQUIRED AFTER PILOT"}</summary>${record.needsReframe?`<div class="reframe-alert">AI ALIGNMENT FAILED — STOP OR HEAVILY REFRAME BEFORE PRODUCTION.</div>`:""}<form data-playtest><div>${(record.criteria||[]).map(item=>`<label><span>${e(item.title)}</span><small>${e(item.question)}</small><select name="rating_${item.id}">${options.map(([value,label])=>`<option value="${value}" ${String(record.ratings?.[item.id]||"")===value?"selected":""}>${label}</option>`).join("")}</select></label>`).join("")}</div><label>DESIGN DISPOSITION<select name="disposition">${dispositions.map(([value,label])=>`<option value="${value}" ${record.disposition===value?"selected":""}>${label}</option>`).join("")}</select></label><label>PLAYTEST OBSERVATIONS<textarea name="notes" maxlength="1600" placeholder="Clarity, role value, remote friction, survival pressure, debrief transfer…">${e(record.notes||"")}</textarea></label><button>SAVE PLAYTEST EVIDENCE</button></form></details>`;
}

function facilitatorDebrief(state) {
  const steps=state.debrief?.steps||[],current=steps.find(item=>item.id===state.debrief.currentStep)||steps[0],note=state.debrief?.notes?.[current?.id]||"";
  const firstSteps=Object.entries(state.debrief?.firstSteps||{});
  return `<aside class="ending-log debrief-facilitator"><header>FACILITATOR DEBRIEF / 20–25 MIN</header><nav>${steps.map(step=>`<button class="${step.id===current?.id?"active":""}" data-debrief-step="${step.id}">${String(step.id).padStart(2,"0")}</button>`).join("")}</nav><strong>${e(current?.title||"")}</strong><p class="fac-debrief-prompt">${e(current?.prompt||"")}</p><form data-debrief-note><input type="hidden" name="step" value="${current?.id||1}"><textarea name="note" maxlength="1200" placeholder="Capture observations without diagnosing participants…">${e(note)}</textarea><button>SAVE FACILITATOR NOTE</button></form><section><b>FIRST-STEP RECORD / ${firstSteps.length}/${state.playerCount}</b>${firstSteps.length?firstSteps.map(([role,item])=>`<p><i>${e(state.roles[role]?.short||role)}</i>${e(item.name)} — ${e(item.note)}</p>`).join(""):"<p>Waiting for participant commitments at Step 06.</p>"}</section><button class="debrief-export" data-download-summary>EXPORT SESSION RECORD</button>${playtestForm(state)}</aside>`;
}

function renderEnding(state, mode) {
  const x=state.ending;
  const clean=x.band==="clean"||x.title==="CLEAN RESCUE",recovered=["clean","severe"].includes(x.band),calculation=x.calculation||{};
  const finalImage=recovered?"mara-venn-below.webp":"auxiliary-relay-hold.webp";
  app.innerHTML=`<div class="game-runtime ending-runtime ${clean?"clean-rescue":"critical-ending"} ${mode==="facilitator"?"facilitator-ending":""}"><div class="runtime-world"><img src="${gameImage(finalImage)}" alt="Final Blackout Ridge outcome"><div class="runtime-grade"></div><div class="scan-sweep"></div></div>${runtimeHud(state,mode==="facilitator"?"FACILITATOR / FINAL RECORD":"FINAL TRANSMISSION")}
    <section class="ending-transmission"><span>STAGE 07 / 07&nbsp;&nbsp;·&nbsp;&nbsp;FINAL OUTCOME</span><h1>${e(x.title)}</h1><p>${e(x.body)}</p><div class="ending-verdict"><i class="${calculation.status==="DISTRESS"?"confirmed":"failed"}"><b>${calculation.status==="DISTRESS"?"✓":"×"}</b>${e(calculation.status||"STATUS UNKNOWN")}</i><i class="${calculation.message==="CLEAR"?"confirmed":"failed"}"><b>${calculation.message==="CLEAR"?"✓":"×"}</b>EXTRACTION ${e(calculation.message||"NONE")}</i><i class="${calculation.release==="ENABLED"?"confirmed":"failed"}"><b>${calculation.release==="ENABLED"?"✓":"×"}</b>RELEASE ${e(calculation.release||"INHIBITED")}</i></div></section>
    <div class="ending-right-stack">
      <div class="ending-stage-seal" aria-label="Stage 7 of 7 complete"><span>FINAL CHALLENGE</span><strong>07</strong><i>/ 07</i><b>${clean?"RESCUE SECURED":"FINAL RECORD"}</b></div>
      <aside class="ending-truth"><header><span>R-12 FINAL RECORD</span><i>${clean?"LIVE / CONFIRMED":"FINAL / DEGRADED"}</i></header><div><span>AIR / OCCUPANCY</span><b>${calculation.finalAir!==undefined?`${e(calculation.finalAir)}/100 · ${e(calculation.occupancy)} OCCUPANTS`:e(x.statusOutcome||"RECORDED")}</b></div><div><span>RESCUE / SURVIVAL</span><b>${e(x.rescueOutcome||`MARA: ${x.mara.toUpperCase().replaceAll("_"," ")}`)}</b><small>${e(x.survivalOutcome||`CREW ${x.crew.toUpperCase()}`)}</small></div><footer><i></i><span>${clean?"EXTRACTION CHANNEL OPEN":"RESPONDER RECORD CLOSED"}</span></footer></aside>
      ${mode==="facilitator"?`${facilitatorDebrief(state)}<button class="ending-restart-control" data-restart-open><img src="./assets/images/ending/icons/restart-session-v1.webp" alt=""><span>RESTART FORMER SESSION<small>SAME CODE · SAME CREW · RETURN TO ACT 1</small></span></button>`:""}
    </div>
    ${debriefPanel(state,mode)}
  </div>`;
}

function renderGallery() {
  ready();
  const assets=[["station-exterior.webp","Blackout Ridge"],["relay-control-room.webp","Surface relay room"],["outside-run.webp","Outside Run"],["containment-hatch.webp","Containment interlock"],["auxiliary-relay-hold.webp","Auxiliary Relay Hold"],["mara-venn-below.webp","Mara Venn below"],["calder-vale-cordon.webp","Calder Vale cordon"],["lark-shift-archive.webp","The Lark Shift"]];
  app.innerHTML=`<div class="app-frame gallery-view">${topbar("CINEMATIC ASSET ARCHIVE","")}<main class="gallery-main"><section class="gallery-heading"><div><p class="eyebrow">VISUAL DIRECTION / SET 01</p><h1>The world of Blackout Ridge</h1><p>Grounded operational horror—no monsters, no evil AI, no decorative fiction.</p></div><a class="button secondary" href="${url("home","")}">Return</a></section><section class="asset-grid">${assets.map(([file,title],i)=>`<figure class="asset-card ${file.includes("lark")?"archive":""}"><img src="${gameImage(file)}" alt="${title}"><figcaption><span>${String(i+1).padStart(2,"0")}</span><div><h2>${title}</h2><p>Game environment and evidence asset</p></div></figcaption></figure>`).join("")}</section></main></div>`;
}

function renderError() { ready(); app.innerHTML=`<div class="app-frame">${topbar("CONNECTION ERROR")}<main class="error-main"><p class="eyebrow">UNABLE TO CONTINUE</p><h1>${e(error||"Session unavailable")}</h1><a class="button secondary" href="${url("home","")}">Return home</a></main></div>`; }

function chatMessageIsMine(state,message){return state.viewer.kind==="facilitator"?message.senderKind==="facilitator":message.senderKind==="player"&&message.senderRole===state.viewer.role;}

function updateChatNotifications(state){
  if(state.viewer.kind!=="player"&&state.viewer.kind!=="facilitator")return;
  const messages=state.chatMessages||[],latest=messages.at(-1);
  if(!chatInitialized){chatInitialized=true;lastChatMessageId=latest?.id||"";return;}
  const previous=lastChatMessageId?messages.findIndex(message=>message.id===lastChatMessageId):-1;
  const incoming=messages.slice(previous>=0?previous+1:0).filter(message=>!chatMessageIsMine(state,message));
  lastChatMessageId=latest?.id||lastChatMessageId;
  if(!incoming.length)return;
  stationAudio.cue("confirm");
  if(chatOpen)return;
  chatUnread+=incoming.length;chatAlert=incoming.at(-1);
  clearTimeout(chatAlertTimer);chatAlertTimer=setTimeout(()=>{chatAlert=null;renderChat(client.state);},6500);
}

function chatMessageMarkup(state,message){
  const own=chatMessageIsMine(state,message),role=message.senderRole&&state.roles?.[message.senderRole];
  const senderCode=message.senderKind==="facilitator"?"FAC":role?.short||"CREW";
  const senderColor=message.senderKind==="facilitator"?"facilitator":(["lead","signal","systems","operations","field","protocol","comms"].includes(message.senderRole)?message.senderRole:"crew");
  const sentAt=new Date(message.at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  return `<article class="crew-chat-message sender-${senderColor} ${own?"own":""}"><header><b>${e(senderCode)} / ${e(message.senderName)}</b><time>${e(sentAt)}</time></header><p>${e(message.text)}</p></article>`;
}

function renderChat(state){
  document.querySelector(".crew-chat-root")?.remove();
  if(!state||state.stage===1||(state.viewer.kind!=="player"&&state.viewer.kind!=="facilitator")||state.viewer.kind==="player"&&state.finale?.communicationLocked)return;
  const messages=state.chatMessages||[];
  const markup=`<section class="crew-chat-root ${chatOpen?"open":""}">
    ${chatAlert&&!chatOpen?`<button class="crew-chat-alert" data-chat-open><b>NEW MESSAGE / ${e(chatAlert.senderName)}</b><span>${e(chatAlert.text)}</span></button>`:""}
    ${chatOpen?`<aside class="crew-chat-panel" role="dialog" aria-label="Crew chat"><header><span><b>CREW CHAT</b><small>${messages.length} MESSAGE${messages.length===1?"":"S"} / AUTHENTICATED CHANNEL</small></span><button type="button" data-chat-toggle aria-label="Close crew chat">×</button></header><div class="crew-chat-messages" data-chat-log aria-live="polite">${messages.length?messages.map(message=>chatMessageMarkup(state,message)).join(""):`<p class="crew-chat-empty">No messages yet. Start the crew discussion.</p>`}</div><form data-chat-form><label for="crew-chat-input">MESSAGE ALL MEMBERS</label><textarea id="crew-chat-input" name="message" maxlength="500" rows="2" placeholder="Type a message…" required>${e(chatDraft)}</textarea><div><small>${chatError?e(chatError):"Players and facilitator only"}</small><button type="submit">SEND</button></div></form></aside>`:""}
    <button class="crew-chat-toggle" type="button" data-chat-toggle aria-label="${chatOpen?"Close":"Open"} crew chat" aria-expanded="${chatOpen}">${chatIcon()}<span>CREW CHAT</span>${chatUnread?`<b>${chatUnread>99?"99+":chatUnread}</b>`:""}</button>
  </section>`;
  app.insertAdjacentHTML("beforeend",markup);
  if(chatOpen)requestAnimationFrame(()=>{const log=document.querySelector("[data-chat-log]");if(log)log.scrollTop=log.scrollHeight;});
}

function render(state) {
  if (!state) return;
  const statusViewport=document.querySelector(".station-status-viewport");
  const statusScroll=statusViewport?{left:statusViewport.scrollLeft,top:statusViewport.scrollTop}:null;
  ready();
  updateChatNotifications(state);
  if (view==="shared") renderShared(state); else if (view==="player") renderPlayer(state); else if (view==="facilitator") renderFacilitator(state);
  if(statusScroll){const viewport=document.querySelector(".station-status-viewport");if(viewport){viewport.scrollLeft=statusScroll.left;viewport.scrollTop=statusScroll.top;}}
  renderChat(state);
  stationAudio.sync(state,view);
  activateAct1LeadIn(state);
}

app.addEventListener("submit",async event=>{
  event.preventDefault(); error="";
  try {
    if(event.target.matches("[data-chat-form]")){
      chatError="";const data=new FormData(event.target),message=String(data.get("message")||"").trim(),submit=event.target.querySelector('button[type="submit"]');
      if(submit){submit.disabled=true;submit.textContent="SENDING…";}
      await client.action("CHAT_MESSAGE",{message});chatDraft="";stationAudio.cue("confirm");return;
    }
    if(event.target.matches("[data-repair-submit]")){
      const data=new FormData(event.target),type=event.target.dataset.repairType;let answer;
      if(type==="sequence")answer=[...event.target.querySelectorAll('select[name^="slot"]')].map(select=>select.value);
      else if(type==="path"||type==="match")answer=Object.fromEntries([...data.entries()]);
      else if(type==="logic"||type==="guide-choice")answer=data.get("choice");
      else if(type==="calibrate")answer=Number(data.get("value"));
      else answer=data.getAll("selected");
      const missing=type==="sequence"?answer.some(value=>!value)
        :type==="path"||type==="match"?[...event.target.querySelectorAll("fieldset, .repair-match label")].some(group=>!group.querySelector("input:checked, select")?.value)
        :type==="logic"||type==="guide-choice"?!answer:false;
      if(missing){
        const guidance=event.target.querySelector(".repair-submit-guidance");
        if(guidance){guidance.textContent="ACTION REQUIRED: complete one choice in every section before submitting.";guidance.classList.add("error");guidance.scrollIntoView({behavior:"smooth",block:"nearest"});}
        stationAudio.cue("error");return;
      }
      if(type==="guide-choice"){
        const selected=event.target.querySelector('input[name="choice"]:checked'),label=selected?.closest("label")?.querySelector("span")?.textContent||answer;
        pendingRepairAnswer={answer,label};document.querySelector(".repair-confirm-overlay")?.remove();
        app.insertAdjacentHTML("beforeend",`<section class="repair-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="repair-confirm-title"><div><small>PRIVATE REPAIR CONFIRMATION</small><h2 id="repair-confirm-title">CONFIRM SELECTED REPAIR</h2><p>Selected action</p><strong>${e(label)}</strong><span>Confirmation submits your only attempt. The repair clock is still running.</span><footer><button type="button" data-repair-back>GO BACK</button><button type="button" data-repair-confirm>CONFIRM REPAIR</button></footer></div></section>`);stationAudio.cue("confirm");return;
      }
      if(!confirm("Submit this repair? There is no retry."))return;
      await client.action("REPAIR_SUBMIT",{answer});stationAudio.cue("commit");return;
    }
    if (event.target.matches("[data-create]")) { const data=new FormData(event.target), result=await client.create(Number(data.get("playerCount"))); localStorage.setItem(`blackout-token-${result.code}`,result.facilitatorToken); location.href=url("facilitator",result.code,result.facilitatorToken); }
    if (event.target.matches("[data-enter]")) { const data=new FormData(event.target); location.href=url("join",String(data.get("code")).toUpperCase()); }
    if (event.target.matches("[data-join]")) { const data=new FormData(event.target),result=await client.join(data.get("name"),data.get("role")); localStorage.setItem(`blackout-token-${code}`,result.playerToken); location.href=url("player",code,result.playerToken); }
    if (event.target.matches("[data-report]")) {
      reportError="";
      const data=new FormData(event.target), submit=event.target.querySelector('button[type="submit"]');
      if(submit){submit.disabled=true;submit.textContent=client.state?.reports?.[client.state.viewer.role]?"UPDATING…":"SHARING…";}
      await client.action("REPORT",{note:data.get("note"),recommendation:"shared"});
      stationAudio.cue("confirm");
    }
    if (event.target.matches("[data-reassign]")) { const data=new FormData(event.target); await client.action("REASSIGN_PLAYER",{from:data.get("from"),to:data.get("to")}); }
    if (event.target.matches("[data-debrief-note]")) { const data=new FormData(event.target); await client.action("SAVE_DEBRIEF_NOTE",{step:Number(data.get("step")),note:data.get("note")}); }
    if (event.target.matches("[data-first-step]")) { const data=new FormData(event.target); await client.action("SAVE_FIRST_STEP",{note:data.get("note")}); }
    if (event.target.matches("[data-playtest]")) { const data=new FormData(event.target),ratings={};for(const item of client.state.playtest?.criteria||[]){const value=data.get(`rating_${item.id}`);if(value)ratings[item.id]=Number(value);}await client.action("SAVE_PLAYTEST",{ratings,disposition:data.get("disposition"),notes:data.get("notes")}); }
    if(event.target.matches("[data-surface-form]")){
      const data=new FormData(event.target);await client.action("UPDATE_SURFACE",{status:data.get("status"),message:data.get("message"),isolation:data.get("isolation"),authority:data.get("authority"),releaseTest:data.get("releaseTest")==="on"});
      await client.action("SUBMIT_SURFACE");stationAudio.cue("commit");
    }
  } catch(cause) {
    error=cause.message;
    if(event.target.matches("[data-chat-form]")){chatError=error;stationAudio.cue("error");renderChat(client.state);}
    else if(event.target.matches("[data-report]")){reportError=error;stationAudio.cue("error");render(client.state);}
    else if(view==="join") renderJoin(); else if(view==="home") renderHome(); else renderError();
  }
});

app.addEventListener("change",async event=>{
  const state=client.state;if(!state)return;
  try {
    if(event.target.matches('.repair-guide-options input[name="choice"]')){event.target.closest("form")?.requestSubmit();return;}
    if(event.target.matches("[data-field]")) await client.action("UPDATE_DRAFT",{[event.target.dataset.field]:event.target.value});
    if(event.target.matches("[data-handover-person]")) await client.action("UPDATE_DRAFT",{handover:{[event.target.dataset.handoverPerson]:event.target.value}});
    if(event.target.matches("[data-repair-role]")) await client.action("UPDATE_DRAFT",{repairs:{[event.target.dataset.repairRole]:event.target.value}});
    if(event.target.matches("[data-array]")){const key=event.target.dataset.array,current=[...(state.draft[key]||[])];const next=event.target.checked?[...new Set([...current,event.target.value])]:current.filter(x=>x!==event.target.value);await client.action("UPDATE_DRAFT",{[key]:next});}
  }catch(cause){error=cause.message;render(client.state);}
});

app.addEventListener("input",event=>{
  if(event.target.matches("#crew-chat-input"))chatDraft=event.target.value;
  if(event.target.matches("[data-repair-range]")){const output=event.target.closest("form")?.querySelector("[data-repair-output]");if(output)output.textContent=`${event.target.value} ${client.state?.repairPuzzle?.unit||""}`;}
  if(event.target.matches("[data-repair-load]")){const form=event.target.closest("form"),total=[...form.querySelectorAll("[data-repair-load]:checked")].reduce((sum,input)=>sum+Number(input.dataset.repairLoad),0),output=form.querySelector("[data-repair-total]");if(output)output.textContent=`${total} / ${client.state?.repairPuzzle?.target||0}`;}
});

app.addEventListener("click",async event=>{
  const statusOpen=event.target.closest("[data-act2-status-open]");
  if(statusOpen){act2StatusOpen=true;render(client.state);document.querySelector("[data-act2-status-close]")?.focus({preventScroll:true});return;}
  const statusClose=event.target.closest("[data-act2-status-close]");
  if(statusClose){act2StatusOpen=false;render(client.state);return;}
  const repairBack=event.target.closest("[data-repair-back]");
  if(repairBack){pendingRepairAnswer=null;repairBack.closest(".repair-confirm-overlay")?.remove();return;}
  const repairConfirm=event.target.closest("[data-repair-confirm]");
  if(repairConfirm&&pendingRepairAnswer){repairConfirm.disabled=true;try{await client.action("REPAIR_SUBMIT",{answer:pendingRepairAnswer.answer});pendingRepairAnswer=null;stationAudio.cue("commit");}catch(cause){repairConfirm.disabled=false;stationAudio.cue("error");alert(cause.message);}return;}
  const restartAct2=event.target.closest("[data-restart-act2]");
  if(restartAct2){restartAct2.disabled=true;try{await client.action("RESTART_ACT2");stationAudio.cue("commit");}catch(cause){restartAct2.disabled=false;stationAudio.cue("error");alert(cause.message);}return;}
  const restartOpen=event.target.closest("[data-restart-open]");
  if(restartOpen){
    restartOpen.disabled=true;
    restartOpen.setAttribute("aria-busy","true");
    try{await client.action("RESTART_SESSION");stationAudio.cue("commit");}
    catch(cause){restartOpen.disabled=false;restartOpen.removeAttribute("aria-busy");stationAudio.cue("error");alert(cause.message);}
    return;
  }
  const act1Page=event.target.closest("[data-act1-page]");
  if(act1Page&&client.state?.viewer?.role){act1PageByRole[client.state.viewer.role]=Number(act1Page.dataset.act1Page);render(client.state);return;}
  const act2Page=event.target.closest("[data-act2-manual-page]");
  if(act2Page&&client.state?.viewer?.role){act2ManualPageByRole[client.state.viewer.role]=Number(act2Page.dataset.act2ManualPage);render(client.state);return;}
  const chatToggle=event.target.closest("[data-chat-toggle]");
  if(chatToggle){chatOpen=!chatOpen;chatUnread=0;chatAlert=null;clearTimeout(chatAlertTimer);renderChat(client.state);if(chatOpen)requestAnimationFrame(()=>document.querySelector("#crew-chat-input")?.focus());return;}
  const chatOpenButton=event.target.closest("[data-chat-open]");
  if(chatOpenButton){chatOpen=true;chatUnread=0;chatAlert=null;clearTimeout(chatAlertTimer);renderChat(client.state);requestAnimationFrame(()=>document.querySelector("#crew-chat-input")?.focus());return;}
  const entry=event.target.closest("[data-entry-mode]");
  if(entry){entryMode=entry.dataset.entryMode;error="";renderHome();return;}
  const crew=event.target.closest("[data-crew-size]");
  if(crew){entryCrewSize=Number(crew.dataset.crewSize);renderHome();return;}
  const create=event.target.closest("[data-create-session]");
  if(create){
    create.disabled=true;const label=create.querySelector("[data-control-label]");if(label)label.textContent="INITIALIZING…";
    try{const result=await client.create(entryCrewSize);localStorage.setItem(`blackout-token-${result.code}`,result.facilitatorToken);location.href=url("facilitator",result.code,result.facilitatorToken);}catch(cause){error=cause.message;entryMode="host";renderHome();}
    return;
  }
  const sound=event.target.closest("[data-sound]");
  if(sound){await stationAudio.toggle();render(client.state);return;}
  const introSound=event.target.closest("[data-intro-sound]");
  if(introSound){const video=document.querySelector("[data-act1-lead-in]");if(video){if(!stationAudio.enabled)await stationAudio.toggle();video.muted=false;video.play().catch(()=>{});introSound.textContent="FULL AUDIO ACTIVE";introSound.disabled=true;}return;}
  const copy=event.target.closest("[data-copy-view]");
  if(copy){await navigator.clipboard.writeText(url(copy.dataset.copyView,code));const label=copy.querySelector("b");if(label)label.textContent="CREW LINK COPIED";stationAudio.cue("confirm");return;}
  const fieldInstruction=event.target.closest("[data-field-instruction]");
  if(fieldInstruction){try{await client.action("FIELD_INSTRUCTION",{instruction:fieldInstruction.dataset.fieldInstruction});stationAudio.cue("confirm");}catch(cause){stationAudio.cue("error");alert(cause.message);}return;}
  const fieldService=event.target.closest("[data-field-service]");
  if(fieldService){try{if(!confirm("Commit this field action? There is no retry."))return;await client.action("FIELD_SERVICE",{action:fieldService.dataset.fieldService});stationAudio.cue("commit");}catch(cause){stationAudio.cue("error");alert(cause.message);}return;}
  const cabinControl=event.target.closest("[data-cabin-control]");
  if(cabinControl){try{await client.action("CABIN_MOVE",{control:cabinControl.dataset.cabinControl,value:cabinControl.dataset.cabinValue||null});stationAudio.cue("confirm");}catch(cause){stationAudio.cue("error");alert(cause.message);}return;}
  const transferStep=event.target.closest("[data-transfer-step]");
  if(transferStep){try{await client.action("TRANSFER_STEP",{step:transferStep.dataset.transferStep});stationAudio.cue("confirm");}catch(cause){stationAudio.cue("error");alert(cause.message);}return;}
  const purge=event.target.closest("[data-r12-purge]");
  if(purge){try{await client.action("R12_PURGE");stationAudio.cue("commit");}catch(cause){stationAudio.cue("error");alert(cause.message);}return;}
  const rating=event.target.closest("[data-message-rating]");
  if(rating){try{await client.action("CLASSIFY_MESSAGE",{rating:rating.dataset.messageRating});stationAudio.cue("commit");}catch(cause){stationAudio.cue("error");alert(cause.message);}return;}
  const absent=event.target.closest("[data-absent-role]");
  if(absent){await client.action("SET_ABSENT",{role:absent.dataset.absentRole,absent:!client.state.absentRoles?.[absent.dataset.absentRole]});return;}
  const resend=event.target.closest("[data-resend-role]");
  if(resend){await client.action("RESEND_CARD",{role:resend.dataset.resendRole});stationAudio.cue("confirm");return;}
  const debriefStep=event.target.closest("[data-debrief-step]");
  if(debriefStep){await client.action("SET_DEBRIEF_STEP",{step:Number(debriefStep.dataset.debriefStep)});stationAudio.cue("confirm");return;}
  const profileSignal=event.target.closest("[data-profile-signal]");
  if(profileSignal){await client.action("TOGGLE_PROFILE_SIGNAL",{id:profileSignal.dataset.profileSignal});stationAudio.cue("confirm");return;}
  const roleDownload=event.target.closest("[data-download-role]");
  if(roleDownload){const state=client.state,card=state.privateCard,role=state.roles[state.viewer.role],body=["BLACKOUT RIDGE / PRIVATE ROLE BRIEF",`SESSION: ${state.code}`,`STAGE: ${String(state.stage).padStart(2,"0")} / ${state.stageDefinition.kicker}`,`ROLE: ${role.name}`,`LENS: ${role.lens}`,`CONFIDENCE: ${card.confidence}`,"",card.title,card.body,"",`ROLE OVERRIDE: ${card.intervention}`,"",state.participantCare].join("\n"),blob=new Blob([body],{type:"text/plain"}),href=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=href;anchor.download=`blackout-ridge-${state.code}-${state.viewer.role}-stage-${state.stage}.txt`;anchor.click();setTimeout(()=>URL.revokeObjectURL(href),500);return;}
  const download=event.target.closest("[data-download-summary]");
  if(download){const state=client.state,payload={session:state.code,ending:state.ending,metrics:state.metrics,decisions:state.decisions,debrief:state.debrief,playtest:state.playtest,environment:state.environment,officialStatus:state.officialStatus,chatMessages:state.chatMessages,history:state.history};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),href=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=href;anchor.download=`blackout-ridge-${state.code}-session-record.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(href),500);return;}
  const target=event.target.closest("[data-action]");if(!target||target.disabled)return;
  try{await client.action(target.dataset.action);stationAudio.cue(target.dataset.action==="COMMIT_STAGE"?"commit":"confirm");}catch(cause){error=cause.message;stationAudio.cue("error");alert(error);}
});

app.addEventListener("keydown",event=>{if(event.key!=="Escape")return;if(act2StatusOpen){act2StatusOpen=false;render(client.state);return;}if(chatOpen){chatOpen=false;renderChat(client.state);}});

app.addEventListener("input",event=>{
  if(!event.target.matches("[data-archive-search]"))return;
  const panel=event.target.closest(".lark-archive"),query=event.target.value.trim().toLowerCase();let visible=0;
  panel?.querySelectorAll("[data-archive-record]").forEach(card=>{const match=!query||card.dataset.search.includes(query);card.hidden=!match;if(match)visible++;});
  const empty=panel?.querySelector("[data-archive-empty]");if(empty)empty.hidden=visible!==0;
});

function tick(){const state=client.state;if(!state)return;document.querySelectorAll("[data-clock]").forEach(node=>node.textContent=clockDisplay(state));const intro=document.querySelector("[data-act1-lead-in]");if(intro&&state.act1Intro){const left=Math.max(0,Math.ceil((state.act1Intro.endsAt-Date.now())/1000)),label=document.querySelector("[data-intro-countdown]");if(label)label.textContent=`HANDOVER IN ${String(left).padStart(2,"0")}`;if(!left)render(state);}const act2=document.querySelector("[data-act2-opening]");if(act2&&state.act2Intro){const left=Math.max(0,Math.ceil((state.act2Intro.endsAt-Date.now())/1000)),elapsed=Math.max(0,(Date.now()-state.act2Intro.startedAt)/1000),beat=elapsed<9?0:elapsed<16?1:elapsed<25?2:3,label=act2.querySelector("[data-act2-opening-countdown]");if(label)label.textContent=String(left).padStart(2,"0");act2.querySelectorAll("[data-opening-beat]").forEach(node=>node.classList.toggle("active",Number(node.dataset.openingBeat)===beat));if(!left)render(state);}}
setInterval(tick,250);

async function boot(){
  if(view==="home")return renderHome();if(view==="gallery")return renderGallery();if(view==="join")return renderJoin();
  if(!code){error="No session code supplied";return renderError();}
  try{client.subscribe(render);await client.load();if(!snapshotMode)client.connect();}catch(cause){error=cause.message;renderError();}
}
boot();
