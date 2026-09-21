export const ROLES = {
  lead: { short: "LEAD", name: "Station Lead", lens: "Accountability", color: "amber", intervention: "Hold the Clock" },
  signal: { short: "SIG", name: "Signal Analyst", lens: "Meaning & provenance", color: "cyan", intervention: "Recover Fragment" },
  systems: { short: "SYS", name: "Systems Engineer", lens: "System boundaries", color: "violet", intervention: "Trace Dependency" },
  operations: { short: "OPS", name: "Operations Officer", lens: "Bounded action", color: "green", intervention: "Controlled Test" },
  field: { short: "FIELD", name: "Field Liaison", lens: "People in the data", color: "rose", intervention: "Human Check" },
  protocol: { short: "PRO", name: "Protocol Officer", lens: "Risk & guardrails", color: "blue", intervention: "Safety Condition" },
  comms: { short: "COMMS", name: "Comms Officer", lens: "Receiver trust", color: "orange", intervention: "Request Readback" },
};

export const ROLE_CONFIGS = {
  4: {
    lead: { ...ROLES.lead, short: "CMD/PRO", name: "Command & Protocol", lens: "Accountability · risk · guardrails" },
    signal: ROLES.signal,
    systems: ROLES.systems,
    operations: { ...ROLES.operations, short: "OPS/FIELD", name: "Operations & Field", lens: "Bounded action · people in the data" },
  },
  5: {
    lead: ROLES.lead,
    signal: ROLES.signal,
    systems: ROLES.systems,
    operations: ROLES.operations,
    field: { ...ROLES.field, short: "FIELD/PRO", name: "Field & Protocol", lens: "People · risk · guardrails" },
  },
  6: Object.fromEntries(Object.entries(ROLES).filter(([id]) => id !== "comms")),
  7: ROLES,
};

const CARD_BUNDLES = {
  4: { lead: ["lead", "protocol"], signal: ["signal"], systems: ["systems"], operations: ["operations", "field"] },
  5: { lead: ["lead"], signal: ["signal"], systems: ["systems"], operations: ["operations"], field: ["field", "protocol"] },
};

export const roleIdsForCount = playerCount => Object.keys(ROLE_CONFIGS[playerCount] || ROLE_CONFIGS[7]);
export const rolesForCount = playerCount => ROLE_CONFIGS[playerCount] || ROLE_CONFIGS[7];

export const REPAIR_SYSTEMS = [
  { id:"inbound_receive", name:"INBOUND RECEIVE", rank:1, consequential:true, manual:"Receives external voice and data through the main mast.", puzzle:{type:"guide-choice",figure:"G09",visual:"module-chain",instruction:"Exactly two modules failed. Use the grouped checks, hard-wired route, severe-weather rule and interference bands to select the complete working receive chain.",facts:["INPUT B IS HARD-WIRED TO BOOSTER 2","SEVERE WEATHER: BOOSTER 2 → FILTER 2","STANDARD SUPPRESSES LOW · SURGE SUPPRESSES HIGH","LOW 31 · HIGH 78 · TRANSMISSION BAND LOW","RECEIVER SELF-TEST PASSES"],table:{head:["MODULES CHECKED","PASSED"],rows:[["Input A / Booster 1 / Filter 1","2 OF 3"],["Input B / Booster 2 / Filter 1","2 OF 3"],["Input B / Booster 1 / Filter 2","1 OF 3"]]},options:[["a","A / BOOSTER 1 / FILTER 2 / SURGE"],["b","A / BOOSTER 2 / FILTER 1 / SURGE"],["c","A / BOOSTER 2 / FILTER 2 / SURGE"],["d","A / BOOSTER 2 / FILTER 2 / STANDARD"],["e","B / BOOSTER 2 / FILTER 2 / SURGE"]]} },
  { id:"human_outbound", name:"HUMAN OUTBOUND", rank:2, consequential:true, manual:"Sends crew-originated voice and data through the main mast.", puzzle:{type:"guide-choice",figure:"G17",visual:"signal-graphs",instruction:"One shift has drifted by a constant. Amplifier ×2 and limiter ±4 work correctly. Select the change that restores both test outputs.",facts:["ORDER: INPUT SHIFT → AMPLIFIER ×2 → LIMITER ±4 → OUTPUT SHIFT","QUIET: INPUT −1…+1 · TARGET −2…+2 · CURRENT 0…+4","STRONG: INPUT −2…+2 · TARGET −4…+4 · CURRENT −2…+4, UPPER PEAK CLIPPED"],options:[["a","LOWER INPUT SHIFT BY 2 UNITS"],["b","LOWER OUTPUT SHIFT BY 2 UNITS"],["c","CHANGE AMPLIFIER FROM ×2 TO ×1"],["d","LOWER INPUT SHIFT BY 1 UNIT"],["e","LOWER OUTPUT SHIFT BY 1 UNIT"]]} },
  { id:"status_beacon", name:"STATUS BEACON", rank:3, consequential:true, manual:"Controls automatic external station-status reporting. Its fail-safe repeats the last valid status while control is broken.", puzzle:{type:"guide-choice",figure:"G10",visual:"beacon-tests",instruction:"Station number, access code and minimum command duration are unchanged. Infer the only settings matching all saved acceptance totals.",facts:["STATIONS: 6 / 9 / 12","ACCESS CODES: 24 / 57 / 81","MINIMUM DURATIONS: 2 / 4 / 6 SECONDS","AUTOMATIC BROADCAST REMAINS ACTIVE"],table:{head:["TEST","STATION","CODE","DURATION","MET"],rows:[["1","6","24","4 SEC","1 OF 3"],["2","6","57","2 SEC","1 OF 3"],["3","6","57","4 SEC","2 OF 3"],["4","9","24","2 SEC","1 OF 3"]]},options:[["a","STATION 9 · CODE 24 · 4 SEC"],["b","STATION 6 · CODE 57 · 4 SEC"],["c","STATION 9 · CODE 57 · 4 SEC"],["d","STATION 9 · CODE 57 · 2 SEC"]]} },
  { id:"tower_monitoring", name:"TOWER MONITORING", rank:4, consequential:true, manual:"Reports faults and diagnostics from the mast and associated external infrastructure.", puzzle:{type:"guide-choice",figure:"G11",visual:"channel-map",instruction:"Every channel A–D belongs to one equipment identifier. Restore the mapping from the surviving correct-count tests.",facts:["EQUIPMENT IDS: RX-01 · TX-01 · CAM-01 · AUX-01","THE TRUE ASSIGNMENT DID NOT CHANGE BETWEEN TESTS","IDENTIFIERS ARE EQUIPMENT, NOT LOCATIONS"],table:{head:["TEST","CHANNEL A","CHANNEL B","CHANNEL C","CHANNEL D","CORRECT"],rows:[["1","RX-01","TX-01","CAM-01","AUX-01","2"],["2","RX-01","CAM-01","TX-01","AUX-01","1"],["3","RX-01","AUX-01","CAM-01","TX-01","1"],["4","TX-01","CAM-01","RX-01","AUX-01","0"]]},options:[["a","RX-01 / AUX-01 / CAM-01 / TX-01"],["b","TX-01 / RX-01 / CAM-01 / AUX-01"],["c","RX-01 / TX-01 / AUX-01 / CAM-01"],["d","CAM-01 / AUX-01 / TX-01 / RX-01"],["e","AUX-01 / TX-01 / CAM-01 / RX-01"]]} },
  { id:"air_quality", name:"AIR QUALITY MONITORING", rank:5, consequential:true, manual:"Monitors local airborne hazards and contamination trends.", puzzle:{type:"guide-choice",figure:"G12",visual:"sensor-calibration",instruction:"Exactly one sensor reads one step high and one reads one step low. Identify both from the balanced pair tests.",facts:["A EXTERNAL INTAKE · B MAIN CABIN · C EQUIPMENT BAY","D LOWER ACCESS · E CEILING RETURN","OTHER THREE SENSORS ARE CORRECT"],table:{head:["SENSOR PAIR","AVERAGE RESULT"],rows:[["A + B","BALANCED"],["A + C","HIGH"],["A + D","BALANCED"],["B + E","LOW"]]},options:[["a","ADJUST A DOWN · B UP"],["b","ADJUST C DOWN · B UP"],["c","ADJUST C DOWN · E UP"],["d","ADJUST A DOWN · E UP"],["e","ADJUST D DOWN · B UP"]]} },
  { id:"received_traffic_log", name:"RECEIVED TRAFFIC LOG", rank:6, consequential:true, manual:"Stores exactly what the station successfully receives; missed traffic cannot be recovered.", puzzle:{type:"guide-choice",figure:"G13",visual:"switch-routing",instruction:"Reverse exactly three switches so the SW3 route check and required backup inputs both match.",facts:["LINES 1–4: MESSAGE AUDIO / STATION TIME / RECORD COMMAND / SOURCE LABEL","AFTER SW3: LINE 2 TIME · LINE 3 RECORD","BACKUP 1–4: SOURCE / RECORD / AUDIO / TIME"],table:{head:["SWITCH","CONTROLLED LINES","CURRENT"],rows:[["SW1","1 AND 2","STRAIGHT"],["SW2","1 AND 3","STRAIGHT"],["SW3","1 AND 4","STRAIGHT"],["SW4","2 AND 3","CROSS"],["SW5","2 AND 4","CROSS"],["SW6","3 AND 4","STRAIGHT"]]},options:[["a","REVERSE SW4 / SW5 / SW6"],["b","REVERSE SW3 / SW4 / SW5"],["c","REVERSE SW3 / SW5 / SW6"],["d","REVERSE SW2 / SW3 / SW4"],["e","REVERSE SW1 / SW3 / SW5"]]} },
  { id:"source_identification", name:"SOURCE IDENTIFICATION", rank:7, consequential:true, manual:"Identifies the source and channel of subsequent normal incoming traffic.", puzzle:{type:"guide-choice",figure:"G14",visual:"timing-axis",instruction:"Eight equal contiguous digit slots must be sampled at their midpoint. Restore the first sample time and interval.",facts:["DIGIT 2 ENDS AT 64 MS","DIGIT 7 BEGINS AT 160 MS","CURRENT FIRST SAMPLE 26 MS · INTERVAL 27 MS","CURRENT: 26 / 53 / 80 / 107 / 134 / 161 / 188 / 215 MS"],options:[["a","FIRST 40 MS · INTERVAL 16 MS"],["b","FIRST 16 MS · INTERVAL 24 MS"],["c","FIRST 28 MS · INTERVAL 24 MS"],["d","FIRST 16 MS · INTERVAL 32 MS"],["e","FIRST 40 MS · INTERVAL 24 MS"]]} },
  { id:"fire_suppression", name:"FIRE SUPPRESSION CONTROL", rank:null, consequential:false, manual:"Controls automatic fire-suppression coverage.", puzzle:{type:"guide-choice",figure:"G15",visual:"valve-network",instruction:"One valve is stuck open. Use both saved pressure tests to identify its pipe and close that pipe’s working backup valve.",facts:["V1 A–B · V2 B–C · V3 A–C · V4 B–D · V5 C–D","ALL TESTS START FULLY PRESSURISED · NO NEW INFLOW","GAUGE B MEASURES CHAMBER B"],table:{head:["TEST","OPEN","CLOSED","DRAINED","GAUGE B"],rows:[["1","V1","V2 V3 V4 V5","C","DROPPED"],["2","V2","V1 V3 V4 V5","A","UNCHANGED"]]},options:[["a","USE BACKUP FOR V1"],["b","USE BACKUP FOR V2"],["c","USE BACKUP FOR V3"],["d","USE BACKUP FOR V4"],["e","USE BACKUP FOR V5"]]} },
  { id:"road_flood_monitoring", name:"ROAD / FLOOD MONITORING", rank:8, consequential:true, manual:"Receives roadside and culvert gauge data.", puzzle:{type:"guide-choice",figure:"G16",visual:"relay-circuit",instruction:"One warning relay is stuck open. Determine it from the saved sensor conditions and lamp results, then select its spare.",facts:["R1 OR R2 → JUNCTION → R3 OR R4 → R5 → WARNING LAMP","R1/R3 WATER ON ROAD · R2 UPSTREAM RISING · R4 DRAINAGE OBSTRUCTED","YES CLOSES · NO OPENS · SENSORS AND LAMP WORK"],table:{head:["TEST","WATER","UPSTREAM","DRAINAGE","LAMP"],rows:[["1","YES","NO","YES","ON"],["2","YES","YES","NO","OFF"]]},options:[["a","USE SPARE FOR R1"],["b","USE SPARE FOR R2"],["c","USE SPARE FOR R3"],["d","USE SPARE FOR R4"],["e","USE SPARE FOR R5"]]} },
  { id:"site_access_control", name:"SITE ACCESS CONTROL", rank:null, consequential:false, manual:"Records entry and exit reader events. Doors remain manually operable when a reader is unavailable.", puzzle:{type:"guide-choice",figure:"G18",visual:"reader-grid",instruction:"The fixed 2×2 sensor head moved exactly one square right between tests. Locate its current position and move it to rows 3–4, columns 4–5.",facts:["CARD 1: WWWBWBW / WBBBBWW / WBWWBWW / WBBWBBW / BBBWWWB","CARD 2: BWBBWBW / WWWWWWW / BBBBWBB / BBBBWWW / WWBBBBW","TEST 1: BW / BB · TEST 2: WB / WW","HEAD HAS NOT MOVED SINCE TEST 2"],options:[["a","DOWN 2"],["b","RIGHT 1"],["c","LEFT 1"],["d","DOWN 2 AND LEFT 1"],["e","DOWN 2 AND RIGHT 2"]]} },
];

