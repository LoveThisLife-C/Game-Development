#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {addPlayer,applyAction,authorize,createSession,expireIfNeeded,publicState} from "../server/game-engine.js";
import {roleIdsForCount} from "../server/game-content.js";

const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"blackout-act7-check-"));
process.env.BLACKOUT_DATA_DIR=path.join(scratch,"sessions");
const {createHttpServer,__sessions}=await import("../server/server.js");
const facilitator={kind:"facilitator"};
const session=createSession({code:"ACT7QA",playerCount:5});
for(const role of roleIdsForCount(5))addPlayer(session,{name:`Review ${role}`,role});
session.status="stage";session.stage=7;session.stageStatus="live";
session.global.systemStatus.status_beacon="working";
session.global.systemStatus.human_outbound="working";
session.global.fieldServices.external_outbound_path="restored";
session.global.fieldServices.upper_ridge_service="restored";
publicState(session,facilitator);
__sessions.set(session.code,session);

const viewer=role=>authorize(session,session.players[role].token);
const claim=role=>{const seat=viewer(role);applyAction(session,seat,"BEGIN_DESCENT");expireIfNeeded(session,session.finaleRun.walkEndsAt+1);return seat;};
function completeTransfer(seat){
  const mechanics=session.finaleRun.mechanics,key=mechanics.keys.find(item=>item.correct);
  for(const [action,payload={}] of [["select_key",{keyId:key.id}],["insert_key"],["turn_key"],["set_hatch",{value:1}],["enter_hatch"],["set_close",{value:1}],["set_clamp",{value:1}]])applyAction(session,seat,"ACT7_MECHANIC",{action,...payload});
  for(let index=0;index<8;index++)applyAction(session,seat,"ACT7_MECHANIC",{action:"fill"});
  applyAction(session,seat,"ACT7_MECHANIC",{action:"hold"});applyAction(session,seat,"ACT7_MECHANIC",{action:"test_seal"});
  while(session.finaleRun.mechanics.purge.charge<session.finaleRun.mechanics.purge.target)applyAction(session,seat,"ACT7_MECHANIC",{action:"shake",amount:4});
  session.finaleRun.capsuleReceiverReadyAt=0;
  applyAction(session,seat,"ACT7_MECHANIC",{action:"fire_purge"});applyAction(session,seat,"ACT7_MECHANIC",{action:"enter_r12"});
}

const server=createHttpServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const chrome=spawn(process.env.CHROME_BIN||"google-chrome",["--headless=new","--no-sandbox","--disable-gpu","--hide-scrollbars","--remote-debugging-port=0",`--user-data-dir=${path.join(scratch,"chrome")}`,"about:blank"],{stdio:"ignore"});
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function until(check,label){const deadline=Date.now()+15000;while(Date.now()<deadline){if(await check())return;await delay(75);}throw Error(`Timed out: ${label}`);}
let socket,sequence=0;const pending=new Map(),browserErrors=[];
function command(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error(`DevTools timeout: ${method}`)),15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});}
async function newPage(){const {targetId}=await command("Target.createTarget",{url:"about:blank"}),{sessionId}=await command("Target.attachToTarget",{targetId,flatten:true});const send=(method,params)=>command(method,params,sessionId);await send("Runtime.enable");await send("Page.enable");const evaluate=async expression=>{const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};return {send,evaluate};}
async function visit(page,view,token,width=1440,height=900){await page.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});await page.send("Page.navigate",{url:`${base}/?${new URLSearchParams({view,session:session.code,token,refresh:"act7-audit-21"})}`});await until(()=>page.evaluate(`!!document.querySelector('.game-runtime,.ending-runtime')`),`${view} runtime`);await page.evaluate("document.fonts.ready.then(()=>true)");}
async function audit(page,label,selectors=[]){
  const result=await page.evaluate(`(() => {const selectors=${JSON.stringify(selectors)},visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'},targets=selectors.flatMap(selector=>[...document.querySelectorAll(selector)]),bad=targets.filter(node=>{if(!visible(node))return false;const r=node.getBoundingClientRect();return r.left<-2||r.top<-2||r.right>innerWidth+2||r.bottom>innerHeight+2||node.scrollWidth>node.clientWidth+3&&getComputedStyle(node).overflowX==='hidden'||node.scrollHeight>node.clientHeight+3&&getComputedStyle(node).overflowY==='hidden';}).map(node=>({tag:node.tagName,class:node.className,text:(node.innerText||'').slice(0,80),rect:[node.getBoundingClientRect().left,node.getBoundingClientRect().top,node.getBoundingClientRect().right,node.getBoundingClientRect().bottom],size:[node.clientWidth,node.clientHeight,node.scrollWidth,node.scrollHeight]}));return {viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],bad};})()`);
  assert.ok(result.document[0]<=result.viewport[0]+2,`${label}: horizontal page overflow`);assert.deepEqual(result.bad,[],`${label}: clipped or off-screen mission controls`);return result;
}
async function screenshot(page,name){const shot=await page.send("Page.captureScreenshot",{format:"webp",quality:80});const file=path.join("/tmp",`${name}.webp`);fs.writeFileSync(file,Buffer.from(shot.data,"base64"));return file;}

