const clone=value=>structuredClone(value);

export const ACT4_MODULES={
  1:[
    {id:"three_buttons",title:"THREE BUTTONS",procedure:"Derive X/Y/Z from colour and symbol, then translate the selected eight-role sequence into physical presses."},
    {id:"route_controls",title:"ROUTE CONTROLS",procedure:"Transmit a complete route through checkpoint 1, checkpoint 2 and exit. EXECUTE validates the whole route."},
    {id:"calibration_dials",title:"CALIBRATION DIALS",procedure:"Use each fixed calibration mark, symbol and striped-sector side to calculate three target values."},
    {id:"patch_matrix",title:"PATCH MATRIX",procedure:"Use source plus lead colour to route PWR, DATA, CTRL and AUX to coordinate sockets."},
    {id:"switch_bank",title:"SWITCH BANK",procedure:"Set the feed test pattern, SAMPLE the latched lamps, then derive the final switch configuration from cap colours."},
    {id:"diagnostic_recovery",title:"DIAGNOSTIC RECOVERY",procedure:"Compare both captures and enter eight RESET/CONFIRM commands in POWER, THERMAL, COMMS, INTEGRITY order."},
  ],
  2:[
    {id:"level_sliders",title:"LEVEL SLIDERS",procedure:"Use the faulted pipe shape and its rank among the four live values to select the complete target profile."},
    {id:"alignment_discs",title:"ALIGNMENT DISCS",procedure:"Set Disc 1 to position 1, then propagate positions clockwise using each symbol and preceding link."},
    {id:"component_order",title:"COMPONENT ORDER",procedure:"Arrange all five marked components from the keyed end. Select two components to swap them."},
    {id:"service_plate",title:"SERVICE PLATE",procedure:"Follow Pattern C from the lock marker in the stamped direction. VERIFY checks all eight bolts."},
    {id:"fuse_allocation",title:"FUSE ALLOCATION",procedure:"Add the circuit allowance, then assign the smallest available fuse with the required FAST/DELAY type."},
    {id:"load_test",title:"LOAD TEST",procedure:"Run TEST A, choose TEST B or C from the first result, then select and verify the diagnosed repair."},
  ],
};

