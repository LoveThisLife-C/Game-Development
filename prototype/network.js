function parseJson(text, fallbackError) {
  if (!text || !String(text).trim()) throw new Error(fallbackError);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(fallbackError);
  }
}

export class GameClient {
  constructor({ code = "", token = "" } = {}) {
    this.code = code.toUpperCase();
    this.token = token;
    this.listeners = new Set();
    this.state = null;
    this.events = null;
    this.pollTimer = null;
  }

  async request(path, options = {}) {
    const headers = { ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...options.headers };
    if (options.body && !headers["content-type"]) headers["content-type"] = "application/json";
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    const body = text.trim() ? parseJson(text, response.ok ? "Station returned an incomplete update. Retry the last action." : `Request failed (${response.status})`) : {};
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }

  async create(playerCount) {
    return this.request("/api/sessions", { method: "POST", body: JSON.stringify({ playerCount }) });
  }

  async join(name, role) {
    return this.request(`/api/sessions/${this.code}/join`, { method: "POST", body: JSON.stringify({ name, role }) });
  }

  async load() {
    this.state = await this.request(`/api/sessions/${this.code}/state`);
    this.emit(); return this.state;
  }

  connect() {
    this.events?.close();
    clearTimeout(this.pollTimer);
    // Short polling avoids the browser's six persistent HTTP/1 connection cap.
    // A facilitator, shared screen and four player tabs otherwise leave the last
    // terminals waiting for a connection and make assignments appear sequential.
    const poll=async()=>{
      try{
        const next=await this.request(`/api/sessions/${this.code}/state`);
        document.body.classList.remove("connection-lost");
        if(!this.state||next.revision!==this.state.revision){this.state=next;this.emit();}
      }catch{document.body.classList.add("connection-lost");}
      this.pollTimer=setTimeout(poll,600);
    };
    this.pollTimer=setTimeout(poll,250);
  }

  async action(type, payload = {}) {
    this.state = await this.request(`/api/sessions/${this.code}/action`, { method: "POST", body: JSON.stringify({ type, payload }) });
    this.emit(); return this.state;
  }

  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit() { this.listeners.forEach(listener => listener(this.state)); }
}

export async function getContent() {
  const response = await fetch("/api/content");
  const text = await response.text();
  if (!response.ok) throw new Error("Game content unavailable");
  return parseJson(text, "Game content unavailable");
}
