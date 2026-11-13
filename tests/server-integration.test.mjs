import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const storage=mkdtempSync(join(tmpdir(),"blackout-ridge-http-"));
process.env.BLACKOUT_DATA_DIR=storage;
const {createHttpServer,__sessions}=await import("../server/server.js");

test("HTTP runtime enforces authentication, privacy, synchronization and live events",async t=>{
  const server=createHttpServer();
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    await new Promise(resolve=>setTimeout(resolve,80));
    rmSync(storage,{recursive:true,force:true});
  });
  const address=server.address(),base=`http://127.0.0.1:${address.port}`;
  const request=async(path,options={})=>{
    const response=await fetch(`${base}${path}`,options),body=await response.json();
    return {response,body};
  };
  const post=(path,body,token)=>request(path,{method:"POST",headers:{"content-type":"application/json",...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});

  const health=await request("/api/health");
  assert.equal(health.response.status,200);assert.equal(health.body.ok,true);
  const page=await fetch(`${base}/`);assert.equal(page.status,200);assert.match(await page.text(),/full-app\.js/);

  const created=await post("/api/sessions",{playerCount:4});
  assert.equal(created.response.status,201);
  const {code,facilitatorToken}=created.body,tokens={};
  for(const role of ["lead","signal","systems","operations"]){
    const joined=await post(`/api/sessions/${code}/join`,{name:`HTTP ${role}`,role});
    assert.equal(joined.response.status,201);tokens[role]=joined.body.playerToken;
  }

  const shared=await request(`/api/sessions/${code}/state`);
  assert.equal(shared.body.viewer.kind,"public");assert.equal(shared.body.privateCard,null);assert.deepEqual(shared.body.chatMessages,[]);
  const lead=await request(`/api/sessions/${code}/state?token=${tokens.lead}`);
  assert.equal(lead.body.viewer.role,"lead");
  const forged=await post(`/api/sessions/${code}/action`,{type:"ACK_SAFETY"});
  assert.equal(forged.response.status,401);

  const streamController=new AbortController();
  const stream=await fetch(`${base}/api/sessions/${code}/events?token=${tokens.lead}`,{signal:streamController.signal});
  assert.match(stream.headers.get("content-type")||"",/text\/event-stream/);
  const firstEvent=new TextDecoder().decode((await stream.body.getReader().read()).value);
  assert.match(firstEvent,/event: state/);assert.match(firstEvent,new RegExp(code));streamController.abort();

  await post(`/api/sessions/${code}/action`,{type:"CHAT_MESSAGE",payload:{message:"Signal path confirmed."}},tokens.signal);
  const synchronized=await request(`/api/sessions/${code}/state?token=${tokens.lead}`);
  assert.equal(synchronized.body.chatMessages.at(-1).senderRole,"signal");assert.equal(synchronized.body.chatMessages.at(-1).text,"Signal path confirmed.");
  assert.deepEqual((await request(`/api/sessions/${code}/state`)).body.chatMessages,[]);

  const started=await post(`/api/sessions/${code}/action`,{type:"START_GAME"},facilitatorToken);
  assert.equal(started.response.status,200);assert.equal(started.body.stage,1);assert.equal(started.body.stageStatus,"live");
  const activeLead=await request(`/api/sessions/${code}/state?token=${tokens.lead}`);
  assert.ok(activeLead.body.privateCard.title.length>5);assert.equal(activeLead.body.privateCard.body,"");
  assert.equal(activeLead.body.privateCard.notes.length,0);assert.ok(activeLead.body.privateCard.act1Screens.length>=1);

  const act5Created=(await post("/api/sessions",{playerCount:4})).body,act5Players=[];
  for(const role of ["lead","signal","systems","operations"]){
    const joined=(await post(`/api/sessions/${act5Created.code}/join`,{name:`Act 5 ${role}`,role})).body;
    act5Players.push(joined);
  }
  const act5Started=await post(`/api/sessions/${act5Created.code}/action`,{type:"START_ACT5_TEST"},act5Created.facilitatorToken);
  assert.equal(act5Started.response.status,200);assert.equal(act5Started.body.stage,5);
  __sessions.get(act5Created.code).act5Intro.endsAt=Date.now()-1;
  await request(`/api/sessions/${act5Created.code}/state?token=${act5Players[0].playerToken}`);
  const wsUrl=base.replace(/^http/,"ws")+`/act5-ws?session=${act5Created.code}&token=${act5Players[0].playerToken}&role=player&seat=1`;
  await new Promise((resolve,reject)=>{
    const ws=new WebSocket(wsUrl);let sent=false;
    const timeout=setTimeout(()=>{ws.close();reject(new Error("Act 5 WebSocket acknowledgement timed out"));},3000);
    ws.on("message",raw=>{
      const message=JSON.parse(raw);
      if(message.type==="state"&&!sent){sent=true;assert.ok(["ready","running"].includes(message.status));ws.send(JSON.stringify({type:"claim",station:"DOOR_BRACE",seq:1,epoch:0}));return;}
      if(message.type==="ack"){
        clearTimeout(timeout);try{assert.equal(message.status,"accepted");assert.equal(message.state.status,"running");assert.equal(message.state.stations.DOOR_BRACE,"1");ws.close();resolve();}catch(error){ws.close();reject(error);}
      }
    });
    ws.on("error",reject);
  });
});