const BOARD_STATES={
  1:{
    three_buttons:{completed:false,feedback:"",buttons:[{colour:"RED",symbol:"TRIANGLE"},{colour:"RED",symbol:"CIRCLE"},{colour:"AMBER",symbol:"SQUARE"}],queue:[],solution:[2,0,1,1,0,2,1,0]},
    route_controls:{completed:false,feedback:"",start:"A1",checkpoints:["CP1","CP2"],exit:"EXIT",queue:[],solution:["right","right","down","down","right","down","right","right"]},
    calibration_dials:{completed:false,feedback:"",dials:[{name:"PRESSURE",symbol:"CIRCLE",mark:4,striped:"ANTICLOCKWISE"},{name:"FLOW",symbol:"TRIANGLE",mark:6,striped:"CLOCKWISE"},{name:"ALIGNMENT",symbol:"SQUARE",mark:2,striped:"ANTICLOCKWISE"}],values:[0,0,0],solution:[6,4,5]},
    patch_matrix:{completed:false,feedback:"",leads:{PWR:"YELLOW",DATA:"BLUE",CTRL:"RED",AUX:"GREEN"},selectedSource:null,connections:{},solution:{PWR:"CTRL-A",DATA:"AUX-D",CTRL:"PWR-B",AUX:"DATA-C"}},
    switch_bank:{completed:false,feedback:"",feed:"LEFT",caps:["WHITE","BLACK","WHITE","BLACK","WHITE","BLACK"],switches:["DOWN","DOWN","DOWN","DOWN","DOWN","DOWN"],sampled:false,lamps:["ON","ON","OFF","ON","OFF","OFF"],test:["UP","DOWN","UP","DOWN","DOWN","UP"],solution:["UP","DOWN","DOWN","DOWN","DOWN","UP"]},
    diagnostic_recovery:{completed:false,feedback:"",capture1:{POWER:"GREEN",THERMAL:"RED",COMMS:"GREEN",INTEGRITY:"AMBER"},capture2:{POWER:"AMBER",THERMAL:"AMBER",COMMS:"GREEN",INTEGRITY:"RED"},queue:[],solution:["RESET","CONFIRM","CONFIRM","RESET","CONFIRM","CONFIRM","RESET","CONFIRM"]},
  },
  2:{
    level_sliders:{completed:false,feedback:"",pipes:["STRAIGHT","ELBOW","FORK","LOOP"],fault:"FORK",initial:[3,8,5,1],values:[3,8,5,1],solution:[7,3,5,9]},
    alignment_discs:{completed:false,feedback:"",symbols:["TRIANGLE","SQUARE","PLUS","CIRCLE"],links:["CROSSED","STRAIGHT","OFFSET"],values:[1,1,1,1],solution:[1,5,8,7]},
    component_order:{completed:false,feedback:"",keyedEnd:"RIGHT",selected:null,items:["DOT-1","BAR-2","TRIANGLE-2","BAR-1","DOT-2"],solution:["BAR-2","DOT-1","TRIANGLE-2","BAR-1","DOT-2"]},
    service_plate:{completed:false,feedback:"",direction:"CLOCKWISE",lockIndex:0,queue:[],solution:[0,3,7,4,5,1,2,6]},
    fuse_allocation:{completed:false,feedback:"",circuits:{PUMP:8.4,HEATER:18.2,COMMS:9.1,FAN:6.6},fuses:["10A_DELAY","15A_FAST","15A_DELAY","20A_FAST"],assignments:{},selected:null,solution:{PUMP:"15A_DELAY",HEATER:"20A_FAST",COMMS:"15A_FAST",FAN:"10A_DELAY"}},
    load_test:{completed:false,feedback:"",fault:"COOLING",meters:{VIBRATION:"NORMAL",TEMPERATURE:"NORMAL",CURRENT:"NORMAL"},tests:[],selected:null,solution:"COOLING"},
  },
};

const LOAD_TEST_FAULTS=["BEARING","DRIVE","COOLING","SUPPLY"];
export function createAct4Board(number,variant=0){
  const board=clone(BOARD_STATES[number]);
  for(const [id,state] of Object.entries(board))state.id=id;
  if(number===2){
    const fault=LOAD_TEST_FAULTS[Math.abs(Number(variant)||0)%LOAD_TEST_FAULTS.length];
    board.load_test.fault=fault;board.load_test.solution=fault;
  }
  return board;
}
export function act4Module(number,id){return ACT4_MODULES[number]?.find(item=>item.id===id)||null;}

