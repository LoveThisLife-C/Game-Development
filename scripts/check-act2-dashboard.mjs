#!/usr/bin/env node
// Real-browser alignment and live repair regression check. No browser package is
// required: Chrome DevTools is driven with Node's built-in WebSocket client.
// All sessions and writes belong to an isolated temporary server, never the game.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { addPlayer,applyAction,authorize,createSession } from "../server/game-engine.js";
import { roleIdsForCount } from "../server/game-content.js";
import { DASHBOARD_PANELS } from "../prototype/act2-dashboard.js";

const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"blackout-dashboard-"));
process.env.BLACKOUT_DATA_DIR=path.join(scratch,"sessions");
const {createHttpServer,__sessions}=await import("../server/server.js");
const output=process.env.DASHBOARD_CAPTURE_DIR || path.join(scratch,"captures");
fs.mkdirSync(output,{recursive:true});
const solutions={inbound_receive:"c",human_outbound:"d",status_beacon:"c",tower_monitoring:"c",air_quality:"c",received_traffic_log:"c",source_identification:"c",fire_suppression:"b",road_flood_monitoring:"c",site_access_control:"d"};
const host={kind:"facilitator"};
function fixture(code,count,ids,{assigned=true}={}){
  const session=createSession({code,playerCount:count});
  const roles=roleIdsForCount(count);
  for(const role of roles)addPlayer(session,{name:`Review ${role}`,role});
  applyAction(session,host,"START_GAME");
  applyAction(session,host,"UPDATE_DRAFT",{handover:{ellie:"yes",noor:"yes",jamie:"yes",saira:"yes",kai:"yes",mara:"no"}});
  applyAction(session,host,"COMMIT_STAGE");
  applyAction(session,host,"ADVANCE_STAGE");
  session.act2Intro=null;
  session.clock={duration:180,remaining:180,running:false,endAt:null};
  if(assigned)applyAction(session,host,"UPDATE_DRAFT",{repairs:Object.fromEntries(roles.map((r,i)=>[r,ids[i]]))});
  __sessions.set(code,session);
  return session;
}
const four=fixture("QAFOUR",4,["inbound_receive","human_outbound","site_access_control","fire_suppression"]);
const seven=fixture("QASEVN",7,["received_traffic_log","air_quality","source_identification","inbound_receive","status_beacon","tower_monitoring","road_flood_monitoring"]);
const unassigned=fixture("QALOCK",4,["inbound_receive","human_outbound","site_access_control","fire_suppression"],{assigned:false});
const server=createHttpServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const chrome=spawn(process.env.CHROME_BIN || "google-chrome",["--headless=new","--no-sandbox","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-port=0",`--user-data-dir=${path.join(scratch,"chrome")}`,"about:blank"],{stdio:"ignore"});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){if(await fn())return;await delay(80);}
  throw Error(`Timed out: ${label}`);
}
let socket,sequence=0;
const pending=new Map(),errors=[];
function command(method,params={},sessionId){
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error(`DevTools timeout: ${method}`));},15000);
    pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject});
    socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));
  });
}
async function page(){
  const {targetId}=await command("Target.createTarget",{url:"about:blank"});
  const {sessionId}=await command("Target.attachToTarget",{targetId,flatten:true});
  const send=(method,params)=>command(method,params,sessionId);
  await send("Runtime.enable");await send("Page.enable");
  const evaluate=async expression=>{
    const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  return {send,evaluate};
}
async function visit(p,session,view,size){
  await p.send("Emulation.setDeviceMetricsOverride",{width:size[0],height:size[1],deviceScaleFactor:1,mobile:false});
  const token=view==="facilitator"?session.facilitatorToken:view==="player"?session.players.lead.token:"";
  await p.send("Page.navigate",{url:`${base}/?${new URLSearchParams({view,session:session.code,token})}`});
  await until(()=>p.evaluate(`!!document.querySelector('.act2-runtime')`),"Act 2 page");
  if(view!=="shared")await p.evaluate(`document.querySelector('[data-act2-status-open]').click()`);
  await until(()=>p.evaluate(`!!document.querySelector('.station-dashboard .sdb-art')?.complete && document.querySelector('.station-dashboard .sdb-art')?.naturalWidth===1672`),"dashboard artwork");
  await p.evaluate("document.fonts.ready.then(()=>true)");
}
async function check(p,label,session){
  const measurements=await p.evaluate(`(() => {
    const board=document.querySelector('.station-dashboard'),r=board.getBoundingClientRect();
    const art=board.querySelector('.sdb-art').getBoundingClientRect();
    const coordinates=el=>{const b=el.getBoundingClientRect();return {x:(b.x-r.x)/r.width*1672,y:(b.y-r.y)/r.height*941,w:b.width/r.width*1672,h:b.height/r.height*941};};
    return {ratio:r.width/r.height, art:{w:art.width,h:art.height},board:{w:r.width,h:r.height},
      lamps:[...board.querySelectorAll('.sdb-lamp')].map(el=>({...coordinates(el),id:el.dataset.system,state:el.dataset.state})),
      overflow:[...board.querySelectorAll('.sdb-slot')].filter(el=>!el.classList.contains('sdb-log-cell')&&!el.classList.contains('sdb-source')&&el.scrollHeight>el.clientHeight+2).map(el=>({class:el.className,text:el.textContent})),
      legacy:board.querySelectorAll('.act2-dashboard-panels,.act2-instrument').length,
      close:document.querySelector('[data-act2-status-close]')?coordinates(document.querySelector('[data-act2-status-close]')):null,
      slots:[...board.querySelectorAll('.sdb-slot')].map(el=>({...coordinates(el),class:el.className}))};
  })()`);
  assert.ok(Math.abs(measurements.ratio-1672/941)<.001,`${label}: aspect ratio changed`);
  assert.deepEqual(measurements.art,measurements.board,`${label}: artwork/overlay dimensions differ`);
  assert.equal(measurements.legacy,0);
  assert.equal(measurements.lamps.length,12);
  for(const lamp of measurements.lamps){
    const [x,y]=DASHBOARD_PANELS[lamp.id].lamp;
    assert.ok(Math.abs(lamp.x+lamp.w/2-x)<.12 && Math.abs(lamp.y+lamp.h/2-y)<.12,`${label}: ${lamp.id} lamp moved`);
    assert.equal(lamp.state,session.global.systemStatus[lamp.id],`${label}: ${lamp.id} must expose its live engine state`);
  }
  for(const slot of measurements.slots){
    assert.ok(slot.x>=0 && slot.y>=0 && slot.x+slot.w<=1672.1 && slot.y+slot.h<=941.1,`${label}: slot outside artwork ${slot.class}`);
  }
  assert.deepEqual(measurements.overflow,[],`${label}: clipped text`);
  if(measurements.close)assert.ok(measurements.close.y+measurements.close.h<=0,`${label}: close button covers artwork`);
  const shot=await p.send("Page.captureScreenshot",{format:"webp",quality:86});
  fs.writeFileSync(path.join(output,`${label}.webp`),Buffer.from(shot.data,"base64"));
  console.log(`PASS ${label}: 12 aligned lamps, no overflowing text`);
}
async function captureHeader(p,label){
  await p.evaluate(`document.querySelector('[data-act2-status-close]')?.click()`);
  await until(()=>p.evaluate(`!document.querySelector('.station-status-dialog')`),"status panel closed");
  const header=await p.evaluate(`(() => {const element=document.querySelector('.runtime-hud'),style=getComputedStyle(element),frame=getComputedStyle(element,'::before');return {loaded:frame.backgroundImage.includes('game-header-art-v4.webp'),borders:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth],separator:getComputedStyle(element,'::after').content,frameContent:frame.content}})()`);
  assert.equal(header.loaded,true,`${label}: header artwork did not load`);
  assert.deepEqual(header.borders,["0px","0px","0px","0px"],`${label}: HTML header border returned`);
  assert.ok(header.separator==="none"||header.separator==="normal",`${label}: CSS header separator returned`);
  assert.equal(header.frameContent,'""',`${label}: artwork frame missing`);
  const manual=await p.evaluate(`(() => {const root=document.querySelector('.act2-manual');if(!root)return null;const tab=root.querySelector('nav button:last-child').getBoundingClientRect();const instruction=root.querySelector('.act2-manual-instruction').getBoundingClientRect();return {tabBottom:tab.bottom,instructionTop:instruction.top}})()`);
  if(manual)assert.ok(manual.tabBottom<=manual.instructionTop+1,`${label}: system tab overlaps manual instructions`);
  const shot=await p.send("Page.captureScreenshot",{format:"webp",quality:86});
  fs.writeFileSync(path.join(output,`${label}.webp`),Buffer.from(shot.data,"base64"));
  await p.evaluate(`document.querySelector('[data-act2-status-open]').click()`);
}
async function dispatchState(p,label,{disabled}){
  await p.evaluate(`document.querySelector('[data-act2-status-close]')?.click()`);
  await until(()=>p.evaluate(`!document.querySelector('.station-status-dialog')`),"status panel closed");
  const state=await p.evaluate(`(() => {
    const button=document.querySelector('[data-action="DISPATCH_REPAIRS"]');
    const footer=document.querySelector('.act2-shell>footer');
    if(!button||!footer)return null;
    const b=button.getBoundingClientRect(),f=footer.getBoundingClientRect();
    return {disabled:button.disabled,visible:b.width>0&&b.height>0,left:Math.abs(b.left-f.left),width:b.width/footer.clientWidth,bottomGap:Math.abs(b.bottom-f.bottom)};
  })()`);
  assert.ok(state,`${label}: dispatch control missing`);
  assert.equal(state.visible,true,`${label}: dispatch control hidden`);
  assert.equal(state.disabled,disabled,`${label}: dispatch state is wrong`);
  assert.ok(state.left<25,`${label}: dispatch does not start in the left artwork bay`);
  assert.ok(state.width>=.34&&state.width<=.39,`${label}: dispatch width does not match the left artwork bay`);
  assert.ok(state.bottomGap<12,`${label}: dispatch is not seated in the bottom artwork bay`);
}
try{
  await until(()=>fs.existsSync(path.join(scratch,"chrome","DevToolsActivePort")),"Chrome launch");
  const [port]=fs.readFileSync(path.join(scratch,"chrome","DevToolsActivePort"),"utf8").split("\n");
  const version=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  socket=new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  socket.addEventListener("message",event=>{
    const data=JSON.parse(event.data);
    if(data.id){const callback=pending.get(data.id);pending.delete(data.id);if(data.error)callback?.reject(Error(data.error.message));else callback?.resolve(data.result);}
    if(data.method==="Runtime.exceptionThrown")errors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
    if(data.method==="Page.javascriptDialogOpening")errors.push(data.params.message);
  });
  const facilitator=await page(),player=await page(),shared=await page(),locked=await page();
  await visit(locked,unassigned,"facilitator",[1366,768]);
  await dispatchState(locked,"unassigned planning",{disabled:true});
  applyAction(unassigned,host,"UPDATE_DRAFT",{repairs:{lead:"inbound_receive",signal:"human_outbound",systems:"site_access_control",operations:"fire_suppression"}});
  await until(()=>locked.evaluate(`!document.querySelector('[data-action="DISPATCH_REPAIRS"]')?.disabled`),"dispatch enabled after assignments");
  await dispatchState(locked,"complete planning",{disabled:false});
  await visit(facilitator,four,"facilitator",[1366,768]);
  await visit(player,four,"player",[1366,768]);
  await captureHeader(facilitator,"act2-facilitator-header");
  await captureHeader(player,"act2-player-header");
  await visit(facilitator,four,"facilitator",[1024,768]);
  await captureHeader(facilitator,"act2-facilitator-header-1024x768");
  await visit(facilitator,four,"facilitator",[390,844]);
  await captureHeader(facilitator,"act2-facilitator-header-390x844");
  await visit(facilitator,four,"facilitator",[1366,768]);
  await check(facilitator,"four-player-planning-facilitator",four);
  await facilitator.evaluate(`document.querySelector('[data-act2-status-close]').click();document.querySelector('[data-action="DISPATCH_REPAIRS"]').click()`);
  await until(()=>facilitator.evaluate(`!!document.querySelector('.act2-repair-monitor')`),"facilitator dispatch");
  await until(()=>player.evaluate(`!!document.querySelector('[data-repair-submit]')`),"player received puzzle");
  await facilitator.evaluate(`document.querySelector('[data-act2-status-open]').click()`);
  await check(facilitator,"four-player-dispatched-facilitator",four);
  // Trigger the real player confirmation UI while facilitator dashboard remains open.
  await player.evaluate(`document.querySelector('[data-act2-status-close]').click();const input=document.querySelector('input[name="choice"][value="c"]');input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));`);
  await until(()=>player.evaluate(`!!document.querySelector('[data-repair-confirm]')`),"repair confirmation");
  await player.evaluate(`document.querySelector('[data-repair-confirm]').click()`);
  await until(()=>facilitator.evaluate(`document.querySelector('[data-system="inbound_receive"]').dataset.state==='working'`),"live successful repair lamp");
  const playerResult=await player.evaluate(`(() => {const panel=document.querySelector('.repair-player-console.submitted');if(!panel)return null;const style=getComputedStyle(panel),overlay=getComputedStyle(panel,'::before');return {backgroundImage:style.backgroundImage,backgroundColor:style.backgroundColor,overlayDisplay:overlay.display,overlayContent:overlay.content}})()`);
  assert.deepEqual(playerResult,{backgroundImage:"none",backgroundColor:"rgba(0, 0, 0, 0)",overlayDisplay:"none",overlayContent:"none"},"player result background returned");
  const resultShot=await player.send("Page.captureScreenshot",{format:"webp",quality:86});
  fs.writeFileSync(path.join(output,"four-player-result-no-background.webp"),Buffer.from(resultShot.data,"base64"));
  for(const role of roleIdsForCount(4).slice(1))applyAction(four,authorize(four,four.players[role].token),"REPAIR_SUBMIT",{answer:solutions[four.repairRun.assignments[role]]});
  await until(()=>facilitator.evaluate(`document.querySelector('[data-system="site_access_control"]').dataset.state==='working'`),"live reader repair");
  await check(facilitator,"four-player-repaired-facilitator",four);
  await captureHeader(facilitator,"four-player-complete-control");

  for(const [width,height] of [[1920,1080],[1366,768],[1280,720],[1024,768],[768,1024],[390,844],[844,390]]){
    await visit(player,seven,"player",[width,height]);
    await check(player,`seven-player-faults-${width}x${height}`,seven);
    if(width===390)await captureHeader(player,"act2-player-header-390x844");
    if(width===390){
      await player.evaluate(`document.querySelector('.station-status-viewport').scrollLeft=900`);
      await check(player,"seven-player-mobile-right-pan",seven);
    }
  }
  applyAction(seven,host,"DISPATCH_REPAIRS");
  for(const role of roleIdsForCount(7))applyAction(seven,authorize(seven,seven.players[role].token),"REPAIR_SUBMIT",{answer:solutions[seven.repairRun.assignments[role]]});
  await visit(player,seven,"player",[1366,768]);
  await check(player,"seven-player-repaired-player",seven);
  await visit(shared,seven,"shared",[1920,1080]);
  await check(shared,"seven-player-repaired-shared",seven);
  // Clear all the successful effects in a second isolated fixture via failed attempts.
  const failed=fixture("QAFAIL",7,Object.keys(solutions).slice(0,7));
  applyAction(failed,host,"DISPATCH_REPAIRS");
  for(const role of roleIdsForCount(7))applyAction(failed,authorize(failed,failed.players[role].token),"REPAIR_SUBMIT",{answer:"wrong"});
  await visit(facilitator,failed,"facilitator",[1366,768]);
  await check(facilitator,"seven-player-failed-repairs",failed);
  assert.deepEqual(errors,[],"browser errors");
  console.log(`Dashboard browser checks passed. Screenshots: ${output}`);
}finally{
  socket?.close();
  const stopped=once(chrome,"exit");chrome.kill("SIGTERM");await stopped;
  await new Promise(resolve=>server.close(resolve));
}