// Client handoff §9: complete player rules and system-specific consequences.
// Designer solutions remain server-only and are never included here.
const ACT2_REPAIR_RULES = {
  inbound_receive:"Automatic receive routing has failed. Exactly two modules have failed. Each grouped check tests three modules independently and reports only how many passed. Choose one working input, booster and filter, followed by the working receiver. Input B is hard-wired to Booster 2. During severe electrical activity, Booster 2 must connect to Filter 2. Select a filter mode that suppresses any interference band at 60 or above while keeping the transmission band open.",
  status_beacon:"The manual control connection is lost but the automatic broadcast remains active. Restore the connection settings. A command is accepted only if station number and access code each match, and command duration meets or exceeds the beacon’s minimum. Required settings remain unchanged throughout the saved tests.",
  tower_monitoring:"The incoming channel label map is lost. Every channel A–D receives telemetry from exactly one equipment item, and each item belongs to exactly one channel. Saved tests temporarily assigned equipment labels. Only the total correct count survived. The true assignment did not change between tests. Restore the equipment labels.",
  air_quality:"All five sensors sample the same reference air during calibration. Exactly one reads high and one reads low by one calibration step each; the other three are correct. Pair tests report whether their average is high, low or balanced. Identify the high and low sensors and apply the corresponding downward and upward correction.",
  received_traffic_log:"The automatic changeover stopped with three switches in the wrong position. Signals move left to right through SW1 to SW6. Each switch affects only its two numbered lines. STRAIGHT keeps them on their current lines; CROSS exchanges them. Reverse three switches from the visible current positions so the route check and required backup inputs both match.",
  source_identification:"Each transmitter sends an identification code of eight binary digits, one after another. Every digit occupies an equal, contiguous time slot. The reader must sample halfway through each slot. Restore the first sample time and regular sampling interval using the saved diagnostic capture.",
  fire_suppression:"One valve is stuck open; all others obey commands. Chambers connect only through the shown pipes. Each test starts with all chambers pressurised and no new inflow. Draining a chamber lowers pressure in any chamber connected to it through open valves. Gauge B measures chamber B. Use the saved tests to identify the failed valve; the selected repair closes the working backup valve on that pipe.",
  road_flood_monitoring:"One warning relay is stuck open; the other four work normally. YES closes its controlled relay and NO opens it. The warning lamp lights only if an unbroken path reaches it from the power supply. Determine the failed relay from the saved conditions and lamp results, then switch to that relay’s spare.",
  human_outbound:"The test signal passes through four operations in order: Input Shift, Amplifier, Limiter, Output Shift. A shift moves the signal up or down; each repair unit moves it by one vertical unit. The amplifier multiplies by 2. The limiter clips above +4 and below −4. One shift has drifted by an unknown constant; the other remains zero. Select the change that makes both current outputs match the expected targets.",
  site_access_control:"The existing exit-reader sensor head is misaligned. Four sensors in a fixed 2×2 block each read black or white. Controls move the entire head by whole squares without rotation; it remains entirely on the card. Cards are fully inserted in the same orientation. The controller moved the head exactly one square RIGHT between Test 1 and Test 2. It has not moved since. Locate its current position and move it to the required position."
};
const ACT2_REPAIR_RESULTS = {
  inbound_receive:"Receiver chain restored. Future normal transmissions starting after this repair can be received clearly; stored and in-progress traffic is unchanged.",
  status_beacon:"Manual control connection restored. The automatic OPERATIONAL / NO ACTIVE DISTRESS broadcast remains active; no distress message was sent.",
  tower_monitoring:"Equipment-labelled diagnostic reports restored. RX-01, TX-01, CAM-01 and AUX-01 remain equipment identifiers, not geographic destinations.",
  air_quality:"Trustworthy readings and trends restored. Calibration changed; the repair did not purify the air or change the current hazard.",
  received_traffic_log:"BUFFER TRANSFER COMPLETE · TRAFFIC LOG RESTORED. Buffered entries were transferred exactly as received and future completed messages will be logged.",
  source_identification:"Source decoding restored for subsequent normal transmissions. Earlier unresolved or in-progress messages remain unresolved.",
  fire_suppression:"Failed pipe isolated through its backup valve. Automatic suppression control is ready; no suppressant was discharged.",
  road_flood_monitoring:"Reliable warning reports and monitoring information restored. Actual water levels remain unchanged.",
  human_outbound:"Local outbound signal chain restored. No message was transmitted; external delivery remains a separate dependency.",
  site_access_control:"Exit-reader recognition and future exit-event recording restored. Entry readiness and manual door operation are unchanged; no earlier departure was reconstructed."
};
for(const system of REPAIR_SYSTEMS){
  system.puzzle.rules=ACT2_REPAIR_RULES[system.id];
  system.puzzle.success=ACT2_REPAIR_RESULTS[system.id];
}
REPAIR_SYSTEMS.find(system=>system.id==="human_outbound").puzzle.table={
  head:["TEST","INPUT PEAKS","TARGET PEAKS","CURRENT OUTPUT"],
  rows:[["QUIET","−1 TO +1","−2 TO +2","0 TO +4 · CENTRED +2"],["STRONG","−2 TO +2","−4 TO +4","−2 TO +4 · UPPER CLIPPED"]]
};
REPAIR_SYSTEMS.find(system=>system.id==="site_access_control").puzzle.table={
  head:["ROW","CARD 1","CARD 2"],
  rows:[["1","WWWBWBW","BWBBWBW"],["2","WBBBBWW","WWWWWWW"],["3","WBWWBWW","BBBBWBB"],["4","WBBWBBW","BBBBWWW"],["5","BBBWWWB","WWBBBBW"]]
};

