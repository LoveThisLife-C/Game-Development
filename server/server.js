import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addPlayer, applyAction, authorize, createSession, expireIfNeeded, publicState } from "./game-engine.js";
import { publicContent } from "./game-content.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const publicDir = path.join(root, "prototype");
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
  return ({ ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".webp":"image/webp", ".svg":"image/svg+xml", ".json":"application/json; charset=utf-8", ".mp4":"video/mp4", ".wav":"audio/wav", ".ico":"image/x-icon" })[path.extname(file)] || "application/octet-stream";
}

function serveStatic(url, res) {
  const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(publicDir, requested);
  if (!file.startsWith(`${publicDir}${path.sep}`) && file !== path.join(publicDir, "index.html")) return sendJson(res, 403, { error: "Forbidden" });
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(res, 404, { error: "Not found" });
    res.writeHead(200, { "content-type": contentType(file), "content-length": stat.size, "cache-control": file.endsWith(".html") ? "no-store" : "public, max-age=300" });
    fs.createReadStream(file).pipe(res);
  });
}

export function createHttpServer() {
  return http.createServer(async (req, res) => {
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
          applyAction(session, viewer, body.type, body.payload); persist(); broadcast(session);
          return sendJson(res, 200, publicState(session, viewer));
        }
      }
      if (url.pathname.startsWith("/api/")) return sendJson(res, 404, { error: "API route not found" });
      serveStatic(url, res);
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Request failed" });
    }
  });
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
