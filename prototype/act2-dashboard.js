// Coordinates are measured on act2-shared-dashboard-fixed-v3.webp (1672 × 941).
// Every overlay uses the full artwork as its containing block. Do not lay these
// out in a CSS grid: the engraved panel widths differ from row to row.
export const DASHBOARD_SIZE = { width: 1672, height: 941 };
export const DASHBOARD_PANELS = {
  lower_road_camera: { bounds: [30,113,638,350], lamp: [57,135] },
  received_traffic_log: { bounds: [677,113,557,350], lamp: [705,135] },
  air_quality: { bounds: [1243,113,400,350], lamp: [1268,135] },
  inbound_receive: { bounds: [30,471,571,232], lamp: [57,491] },
  source_identification: { bounds: [610,471,329,232], lamp: [638,491] },
  human_outbound: { bounds: [947,471,326,232], lamp: [974,491] },
  status_beacon: { bounds: [1281,471,362,232], lamp: [1310,491] },
  tower_monitoring: { bounds: [30,715,391,200], lamp: [57,735] },
  road_flood_monitoring: { bounds: [427,715,327,200], lamp: [453,735] },
  ventilation_control: { bounds: [762,715,260,200], lamp: [792,735] },
  site_access_control: { bounds: [1030,715,295,200], lamp: [1057,735] },
  fire_suppression: { bounds: [1331,715,312,200], lamp: [1350,735] },
};

const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const rectangle = ([x,y,width,height]) => `left:${x/DASHBOARD_SIZE.width*100}%;top:${y/DASHBOARD_SIZE.height*100}%;width:${width/DASHBOARD_SIZE.width*100}%;height:${height/DASHBOARD_SIZE.height*100}%`;
const element = (className, rect, content, attributes = "") => `<div class="sdb-slot ${className}" style="${rectangle(rect)}" ${attributes}>${content}</div>`;
const text = (className, rect, value) => element(`sdb-text ${className}`,rect,escape(value),`title="${escape(value)}"`);
const fault = (rect, label) => text("sdb-fault",rect,label);