// Canonical Act 2 console order and panel identity. Every Act 2 surface must use
// this registry so the shared dashboard, facilitator view and player terminals
// always describe the same twelve systems.
const ACT2_PANEL_DEFINITIONS = [
  ["lower_road_camera",1,"LOWER ROAD CAMERA","Provides a continuous live view of Lower Road."],
  ["received_traffic_log",2,"RECEIVED TRAFFIC LOG"],
  ["air_quality",3,"AIR QUALITY MONITORING"],
  ["inbound_receive",4,"INBOUND RECEIVE"],
  ["source_identification",5,"SOURCE IDENTIFICATION"],
  ["human_outbound",6,"HUMAN OUTBOUND"],
  ["status_beacon",7,"STATUS BEACON"],
  ["tower_monitoring",8,"TOWER MONITORING"],
  ["road_flood_monitoring",9,"ROAD / FLOOD MONITORING"],
  ["ventilation_control",10,"VENTILATION CONTROL","Controls cabin air exchange and emergency ventilation."],
  ["site_access_control",11,"SITE ACCESS CONTROL"],
  ["fire_suppression",12,"FIRE SUPPRESSION CONTROL"],
];
const repairSystemsById = new Map(REPAIR_SYSTEMS.map(system=>[system.id,system]));
const ACT2_MANUAL_COPY = {
  inbound_receive:"Receives external voice and data traffic through the relay mast. Feeds the cabin speakers and the Received Traffic Log. Depends on the mast feed and receiver chain.",
  human_outbound:"Transmits crew voice and data to external stations. Depends on the outbound amplifier and mast feed. Its signal path is separate from Inbound Receive.",
  status_beacon:"Sends the station’s configured automatic status report at fixed intervals on a reserved channel. Depends on the dedicated beacon transmitter; does not use the outbound amplifier.",
  tower_monitoring:"Collects fault codes from mast-mounted and external equipment. Reports equipment ID, fault code and time. Does not identify the equipment’s physical location.",
  air_quality:"Samples cabin and perimeter air. Reports current readings and how quickly they are changing.",
  received_traffic_log:"Displays the time, source and message text for completed incoming transmissions. A temporary buffer holds traffic during a recorder fault. Repair recovers buffered messages as received. Earlier message text and source labels are not reprocessed.",
  source_identification:"Matches incoming transmissions against the station channel registry and labels them with the originating station. Labels appear beside incoming traffic and in stored messages. Earlier unidentified messages remain unidentified.",
  ventilation_control:"Manages cabin air exchange and operates the emergency purge cycle. Depends on the external intake assembly.",
  road_flood_monitoring:"Receives data from roadside and culvert gauges on the local road network. Reports surface water depth and gauge state.",
  lower_road_camera:"Provides a continuous live view of the Lower Road approach.",
  site_access_control:"Operates the cabin entry and exit readers and records access events. Doors remain manually operable when a reader is unavailable.",
  fire_suppression:"Operates automatic fire suppression in the cabin and equipment enclosures. Manual extinguishers are unaffected by a control fault."
};
export const ACT2_SYSTEMS = ACT2_PANEL_DEFINITIONS.map(([id,panelId,name,fallbackManual])=>{
  const repair=repairSystemsById.get(id);
  return repair
    ? {...repair,manual:ACT2_MANUAL_COPY[id],panelId,selectable:true,initialState:"fault"}
    : {id,panelId,name,manual:ACT2_MANUAL_COPY[id]||fallbackManual,selectable:false,consequential:false,rank:null,initialState:"working"};
});

export const FIELD_EQUIPMENT = [
  ["gas_mask", "GAS MASK"],
  ["flood_kit", "FLOOD RESPONSE KIT"],
  ["high_access", "HIGH-ACCESS KIT"],
  ["service_toolkit", "SPECIALIST SERVICE TOOLKIT"],
];

export const PRE_STRIKE_ARCHIVE = [
  {
    ref:"ARCHIVE-21:20",
    title:"ROUTINE ENVIRONMENTAL CHECK",
    source:"CALDER VALE MATERIALS / ENVIRONMENTAL",
    text:"21:20 environmental check. Perimeter air quality within normal limits.",
    audio:"./assets/audio/act1-calder-vale-routine.wav",
  },
];

// Canonical Act 1 evidence. These are fixed information screens, not role advice.
export const ACT1_EVIDENCE_SCREENS = [
  { id:"closeout", title:"SHIFT CLOSEOUT", scope:"Previous-shift closeout times for all personnel.", columns:["NAME","CLOSEOUT"], rows:[["Ellie Hart","—"],["Noor Hale","—"],["Mara Venn","—"],["Jamie Arlen","—"],["Saira Rowan","21:14"],["Kai Kessler","21:15"]] },
  { id:"movements", title:"EXTERNAL MOVEMENTS", scope:"Recorded personnel movements and recorded returns.", columns:["TIME","PERSON","DESTINATION","RECORDED RETURN"], rows:[["20:42","E. Hart","Generator","—"],["20:51","N. Hale","Mast Base","—"],["20:58","J. Arlen","North Gate","—"],["21:19","M. Venn","Lower Route","—"]] },
  { id:"access", title:"SITE ACCESS", scope:"Recent site access activity and equipment events.", columns:["TIME","EVENT"], rows:[["20:43","E. Hart — Generator enclosure opened"],["20:48","Main cabin exit reader — OUT CHANNEL FAULT"],["20:52","N. Hale — Mast service cabinet opened"],["20:59","J. Arlen — North barrier opened"]], note:"Main cabin OUT events may be incomplete while reader fault remains open." },
  { id:"transport", title:"TRANSPORT", scope:"Completed collections and recent vehicle exits from the site.", columns:["TIME","EVENT"], rows:[["21:06","West Pickup — collection complete"],["21:09","Parking Bay 3 — vehicle exited"],["21:12","North Access — contractor collection complete"],["21:17","Parking Bay 2 — vehicle exited"]] },
  { id:"work", title:"WORK / MAINTENANCE", scope:"Assigned tasks, completion states, and related notes.", columns:["#","WORK ITEM","ASSIGNED","STATUS","NOTE"], rows:[["1","Generator inspection","E. Hart","COMPLETE","West Layby pickup arranged after inspection. Cabin return not required."],["2","Mast signal check","N. Hale","COMPLETE","—"],["3","North Gate roadside marker check","J. Arlen","COMPLETE","Contractor pickup arranged from North Gate."],["4","Field marker survey","M. Venn","OPEN","Routine visual check. Expected completion before record rollover."]] },
  { id:"comms", title:"HANDOVER COMMS", scope:"Recent messages left by the previous shift.", columns:["TIME","FROM","MESSAGE"], rows:[["21:08","Noor Hale","Exit reader's still dead. Heading off. Car's in Bay 3."],["21:16","Saira Rowan","Kess is riding down with me. I'm parked Bay 2."],["21:18","Mara Venn","Taking the last check. Back before rollover."]] },
  { id:"map", title:"CURRENT LOCAL MAP", scope:"Current site labels and routes around Blackout Ridge.", kind:"map", locations:[["WEST PICKUP","Completed collection point"],["BLACKOUT RIDGE CABIN","Current crew location"],["RELAY MAST","Operating normally"],["GENERATOR","Operational"],["PARKING BAYS","Bays 2 and 3 recorded exits"],["NORTH ACCESS","Contractor collection point"],["LOWER ROAD","Current local route label"],["CALDER VALE","Valley settlement"]] },
];

export const ACT1_TRANSMISSIONS = [
  { at:20, id:"carrier-check", source:"CALDER DISPATCH", transcript:"Blackout Ridge, routine carrier check. Signal received five by five. No relay faults reported.", audio:"./assets/audio/act1-carrier-check.wav" },
  { at:50, id:"environmental-check", source:"CALDER VALE MATERIALS", transcript:"Twenty-one twenty environmental check. Perimeter air quality within normal limits.", audio:"./assets/audio/act1-environmental-check.wav" },
  { at:150, id:"weather-advisory", source:"CALDER WEATHER", transcript:"Electrical activity increasing across the western ridge. Remote sites advised to monitor strike conditions.", audio:"./assets/audio/act1-weather-advisory.wav" },
  { at:270, id:"ridge-alert", source:"RIDGE WEATHER ALERT", transcript:"Severe electrical activity approaching Blackout Ridge sector. Elevated mast-line strike risk.", audio:"./assets/audio/act1-ridge-alert.wav" },
];

// Timings are measured from the fixed runner-deployment point T+0.
// Location descriptions are intentionally neutral: every site contains a genuine fault.
export const OUTSIDE_LOCATIONS = [
  { id:"a", name:"A / NORTH MAST APRON", travel:2, service:2, concentration:16, rise:1, transfer:{b:2,c:3,d:4}, requirement:["gas_mask"], serviceNote:"Exposed-horizon sealed cabinet; passive return calibration." },
  { id:"b", name:"B / EAST SERVICE BAY", travel:2, service:3, concentration:15, rise:1, transfer:{a:2,c:3,d:4}, requirement:["gas_mask","service_toolkit"], serviceNote:"Protected line-driver cabinet; specialist calibration port." },
  { id:"c", name:"C / LOWER ROUTE ANNEX", travel:2, service:2, concentration:12, rise:1, transfer:{a:3,b:3,d:3}, requirement:["flood_kit"], serviceNote:"Flooded camera and historical-recording cabinet; old conduit in foundation." },
  { id:"d", name:"D / UPPER RIDGE PLATFORM", travel:2, service:3, concentration:5, rise:.4, transfer:{a:4,b:4,c:3}, requirement:["high_access"], serviceNote:"High-access legacy ventilation installation; unresolved old branch." },
];

