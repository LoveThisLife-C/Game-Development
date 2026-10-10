#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {addPlayer,applyAction,createSession,expireIfNeeded} from "../server/game-engine.js";
import {roleIdsForCount} from "../server/game-content.js";

const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"blackout-act3-"));
process.env.BLACKOUT_DATA_DIR=path.join(scratch,"sessions");
const {createHttpServer,__sessions}=await import("../server/server.js");
const host={kind:"facilitator"};
function fixture(code,count){
  const session=createSession({code,playerCount:count});
  for(const role of roleIdsForCount(count))addPlayer(session,{name:`Review ${role}`,role});
  session.status="stage";session.stage=3;session.stageStatus="live";
  session.act3Intro=null;session.act3Run={phase:"planning",impossibleVoicePlayed:false,impossibleVoiceAt:null,finalCall:false,resolution:null};
  session.draft={firstLocation:"",secondLocation:"",tool1:"",tool2:"",supportItem:"",filterUse:"",runner:""};
  session.clock={duration:480,remaining:480,running:false,endAt:null};
  session.global.externalStatus={external_inbound:"offline",external_human_outbound:"offline",lower_road_camera_history:"offline",ventilation_path:"offline"};
  for(const id of ["lower_road_camera","received_traffic_log","source_identification","status_beacon","tower_monitoring","road_flood_monitoring","ventilation_control"])session.global.systemStatus[id]="working";
  for(const id of ["air_quality","inbound_receive","human_outbound","site_access_control","fire_suppression"])session.global.systemStatus[id]="broken";
  __sessions.set(code,session);return session;
}
const session=fixture("ACT3QA",4);
const server=createHttpServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const chrome=spawn(process.env.CHROME_BIN||"google-chrome",["--headless=new","--no-sandbox","--disable-gpu","--remote-debugging-port=0",`--user-data-dir=${path.join(scratch,"chrome")}`,"about:blank"],{stdio:"ignore"});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await delay(75);}throw Error(`Timed out: ${label}`);}
let socket,seq=0;const pending=new Map(),errors=[];
function command(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error(`DevTools timeout: ${method}`)),15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});}
async function page(){const {targetId}=await command("Target.createTarget",{url:"about:blank"}),{sessionId}=await command("Target.attachToTarget",{targetId,flatten:true});const send=(method,params)=>command(method,params,sessionId);await send("Runtime.enable");await send("Page.enable");const evaluate=async expression=>{const result=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};return {send,evaluate};}
async function visit(page,view,size,resource="navigation"){
  await page.send("Emulation.setDeviceMetricsOverride",{width:size[0],height:size[1],deviceScaleFactor:1,mobile:size[0]<600});
  const token=view==="facilitator"?session.facilitatorToken:view==="player"?session.players.lead.token:"";
  await page.send("Page.navigate",{url:`${base}/?${new URLSearchParams({view,session:session.code,token,resource})}`});
  await until(()=>page.evaluate(`!!document.querySelector('.act3-runtime')`),`${view} Act 3 runtime`);await page.evaluate("document.fonts.ready.then(()=>true)");
}
async function inspect(page,label){
  const result=await page.evaluate(`(() => {const consoleEl=document.querySelector('.act3-console'),left=document.querySelector('.act3-left')||document.querySelector('.act3-deployment-console'),right=document.querySelector('.act3-right')||document.querySelector('.act3-deployment-console');return {docWidth:document.documentElement.scrollWidth,viewport:innerWidth,consoleWidth:consoleEl.getBoundingClientRect().width,leftOverflow:left.scrollWidth-left.clientWidth,rightOverflow:right.scrollWidth-right.clientWidth,systems:document.querySelectorAll('.act3-status-dots i').length,offline:document.querySelectorAll('.act3-status-dots i.offline').length,duplicateHeaders:document.querySelectorAll('.runtime-hud').length,logoCount:document.querySelectorAll('.runtime-hud .brand-logo').length};})()`);
  assert.ok(result.docWidth<=result.viewport+2,`${label}: horizontal page overflow`);assert.ok(result.consoleWidth>0,`${label}: console missing`);if(result.systems){assert.equal(result.systems,12);assert.equal(result.offline,4);}assert.equal(result.duplicateHeaders,1);assert.equal(result.logoCount,1);assert.ok(result.leftOverflow<=2,`${label}: left aperture overflow`);assert.ok(result.rightOverflow<=2,`${label}: right aperture overflow`);
  const shot=await page.send("Page.captureScreenshot",{format:"webp",quality:86});const file=path.join(process.cwd(),"docs/reports/screenshots",`${label}.webp`);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.from(shot.data,"base64"));return file;
}
try{
  await until(()=>fs.existsSync(path.join(scratch,"chrome","DevToolsActivePort")),"Chrome launch");const [port]=fs.readFileSync(path.join(scratch,"chrome","DevToolsActivePort"),"utf8").split("\n"),version=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();socket=new WebSocket(version.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});socket.addEventListener("message",event=>{const data=JSON.parse(event.data);if(data.id){const callback=pending.get(data.id);pending.delete(data.id);data.error?callback?.reject(Error(data.error.message)):callback?.resolve(data.result);}if(data.method==="Runtime.exceptionThrown")errors.push(data.params.exceptionDetails.exception?.description||data.params.exceptionDetails.text);});
  const fac=await page(),player=await page();
  await visit(fac,"facilitator",[1920,1080],"navigation");await inspect(fac,"act3-facilitator-1920x1080");
  const facilitatorPlanning=await fac.evaluate(`({rail:!!document.querySelector('.act3-fac-controls.planning'),voice:!!document.querySelector('[data-act3-voice]'),deployment:!!document.querySelector('.act3-fac-controls [data-act3-resource="submission"]'),label:document.querySelector('.act3-fac-controls>header')?.innerText||''})`);
  assert.deepEqual(facilitatorPlanning,{rail:true,voice:true,deployment:true,label:"FACILITATOR ONLY\nLIVE STORY CONTROL"});
  await visit(player,"player",[1366,768],"navigation");
  const playerAuthority=await player.evaluate(`({facControls:!!document.querySelector('.act3-fac-controls'),voice:!!document.querySelector('[data-act3-voice]'),random:!!document.querySelector('[data-act3-random]'),nominate:!!document.querySelector('[data-act3-nominate]'),advance:!!document.querySelector('[data-action="ADVANCE_STAGE"]'),restart:!!document.querySelector('[data-restart-act3]')})`);
  assert.deepEqual(playerAuthority,{facControls:false,voice:false,random:false,nominate:false,advance:false,restart:false},"players must not receive facilitator authority controls");
  const crewGuide=await player.evaluate(`({steps:document.querySelectorAll('.act3-shared-mission.planning li').length,text:document.querySelector('.act3-shared-mission.planning')?.innerText||''})`);
  assert.equal(crewGuide.steps,4);assert.match(crewGuide.text,/NAVIGATION.*MANUAL.*EQUIPMENT.*DEPLOYMENT/is);assert.match(crewGuide.text,/PLAYERS EDIT TOGETHER.*FACILITATOR COMMITS/i);
  await fac.evaluate(`document.querySelector('[data-act3-resource="equipment"]').click()`);await until(()=>fac.evaluate(`document.querySelector('.act3-equipment-board img')?.complete===true`),"field equipment catalogue artwork");
  const catalogue=await fac.evaluate(`({items:document.querySelectorAll('.act3-equipment-items article').length,names:[...document.querySelectorAll('.act3-equipment-items article b')].map(node=>node.textContent.trim()),image:document.querySelector('.act3-equipment-board img')?.complete})`);
  assert.equal(catalogue.items,7);assert.equal(new Set(catalogue.names).size,7);assert.equal(catalogue.image,true);await inspect(fac,"act3-equipment-catalogue-1920x1080");
  await fac.evaluate(`document.querySelector('[data-act2-status-open]').click()`);await until(()=>fac.evaluate(`!!document.querySelector('.station-status-dialog .station-dashboard')`),"Act 2 twelve-system dashboard in Act 3");
  const status=await fac.evaluate(`({systems:document.querySelectorAll('.station-dashboard .sdb-lamp').length,offline:document.querySelectorAll('.station-dashboard .sdb-lamp.offline').length})`);assert.equal(status.systems,12);assert.equal(status.offline,4);const statusShot=await fac.send("Page.captureScreenshot",{format:"webp",quality:86});fs.writeFileSync(path.join(process.cwd(),"docs/reports/screenshots/act3-act2-status-dashboard-1920x1080.webp"),Buffer.from(statusShot.data,"base64"));await fac.evaluate(`document.querySelector('[data-act2-status-close]').click()`);
  await fac.evaluate(`document.querySelector('[data-act3-resource="submission"]').click()`);await until(()=>fac.evaluate(`!!document.querySelector('.act3-deployment-console')`),"submission screen");await inspect(fac,"act3-submission-1920x1080");
  await visit(fac,"facilitator",[1366,768],"submission");await inspect(fac,"act3-submission-1366x768");
  await visit(fac,"facilitator",[1920,1080],"submission");
  const g06=await fac.evaluate(`({fields:document.querySelectorAll('.act3-deployment-fields>label').length,rules:document.querySelectorAll('.act3-mission-rules>p').length,summary:document.querySelectorAll('.act3-plan-summary>p').length,voice:!!document.querySelector('[data-act3-voice]'),shell:document.querySelector('.act3-deployment-art')?.getAttribute('src')||''})`);
  assert.deepEqual(g06,{fields:6,rules:4,summary:6,voice:true,shell:"./assets/images/act3/deployment-console-shell-v2.webp"});
  const act=async(type,payload={})=>fac.evaluate(`fetch('/api/sessions/${session.code}/action',{method:'POST',headers:{'authorization':'Bearer ${session.facilitatorToken}','content-type':'application/json'},body:JSON.stringify({type:${JSON.stringify(type)},payload:${JSON.stringify(payload)}})}).then(async response=>{if(!response.ok)throw Error((await response.json()).error);return true})`);
  await act("UPDATE_DRAFT",{firstLocation:"a",secondLocation:"c",tool1:"torque_wrench",tool2:"signal_meter",supportItem:"flood_kit",filterUse:96});
  await act("ACT3_COMMIT_DEPLOYMENT");
  await until(()=>fac.evaluate(`!!document.querySelector('.act3-runner-control')`),"corrected result and runner nomination");
  const corrected=await fac.evaluate(`(() => ({text:document.querySelector('.act3-deployment-console')?.innerText||'',first:document.querySelector('[data-field="firstLocation"]')?.value,second:document.querySelector('[data-field="secondLocation"]')?.value,voice:document.querySelector('.signal-intercept')?.innerText||''}))()`);
  assert.match(corrected.text,/DEPLOYMENT CORRECTED/i);assert.equal(corrected.first,"c");assert.equal(corrected.second,"a");assert.match(corrected.voice,/Can anyone hear me\?/i);
  assert.equal(await fac.evaluate(`!!document.querySelector('[data-signal-dismiss]')`),true);await fac.evaluate(`document.querySelector('[data-signal-dismiss]').click()`);assert.equal(await fac.evaluate(`!!document.querySelector('.signal-intercept')`),false);await inspect(fac,"act3-corrected-result-1920x1080");
  await act("ACT3_NOMINATE_RUNNER",{runner:"lead"});await until(()=>fac.evaluate(`!!document.querySelector('.consequence-overlay.stage-3')`),"Act 3 consequence modal");
  const consequence=await fac.evaluate(`({restart:document.querySelector('[data-restart-act3]')?.innerText||'',advance:document.querySelector('[data-action="ADVANCE_STAGE"]')?.innerText||'',scroll:document.querySelector('.consequence-overlay')?.scrollHeight-document.querySelector('.consequence-overlay')?.clientHeight})`);
  assert.match(consequence.restart,/RESTART ACT 3/i);assert.match(consequence.advance,/ADVANCE TO STAGE 04/i);assert.ok(consequence.scroll<=2);await inspect(fac,"act3-consequence-1920x1080");
  await visit(player,"player",[390,844],"navigation");await until(()=>player.evaluate(`!!document.querySelector('.consequence-overlay.stage-3')`),"mobile Act 3 consequence modal");
  const mobileConsequenceShot=await player.send("Page.captureScreenshot",{format:"webp",quality:86});fs.writeFileSync(path.join(process.cwd(),"docs/reports/screenshots/act3-consequence-390x844.webp"),Buffer.from(mobileConsequenceShot.data,"base64"));
  await act("RESTART_ACT3");await until(()=>fac.evaluate(`!document.querySelector('.consequence-overlay')&&!!document.querySelector('.act3-runtime.phase-planning')`),"Act 3 direct restart");session.act3Intro=null;session.clock.endAt=Date.now()+480000;
  await visit(player,"player",[1366,768],"manual");await inspect(player,"act3-player-1366x768");
  await visit(player,"player",[390,844],"manual");await until(()=>player.evaluate(`document.querySelector('.act3-resource-art img')?.complete===true`),"mobile service manual artwork");
  const mobileManual=await player.evaluate(`(() => {const viewport=document.querySelector('.act3-resource-art>div'),tabs=document.querySelector('.act3-resource-tabs'),buttons=[...tabs.querySelectorAll('button')],rect=tabs.getBoundingClientRect();return {scrollable:viewport.scrollWidth>viewport.clientWidth,duplicateActions:document.querySelectorAll('.act3-resource-art>button,.act3-equipment-catalogue>button').length,tabsOverflow:tabs.scrollWidth-tabs.clientWidth,allTabsVisible:buttons.every(button=>{const box=button.getBoundingClientRect();return box.left>=rect.left-1&&box.right<=rect.right+1&&box.top>=rect.top-1&&box.bottom<=rect.bottom+1}),labels:buttons.map(button=>button.querySelector('b').textContent.trim()),pageWidth:document.documentElement.scrollWidth}})()`);
  assert.equal(mobileManual.scrollable,true);assert.equal(mobileManual.duplicateActions,0);assert.ok(mobileManual.tabsOverflow<=1);assert.equal(mobileManual.allTabsVisible,true);assert.deepEqual(mobileManual.labels,["NAVIGATION","SERVICE MANUAL","EQUIPMENT","DEPLOYMENT"]);assert.ok(mobileManual.pageWidth<=392);
  const mobileManualShot=await player.send("Page.captureScreenshot",{format:"webp",quality:86});fs.writeFileSync(path.join(process.cwd(),"docs/reports/screenshots/act3-manual-390x844.webp"),Buffer.from(mobileManualShot.data,"base64"));
  await visit(player,"player",[390,844],"submission");await inspect(player,"act3-player-390x844");
  const playerSubmission=await player.evaluate(`({canCommit:!!document.querySelector('[data-act3-commit]'),disabled:document.querySelector('.act3-commit')?.disabled,label:document.querySelector('.act3-commit')?.innerText||'',editable:document.querySelector('[data-field="firstLocation"]')?.disabled===false})`);
  assert.equal(playerSubmission.canCommit,false);assert.equal(playerSubmission.disabled,true);assert.equal(playerSubmission.editable,true);assert.match(playerSubmission.label,/BUILD THE SHARED PLAN|PLAN READY FOR FACILITATOR/i);
  await visit(player,"player",[390,844],"equipment");await until(()=>player.evaluate(`document.querySelector('.act3-equipment-board img')?.complete===true`),"mobile equipment catalogue artwork");
  const mobileCatalogue=await player.evaluate(`(() => {const viewport=document.querySelector('.act3-equipment-scroll');return {items:document.querySelectorAll('.act3-equipment-items article').length,scrollable:viewport.scrollWidth>viewport.clientWidth,overflow:getComputedStyle(viewport).overflowX,pageWidth:document.documentElement.scrollWidth}})()`);
  assert.equal(mobileCatalogue.items,7);assert.equal(mobileCatalogue.scrollable,true);assert.match(mobileCatalogue.overflow,/auto|scroll/);assert.ok(mobileCatalogue.pageWidth<=392);
  const mobileCatalogueShot=await player.send("Page.captureScreenshot",{format:"webp",quality:86});fs.writeFileSync(path.join(process.cwd(),"docs/reports/screenshots/act3-equipment-catalogue-390x844.webp"),Buffer.from(mobileCatalogueShot.data,"base64"));
  session.clock.endAt=10;assert.equal(expireIfNeeded(session,11),true);await visit(fac,"facilitator",[1920,1080],"submission");
  const finalCall=await fac.evaluate(`({random:!!document.querySelector('[data-act3-random]'),commit:!!document.querySelector('[data-act3-commit]'),voice:!!document.querySelector('[data-act3-voice]'),label:document.querySelector('.act3-deployment-heading strong')?.textContent||''})`);
  assert.deepEqual(finalCall,{random:true,commit:true,voice:false,label:"IMMEDIATE FINAL CALL"});await inspect(fac,"act3-final-call-1920x1080");
  assert.equal(errors.length,0,errors.join("\n"));console.log("PASS Act 3: facilitator/player/shared layout, 12 systems, four forced outages and responsive apertures verified");
}finally{try{socket?.close();}catch{}chrome.kill("SIGTERM");await new Promise(resolve=>server.close(resolve));}
