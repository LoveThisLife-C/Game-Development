import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { addPlayer, applyAction, authorize, createSession, expireIfNeeded, publicState } from "./game-engine.js";
import { publicContent } from "./game-content.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const publicDir = path.join(root, "prototype");
const act5PublicDir = path.join(publicDir, "act5");
const dataDir = process.env.BLACKOUT_DATA_DIR || path.join(root, "data");
const dataFile = path.join(dataDir, "sessions.json");
const port = Number(process.env.PORT || 4173);
const sessions = new Map();
const subscribers = new Map();

function restore() {
  try {
    const records = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    for (const item of records) {
      sessions.set(item.code, item);
    }
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("Session restore skipped:", error.message);
  }
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(dataDir, { recursive: true });
    const temporary = `${dataFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify([...sessions.values()], null, 2));
    fs.renameSync(temporary, dataFile);
  }, 40);
}

function sendJson(res, status, body) {
  if (res.headersSent || res.writableEnded) return;
  const value = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(value), "cache-control": "no-store" });
  res.end(value);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Request is too large");
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body was incomplete");
  }
}

function suppliedToken(req, url, body = {}) {
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  return auth || url.searchParams.get("token") || body.token || "";
}

function broadcast(session) {
  const clients = subscribers.get(session.code) || new Set();
  for (const client of [...clients]) {
    try {
      const payload = publicState(session, authorize(session, client.token));
      client.res.write(`id: ${session.revision}\nevent: state\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      clients.delete(client);
      try { client.res.end(); } catch {}
    }
  }
}

function contentType(file) {
  return ({ ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".webp":"image/webp", ".svg":"image/svg+xml", ".json":"application/json; charset=utf-8", ".mp4":"video/mp4", ".mp3":"audio/mpeg", ".wav":"audio/wav", ".ico":"image/x-icon" })[path.extname(file)] || "application/octet-stream";
}

function serveStatic(url, res) {
  const act5Page=url.pathname.match(/^\/act5\/(player\/\d{1,3}|screen)$/);
  const act5Requested=act5Page?(act5Page[1]==="screen"?"screen.html":"player.html"):decodeURIComponent(url.pathname.slice(1));
  const act5File=path.resolve(act5PublicDir,act5Requested);
  if((act5Page||url.pathname!=="/"&&fs.existsSync(act5File))&&act5File.startsWith(`${act5PublicDir}${path.sep}`)){
    return fs.stat(act5File,(error,stat)=>{
      if(error||!stat.isFile())return sendJson(res,404,{error:"Act 5 asset not found"});
      res.writeHead(200,{"content-type":contentType(act5File),"content-length":stat.size,"cache-control":act5File.endsWith(".html")?"no-store":"public, max-age=300"});
      fs.createReadStream(act5File).pipe(res);
    });
  }
  const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(publicDir, requested);
  if (!file.startsWith(`${publicDir}${path.sep}`) && file !== path.join(publicDir, "index.html")) return sendJson(res, 403, { error: "Forbidden" });
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(res, 404, { error: "Not found" });
    const liveUi=/\.(?:html|js|css)$/i.test(file);
    res.writeHead(200, { "content-type": contentType(file), "content-length": stat.size, "cache-control": liveUi ? "no-store" : "public, max-age=300" });
    fs.createReadStream(file).pipe(res);
  });
}