export const FIELD_GAMES = {
  a: {
    title:"WEATHER-SEALED COUPLER", type:"coupler",
    observation:"The RETURN needle falls to zero on every second pulse. Moisture beads beneath the clear coupler window. The collar's white notch points away from the wind sock.",
    manual:[["Alternating return + moisture + collar downwind","VENT WINDOW / TURN COLLAR WINDWARD / RESEAT SEAL","vent_turn"],["Steady zero return + dry window","ISOLATE GROUNDING BRAID / TEST CONTINUITY","ground_braid"],["Return held high + dry window","REDUCE INPUT GAIN / HOLD COLLAR POSITION","reduce_gain"]],
    actions:[["vent_turn_reseat","OPEN SILVER VENT · POINT WHITE NOTCH TO WIND SOCK · PRESS CLEAR SEAL"],["bridge_ground","CLIP BRAID ACROSS LOWER COPPER POSTS"],["reduce_gain","TURN BLACK DIAL LEFT · HOLD COLLAR STILL"]],
    solution:{instruction:"vent_turn",action:"vent_turn_reseat"},
  },
  b: {
    title:"OPERATOR LINE-DRIVER BAY", type:"bridge",
    observation:"The transmit lamp is green at idle but turns red only while PUSH-TO-TALK is held. The BLUE calibration rail is dark; the AMBER rail remains steady.",
    manual:[["Fails only under keyed load + one rail dark","ISOLATE DARK RAIL / BRIDGE THROUGH CALIBRATION LOAD","isolate_dark"],["Fails at idle + both rails lit","OPEN OUTPUT BREAKER / DISCHARGE DRIVER","discharge_driver"],["Keyed lamp green + no carrier movement","HOLD TEST TONE / TRIM CARRIER","trim_carrier"]],
    actions:[["isolate_blue_bridge","LIFT BLUE TAB · JOIN BLUE SOCKETS THROUGH WHITE LOAD"],["open_discharge","DROP RED BREAKER · HOLD DISCHARGE PAD"],["hold_trim","HOLD TONE KEY · TURN AMBER TRIM CLOCKWISE"]],
    solution:{instruction:"isolate_dark",action:"isolate_blue_bridge"},
  },
  c: {
    title:"FLOODED CAMERA CABINET", type:"flood",
    observation:"Water is entering at the SOUTH sill. Both lower pressure pins are loaded, the upper latch is bowed, and the NORTH drain channel is clear.",
    manual:[["South ingress + north drain clear + lower pins loaded","OPEN NORTH DRAIN / RELEASE LOWER PINS / LIFT UPPER LATCH","drain_north"],["North ingress + south drain clear + upper latch free","OPEN SOUTH DRAIN / RELEASE UPPER LATCH","drain_south"],["Both drains blocked + cabinet level rising","LEAVE SEALED / ISOLATE LOCAL POWER","isolate_power"]],
    actions:[["north_lower_upper","PULL NORTH GRATE · FREE BOTH FLOOR PINS · RAISE BOWED LATCH"],["south_upper","PULL SOUTH GRATE · FREE TOP PIN"],["seal_isolate","LEAVE DOOR SHUT · LOWER LOCAL POWER LEVER"]],
    solution:{instruction:"drain_north",action:"north_lower_upper"},
  },
  d: {
    title:"LEGACY PRESSURE INSTALLATION", type:"pressure",
    observation:"The intake vane is open, the discharge vane is closed, and the pressure needle oscillates. The bypass handwheel moves freely beside a faded asset plate.",
    manual:[["Intake open + discharge closed + pressure oscillating","OPEN BYPASS / ALIGN DISCHARGE / CLOSE BYPASS","equalise_bypass"],["Both vanes closed + pressure steady","OPEN INTAKE / HOLD BYPASS CLOSED","open_intake"],["Both vanes open + pressure falling","CLOSE DISCHARGE / WAIT FOR BALANCE","close_discharge"]],
    actions:[["bypass_discharge_close","TURN SMALL HANDWHEEL OPEN · ALIGN RIGHT VANE · RETURN HANDWHEEL SHUT"],["intake_hold","RAISE LEFT VANE · KEEP SMALL HANDWHEEL SHUT"],["close_wait","LOWER RIGHT VANE · WATCH NEEDLE SETTLE"]],
    solution:{instruction:"equalise_bypass",action:"bypass_discharge_close"},
  },
};

// Each card: [title, body, confidence, speakPrompt]
// Confidence describes evidence quality, never "correct answer" status.
// Decisive Lower Route / OPERATIONAL conclusions are split across roles — no solo card completes the spine.
const cards = {
  1: {
    lead: ["SHIFT CLOSEOUT", "The outgoing roster contains six people. ACCOUNTED FOR requires evidence that a person departed Blackout Ridge—not merely that their work ended.", "CONFIRMED", "Which names have actual departure evidence, and which have only a completed task?"],
    signal: ["HANDOVER VOICE", "At 21:04 Mara said: ‘Lower Route check. Back before rollover.’ No later handover call from Mara is stored.", "CONFIRMED", "Who can show whether Mara returned or left after that call?"],
    systems: ["WORK RECORDS", "Ellie’s generator inspection closed at 20:41. Mara’s Lower Route task remains OPEN, due 21:25, so it has not triggered an exception.", "CONFIRMED", "Does an open task prove where its worker is now?"],
    operations: ["VEHICLE LOG", "Noor’s assigned rover is still in its bay. A Calder Vale materials shuttle left the west loading point at 20:52, but its local passenger field is blank. Saira’s vehicle left at 20:57 with two occupants, also without a passenger name.", "CONFIRMED", "Which separate records can identify the shuttle passenger and Saira’s passenger?"],
    field: ["MOVEMENT RECORD", "Jamie signed out through the north service boundary at 20:49. Mara’s final movement is M. VENN — LOWER ROUTE at 20:56; no later cabin or departure event appears.", "CONFIRMED", "What evidence would establish that Mara departed the site?"],
    protocol: ["SITE ACCESS", "Ellie badged out at 20:45 and Saira at 20:57. Noor badged into the west loading point at 20:49, but that scan proves only that Noor reached the shuttle area. Kai has no independent exit scan because his pass was reported faulty.", "CONFIRMED", "Which transport or receiver record proves that Noor and Kai actually departed?"],
    comms: ["TRANSPORT READBACK", "At 20:54 Calder Vale acknowledged one Ridge passenger, N. HALE, aboard the 20:52 materials shuttle. At 20:55 Kai wrote: ‘Riding down with Saira. My pass is still dead.’ Saira acknowledged before her two-person vehicle exit.", "CONFIRMED", "Do the external shuttle readback and Saira’s vehicle count resolve the two missing passenger fields?"],
  },
  2: {
    lead: ["REPAIR LIMIT", "The crew receives one repair attempt per player. Every failed panel looks useful; ignored systems remain in their current state.", "CONFIRMED", "Which capabilities does the crew most need to restore?"],
    signal: ["TRAFFIC CONTINUES", "The damaged mast is still carrying traffic. Inbound clarity, source labels and local recording are three separate capabilities.", "CONFIRMED", "Which communications failures must not be treated as one system?"],
    systems: ["FAULT BOUNDARIES", "Only amber FAULT panels are selectable. Road/Flood Monitoring, Lower Road Camera and Ventilation Control survived and cannot be assigned.", "CONFIRMED", "Can every selected repair be assigned to exactly one operator?"],
    operations: ["LIVE CONSEQUENCE", "A successful repair takes effect immediately. A failed or timed-out repair remains broken, with no retry.", "CONFIRMED", "What must be working before later traffic arrives?"],
    field: ["OUTSIDE EVENT", "Calder Vale has an airborne incident; Lower Road is flooding; a genuine high-access fault exists at Upper Ridge.", "DEVELOPING", "Which station capabilities will let us understand the changing outside situation?"],
    protocol: ["STATUS FAIL-SAFE", "A broken Status Beacon does not go silent. It repeats the last valid OPERATIONAL / NO ACTIVE DISTRESS heartbeat.", "CONFIRMED", "Does restoring control mean the heartbeat was truthful?"],
    comms: ["RECEIVE / IDENTIFY / STORE", "Clear reception does not identify a source, and identified traffic is not preserved unless the traffic log is working when it arrives.", "CONFIRMED", "Which messages could be missed permanently?"],
  },
  3: {
    lead: ["FOUR EXTERNAL FAILURES", "External inbound, human outbound, Lower Road camera/history, and ventilation are red OFFLINE. The automatic OPERATIONAL / NO ACTIVE DISTRESS heartbeat is still transmitting and proves only that its fail-safe has power.", "CONFIRMED", "Which two communication functions must the runner restore, and what evidence supports each location?"],
    signal: ["FUNCTION TO COMPONENT", "Inbound traffic needs a weather-sealed receive coupler with a clear horizon and calibrated return. Human outbound needs an operator send bridge with a line driver and protected calibration access.", "CONFIRMED", "Which site descriptions fit the two different signal-chain components?"],
    systems: ["COMPONENT DIAGNOSTICS", "The current fault symptoms are a receive-return mismatch and an isolated operator line driver. Tower Monitoring may provide a third unresolved legacy reference, but a legacy fault is not automatically a communications fault.", "CONFIRMED", "Can the crew trace each failed function through its component before choosing a site?"],
    operations: ["FIXED DEPLOYMENT CLOCK", "Runner deployment is T+0, regardless of discussion time. Add travel, service, and transfer time in route order; exposure at service completion determines whether respiratory protection is required.", "CONFIRMED", "Does the proposed order remain physically possible with only two specialist items?"],
    field: ["FOUR REAL FAULT SITES", "A has an exposed-horizon sealed cabinet. B has a protected line-driver cabinet and calibration port. C is the flooded Lower Route camera/archive annex. D is a high-access legacy ventilation installation on Upper Ridge.", "CONFIRMED", "Which location characteristics connect to the components—and which sites are genuine but unrelated faults?"],
    protocol: ["TWO-ITEM LIMIT", "The runner may carry exactly two: Gas Mask, Flood Response Kit, High-Access Kit, or Specialist Service Toolkit. A and B require a Gas Mask; B also requires the toolkit. C requires flood gear and may require a mask if reached after the threshold; D requires high-access gear.", "CONFIRMED", "What equipment does the complete two-stop route require at the time each service finishes?"],
    comms: ["LOCAL TRAFFIC RECORD", "The Act 1 archive remains locally available. Only Act 2 messages received while the Traffic Log was working were stored exactly; this record provides context, not a direct location answer.", "CONFIRMED", "Which observations are current fault evidence, and which are only background context?"],
  },
  4: {
    lead: ["LOCKED MISSION", "The two destinations, their order and two carried items are locked from the Outside Plan. Failure never reopens routing or permits a replacement site.", "CONFIRMED", "Who will turn the runner's observation into one clear station instruction?"],
    signal: ["SERVICE SYMPTOMS", "Treat indicator behavior as a functional symptom. Ask what changes at idle, under load, or with each pulse before choosing a procedure.", "CONFIRMED", "What exact behavior must the runner describe before the station interprets it?"],
    systems: ["PROCEDURE LOGIC", "Use the current location's station manual as a decision table: combine every observed condition, then send one complete instruction.", "CONFIRMED", "Which manual row matches all—not merely one—of the runner's observations?"],
    operations: ["TWO SEQUENTIAL SERVICES", "The mission is travel → service → consequence → travel → service → consequence → return. Conditions follow the Act 3 forecast; there is no new route or gas decision.", "CONFIRMED", "Is the crew focused on the current installation rather than replanning the mission?"],
    field: ["DESCRIBE BEFORE ACTING", "The runner can see the physical installation but not the station procedure. Report position, behavior, condition and change; do not guess what the equipment is for.", "CONFIRMED", "Has the runner described every visible condition needed by the manual?"],
    protocol: ["ONE SERVICE ATTEMPT", "The assigned specialist equipment makes the visit physically possible. Each installation receives one instructed action and no retry.", "CONFIRMED", "Is the station instruction complete before the runner commits the action?"],
    comms: ["LOCAL FIELD RADIO", "Runner contact uses a reliable local Ridge radio independent of the failed external paths. Keep the channel clear; it is not another degradation puzzle.", "CONFIRMED", "Can the station repeat the observation and instruction without adding an assumption?"],
  },
  5: {
    lead: ["STRICT ROTATION", "Everyone has the same controls, but only the named active player can make one change. Control then passes automatically.", "CONFIRMED", "Whose move is next, and what tradeoff should they manage?"],
    signal: ["AMBIENT TRAFFIC", "Inbound plume and station-status traffic may be clear, fragmented, or absent. It provides context only; the cabin game never depends on it.", "CONFIRMED", "Can we keep external traffic separate from the local control problem?"],
    systems: ["CONTROL INTERACTIONS", "Sealing slows toxin but raises CO₂. Recirculation filters toxin but loads the active bank. Exhaust lowers CO₂ while drawing more plume inside.", "CONFIRMED", "Which pressure will the proposed move improve, and which will it worsen?"],
    operations: ["NO SAFE CONFIGURATION", "Outside contamination rises continuously. Every arrangement eventually deteriorates, so the crew must watch the effect and reconfigure again.", "CONFIRMED", "What changed after the last move, and when should we change again?"],
    field: ["READ THE ROOM", "When Air Quality is broken, the numerical model is unchanged. Use haze and LOW, RISING, HIGH, or CRITICAL warnings instead of exact readings.", "CONFIRMED", "What visible warning changed after our last move?"],
    protocol: ["FINITE PURGE", "Emergency Purge exists only if Upper Ridge service was restored. It is strongest with the intake SEALED and airflow RECIRCULATING, and it cannot make the cabin permanently safe.", "CONFIRMED", "Is the cabin aligned before we spend a purge charge?"],
    comms: ["FALSE EXTERNAL PICTURE", "The cabin is taking contaminated air while the outside network still treats Blackout Ridge as OPERATIONAL / NO ACTIVE DISTRESS.", "CONFIRMED", "What is the outside status failing to describe?"],
  },
  6: {
    lead: ["MAKE THE HISTORY HUMAN", "The Lark Shift began normally, checked rational explanations and chose a real refuge under terrifying uncertainty. Reconstruct their decisions without turning them into fools.", "CONFIRMED", "Can everyone explain what changed—and what remains unexplained?"],
    signal: ["THE IMPOSSIBLE VOICE", "Mara's Act 3 call travelled through R-12's obsolete internal circuit, not the normal mast. That is why receive, source and storage repairs could not fix it.", "CONFIRMED", "Which earlier fragment now makes sense?"],
    systems: ["THREE DIFFERENT CONTROLS", "DISTRESS changes station status. EXTRACTION MESSAGE requests rescue. RELEASE CONFIGURATION arms responder access while contamination isolation stays engaged.", "CONFIRMED", "Can every player name what each control does—and does not do?"],
    operations: ["TRANSFER COST", "R-12 is a refuge, not an escape tunnel. Every entry brings contamination; faster transfers reduce it, and protected air remains finite.", "CONFIRMED", "What will speed preserve during the descent?"],
    field: ["WHY SIX DIED", "All six entered R-12 and latched SECURE / CREW ONLY. The refuge protected them, but no extraction request and the false station status delayed responders until their air ran out.", "CONFIRMED", "What killed them after the initiating threat failed to?"],
    protocol: ["SAFE RELEASE ORDER", "Keep contamination isolation engaged; select AUTHORISED RESPONSE; pull EXTERNAL RELEASE TEST; verify ISOLATION HELD and RESPONDER RELEASE ARMED.", "CONFIRMED", "Can everyone repeat the release sequence exactly?"],
    comms: ["NO COACHING BELOW", "Descent order will be hidden. Once below, microphones are muted, so any player may become the final surface operator.", "CONFIRMED", "Has every player learned DISTRESS → EXTRACTION MESSAGE → RELEASE CONFIGURATION?"],
  },
  7: {
    lead: ["EXECUTE, DO NOT REPLAN", "The route is fixed: one transfer at a time, then the final operator performs the three learned surface tasks before descending.", "CONFIRMED", "Is the active person moving while everyone else respects their isolation?"],
    signal: ["MESSAGE CONTENT", "A useful extraction message says personnel are in R-12, the surface atmosphere is unsafe, and external recovery is required. Grammar and style do not matter.", "CONFIRMED", "Would a responder know where, why and what help is required?"],
    systems: ["SEPARATE EFFECTS", "Status Beacon determines whether DISTRESS propagates. Human Outbound and the restored path determine message quality. The retained release control works locally.", "CONFIRMED", "Which earlier system controls each outside result?"],
    operations: ["MOVE CLEANLY", "Every second in the access route admits more contaminated air. Mistakes cost time, but timeout still completes the transfer.", "CONFIRMED", "Can the current player complete the physical sequence calmly and quickly?"],
    field: ["MARA STAYS BELOW", "Mara expects extraction, but R-12 is now safer than the cabin. Tell her to remain inside while the surface crew joins her.", "CONFIRMED", "Can we accept that finding Mara does not mean bringing her upward?"],
    protocol: ["PURGE JUDGEMENT", "Three shared R-12 cycles exist only if Upper Ridge was restored. Repeating before about sixty seconds still works but wastes effectiveness.", "CONFIRMED", "If you are already below, will you purge now or hold your nerve?"],
    comms: ["FINAL OPERATOR", "Any player may be left alone above. From memory: DISTRESS, usable extraction message, then AUTHORISED RESPONSE while contamination isolation remains engaged.", "CONFIRMED", "Can you perform all three without coaching?"],
  },
};

