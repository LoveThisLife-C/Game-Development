#!/usr/bin/env node
/**
 * Capture current Milestone 4 screenshots against a live dev server.
 * Usage: npm run dev (separate terminal) then node scripts/capture-milestone-4-screenshots.mjs
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.CAPTURE_OUT
  ? path.resolve(root, process.env.CAPTURE_OUT)
  : path.join(root, "docs/reports/screenshots/milestone-4-latest");
const base = process.env.CAPTURE_BASE || "http://127.0.0.1:4173";
const capturePlayerCount = Number(process.env.CAPTURE_PLAYERS || 6);
if (![4, 5, 6, 7].includes(capturePlayerCount)) throw new Error("CAPTURE_PLAYERS must be 4, 5, 6 or 7");
const captureRoles = {
  4: ["lead", "signal", "systems", "operations"],
  5: ["lead", "signal", "systems", "operations", "field"],
  6: ["lead", "signal", "systems", "operations", "field", "protocol"],
  7: ["lead", "signal", "systems", "operations", "field", "protocol", "comms"],
}[capturePlayerCount];

const chromeCandidates = [
  "google-chrome-stable",
  "google-chrome",
  "chromium-browser",
  "chromium",
];

function chromeBin() {
  for (const name of chromeCandidates) {
    try {
      execFileSync("which", [name], { stdio: "pipe" });
      return name;
    } catch {}
  }
  throw new Error("No headless Chrome found (google-chrome-stable or chromium).");
}

function convertCapture(source, destination) {
  const imageMagick = spawnSync("which", ["convert"], { stdio: "ignore" });
  if (imageMagick.status === 0) {
    execFileSync("convert", [source, "-quality", "82", "-define", "webp:method=6", destination], {
      stdio: "pipe",
      timeout: 45000,
    });
    return;
  }
  execFileSync("python3", [
    "-c",
    "from PIL import Image; import sys; image=Image.open(sys.argv[1]); image.save(sys.argv[2], 'WEBP', quality=82, method=6)",
    source,
    destination,
  ], { stdio: "pipe", timeout: 45000 });
}

async function api(pathname, { method = "GET", token, body, retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const headers = {};
      if (token) headers.authorization = `Bearer ${token}`;
      if (body) headers["content-type"] = "application/json";
      const response = await fetch(`${base}${pathname}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      const data = text.trim() ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(data.error || `${method} ${pathname} failed (${response.status})`);
      return data;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function action(code, token, type, payload = {}) {
  return api(`/api/sessions/${code}/action`, { method: "POST", token, body: { type, payload } });
}

function shot(chrome, name, url, { width = 1440, height = 900, skipIfExists = false } = {}) {
  const file = path.join(outDir, name);
  const captureFile = file.endsWith(".webp") ? file.replace(/\.webp$/, ".capture.png") : file;
  fs.mkdirSync(outDir, { recursive: true });
  if (skipIfExists && fs.existsSync(file) && fs.statSync(file).size > 5000) {
    console.log("Skipped (exists)", name);
    return;
  }
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--hide-scrollbars",
      "--virtual-time-budget=8000",
      "--window-size=" + width + "," + height,
      "--screenshot=" + captureFile,
      url,
    ],
    { stdio: "pipe", timeout: 45000 },
  );
  if (captureFile !== file) {
    convertCapture(captureFile, file);
    fs.unlinkSync(captureFile);
  }
  if (!fs.existsSync(file) || fs.statSync(file).size < 5000) {
    throw new Error(`Screenshot too small or missing: ${name}`);
  }
  console.log("Captured", name);
}

function page(view, code, token, extra = "") {
  const params = new URLSearchParams({ view, snapshot: "1" });
  if (code) params.set("session", code);
  if (token) params.set("token", token);
  for (const part of extra.split("&").filter(Boolean)) {
    const [key, value] = part.split("=");
    params.set(key, value);
  }
  return `${base}/?${params}`;
}

async function healthCheck() {
  try {
    await api("/api/health");
  } catch {
    throw new Error(`Dev server not reachable at ${base}. Run: npm run dev`);
  }
}

async function createDemoSession() {
  const { code, facilitatorToken } = await api("/api/sessions", {
    method: "POST",
    body: { playerCount: capturePlayerCount },
  });
  const tokens = { facilitator: facilitatorToken };
  const roster = {
    lead: "Avery Chen",
    signal: "Sam Ortiz",
    systems: "Rin Patel",
    operations: "Jordan Blake",
    field: "Mara Ellis",
    protocol: "Lee Nguyen",
    comms: "Alex Morgan",
  };
  for (const role of captureRoles) {
    const name = roster[role];
    const joined = await api(`/api/sessions/${code}/join`, {
      method: "POST",
      body: { role, name },
    });
    tokens[role] = joined.playerToken;
  }
  return { code, tokens };
}

const repairRoles = captureRoles;
const repairSystems = ["inbound_receive", "human_outbound", "status_beacon", "tower_monitoring", "air_quality", "received_traffic_log", "backup_power"];
const repairAnswers = {
    inbound_receive: ["antenna", "filter", "decoder", "console"],
    human_outbound: { input: "human", gate: "human", output: "main" },
    status_beacon: {control:"restore",memory:"retain_stale",output:"heartbeat"},
    tower_monitoring: { arc: "mast", drop: "distribution", legacy: "legacy" },
    air_quality: 42,
    received_traffic_log: ["p05", "p12", "p18", "p27"],
    backup_power: ["lights", "comms", "console"],
};
async function beginRepairs(code, tokens) {
  await action(code, tokens.facilitator, "UPDATE_DRAFT", { repairs: Object.fromEntries(repairRoles.map((role,index)=>[role,repairSystems[index]])) });
  await action(code, tokens.facilitator, "COMMIT_STAGE");
}
async function submitRepairs(code, tokens) {
  for (let index=0; index<repairRoles.length; index++) await action(code, tokens[repairRoles[index]], "REPAIR_SUBMIT", { answer: repairAnswers[repairSystems[index]] });
  await action(code, tokens.facilitator, "COMMIT_STAGE");
}
async function completeRepairs(code, tokens) {
  await beginRepairs(code,tokens);
  await submitRepairs(code,tokens);
}

async function advanceToStage(code, tokens, targetStage) {
  await action(code, tokens.facilitator, "START_GAME");

  const steps = [
    () => action(code, tokens.facilitator, "UPDATE_DRAFT", { handover: { ellie: "yes", noor: "yes", jamie: "yes", saira: "yes", kai: "yes", mara: "no" } }),
    () => action(code, tokens.facilitator, "COMMIT_STAGE"),
    () => action(code, tokens.facilitator, "ADVANCE_STAGE"),
    () => completeRepairs(code, tokens),
    () => action(code, tokens.facilitator, "ADVANCE_STAGE"),
    () => action(code, tokens.facilitator, "UPDATE_DRAFT", { plannedInbound: "a", plannedOutbound: "b", firstTarget: "a", equipment: ["gas_mask", "service_toolkit"] }),
    () => action(code, tokens.facilitator, "COMMIT_STAGE"),
    () => action(code, tokens.facilitator, "ADVANCE_STAGE"),
  ];

  let stage = 1;
  for (const step of steps) {
    await step();
    const state = await api(`/api/sessions/${code}/state`, { token: tokens.facilitator });
    stage = state.stage;
    if (stage >= targetStage) return state;
  }
  return api(`/api/sessions/${code}/state`, { token: tokens.facilitator });
}

async function beginOutsideRun(code, tokens) {
  await action(code, tokens.facilitator, "UPDATE_DRAFT", {
    runner: "operations",
  });
  await action(code, tokens.facilitator, "COMMIT_STAGE");
}

async function completeOutsideRun(code, tokens) {
  await action(code, tokens.signal, "FIELD_INSTRUCTION", { instruction: "vent_turn" });
  await action(code, tokens.operations, "FIELD_SERVICE", { action: "vent_turn_reseat" });
  await action(code, tokens.systems, "FIELD_INSTRUCTION", { instruction: "isolate_dark" });
  await action(code, tokens.operations, "FIELD_SERVICE", { action: "isolate_blue_bridge" });
  await action(code, tokens.facilitator, "ADVANCE_STAGE");
}

const transferSteps=["harness","wheel","ladder","inner"];
function currentRole(state){return Object.entries(state.players).find(([,player])=>player.name===state.finale.currentName)?.[0];}
async function completeCurrentTransfer(code,tokens){
  const state=await api(`/api/sessions/${code}/state`,{token:tokens.facilitator}),role=currentRole(state);
  if(!role)throw new Error("Active finale player could not be resolved");
  for(const step of transferSteps)await action(code,tokens[role],"TRANSFER_STEP",{step});
}

async function main() {
  await healthCheck();
  const chrome = chromeBin();
  fs.mkdirSync(outDir, { recursive: true });

  // Static entry screens (current UI)
  shot(chrome, "01-home-boot.webp", page("home", "", "", "entry=boot"), { skipIfExists: true });
  shot(chrome, "02-host-config.webp", page("home", "", "", "entry=host"), { skipIfExists: true });

  const lobbySession = await createDemoSession();
  const { code, tokens } = lobbySession;

  // Partial crew for join flow (one role still open)
  const joinCode = code;
  shot(chrome, "03-join-flow.webp", page("join", joinCode));

  shot(chrome, "04-assembly-lobby.webp", page("facilitator", code, tokens.facilitator));

  await action(code, tokens.facilitator, "START_GAME");
  shot(chrome, "04a-shared-stage1.webp", page("shared", code));
  shot(chrome, "04b-player-lead-stage1.webp", page("player", code, tokens.lead));
  shot(chrome, "04c-facilitator-stage1.webp", page("facilitator", code, tokens.facilitator));
  shot(chrome, "04d-player-lead-mobile.webp", page("player", code, tokens.lead), { width: 390, height: 844 });

  await action(code, tokens.facilitator, "UPDATE_DRAFT", { handover: { ellie: "yes", noor: "yes", jamie: "yes", saira: "yes", kai: "yes", mara: "no" } });
  await action(code, tokens.facilitator, "COMMIT_STAGE");
  shot(chrome, "04e-stage1-consequence-mobile.webp", page("player", code, tokens.lead), { width: 390, height: 844 });
  await action(code, tokens.facilitator, "ADVANCE_STAGE");
  shot(chrome, "05-shared-stage2.webp", page("shared", code));
  shot(chrome, "06-facilitator-stage2.webp", page("facilitator", code, tokens.facilitator));

  await beginRepairs(code, tokens);
  shot(chrome, "06a-shared-repairs-active.webp", page("shared", code));
  shot(chrome, "06b-player-inbound-repair.webp", page("player", code, tokens.lead));
  shot(chrome, "06c-player-outbound-repair.webp", page("player", code, tokens.signal));
  shot(chrome, "06d-player-inbound-mobile.webp", page("player", code, tokens.lead), { width: 390, height: 844 });
  await submitRepairs(code, tokens);
  await action(code, tokens.facilitator, "ADVANCE_STAGE");

  await action(code, tokens.facilitator, "UPDATE_DRAFT", { plannedInbound: "a", plannedOutbound: "b", firstTarget: "a", equipment: ["gas_mask", "service_toolkit"] });
  shot(chrome, "07-shared-stage3.webp", page("shared", code));
  shot(chrome, "08-player-signal-stage3.webp", page("player", code, tokens.signal));
  shot(chrome, "09-facilitator-stage3.webp", page("facilitator", code, tokens.facilitator));
  await action(code, tokens.lead, "CHAT_MESSAGE", { message: "Confirm both functions before we lock two locations." });
  await action(code, tokens.systems, "CHAT_MESSAGE", { message: "Tower shows receive-return loss and an isolated operator line driver." });
  await action(code, tokens.facilitator, "CHAT_MESSAGE", { message: "Two minutes remain in the planning window." });
  await action(code, tokens.signal, "CHAT_MESSAGE", { message: "The sealed receive coupler needs a clear horizon." });
  shot(chrome, "09a-crew-chat.webp", page("player", code, tokens.signal, "chat=open"));
  shot(chrome, "09b-player-signal-mobile.webp", page("player", code, tokens.signal), {
    width: 390,
    height: 844,
  });

  await action(code, tokens.facilitator, "COMMIT_STAGE");
  await action(code, tokens.facilitator, "ADVANCE_STAGE");

  await beginOutsideRun(code, tokens);
  shot(chrome, "10-outside-run-runner.webp", page("player", code, tokens.operations));
  shot(chrome, "10a-outside-run-station.webp", page("player", code, tokens.signal));
  shot(chrome, "11-outside-run-facilitator.webp", page("facilitator", code, tokens.facilitator));

  await completeOutsideRun(code, tokens);

  await action(code, tokens.facilitator, "CABIN_MOVE", { control: "intake", value: "sealed" });
  await action(code, tokens.facilitator, "CABIN_MOVE", { control: "filter", value: "b" });
  shot(chrome, "12-cabin-air-stage5.webp", page("shared", code));
  shot(chrome, "13-facilitator-cabin-air-stage5.webp", page("facilitator", code, tokens.facilitator));
  shot(chrome, "13a-player-cabin-air-stage5.webp", page("player", code, tokens.systems));

  await action(code, tokens.facilitator, "END_CABIN_WINDOW", { note: "Automated documentation capture" });
  shot(chrome, "13b-r12-mara-reveal-stage5.webp", page("shared", code));
  await action(code, tokens.facilitator, "ADVANCE_STAGE");

  shot(chrome, "14-lark-history-stage6.webp", page("facilitator", code, tokens.facilitator));
  await action(code, tokens.facilitator, "ADVANCE_ARCHIVE_PHASE", { note: "Automated documentation capture" });
  shot(chrome, "14a-r12-technical-stage6.webp", page("facilitator", code, tokens.facilitator));
  await action(code, tokens.facilitator, "END_ARCHIVE_WINDOW", { note: "Automated documentation capture" });
  await action(code, tokens.facilitator, "ADVANCE_STAGE");

  shot(chrome, "15-finale-stage7.webp", page("shared", code));
  let finaleState=await api(`/api/sessions/${code}/state`,{token:tokens.facilitator});
  shot(chrome,"15a-active-transfer-stage7.webp",page("player",code,tokens[currentRole(finaleState)]));
  while((finaleState=await api(`/api/sessions/${code}/state`,{token:tokens.facilitator})).finale.phase==="transfer"&&finaleState.finale.belowCount<finaleState.finale.total-1)await completeCurrentTransfer(code,tokens);
  finaleState=await api(`/api/sessions/${code}/state`,{token:tokens.facilitator});
  const finalRole=currentRole(finaleState);
  shot(chrome,"15b-final-surface-stage7.webp",page("player",code,tokens[finalRole]));
  await action(code,tokens[finalRole],"UPDATE_SURFACE",{status:"distress",message:"ALL CREW IN R-12. SURFACE ATMOSPHERE UNSAFE. EXTERNAL EXTRACTION REQUIRED.",isolation:"engaged",authority:"authorised",releaseTest:true});
  await action(code,tokens[finalRole],"SUBMIT_SURFACE");
  await action(code,tokens.facilitator,"CLASSIFY_MESSAGE",{rating:"effective"});
  for(const step of transferSteps)await action(code,tokens[finalRole],"TRANSFER_STEP",{step});
  shot(chrome, "16-ending-preview.webp", page("facilitator", code, tokens.facilitator));

  await action(code, tokens.facilitator, "CONFIRM_ENDING");
  shot(chrome, "17-ending-clean-rescue.webp", page("shared", code));
  shot(chrome, "18-debrief-facilitator.webp", page("facilitator", code, tokens.facilitator));

  await action(code, tokens.facilitator, "SET_DEBRIEF_STEP", { step: 6 });
  await action(code, tokens.signal, "SAVE_FIRST_STEP", {
    note: "Before trusting an AI summary, I will ask which source header was preserved.",
  });
  shot(chrome, "19-debrief-player-mobile.webp", page("player", code, tokens.signal), {
    width: 390,
    height: 844,
  });

  await action(code, tokens.facilitator, "SET_DEBRIEF_STEP", { step: 1 });
  await action(code, tokens.facilitator, "SAVE_PLAYTEST", {
    ratings: {
      clarity: 4,
      thrill: 5,
      survival: 4,
      ai_alignment: 4,
      facilitation: 5,
      role_value: 4,
      remote_fit: 4,
    },
    disposition: "proceed",
    notes: "Pilot session — strong role interdependence; Stage 4 air meter landed well.",
  });
  shot(chrome, "20-playtest-record.webp", page("facilitator", code, tokens.facilitator));

  console.log(`\nDone. ${outDir}`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