export function createHttpServer() {
  const act5Clients=new Map();
  const server=http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    try {
      if (url.pathname === "/api/health") return sendJson(res, 200, { ok: true, sessions: sessions.size });
      if (url.pathname === "/api/content") return sendJson(res, 200, publicContent());
      if (req.method === "POST" && url.pathname === "/api/sessions") {
        const body = await readJson(req);
        let session;
        do session = createSession({ playerCount: body.playerCount }); while (sessions.has(session.code));
        sessions.set(session.code, session); persist();
        return sendJson(res, 201, { code: session.code, facilitatorToken: session.facilitatorToken });
      }
      const match = url.pathname.match(/^\/api\/sessions\/([A-Z0-9]{6})(?:\/(join|state|events|action))?$/i);
      if (match) {
        const code = match[1].toUpperCase(), operation = match[2] || "state", session = sessions.get(code);
        if (!session) return sendJson(res, 404, { error: "Session not found" });
        if (operation === "join" && req.method === "POST") {
          const body = await readJson(req); const player = addPlayer(session, body); persist(); broadcast(session);
          return sendJson(res, 201, { code, playerToken: player.token, role: player.role, name: player.name });
        }
        if (operation === "state" && req.method === "GET") return sendJson(res, 200, publicState(session, authorize(session, suppliedToken(req, url))));
        if (operation === "events" && req.method === "GET") {
          const client = { token: suppliedToken(req, url), res };
          req.setTimeout(0);
          res.setTimeout(0);
          res.writeHead(200, { "content-type":"text/event-stream", "cache-control":"no-cache, no-transform", connection:"keep-alive", "x-accel-buffering":"no" });
          res.write(": connected\n\n");
          res.write(`event: state\ndata: ${JSON.stringify(publicState(session, authorize(session, client.token)))}\n\n`);
          if (!subscribers.has(code)) subscribers.set(code, new Set()); subscribers.get(code).add(client);
          const heartbeat = setInterval(() => {
            try { res.write(`: ping ${Date.now()}\n\n`); }
            catch { clearInterval(heartbeat); }
          }, 15000);
          req.on("close", () => {
            clearInterval(heartbeat);
            subscribers.get(code)?.delete(client);
          });
          return;
        }
        if (operation === "action" && req.method === "POST") {
          const body = await readJson(req), viewer = authorize(session, suppliedToken(req, url, body));
          if (viewer.kind === "public") return sendJson(res, 401, { error: "A valid role or facilitator token is required" });
          applyAction(session, viewer, body.type, body.payload); persist(); broadcast(session);broadcastAct5(session);
          return sendJson(res, 200, publicState(session, viewer));
        }
      }
      if (url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "API route not found" });
      serveStatic(url, res);
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Request failed" });
    }
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:8192});
  const act5Snapshot=(session,viewer)=>{
    const state=publicState(session,viewer);
    if(session.stage!==5||!state.cabinRun?.engine)throw new Error("Act 5 is not active");
    return {type:"state",epoch:0,revision:session.revision,...state.cabinRun.engine,localDevelopment:false,developerInput:false};
  };
  function broadcastAct5(session){
    for(const [ws,client] of act5Clients){
      if(client.session!==session||ws.readyState!==WebSocket.OPEN)continue;
      try{ws.send(JSON.stringify(act5Snapshot(session,client.viewer)));}catch{try{ws.close();}catch{}}
    }
  }
  server.on("upgrade",(req,socket,head)=>{
    let url;
    try{url=new URL(req.url,`http://${req.headers.host||"localhost"}`);}catch{socket.destroy();return;}
    if(url.pathname!=="/act5-ws"){socket.destroy();return;}
    const session=sessions.get(String(url.searchParams.get("session")||"").toUpperCase());
    const viewer=session?authorize(session,url.searchParams.get("token")||""):{kind:"public"};
    const requestedRole=url.searchParams.get("role");
    if(!session||session.stage!==5||!session.cabinRun?.engine||requestedRole==="player"&&viewer.kind!=="player"||requestedRole==="screen"&&!['public','player','facilitator'].includes(viewer.kind)){
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");return;
    }
    wss.handleUpgrade(req,socket,head,ws=>wss.emit("connection",ws,{session,viewer,role:requestedRole}));
  });
  wss.on("connection",(ws,client)=>{
    if(client.viewer.kind==="player"&&[...act5Clients.values()].some(other=>other.viewer.kind==="player"&&other.session===client.session&&other.viewer.role===client.viewer.role)){
      ws.close(4001,"Player already connected in another tab");return;
    }
    client.seq=0;client.receipts=new Map();act5Clients.set(ws,client);
    ws.send(JSON.stringify(act5Snapshot(client.session,client.viewer)));
    ws.on("message",raw=>{
      let msg;
      try{
        msg=JSON.parse(raw);
        if(client.role!=="player")throw Object.assign(new Error("Read-only cabin display"),{code:"READ_ONLY"});
        if(!Number.isSafeInteger(msg.seq)||msg.seq<1)throw Object.assign(new Error("Invalid action sequence"),{code:"INVALID_SEQUENCE"});
        if(msg.epoch!==0)throw Object.assign(new Error("Stale Act 5 session"),{code:"STALE_EPOCH"});
        if(msg.seq<=client.seq){const prior=client.receipts.get(msg.seq);if(prior){ws.send(JSON.stringify({...prior,duplicate:true}));return;}throw Object.assign(new Error("Old action sequence"),{code:"STALE_SEQUENCE"});}
        client.seq=msg.seq;
        applyAction(client.session,client.viewer,"ACT5_ACTION",{action:msg});persist();broadcast(client.session);
        const receipt={type:"ack",epoch:0,seq:msg.seq,status:"accepted",code:"APPLIED",message:"Action applied",state:act5Snapshot(client.session,client.viewer)};
        client.receipts.set(msg.seq,receipt);if(client.receipts.size>256)client.receipts.delete(client.receipts.keys().next().value);
        ws.send(JSON.stringify(receipt));broadcastAct5(client.session);
      }catch(error){
        const receipt={type:"ack",epoch:0,seq:Number.isSafeInteger(msg?.seq)?msg.seq:null,status:"rejected",code:error.code||"INVALID_ACTION",message:error.message||"Action rejected",state:act5Snapshot(client.session,client.viewer)};
        try{ws.send(JSON.stringify(receipt));}catch{}
      }
    });
    ws.on("close",()=>{
      act5Clients.delete(ws);
      if(client.viewer.kind==="player"&&client.session.stage===5&&client.session.stageStatus==="live"){
        try{applyAction(client.session,client.viewer,"ACT5_ACTION",{action:{type:"release"}});persist();broadcast(client.session);broadcastAct5(client.session);}catch{}
      }
    });
  });
  const act5PublishTimer=setInterval(()=>{
    for(const session of new Set([...act5Clients.values()].map(client=>client.session)))broadcastAct5(session);
  },250);
  act5PublishTimer.unref();
  server.on("close",()=>clearInterval(act5PublishTimer));
  return server;
}

restore();
setInterval(() => {
  for (const session of sessions.values()) if (expireIfNeeded(session)) { persist(); broadcast(session); }
}, 500).unref();

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  createHttpServer().listen(port, "0.0.0.0", () => console.log(`Blackout Ridge running at http://localhost:${port}`));
}

export const __sessions = sessions;