/** P = primary private evidence, S = supporting, D = decision responsibility */
export const INFORMATION_MATRIX = {
  1: { lead: "S", signal: "P", systems: "P", operations: "P", field: "P", protocol: "P", comms: "P" },
  2: { lead: "P", signal: "P", systems: "P", operations: "P", field: "P", protocol: "P", comms: "P" },
  3: { lead: "D", signal: "P", systems: "P", operations: "S", field: "P", protocol: "S", comms: "P" },
  4: { lead: "S", signal: "S", systems: "P", operations: "D", field: "D", protocol: "P", comms: "S" },
  5: { lead: "P", signal: "S", systems: "P", operations: "P", field: "P", protocol: "P", comms: "S" },
  6: { lead: "P", signal: "P", systems: "P", operations: "P", field: "P", protocol: "P", comms: "P" },
  7: { lead: "D", signal: "D", systems: "D", operations: "D", field: "D", protocol: "D", comms: "D" },
};

/** Required joins — no single private view contains a complete conclusion. */
export const INFORMATION_JOINS = [
  { id: "handover_accounting", conclusion: "Five staff departed; Mara's departure cannot be established", roles: ["lead", "signal", "systems", "operations", "field", "protocol", "comms"] },
  { id: "repair_priorities", conclusion: "Repair attempts cover distinct capabilities before later traffic arrives", roles: ["lead", "signal", "systems", "operations", "comms"] },
  { id: "outside_plan", conclusion: "A physically viable two-stop outside plan", roles: ["signal", "systems", "operations", "field", "protocol"] },
  { id: "outside_bounded", conclusion: "Outside Run is bounded", roles: ["operations", "protocol", "field"] },
  { id: "cabin_balance", conclusion: "The next cabin move improves one pressure without ignoring another", roles: ["systems", "operations", "field", "protocol"] },
  { id: "lower_route_beneath", conclusion: "Lower Route is an older route beneath the station and leads to R-12", roles: ["signal", "systems", "field"] },
  { id: "lark_failure", conclusion: "R-12 protected the Lark Shift but delayed external extraction exhausted their air", roles: ["lead", "systems", "field", "protocol"] },
  { id: "surface_sequence", conclusion: "Distress, extraction message and authorised release have three separate effects", roles: ["signal", "systems", "protocol", "comms"] },
];

/** Unique phrases that must stay role-private (anti solo-solve / anti leak). */
export const PRIVATE_PHRASE_OWNERS = {
  lead: [/failure never reopens routing/i],
  signal: [/indicator behavior as a functional symptom/i],
  systems: [/combine every observed condition/i],
  operations: [/travel → service → consequence/i],
  field: [/position, behavior, condition and change/i],
  protocol: [/one instructed action and no retry/i],
  comms: [/reliable local Ridge radio independent/i],
};

/** When Comms is absent (6-player), fold critical Comms clues into other private views. */
const SIX_PLAYER_SUPPLEMENTS = {
  1: { protocol: ["CREW MESSAGE", "At 20:55 Kai wrote: ‘Riding down with Saira. My pass is still dead.’ Saira then left in a vehicle carrying two occupants.", "CONFIRMED", "Do these two records account for Kai despite the missing badge scan?"] },
  2: { protocol: ["RECEIVE / IDENTIFY / STORE", "Clear reception does not identify a source, and identified traffic is not preserved unless the Traffic Log is working when it arrives.", "CONFIRMED", "Which messages could be missed permanently?"] },
  3: { signal: ["LOCAL TRAFFIC RECORD", "The Act 1 archive remains available. Act 2 messages exist only when the Traffic Log was working at arrival; use them as context, not as a location key.", "CONFIRMED", "Which evidence diagnoses a current component rather than merely describing the incident?"] },
  4: { operations: ["LOCAL FIELD RADIO", "The Ridge local field link remains clear throughout both services and is independent of the failed external communications paths.", "CONFIRMED", "Can the crew repeat the complete observation and instruction without adding assumptions?"] },
  5: { systems: ["FALSE EXTERNAL PICTURE", "The cabin is taking contaminated air while the outside network still treats Blackout Ridge as OPERATIONAL / NO ACTIVE DISTRESS.", "CONFIRMED", "What is the outside status failing to describe?"] },
  6: { protocol: ["NO COACHING BELOW", "Descent order will be hidden. Once below, microphones are muted, so any player may become the final surface operator.", "CONFIRMED", "Has every player learned DISTRESS → EXTRACTION MESSAGE → RELEASE CONFIGURATION?"] },
  7: { signal: ["FINAL OPERATOR", "Any player may be left alone above. From memory: DISTRESS, a message naming R-12 occupancy and unsafe surface conditions, then AUTHORISED RESPONSE while isolation remains engaged.", "CONFIRMED", "Can every player perform all three tasks without coaching?"] },
};

