#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {addPlayer,applyAction,authorize,createSession,expireIfNeeded,publicState} from "../server/game-engine.js";
import {roleIdsForCount} from "../server/game-content.js";

const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"blackout-act6-check-"));
process.env.BLACKOUT_DATA_DIR=path.join(scratch,"sessions");
const {createHttpServer,__sessions}=await import("../server/server.js");
const facilitator={kind:"facilitator"};
const session=createSession({code:"ACT6QA",playerCount:5});
for(const role of roleIdsForCount(5))addPlayer(session,{name:`Review ${role}`,role});
applyAction(session,facilitator,"START_ACT6_TEST");
__sessions.set(session.code,session);

const server=createHttpServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const chrome=spawn(process.env.CHROME_BIN||"google-chrome",["--headless=new","--no-sandbox","--disable-gpu","--hide-scrollbars","--remote-debugging-port=0",`--user-data-dir=${path.join(scratch,"chrome")}`,"about:blank"],{stdio:"ignore"});
const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function until(check,label){const deadline=Date.now()+15000;while(Date.now()<deadline){if(await check())return;await delay(75);}throw Error(`Timed out: ${label}`);}
let socket,sequence=0;
const pending=new Map(),browserErrors=[];
function command(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error(`DevTools timeout: ${method}`)),15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});}
async function newPage(){const {targetId}=await command("Target.createTarget",{url:"about:blank"}),{sessionId}=await command("Target.attachToTarget",{targetId,flatten:true});const send=(method,params)=>command(method,params,sessionId);await send("Runtime.enable");await send("Page.enable");const evaluate=async expression=>{const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};return {send,evaluate};}
async function visit(page,view,token,width=1440,height=900){await page.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:false});const params=new URLSearchParams({view,session:session.code,refresh:"act6-final-audit-1"});if(token)params.set("token",token);await page.send("Page.navigate",{url:`${base}/?${params}`});await until(()=>page.evaluate(`!!document.querySelector('.game-runtime,.ending-runtime')`),`${view} runtime`);await page.evaluate("document.fonts.ready.then(()=>true)");}
async function audit(page,label,selectors=[]){
  const result=await page.evaluate(`(() => {const selectors=${JSON.stringify(selectors)},visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'},targets=selectors.flatMap(selector=>[...document.querySelectorAll(selector)]),bad=targets.filter(node=>{if(!visible(node))return false;const r=node.getBoundingClientRect();return r.left<-2||r.top<-2||r.right>innerWidth+2||r.bottom>innerHeight+2||node.scrollWidth>node.clientWidth+3&&getComputedStyle(node).overflowX==='hidden'||node.scrollHeight>node.clientHeight+3&&getComputedStyle(node).overflowY==='hidden';}).map(node=>({tag:node.tagName,class:node.className,text:(node.innerText||'').slice(0,80),rect:[node.getBoundingClientRect().left,node.getBoundingClientRect().top,node.getBoundingClientRect().right,node.getBoundingClientRect().bottom],size:[node.clientWidth,node.clientHeight,node.scrollWidth,node.scrollHeight]}));return {viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],bad};})()`);
  assert.ok(result.document[0]<=result.viewport[0]+2,`${label}: horizontal page overflow`);
  assert.deepEqual(result.bad,[],`${label}: clipped or off-screen mission controls`);
  return result;
}
async function screenshot(page,name){const shot=await page.send("Page.captureScreenshot",{format:"webp",quality:80});const file=path.join("/tmp",`${name}.webp`);fs.writeFileSync(file,Buffer.from(shot.data,"base64"));return file;}
async function assertImages(page,selector,label){const result=await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(image=>({src:image.currentSrc||image.src,complete:image.complete,width:image.naturalWidth}))`);assert.ok(result.length>0,`${label}: no images rendered`);assert.ok(result.every(image=>image.complete&&image.width>0),`${label}: broken image asset`);}

const report={screenshots:[],checks:[]};
try{
  await until(()=>fs.existsSync(path.join(scratch,"chrome","DevToolsActivePort")),"Chromium launch");
  const [debugPort]=fs.readFileSync(path.join(scratch,"chrome","DevToolsActivePort"),"utf8").split("\n"),version=await(await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  socket=new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  socket.addEventListener("message",event=>{const data=JSON.parse(event.data);if(data.id){const callback=pending.get(data.id);pending.delete(data.id);data.error?callback?.reject(Error(data.error.message)):callback?.resolve(data.result);}if(data.method==="Runtime.exceptionThrown")browserErrors.push(data.params.exceptionDetails.exception?.description||data.params.exceptionDetails.text);});
  const page=await newPage(),roles=roleIdsForCount(5),leadToken=session.players.lead.token;

  for(const [view,token] of [["player",leadToken],["facilitator",session.facilitatorToken],["shared",""]]){
    await visit(page,view,token,1440,900);
    assert.equal(await page.evaluate(`!!document.querySelector('.act6-opening')`),true,`${view} opening missing`);
    assert.equal(await page.evaluate(`document.querySelectorAll('.act6-opening-boards img').length`),3,`${view} opening boards missing`);
    await assertImages(page,".act6-opening-boards img",`${view} opening`);
    await audit(page,`${view} opening`,[".act6-opening-copy"]);
  }
  const openingFont=await page.evaluate(`parseFloat(getComputedStyle(document.querySelector('.act6-opening-copy p')).fontSize)`);
  assert.ok(openingFont>=16,"Act 6 opening text is too small");
  await visit(page,"player",leadToken,1440,900);report.screenshots.push(await screenshot(page,"act6-opening"));

  session.act6Intro.endsAt=Date.now()-1;
  expireIfNeeded(session,Date.now());
  assert.equal(session.archiveRun.phase,"history");
  for(const role of roles){await visit(page,"player",session.players[role].token);assert.equal(await page.evaluate(`document.querySelectorAll('[data-archive-page]').length`),6,`${role} history navigation incomplete`);assert.match(await page.evaluate(`document.querySelector('.archive-player-mission').innerText`),/same for every player/i);}
  await visit(page,"player",leadToken,1280,720);
  for(let index=0;index<6;index++){
    await page.evaluate(`document.querySelector('[data-archive-page="${index}"]').click()`);
    await until(()=>page.evaluate(`document.querySelector('[data-archive-page="${index}"]').classList.contains('active')`),`history page ${index+1}`);
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-archive-record]:not([hidden])').length`),1);
    await audit(page,`history page ${index+1} 1280x720`,[".lark-archive",".archive-layout",".archive-index",".archive-grid"]);
  }
  const historyFonts=await page.evaluate(`({body:parseFloat(getComputedStyle(document.querySelector('[data-archive-record]:not([hidden]) p')).fontSize),nav:parseFloat(getComputedStyle(document.querySelector('[data-archive-page]')).fontSize)})`);
  assert.ok(historyFonts.body>=14&&historyFonts.nav>=11,"Act 6 archive text is too small");
  await assertImages(page,".lark-archive img","Act 6 history");
  report.screenshots.push(await screenshot(page,"act6-history-player"));
  await visit(page,"facilitator",session.facilitatorToken,1280,720);
  assert.equal(await page.evaluate(`!!document.querySelector('.act6-command-monitor.phase-history')`),true);
  await audit(page,"facilitator history 1280x720",[".act6-command-monitor",".a6-command-phases",".a6-command-title",".a6-command-metrics",".a6-command-crew",".facilitator-immersive-controls"]);
  report.screenshots.push(await screenshot(page,"act6-facilitator-history"));
  await visit(page,"shared","",1440,900);await audit(page,"shared history",[".shared-decision-preview",".lark-archive"]);

  session.archiveRun.nightmareAt=Date.now()-1;
  expireIfNeeded(session,Date.now());
  assert.equal(session.archiveRun.phase,"nightmare");
  for(const [view,token] of [["player",leadToken],["facilitator",session.facilitatorToken],["shared",""]]){
    await visit(page,view,token,1440,900);
    assert.equal(await page.evaluate(`!!document.querySelector('.production-nightmare')`),true,`${view} nightmare missing`);
    assert.equal(await page.evaluate(`document.querySelectorAll('.act6-nightmare-boards img').length`),3,`${view} nightmare boards missing`);
    await assertImages(page,".act6-nightmare-boards img",`${view} nightmare`);
    await audit(page,`${view} nightmare`,[".nightmare-copy"]);
  }
  report.screenshots.push(await screenshot(page,"act6-nightmare"));

  session.archiveRun.nightmareEndsAt=Date.now()-1;
  expireIfNeeded(session,Date.now());
  assert.equal(session.archiveRun.phase,"technical");
  await visit(page,"player",leadToken,1280,720);
  assert.equal(await page.evaluate(`document.querySelectorAll('[data-archive-page]').length`),3);
  for(let index=0;index<3;index++){
    await page.evaluate(`document.querySelector('[data-archive-page="${index}"]').click()`);
    await until(()=>page.evaluate(`document.querySelector('[data-archive-page="${index}"]').classList.contains('active')`),`manual page ${index+1}`);
    await assertImages(page,"[data-archive-record]:not([hidden]) img",`manual page ${index+1}`);
    await audit(page,`manual page ${index+1} 1280x720`,[".lark-archive",".archive-layout",".archive-index",".archive-grid"]);
  }
  report.screenshots.push(await screenshot(page,"act6-technical-player"));
  await visit(page,"facilitator",session.facilitatorToken,1280,720);
  assert.equal(await page.evaluate(`!!document.querySelector('.act6-command-monitor.phase-technical')`),true);
  await audit(page,"facilitator technical 1280x720",[".act6-command-monitor",".a6-command-phases",".a6-command-title",".a6-command-metrics",".a6-command-crew",".facilitator-immersive-controls"]);
  report.screenshots.push(await screenshot(page,"act6-facilitator-technical"));

  session.clock.running=false;session.clock.endAt=null;session.clock.remaining=session.act6Config.criticalSeconds;
  await visit(page,"facilitator",session.facilitatorToken);
  assert.equal(await page.evaluate(`document.querySelector('.act6-command-monitor').classList.contains('critical')`),true);
  session.clock.running=true;session.clock.endAt=Date.now()-1;
  expireIfNeeded(session,Date.now());
  assert.equal(session.stageStatus,"resolved");
  for(const [view,token] of [["player",leadToken],["facilitator",session.facilitatorToken],["shared",""]]){
    await visit(page,view,token,1280,720);
    assert.equal(await page.evaluate(`!!document.querySelector('.consequence-overlay.stage-6')`),true,`${view} consequence missing`);
    await audit(page,`${view} Act 6 consequence`,[".consequence-copy",view==="facilitator"?".stage-consequence-actions":".act67-resolved-wait"]);
  }
  assert.equal(await page.evaluate(`!!document.querySelector('[data-action="ADVANCE_STAGE"]')`),false,"shared view must not expose facilitator authority");
  await visit(page,"facilitator",session.facilitatorToken,1440,900);
  assert.equal(await page.evaluate(`!!document.querySelector('[data-action="ADVANCE_STAGE"]')`),true);
  assert.equal(await page.evaluate(`!!document.querySelector('[data-restart-act6]')`),true);
  report.screenshots.push(await screenshot(page,"act6-resolved-facilitator"));

  applyAction(session,facilitator,"RESTART_ACT6");
  assert.equal(session.stage,6);assert.equal(session.stageStatus,"live");assert.equal(session.archiveRun.phase,"opening");
  await visit(page,"facilitator",session.facilitatorToken);assert.equal(await page.evaluate(`!!document.querySelector('.act6-opening')`),true);
  session.act6Intro.endsAt=Date.now()-1;expireIfNeeded(session,Date.now());session.archiveRun.nightmareAt=Date.now()-1;expireIfNeeded(session,Date.now());session.archiveRun.nightmareEndsAt=Date.now()-1;expireIfNeeded(session,Date.now());session.clock.running=true;session.clock.endAt=Date.now()-1;expireIfNeeded(session,Date.now());
  applyAction(session,facilitator,"ADVANCE_STAGE");
  assert.equal(session.stage,7);assert.equal(session.stageStatus,"live");
  for(const role of roles)assert.equal(publicState(session,authorize(session,session.players[role].token)).finale.canBegin,true,`${role} cannot begin Act 7 after Act 6`);

  assert.deepEqual(browserErrors,[],"browser exceptions");
  report.checks.push("opening renders for player, facilitator and shared display","all five players receive all six history records","all three R-12 manuals render with readable text","nightmare interruption is synchronized","facilitator authority monitor remains visible at 1280x720","resolved modal offers Act 7 and Act 6 restart","Act 6 restart preserves direct Act 6 flow","Act 6 handoff enables Act 7 for all five players");
  console.log(JSON.stringify(report,null,2));
}finally{
  try{socket?.close();}catch{}
  chrome.kill("SIGTERM");
  if(chrome.exitCode===null)await Promise.race([new Promise(resolve=>chrome.once("exit",resolve)),delay(2000)]);
  if(chrome.exitCode===null){chrome.kill("SIGKILL");await new Promise(resolve=>chrome.once("exit",resolve));}
  await new Promise(resolve=>server.close(resolve));
  await delay(500);
  fs.rmSync(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