const report={screenshots:[],checks:[]};
try{
  await until(()=>fs.existsSync(path.join(scratch,"chrome","DevToolsActivePort")),"Chromium launch");
  const [debugPort]=fs.readFileSync(path.join(scratch,"chrome","DevToolsActivePort"),"utf8").split("\n"),version=await(await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  socket=new WebSocket(version.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  socket.addEventListener("message",event=>{const data=JSON.parse(event.data);if(data.id){const callback=pending.get(data.id);pending.delete(data.id);data.error?callback?.reject(Error(data.error.message)):callback?.resolve(data.result);}if(data.method==="Runtime.exceptionThrown")browserErrors.push(data.params.exceptionDetails.exception?.description||data.params.exceptionDetails.text);});
  const page=await newPage(),roles=roleIdsForCount(5);
  for(const role of roles){await visit(page,"player",session.players[role].token);assert.equal(await page.evaluate(`!!document.querySelector('[data-begin-descent]')`),true,`${role} lacks BEGIN DESCENT`);}
  await visit(page,"facilitator",session.facilitatorToken);assert.equal(await page.evaluate(`!!document.querySelector('.act7-command-monitor')`),true);await audit(page,"facilitator queue",[".act7-command-monitor"]);report.screenshots.push(await screenshot(page,"act7-facilitator-queue"));

  const lead=viewer("lead");applyAction(session,lead,"BEGIN_DESCENT");await visit(page,"player",session.players.lead.token);assert.equal(await page.evaluate(`!!document.querySelector('.act7-walk-film')`),true);await audit(page,"private walk",[".act7-walk-copy"]);
  expireIfNeeded(session,session.finaleRun.walkEndsAt+1);await visit(page,"player",session.players.lead.token);assert.equal(await page.evaluate(`document.querySelectorAll('.act7-key').length`),4);await audit(page,"key phase",[".act7-apparatus-controls",".act7-key-grid",".act7-next-action"]);
  const correct=session.finaleRun.mechanics.keys.find(item=>item.correct);applyAction(session,lead,"ACT7_MECHANIC",{action:"select_key",keyId:correct.id});applyAction(session,lead,"ACT7_MECHANIC",{action:"insert_key"});applyAction(session,lead,"ACT7_MECHANIC",{action:"turn_key"});await visit(page,"player",session.players.lead.token,1280,720);await audit(page,"hatch phase 1280x720",[".act7-apparatus-controls",".act7-hatch-drag"]);
  applyAction(session,lead,"ACT7_MECHANIC",{action:"set_hatch",value:1});applyAction(session,lead,"ACT7_MECHANIC",{action:"enter_hatch"});await visit(page,"player",session.players.lead.token,1280,720);await audit(page,"seal phase 1280x720",[".act7-apparatus-controls",".act7-seal-readout",".act7-mechanical-drag"]);
  applyAction(session,lead,"ACT7_MECHANIC",{action:"set_close",value:1});applyAction(session,lead,"ACT7_MECHANIC",{action:"set_clamp",value:1});for(let index=0;index<8;index++)applyAction(session,lead,"ACT7_MECHANIC",{action:"fill"});applyAction(session,lead,"ACT7_MECHANIC",{action:"hold"});applyAction(session,lead,"ACT7_MECHANIC",{action:"test_seal"});await visit(page,"player",session.players.lead.token,1280,720);await audit(page,"purge phase 1280x720",[".act7-apparatus-controls",".act7-shaker",".act7-seal-readout"]);
  while(session.finaleRun.mechanics.purge.charge<session.finaleRun.mechanics.purge.target)applyAction(session,lead,"ACT7_MECHANIC",{action:"shake",amount:4});session.finaleRun.capsuleReceiverReadyAt=0;applyAction(session,lead,"ACT7_MECHANIC",{action:"fire_purge"});applyAction(session,lead,"ACT7_MECHANIC",{action:"enter_r12"});
  await visit(page,"player",session.players.lead.token);assert.equal(await page.evaluate(`document.querySelectorAll('[data-r12-view]').length`),5);await audit(page,"R-12 room",[".act7-r12-scene",".act7-r12-hotspot-map",".r12-isolated"]);report.screenshots.push(await screenshot(page,"act7-r12-room"));
  await page.evaluate(`document.querySelector('[data-r12-view="mara"]').click()`);await until(()=>page.evaluate(`document.querySelectorAll('[data-r12-dialogue]').length===6`),"Mara dialogue");const mara=await page.evaluate(`({count:document.querySelectorAll('[data-r12-dialogue]').length,minFont:Math.min(...[...document.querySelectorAll('[data-r12-dialogue] span')].map(node=>parseFloat(getComputedStyle(node).fontSize)))})`);assert.equal(mara.count,6);assert.ok(mara.minFont>=16,"Mara questions are too small");await audit(page,"Mara questions",[".act7-mara-detail",".act7-dialogue"]);
  for(const hotspot of ["receiver","manuals","console"]){await page.evaluate(`document.querySelector('[data-r12-view="room"]').click()`);await page.evaluate(`document.querySelector('[data-r12-view="${hotspot}"]').click()`);await until(()=>page.evaluate(`!!document.querySelector('.act7-${hotspot==="manuals"?"manual":hotspot}-detail')`),`${hotspot} detail`);await audit(page,`R-12 ${hotspot}`,[".act7-r12-detail"]);}

  completeTransfer(claim("signal"));await visit(page,"player",session.players.lead.token);await page.evaluate(`document.querySelector('[data-r12-view="cctv"]').click()`);await until(()=>page.evaluate(`!!document.querySelector('[data-r12-scare-camera="1"]')`),"CCTV one-shot feed");assert.equal(await page.evaluate(`document.querySelector('[data-r12-scare-camera="1"]').loop`),false);await audit(page,"CCTV one-shot",[".act7-cctv-detail",".act7-media-tabs"]);report.screenshots.push(await screenshot(page,"act7-cctv-one-shot"));
  for(const role of ["systems","operations","field"])completeTransfer(claim(role));session.finaleRun.powerFailureEndsAt=Date.now()+60000;
  await visit(page,"player",session.players.lead.token);assert.equal(await page.evaluate(`!!document.querySelector('.act7-power-failure')`),true);await audit(page,"power failure",[".act7-power-failure"]);
  session.finaleRun.powerFailureEndsAt=Date.now()-1;expireIfNeeded(session,Date.now());
  for(const [width,height] of [[1440,900],[1280,720]]){await visit(page,"player",session.players.lead.token,width,height);assert.equal(await page.evaluate(`document.querySelectorAll('.final-control').length`),5);const controls=await page.evaluate(`[...document.querySelectorAll('.final-control')].map(node=>({font:parseFloat(getComputedStyle(node.querySelector('b')).fontSize),small:parseFloat(getComputedStyle(node.querySelector('small')).fontSize)}))`);assert.ok(controls.every(item=>item.font>=17&&item.small>=9));await audit(page,`final console ${width}x${height}`,[".surface-console>header",".final-control",".final-message-field",".final-console-readout"]);if(width===1440)report.screenshots.push(await screenshot(page,"act7-final-console"));}
  applyAction(session,lead,"UPDATE_SURFACE",{red:true,white:true,amber:true,message:"ALL CREW IN R-12. SURFACE ATMOSPHERE UNSAFE. EXTERNAL EXTRACTION REQUIRED."});applyAction(session,lead,"UPDATE_SURFACE",{green:true});
  await visit(page,"player",session.players.lead.token);assert.equal(await page.evaluate(`!!document.querySelector('.act7-total-blackout')`),true);assert.equal(await page.evaluate(`document.body.innerText.trim()`),"");
  await visit(page,"facilitator",session.facilitatorToken);assert.equal(await page.evaluate(`!!document.querySelector('[data-message-verdict]')`),true);await audit(page,"facilitator verdict",[".act7-blackout>div",".message-rubric"]);
  applyAction(session,facilitator,"CLASSIFY_MESSAGE",{rating:"clear"});applyAction(session,facilitator,"CALCULATE_ENDING");await visit(page,"facilitator",session.facilitatorToken);assert.equal(await page.evaluate(`!!document.querySelector('.consequence-overlay.stage-7')`),true);applyAction(session,facilitator,"CONFIRM_ENDING");
  await visit(page,"facilitator",session.facilitatorToken,1440,900);await audit(page,"facilitator final record",[".fac-final-outcome",".fac-final-command"]);report.screenshots.push(await screenshot(page,"act7-facilitator-final-record"));
  assert.deepEqual(browserErrors,[],"browser exceptions");report.checks.push("5/5 players can claim descent","six physical transfer phases render","five R-12 hotspots render","CCTV is one-shot","power failure and final console render","player/shared blackout is text-free","facilitator verdict and final record render","1440x900 and 1280x720 controls remain visible");
  console.log(JSON.stringify(report,null,2));
}finally{
  try{socket?.close();}catch{}chrome.kill("SIGTERM");if(chrome.exitCode===null)await Promise.race([new Promise(resolve=>chrome.once("exit",resolve)),delay(2000)]);if(chrome.exitCode===null){chrome.kill("SIGKILL");await new Promise(resolve=>chrome.once("exit",resolve));}await new Promise(resolve=>server.close(resolve));await delay(500);fs.rmSync(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