export const STAGES = {
  1: {
    title: "Account for the outgoing shift", kicker: "NIGHT SHIFT HANDOVER", duration: 360,
    image: "relay-control-room.webp", mechanic: "handover",
    objective: "For each outgoing staff member, decide whether sufficient evidence shows that they departed Blackout Ridge.",
    scene: "21:14. An ordinary night shift begins above Calder Vale. Six outgoing staff should be accounted for before the records roll over; the station reports PERSONNEL EXCEPTIONS: NONE RAISED.",
    story: {
      chapter: "THE ORDINARY HANDOVER",
      arrival: "Blackout Ridge is functional and recently occupied. The human question is deliberately simpler than the station label: is there evidence that each person actually left?",
      pressure: "The outgoing records roll over in six minutes. Several absences look suspicious until evidence from different terminals is reconciled.",
      next: "The incoming shift becomes active. Before the crew can follow up on what it noticed, lightning strikes the mast and central station infrastructure; power collapses and multiple systems fail.",
    },
    participantGoal: "Help the crew answer one precise question for all six people: is there sufficient evidence that this person departed Blackout Ridge? Share the record, time, person, and what it does—or does not—prove.",
    options: [
      ["ellie", "ELLIE HART", "Power"],
      ["noor", "NOOR HALE", "Comms"],
      ["mara", "MARA VENN", "Field"],
      ["jamie", "JAMIE ARLEN", "Road Watch"],
      ["saira", "SAIRA ROWAN", "Protocol"],
      ["kai", "KAI KESSLER", "Systems"],
    ],
  },
  2: {
    title: "Repair what the station needs", kicker: "AFTER THE STRIKE", duration: 180,
    image: "station-exterior.webp", mechanic: "repairs",
    objective: "Inspect the failed systems, choose one repair per player, then complete distinct simultaneous repair games.",
    scene: "21:18. Lightning strikes the mast and central station infrastructure. Emergency lighting rises over twelve system panels—some working, some in amber FAULT.",
    story: {
      chapter: "THE STATION CANNOT REPAIR EVERYTHING",
      arrival: "The handover has just closed when the strike tears through the station. The mast still carries outside traffic, but receive, send, status and monitoring functions reboot unevenly.",
      pressure: "The crew has three minutes to assign one repair attempt per player, then five minutes to solve them. There are no retries.",
      next: "The repair window closes with the true station state exposed. A central external distribution failure then takes the field infrastructure and ventilation path offline.",
    },
    participantGoal: "Use the Systems Manual to distinguish the failed functions, agree what to attempt, and make sure every player receives one repair.",
    options: REPAIR_SYSTEMS.map(system=>[system.id,system.name]),
  },
  3: {
    title: "Build the outside plan", kicker: "EXTERNAL FAILURE", duration: 420,
    image: "outside-run.webp", mechanic: "outside_plan",
    objective: "Diagnose two communications locations and build a physically viable two-stop route with exactly two specialist items.",
    scene: "21:23. A central field-distribution failure drops four outside capabilities to red OFFLINE. The automatic station heartbeat continues to report OPERATIONAL / NO ACTIVE DISTRESS.",
    story: {
      chapter: "THE RUNNER CAN SERVICE ONLY TWO SITES",
      arrival: "Every red site has a real fault, but only two restore human communications. The crew must move from failed function to component symptom to physical location.",
      pressure: "The runner carries exactly two specialist items. Travel order changes exposure: a route that works in one direction may become impossible in reverse.",
      next: "The plan locks without any diagnosis score. The runner leaves at T+0—and an impossible voice tears through obsolete infrastructure as the cabin loses contact.",
    },
    participantGoal: "Share the part of the chain only you can see: failed function, component clue, location characteristic, timing, or equipment rule. Help the crew produce a feasible plan without treating the interface as a correctness checker.",
    options: [["a","A / NORTH MAST APRON"],["b","B / EAST SERVICE BAY"],["c","C / LOWER ROUTE ANNEX"],["d","D / UPPER RIDGE PLATFORM"]],
  },
  4: {
    title: "Execute the outside run", kicker: "OUTSIDE RUN", duration: 480,
    image: "outside-run.webp", mechanic: "outside",
    objective: "Complete the two locked field services through runner observation, station interpretation, instruction and one committed action.",
    scene: "21:30. Carrying the two selected specialist items, the runner leaves Blackout Ridge on local radio and travels to the first locked destination.",
    story: {
      chapter: "THE PLAN MEETS THE PHYSICAL WORLD",
      arrival: "Act 3 fixed the destinations, order and equipment. Now the runner can see each damaged installation while the station crew alone holds the interpretation procedure.",
      pressure: "Every selected site is genuine, but each service receives one instruction and one action. Failure cannot be retried or exchanged for a different destination.",
      next: "The runner returns and the dashboard exposes what the two services actually restored. Then a legacy containment controller wakes beneath the cabin and reports an occupied hold as OPERATIONAL.",
    },
    participantGoal: "Help the runner describe the physical problem, match every observation to the station procedure, and send one complete instruction before the runner acts.",
    options: OUTSIDE_LOCATIONS.map(location=>[location.id,location.name]),
  },
  5: {
    title: "Keep the cabin breathable", kicker: "CABIN AIR", duration: 240,
    image: "relay-control-room.webp", consequenceImage: "mara-venn-below.webp", mechanic: "cabin_air",
    objective: "Act in strict rotation. Reconfigure intake, airflow and filter use as the plume worsens; preserve the longest safe investigation window.",
    scene: "21:35. The runner is back. The Calder Vale plume reaches the ridge and contaminated air begins entering Blackout Ridge's single occupied cabin.",
    story: {
      chapter: "THE DANGER IS INSIDE THE CABIN",
      arrival: "Outside conditions can no longer be held at the door. Better monitoring may show exact values and Upper Ridge may have restored a finite emergency purge, but neither stops the plume.",
      pressure: "No control arrangement stays safe. Sealing slows toxin but raises CO₂; recirculation cleans air but loads the filter; outside contamination rises continuously.",
      next: "The mitigation window closes. An automatic isolation sweep finds an unlisted protected volume beneath the cabin—R-12—and its dormant camera shows Mara alive inside.",
    },
    participantGoal: "Watch all three cabin pressures, discuss the next tradeoff, and let the active player make exactly one move before control passes. There is no permanent solution.",
    options: [],
  },
  6: {
    title: "The Lark Shift", kicker: "ARCHIVE INVESTIGATION", duration: 360,
    image: "lark-shift-archive.webp", mechanic: "archive",
    objective: "Reconstruct why six people died in R-12, then learn the exact refuge rules the final surface operator must execute.",
    scene: "21:39. Mara is alive inside sealed refuge R-12. The cabin window is closing, and the old Lark Shift archive is the only guide to entering without repeating its tragedy.",
    story: {
      chapter: "THEY SURVIVED THE THREAT—THEN DIED WAITING",
      arrival: "The first archive is human and frightening: ordinary records deteriorate into fear. The second is dry technical documentation for the refuge the present crew must now use.",
      pressure: "Act 5 bought only a limited investigation window. Every player may be left alone at the final surface console, unable to receive coaching from those already below.",
      next: "The archive closes as the cabin reaches critical. The crew now knows the three separate protections: DISTRESS → EXTRACTION MESSAGE → RELEASE CONFIGURATION. Execution begins.",
    },
    participantGoal: "Search short records, open useful leads, share the evidence aloud, and make sure every player can explain the final three-step checklist without relying on one expert.",
    options: [],
  },
  7: {
    title: "Get Below", kicker: "FINAL EVACUATION", duration: 60,
    image: "mara-venn-below.webp", mechanic: "finale",
    objective: "Descend one at a time, manage R-12 air, and let the final hidden operator complete the learned surface procedure alone.",
    scene: "21:48. The cabin reaches critical. Mara is already inside the safest available space; the rest of the crew must now join her without poisoning the refuge or repeating the Lark Shift isolation.",
    story: {
      chapter: "MARA IS WHERE EVERYONE NOW NEEDS TO GO",
      arrival: "A hidden random order activates one transfer terminal at a time. Players below lose surface communication but may independently spend the shared purge reserve.",
      pressure: "Slow transfers contaminate R-12. The last player must declare distress, send an extraction request and arm authorised release before completing the same descent.",
      next: "Once R-12 seals, the outside results are revealed and survival time is compared with rescue delay.",
    },
    participantGoal: "Follow the state on your own terminal: wait above, complete the active transfer, then remain isolated below and decide independently whether to use a shared purge cycle.",
    options: [],
  },
};

export const ACTIONS = {
  cabinControls: {
    intake: [["sealed","SEAL INTAKE"],["metered","METER OUTSIDE AIR"],["open","OPEN INTAKE"]],
    airflow: [["recirculate","RECIRCULATE THROUGH FILTER"],["exhaust","EXHAUST CABIN AIR"],["idle","HOLD FANS / IDLE"]],
    filter: [["a","FILTER BANK A"],["b","FILTER BANK B"]],
  },
  transferSteps: [["harness","CLIP SAFETY HARNESS"],["wheel","TURN OUTER WHEEL TO WHITE MARK"],["ladder","LOWER THROUGH HATCH"],["inner","PULL INNER GATE CLOSED"]],
  surfaceStatus: [["operational","LEAVE OPERATIONAL"],["distress","SET DISTRESS / PERSONNEL BELOW"]],
  releaseIsolation: [["engaged","ISOLATION ENGAGED"],["released","ISOLATION RELEASED"]],
  releaseAuthority: [["secure","SECURE / CREW ONLY"],["authorised","AUTHORISED RESPONSE"]],
};

export const FINALE_BALANCE = Object.freeze({
  transferSeconds:60,surfaceSeconds:30,baseTransferContamination:8,timeContamination:22,mistakeContamination:3,
  purgeCycles:3,purgeFullBenefit:22,purgeMinimumFactor:.45,purgeRecoverySeconds:60,purgeReserveCost:6,
  rescueBaselineSeconds:2100,operationalDelay:1200,messageDegradedDelay:720,messageNoneDelay:1800,releaseInhibitedDelay:1200,
  survivalBaseSeconds:2600,survivalPerAirPoint:35,occupancyCostSeconds:180,
  endingMargins:{clean:600,severe:0,casualties:-1200},
});