export function act4Procedure(number,id){
  const base=act4Module(number,id);if(!base)return null;
  const details={
    three_buttons:{steps:["Matching colours adjacent: X is the unique colour. Separated: X is the left matching button.","Of the remaining buttons, Y is earlier in TRIANGLE → CIRCLE → SQUARE; the last is Z.","Use symbol and position of X to read the eight-role sequence."],table:"SQUARE / X RIGHT: X Y Z Z Y X Z Y"},
    route_controls:{steps:["Use the full 6×6 cabin maze.","Route START → CP1 → CP2 → EXIT in that order.","Send the complete arrow sequence; an invalid EXECUTE clears the queue without revealing the wrong step."],table:"The runner supplies the seeded START cell; the cabin owns the maze."},
    calibration_dials:{steps:["CIRCLE: anticlockwise +2; clockwise −1.","TRIANGLE: anticlockwise +1; clockwise −2.","SQUARE: anticlockwise +3; clockwise −3.","Wrap values around 0–9."],table:"Use the fixed white mark, not the movable setting."},
    patch_matrix:{steps:["PWR: RED AUX-B / BLUE CTRL-C / YELLOW CTRL-A / GREEN PWR-C","DATA: RED AUX-C / BLUE AUX-D / YELLOW CTRL-B / GREEN PWR-A","CTRL: RED PWR-B / BLUE DATA-A / YELLOW DATA-B / GREEN DATA-D","AUX: RED PWR-D / BLUE CTRL-D / YELLOW AUX-A / GREEN DATA-C"],table:"Match SOURCE + COLOUR."},
    switch_bank:{steps:["LEFT test: U D U D D U. RIGHT test: D U D U U D.","Press SAMPLE. A correct test latches the six lamps.","WHITE cap follows lamp; BLACK cap inverts lamp."],table:"ON: white UP / black DOWN. OFF: white DOWN / black UP."},
    diagnostic_recovery:{steps:["Improved: CONFIRM → RESET.","Worsened: RESET → CONFIRM.","Stayed GREEN: CONFIRM → CONFIRM.","Stayed AMBER/RED: RESET → RESET."],table:"Order: POWER → THERMAL → COMMS → INTEGRITY."},
    level_sliders:{steps:["Identify the fixed FAULT pipe shape.","Rank that pipe's current value: HIGHEST, 2ND HIGHEST, 2ND LOWEST or LOWEST.","Use the matching FAULT PIPE table and rank row.","Apply all four listed values to STRAIGHT, ELBOW, FORK and LOOP respectively.","Set all four sliders, then press VERIFY."],table:"Values apply to pipe shapes, not channel numbers."},
    alignment_discs:{steps:["Set Disc 1 / TRIANGLE to Position 1.","Move clockwise: TRIANGLE → SQUARE → PLUS → CIRCLE.","For each following disc, use that disc's symbol and the link immediately before it.","Add the lookup offset to the previous disc; positions wrap 1–8.","Set all four discs, then press VERIFY."],table:"Link types are STRAIGHT, CROSSED and OFFSET."},
    component_order:{steps:["Read the five-position rail from the visibly KEYED END.","Required order: DOT+2, BAR+1, TRIANGLE+2, DOT+1, BAR+2.","If the key is on the right, position 1 is the rightmost slot.","Select one component, then a second component to swap them.","Press VERIFY when the full arrangement is complete."],table:"There is no empty holding slot and no drag/drop."},
    service_plate:{steps:["Start with the bolt nearest the lock marker.","Skip two bolts in the stamped direction and tighten the next bolt.","Tighten its opposite.","Tighten the bolt opposite the starting bolt.","Tighten the next unused bolt in the stamped direction.","Tighten its opposite.","Tighten the final unused bolt.","Tighten its opposite, then VERIFY."],table:"PATTERN C / SKIP TWO."},
    fuse_allocation:{steps:["Add the circuit allowance to its measured current.","Select the smallest available fuse rating equal to or above the adjusted current.","Use the required FAST or DELAY type.","Assign all four physical fuses; each fuse is one use.","Press VERIFY when complete."],table:"Pump DELAY +4A · Heater FAST +1A · Comms FAST +2A · Fan DELAY +3A."},
    load_test:{steps:["Run TEST A.","If VIBRATION is HIGH, run TEST B; if TEMPERATURE is HIGH, run TEST C.","Use the follow-up CURRENT reading to identify the fault.","Select the matching repair action, then press VERIFY.","Tests may be repeated and a rejected repair remains editable."],table:"B+LOW BEARING · B+HIGH DRIVE · C+HIGH COOLING · C+LOW SUPPLY."},
  }[id];
  return {...base,...details};
}

const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)?JSON.stringify(a)===JSON.stringify(b):a&&b&&typeof a==="object"&&typeof b==="object"?Object.keys(b).length===Object.keys(a).length&&Object.entries(b).every(([key,value])=>a[key]===value):a===b;
export function verifyAct4Module(state){
  if(state.solution===undefined)return false;
  if(Array.isArray(state.solution))return same(state.queue??state.values??state.items??state.switches,state.solution);
  if(typeof state.solution==="object")return same(state.connections??state.assignments,state.solution);
  return state.selected===state.solution;
}
