import test from "node:test";
import assert from "node:assert/strict";

import {nextDragTarget} from "../prototype/act5/live-wire/drag.js";
import {TOOL_GRAB_RADIUS,createState as createDemisterState,grab as grabDemister} from "../prototype/act5/demister/model.js";
import {panelDeposits} from "../prototype/act5/service-view.js";

test("Live Wire long drags advance in server-safe chunks until the pointer goal is reached",()=>{
  let target={x:100,y:200},dirty=true,steps=0;
  const goal={x:1050,y:620};
  while(dirty&&steps<20){({target,dirty}=nextDragTarget(target,goal));steps++;}
  assert.deepEqual(target,goal);
  assert.equal(dirty,false);
  assert.ok(steps>1,"a long drag must be split into more than one validated sample");
});

test("Demister accepts a grab throughout the enlarged visible tip target",()=>{
  const state=createDemisterState("A",17),tool={...state.tool};
  assert.equal(TOOL_GRAB_RADIUS,40);
  assert.equal(grabDemister(state,{x:tool.x-TOOL_GRAB_RADIUS+1,y:tool.y}),true);
});

test("Service Seal renders deposits only for the selected panel",()=>{
  const deposits=[
    {panel:0,stroke:"a",x:10,y:10,x2:20,y2:20,thickness:6},
    {panel:1,stroke:"b",x:30,y:30,x2:40,y2:40,thickness:6},
  ];
  assert.deepEqual(panelDeposits(deposits,0),[deposits[0]]);
  assert.deepEqual(panelDeposits(deposits,1),[deposits[1]]);
});