export const LARK_ARCHIVE = [
  {id:"newsreel",phase:"history",type:"NEWSREEL / AUDIO",title:"SIX DEAD IN RIDGE RELAY MYSTERY",date:"18 NOV 1987",source:"CALDER VALE REGIONAL NEWS",tags:["six","deaths","r-12","recovery","mystery","news"],featured:true,audio:"./assets/audio/act6-lark-newsreel.wav",summary:"A contemporary report says all six Lark Shift personnel died inside Auxiliary Relay Hold R-12 after an unusual ridge incident. Responders reached them only after a long delay; officials rejected rumours but never supplied a complete cause.",transcript:"Six Blackout Ridge workers have been recovered dead from the station's R-12 emergency hold. Officials say the relay remained operational throughout. The delayed recovery and unexplained reports from the ridge have already produced industrial, military and stranger theories."},
  {id:"shift_start",phase:"history",type:"SHIFT LOG",title:"LARK SHIFT / ROUTINE OPEN",date:"14 NOV 1987 / 18:00",source:"BLACKOUT RIDGE LOG 44-A",tags:["normal","six","crew","routine","start"],summary:"Six names sign on. Weather is cold but serviceable. Equipment, food and protected-air checks are normal. The first two hours contain no anomaly.",detail:"M. Ives, T. Bell, R. Okafor, June Pell, A. Shaw and Len Varga begin an ordinary night shift. This establishes that the deterioration was gradual, not a group arriving already irrational."},
  {id:"medical",phase:"history",type:"FIRST-AID NOTES",title:"A BAD TASTE IN THE AIR",date:"14 NOV / 20:31–22:08",source:"JUNE PELL / PAPER PAD",tags:["symptoms","headache","taste","nausea","gradual","air"],summary:"Metallic taste becomes headache, nausea, ear pressure and difficulty concentrating. At first the crew checks heaters, batteries and food rather than assuming an attack.",detail:"Three people report symptoms at different times. Outside samples and cabin instruments disagree. Their early responses—ventilation checks, paired observations and rest—remain rational."},
  {id:"contradictions",phase:"history",type:"RADIO + WATCH LOG",title:"TWO PEOPLE, TWO DIFFERENT RIDGES",date:"14 NOV / 22:42–23:27",source:"LARK LOCAL RECORD",tags:["lights","figures","voices","contradiction","unexplained","outside"],summary:"One watcher sees lights moving against the wind; another sees nothing. Later the sceptical watcher reports a figure near the access route while the camera shows an empty path.",detail:"Unexpected voices appear beneath a normal channel. A perimeter door reports movement without opening. No surviving record proves an environmental, neurological, technological or supernatural cause."},
  {id:"crew_messages",phase:"history",type:"CREW MESSAGES",title:"DO NOT ANSWER THEM",date:"15 NOV / 00:11–01:03",source:"LARK INTERNAL TERMINAL",tags:["paranoia","communications","fear","outside","transmit"],summary:"Fear hardens into suspicion that incoming voices are imitations and transmitting will reveal the station. The crew still debates, cross-checks and tries to protect one another.",detail:"They become convinced something outside is approaching and that the surface cannot be trusted. Their judgement deteriorates, but their choice of R-12 is grounded in a real refuge procedure."},
  {id:"isolation_event",phase:"history",type:"CONTROL EVENT",title:"SIX TRANSFERS / SECURE ISOLATION",date:"15 NOV / 01:18",source:"R-12 MECHANICAL EVENT DRUM",tags:["secure isolation","six","entered","r-12","extraction","request"],summary:"All six transfer into R-12. Before the last entry they deliberately latch SECURE ISOLATION because they believe the danger is outside.",detail:"The refuge seals successfully and protects them. The extraction-message field remains blank. Secure isolation inhibits normal authorised external release."},
  {id:"station_record",phase:"history",type:"OPERATIONS RECORD",title:"OPERATIONAL / NO ACTIVE DISTRESS",date:"15–17 NOV",source:"RIDGE STATUS ARCHIVE",tags:["operational","distress","status","relay","safe"],summary:"Blackout Ridge continues relaying traffic and automatically reports OPERATIONAL / NO ACTIVE DISTRESS while six people shelter beneath it.",detail:"OPERATIONAL describes station and relay service. R-12 occupancy does not automatically declare a human emergency."},
  {id:"recovery",phase:"history",type:"RECOVERY REPORT",title:"R-12 OPENED TOO LATE",date:"18 NOV / 09:40",source:"HAZARDOUS RESPONSE REVIEW",tags:["recovery","died","protected","delay","air","responders"],summary:"Responders eventually detect the problem and arrive. R-12 kept the initiating threat out, but secure isolation, no extraction request and the false station picture delay entry until all six are dead.",detail:"The report cannot determine the original phenomenon. It can determine the reversal: the threat did not kill the Lark Shift. The refuge protected them; delayed extraction exhausted their survival window."},
  {id:"press",phase:"history",type:"PRESS CLIPPINGS",title:"THEORIES MULTIPLY; CAUSE DOES NOT",date:"1987–1994",source:"VALE PRESS FILE",tags:["calder vale","theory","industrial","military","supernatural","cause"],summary:"Industrial vapour, infrasound, classified trials, mass illness and stranger explanations compete. Every theory conflicts with at least one record.",detail:"Calder Vale appears repeatedly in speculation, but no incident is proven to have caused the Lark Shift. Nothing proves a supernatural explanation either."},
  {id:"refuge_model",phase:"technical",type:"R-12 QUICK DIAGRAM",title:"A REFUGE, NOT AN ESCAPE TUNNEL",date:"TECHNICAL CARD 1",source:"R-12 OPERATING MANUAL",tags:["refuge","transfer","contamination","speed","air"],featured:true,summary:"R-12 is a sealed atmospheric refuge. Every surface-to-refuge transfer introduces contaminated air; a faster transfer leaves the passage exposed for less time.",detail:"Repeated transfers progressively worsen refuge air. Occupants wait inside for conditions to improve or for authorised responders—there is no lower escape route."},
  {id:"purge_model",phase:"technical",type:"AIR SYSTEM DIAGRAM",title:"PURGE / THREE CYCLES / SIXTY-SECOND RECOVERY",date:"TECHNICAL CARD 2",source:"R-12 OPERATING MANUAL",tags:["purge","upper ridge","three","60","recovery","reserve"],featured:true,summary:"If Upper Ridge service is restored, R-12 has three shared purge cycles. Purge removes some contamination after entry but consumes protected air and never returns the refuge to perfectly clean.",detail:"Wait about sixty seconds after a purge for full effectiveness; an earlier repeat still works but removes less. Cabin purge and R-12 purge use separate tanks. Unused R-12 cycles remain available after sealing and are applied after full recovery in the survival calculation. If Upper Ridge is not restored, no internal fallback exists."},
  {id:"release_console",phase:"technical",type:"SURFACE CONSOLE PLATE",title:"ISOLATION IS NOT RELEASE AUTHORITY",date:"TECHNICAL CARD 3",source:"R-12 RETIRED HARDWARE GUIDE",tags:["secure isolation","release","responders","console","verify","selector"],featured:true,summary:"Before the final person enters, keep SURFACE CONTAMINATION ISOLATION engaged. Move the retained mechanical authority selector from SECURE / CREW ONLY to AUTHORISED RESPONSE, then pull EXTERNAL RELEASE TEST.",detail:"The safe verification is two simultaneous lamps: ISOLATION HELD and RESPONDER RELEASE ARMED. Isolation protects against contaminated surface air; release authority lets authorised responders open R-12 later. The Lark selector is still physically latched in SECURE / CREW ONLY."},
  {id:"distress",phase:"technical",type:"STATUS PROCEDURE",title:"1 / DECLARE DISTRESS",date:"FINALE CHECKLIST",source:"BLACKOUT RIDGE + R-12 JOINT PROCEDURE",tags:["distress","status beacon","occupied refuge","checklist"],featured:true,summary:"Attempt to replace OPERATIONAL / NO ACTIVE DISTRESS with DISTRESS / PERSONNEL IN R-12. The Status Beacon determines whether that automatic status propagates externally.",detail:"Declaring distress changes station status. It does not tell responders the surface hazard, request extraction or change the R-12 release latch."},
  {id:"extraction",phase:"technical",type:"MESSAGE PROCEDURE",title:"2 / SEND EXTRACTION MESSAGE",date:"FINALE CHECKLIST",source:"BLACKOUT RIDGE + R-12 JOINT PROCEDURE",tags:["extraction","message","outbound","hazard","r-12","checklist"],featured:true,summary:"Transmit: BLACKOUT RIDGE PERSONNEL SHELTERING IN R-12 / SURFACE ATMOSPHERE UNSAFE / EXTERNAL EXTRACTION REQUIRED.",detail:"Human Outbound and the restored external outbound path determine whether the message gets through. A distress beacon alone does not identify the refuge or request extraction."},
  {id:"release",phase:"technical",type:"RELEASE PROCEDURE",title:"3 / CORRECT RELEASE CONFIGURATION",date:"FINALE CHECKLIST",source:"BLACKOUT RIDGE + R-12 JOINT PROCEDURE",tags:["release","authorised response","isolation held","armed","checklist"],featured:true,summary:"Keep contamination isolation engaged; select AUTHORISED RESPONSE; pull EXTERNAL RELEASE TEST; verify ISOLATION HELD + RESPONDER RELEASE ARMED.",detail:"An extraction message cannot move this retained mechanical latch. Correct release configuration alone also tells nobody that rescue is needed."},
  {id:"legacy_voice",phase:"technical",type:"LEGACY CIRCUIT NOTE",title:"THE ACT 3 VOICE WAS MARA",date:"TECHNICAL CARD 4",source:"AUX-04 MAINTENANCE SCHEMATIC",tags:["mara","voice","twelve","act 3","legacy","circuit"],summary:"R-12 retains an obsolete internal emergency circuit through old Ridge infrastructure. Mara's attempted call bypassed the normal mast and arrived as the destroyed voice containing 'twelve'.",detail:"That is why Inbound Receive, Source Identification and Received Traffic Log could neither improve, identify nor store it. Location C evidence, if recovered, now clicks into place but is not required."},
  {id:"final_operator",phase:"technical",type:"FINAL OPERATOR CARD",title:"EVERY PLAYER MUST KNOW THIS",date:"TECHNICAL CARD 5",source:"R-12 TRANSFER STATION",tags:["final person","microphones","distress","extraction","release","checklist"],featured:true,summary:"Descent order is hidden and random. Once below, microphones are muted. Any player may be left alone above and must remember: DISTRESS → EXTRACTION MESSAGE → RELEASE CONFIGURATION.",detail:"Do not perform these actions yet. Act 7 introduces no new rule and the players already inside cannot coach the final surface operator."},
];