export function renderAct2Dashboard(state) {
  const systems = Object.fromEntries((state.repairSystems || state.act3Systems || []).map(system => [system.id,system]));
  const systemState = id => systems[id]?.state || "fault";
  const works = id => systemState(id) === "working";
  const offline = id => systemState(id) === "offline";
  const run = state.repairRun || {};
  const traffic = run.traffic || [];
  const latest = traffic.at(-1);
  const phase = state.stage === 3 ? "FIELD PLANNING" : run.phase === "repair" ? "REPAIRS" : run.phase === "dispatch" ? "DISPATCH" : "PRIORITISATION";
  const seconds = state.clock.running && state.clock.endAt ? Math.max(0,Math.ceil((state.clock.endAt-Date.now())/1000)) : state.clock.remaining;
  const clock = `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  const assignments = Object.values(run.phase === "planning" || run.phase === "dispatch" ? state.draft?.repairs || {} : run.assignments || {}).filter(Boolean).length;
  const complete = Object.keys(run.results || {}).length;
  const level = run.personnelLevel || 0;
  const personnel = level === 2 ? "PERSONNEL EXCEPTION / M. VENN / FIELD TASK OVERDUE" : level === 1 ? "M. VENN / FIELD TASK OVERDUE" : "PERSONNEL STATUS / NO EXCEPTION RAISED";
  const parts = [
    element("sdb-official",[445,24,612,38],`<span>AUTOMATIC STATUS :</span><strong>OPERATIONAL / NO ACTIVE DISTRESS</strong>`),
    text("sdb-players",[1080,25,151,36],`${Object.keys(state.players || {}).length} PLAYERS`),
    element("sdb-clock",[1255,25,366,36],`<span>${phase}</span><strong data-clock>${clock}</strong>`),
    text(`sdb-personnel ${level ? "sdb-alert" : ""}`,[58,74,1278,24],personnel),
    text("sdb-progress",[1368,74,255,24],state.stage===3?"4 EXTERNAL SYSTEMS OFFLINE":`${run.phase === "repair" ? complete : assignments} / ${state.playerCount} ${run.phase === "repair" ? "REPAIRS COMPLETE" : "REPAIRS ASSIGNED"}`),
  ];
  for (const [id,{lamp:[x,y]}] of Object.entries(DASHBOARD_PANELS)) {
    const status=systemState(id);
    parts.push(element(`sdb-lamp ${status}`,[x-10,y-10,20,20],"",`role="img" data-system="${id}" data-state="${status}" aria-label="${escape(systems[id]?.name || id)}: ${status === "working" ? "operational" : status === "offline" ? "offline" : "local fault"}"`));
  }

  parts.push(element(`sdb-camera ${offline("lower_road_camera")?"sdb-camera-offline":""}`,[50,163,595,271],offline("lower_road_camera")?`<strong>OFFLINE</strong><span>CAM 01 · LOWER ROAD</span>`:`<img src="./assets/images/act2/act2-lower-road-camera-feed-v1.webp" alt="Lower Road camera in heavy rain"><span>CAM 01 · LOWER ROAD</span><b>LIVE</b>`));

  // One line per engraved row, with exactly the same column boundaries as the art.
  const rows = traffic.filter(item => item.stored || ["direct","recovered"].includes(item.storageState)).slice(-10);
  for(let row=0;row<10;row++) {
    const item = works("received_traffic_log") ? rows[row] : null;
    const time = item ? new Date(item.receiptStartAt || item.at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}) : "—";
    const values = [time,item?.capturedSource || item?.source || "—",item?.displayedTranscript || item?.text || "—"];
    [[699,83],[792,91],[894,312]].forEach(([x,w],column) => {
      parts.push(text(`sdb-log-cell ${column === 0 ? "sdb-log-time" : ""}`,[x,184+row*25.5,w,24],values[column]));
    });
  }
  if(!works("received_traffic_log")) parts.push(element("sdb-log-unavailable",[798,265,314,82],`<b>⚠ LOG UNAVAILABLE</b><span>Incoming messages held in receiver buffer.<br>Restore transfer to recover messages.</span>`));

  if(!works("air_quality")) parts.push(fault([1269,157,347,26],"⚠ SENSOR FAULT / READINGS UNRELIABLE"));
  else {
    parts.push(text("sdb-good",[1269,157,347,26],"READINGS TRUSTWORTHY"));
    for(const x of [1292,1482]) {
      // Cover only the baked placeholder dash, never the surrounding gauge/label.
      parts.push(text("sdb-reading sdb-good",[x,329,110,29],"AVAILABLE"));
      parts.push(text("sdb-reading sdb-good",[x,416,110,22],"ACTIVE"));
    }
  }

  if(!works("inbound_receive")) parts.push(text(offline("inbound_receive")?"sdb-offline":"sdb-fault",[331,480,252,24],offline("inbound_receive")?"EXTERNAL LINK OFFLINE":"RECEPTION DEGRADED"));
  const waveform = Array.from({length:64},(_,i)=>`<i style="height:${latest?12+(i*19%72):6}%"></i>`).join("");
  parts.push(element("sdb-wave",[109,541,460,17],waveform,`aria-label="${latest ? "Incoming signal" : "Carrier idle"}"`));
  parts.push(text("sdb-inbound-source",[124,588,450,20],offline("inbound_receive")?"NO EXTERNAL CARRIER":latest?.capturedSource || latest?.source || "AWAITING SIGNAL"));
  parts.push(text("sdb-transmission",[57,637,520,53],offline("inbound_receive")?"Inbound field distribution is offline.":latest?.displayedTranscript || latest?.text || "Waiting for incoming transmission."));

  if(!works("source_identification")) parts.push(fault([629,509,293,23],"IDENTIFICATION FAULT"));
  parts.push(text("sdb-source",[635,565,279,30],latest?.capturedSource || latest?.source || (works("source_identification") ? "AWAITING SIGNAL" : "SOURCE UNRESOLVED")));
  if(!works("human_outbound")) parts.push(text(offline("human_outbound")?"sdb-offline":"sdb-fault",[967,509,288,23],offline("human_outbound")?"EXTERNAL LINK OFFLINE":"OUTPUT DISTORTED"));
  parts.push(text(offline("human_outbound")?"sdb-offline":"sdb-idle",[1078,648,159,25],offline("human_outbound")?"OFFLINE":"IDLE"));
  if(!works("status_beacon")) parts.push(fault([1301,509,325,23],"STATUS CONTROL FAULT"));
  parts.push(text("sdb-beacon",[1308,568,308,23],"OPERATIONAL / NO ACTIVE DISTRESS"));

  if(!works("tower_monitoring")) parts.push(fault([53,749,346,20],"DIAGNOSTIC FEED UNAVAILABLE"));
  ["RX-01","TX-01","CAM-01","AUX-01"].forEach((id,row) => {
    const values=[id,works("tower_monitoring")?"FEED ACTIVE":"—","—"];
    [[48,140],[200,111],[325,74]].forEach(([x,w],column)=>parts.push(text("sdb-diagnostic",[x,797+row*23,w,21],values[column])));
  });
  if(!works("road_flood_monitoring")) parts.push(fault([443,750,293,27],"MONITORING FAULT / REPORTS UNAVAILABLE"));
  parts.push(text("sdb-water",[687,808,43,27],works("road_flood_monitoring")?"OK":"—"));
  parts.push(text("sdb-water",[687,861,43,27],works("road_flood_monitoring")?"OK":"—"));
  parts.push(text(`sdb-vent ${offline("ventilation_control")?"sdb-offline":works("ventilation_control")?"sdb-good":"sdb-fault"}`,[779,851,224,35],offline("ventilation_control")?"EXTERNAL PATH OFFLINE":works("ventilation_control")?"AIR EXCHANGE ACTIVE":"LOCAL FAULT"));
  parts.push(text("sdb-reader sdb-good",[1169,789,122,17],"READY"));
  parts.push(text(`sdb-reader ${works("site_access_control")?"sdb-good":"sdb-fault"}`,[1169,842,122,18],works("site_access_control")?"READY":"FAULT"));
  parts.push(text("sdb-footnote",[1047,879,262,22],"Door manually operable."));
  parts.push(text(works("fire_suppression")?"sdb-good":"sdb-fault",[1347,751,280,25],works("fire_suppression")?"SUPPRESSION CONTROL READY":"AUTOMATIC SUPPRESSION NOT READY"));
  parts.push(text("sdb-footnote",[1347,883,280,20],"Manual extinguishers available."));

  return `<section class="station-dashboard" aria-label="Station status and control"><img class="sdb-art" width="1672" height="941" src="./assets/images/act2/act2-shared-dashboard-fixed-v3.webp" alt="Blackout Ridge: twelve station systems, live status and received traffic">${parts.join("")}</section>`;
}