export const SIGNAL_TRANSMISSIONS = {
  1: { kind: "routine", source: "CALDER VALE MATERIALS / ENVIRONMENTAL", integrity: 100, transcript: "21:20 environmental check. Perimeter air quality within normal limits.", instruction: "ROUTINE ATTRIBUTED TRAFFIC / ARCHIVED", audio:"./assets/audio/act1-calder-vale-routine.wav" },
  2: { source: "AUX-04 / FALLBACK BUS", integrity: 24, transcript: "…route tag LRR-2… carrier beneath relay traffic…", instruction: "LEGACY SOURCE / DIAGRAM ABSENT" },
  3: { source: "RX-04 + AUX-04", integrity: 42, transcript: "…not road… under… do not classify silence as safe…", instruction: "RECONSTRUCTION REQUIRED", audio:"./assets/audio/act3-impossible-transmission.wav" },
  4: { kind: "local", source: "LOCAL FIELD RADIO", integrity: 100, transcript: "Runner observation and station instruction channel clear.", instruction: "LOCAL LINK / INDEPENDENT OF EXTERNAL COMMUNICATIONS" },
  5: { source: "CALDER VALE MATERIALS / CORDON", integrity: 82, transcript: "Plume front has reached Blackout Ridge. Concentrations continue to rise. Ridge still reports OPERATIONAL / NO ACTIVE DISTRESS.", instruction: "AMBIENT CONTEXT / CABIN CONTROLS REMAIN LOCAL" },
  6: { source: "CALDER VALE HAZARDOUS RESPONSE", integrity: 76, transcript: "Specialist response teams deploying. Ridge access restrictions increasing as surface concentrations rise.", instruction: "AMBIENT INBOUND / ARCHIVE CONTAINS ALL REQUIRED INFORMATION" },
  7: { source: "LAST CARRIER / MARA VENN", integrity: 93, transcript: "Do not let it call me safe.", instruction: "FINAL READBACK WINDOW" },
};

export const DEBRIEF_STEPS = [
  { id: 1, title: "Immediate reactions", prompt: "What felt tense, confusing, or dangerous before we explain it?" },
  { id: 2, title: "Reconstruct the status failures", prompt: "Where did OPERATIONAL, GREEN, NO ACTIVE DISTRESS, or LOWER ROUTE become misleading?" },
  { id: 3, title: "Role map", prompt: "What did each responsibility protect, and which perspective was easiest to ignore?" },
  { id: 4, title: "Hesitation diagnosis", prompt: "Where did hesitation come from: evidence, risk, people, ownership, control, or technical exposure?" },
  { id: 5, title: "AI workplace bridge", prompt: "Which real dashboard, AI output, vendor tool, or automated label behaves like OPERATIONAL?" },
  { id: 6, title: "First step", prompt: "What one label, output, or workflow will each participant challenge or clarify at work?" },
];

export const PARTICIPANT_CARE = "This is a fictional survival-horror leadership exercise involving emergency pressure, missing-person themes and implied danger. If at any point you need to step out of the scenario, message the facilitator privately and we will accommodate that without drawing attention to it.";

export const ROLE_MAP = {
  lead: { area: "Self-readiness", question: "How did you hold accountability without becoming the only expert?" },
  signal: { area: "Leadership fluency", question: "How did you challenge clean or fluent signals without freezing action?" },
  systems: { area: "Roadmap and learning", question: "What did the system actually measure, and what did the team assume it measured?" },
  operations: { area: "Value discovery", question: "Which bounded test created the most useful evidence?" },
  field: { area: "People and adoption", question: "Who was missing from the data, and how did you keep them visible?" },
  protocol: { area: "Risk and guardrails", question: "Where did uncertainty need to be explicit before action?" },
  comms: { area: "External trust", question: "What made the correction credible to a receiver outside the team?" },
};

export const READINESS_PROFILES = [
  { id: "risk_aware", title: "Risk-Aware Leader", prompt: "Noticed hazards, confidence limits, and guardrails early.", risk: "May over-protect and slow action." },
  { id: "practical_sceptic", title: "Practical Sceptic", prompt: "Challenged clean labels and asked what evidence supported them.", risk: "May keep interrogating after action is needed." },
  { id: "people_first", title: "People-First Leader", prompt: "Kept Mara, the Lark Shift, and responder impact visible.", risk: "May let human urgency outrun system constraints." },
  { id: "stuck_starter", title: "Stuck Starter", prompt: "Waited for clarity while defaults or hazards hardened.", risk: "Needs a smaller bounded first move." },
  { id: "exposed", title: "Exposed Leader", prompt: "Technical ambiguity made it tempting to defer or stay quiet.", risk: "Needs permission and language to question the system." },
];

export const PLAYTEST_CRITERIA = [
  { id: "clarity", title: "Clarity", question: "Did players understand what they were being asked to do?" },
  { id: "thrill", title: "Thrill", question: "Did it feel tense rather than administrative?" },
  { id: "survival", title: "Survival stakes", question: "Did the crew feel personally endangered as well as responsible for Mara?" },
  { id: "ai_alignment", title: "AI alignment", question: "Could players explain the AI-leadership lesson afterwards?" },
  { id: "facilitation", title: "Facilitation", question: "Could one facilitator run it without drowning?" },
  { id: "role_value", title: "Role value", question: "Did each responsibility materially matter?" },
  { id: "remote_fit", title: "Teams / Zoom fit", question: "Did the remote format support coordination?" },
];

export function roleMapForCount(playerCount) {
  const roles = rolesForCount(playerCount);
  return Object.fromEntries(Object.entries(roles).map(([role, configuration]) => {
    const bundle = CARD_BUNDLES[playerCount]?.[role] || [role];
    return [role, {
      name: configuration.name,
      short: configuration.short,
      areas: bundle.map(id => ROLE_MAP[id]?.area).filter(Boolean),
      questions: bundle.map(id => ROLE_MAP[id]?.question).filter(Boolean),
    }];
  }));
}

function cardEntry(stage, role) {
  return cards[stage]?.[role] || ["NO PRIVATE UPDATE", "Coordinate with the crew using the shared station picture.", "UNKNOWN", "Who needs to know this?"];
}

function formatCardLine(roleId, entry) {
  const [title, body, confidence, prompt] = entry;
  return { roleId, title, body, confidence: confidence || "UNKNOWN", prompt: prompt || "Who needs to know this?" };
}

const CONFIDENCE_MEANING = {
  CONFIRMED: "Verified by a current source or a clear operating rule.",
  LIKELY: "Supported by evidence, but still needs another source or physical check.",
  STALE: "Once reliable, but too old to describe the current situation safely.",
  CONTRADICTED: "Another verified fact directly conflicts with this claim.",
  UNKNOWN: "Not enough evidence yet. Treat it as an open question, not a fact.",
};

export function roleCard(stage, role, playerCount = 7) {
  const configuration = rolesForCount(playerCount);
  if (stage === 1) {
    const roleIndex = roleIdsForCount(playerCount).indexOf(role);
    const screens = ACT1_EVIDENCE_SCREENS.filter((_, index) => index % playerCount === roleIndex);
    const primary = screens[0] || ACT1_EVIDENCE_SCREENS[0];
    return {
      title: primary.title, body: "", confidence: "RECORD",
      prompt: "", confidenceMeaning: "", participantGoal: "",
      notes: [], act1Screens: screens.map(screen => ({...screen})),
      intervention: configuration[role]?.intervention || ROLES[role]?.intervention,
    };
  }
  const bundle = CARD_BUNDLES[playerCount]?.[role];
  const lines = [];
  if (bundle) {
    for (const id of bundle) lines.push(formatCardLine(id, cardEntry(stage, id)));
  } else {
    lines.push(formatCardLine(role, cardEntry(stage, role)));
  }
  if (playerCount === 6 && SIX_PLAYER_SUPPLEMENTS[stage]?.[role]) {
    lines.push(formatCardLine("comms", SIX_PLAYER_SUPPLEMENTS[stage][role]));
  }
  // Four- and five-player configurations have no separate Comms terminal.
  // Preserve its evidence by combining it with Signal rather than deleting it.
  if (playerCount < 6 && role === "signal" && cards[stage]?.comms) {
    lines.push(formatCardLine("comms", cards[stage].comms));
  }
  const primary = lines[0];
  const title = bundle || lines.length > 1 ? `${configuration[role].name.toUpperCase()} BRIEF` : primary.title;
  const body = lines.length === 1
    ? primary.body
    : lines.map(line => `${ROLES[line.roleId]?.short || line.roleId.toUpperCase()} — ${line.body}`).join("\n");
  const confidence = lines.some(line => line.confidence === "CONTRADICTED") ? "CONTRADICTED"
    : lines.some(line => line.confidence === "STALE") ? "STALE"
    : lines.some(line => line.confidence === "LIKELY") ? "LIKELY"
    : lines.some(line => line.confidence === "UNKNOWN") ? "UNKNOWN"
    : "CONFIRMED";
  return {
    title,
    body,
    confidence,
    prompt: primary.prompt,
    confidenceMeaning: CONFIDENCE_MEANING[confidence],
    participantGoal: STAGES[stage]?.participantGoal || "Explain what you know, why it matters, and what the crew should do next.",
    notes: lines.map(line => ({
      ...line,
      roleName: ROLES[line.roleId]?.name || line.roleId,
      confidenceMeaning: CONFIDENCE_MEANING[line.confidence] || CONFIDENCE_MEANING.UNKNOWN,
      sharePrompt: `Ask the crew: ${line.prompt}`,
    })),
    intervention: configuration[role]?.intervention || ROLES[role]?.intervention,
  };
}

export function publicContent() {
  return {
    roles: ROLES, roleConfigs: ROLE_CONFIGS, stages: STAGES, actions: ACTIONS, debriefSteps: DEBRIEF_STEPS,
    participantCare: PARTICIPANT_CARE, roleMap: ROLE_MAP, readinessProfiles: READINESS_PROFILES, playtestCriteria: PLAYTEST_CRITERIA,
    informationMatrix: INFORMATION_MATRIX, informationJoins: INFORMATION_JOINS,
  };
}
