class StationAudio {
  constructor() {
    this.enabled = false;
    this.context = null;
    this.master = null;
    this.nodes = [];
    this.recording = null;
    this.transmissionQueue = [];
    this.playedTransmissions = new Set();
  }

  async toggle() {
    if (this.enabled) return this.stop();
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    this.context ||= new AudioContext();
    await this.context.resume();
    this.master = this.context.createGain();
    this.master.gain.setValueAtTime(0.0001, this.context.currentTime);
    this.master.gain.exponentialRampToValueAtTime(0.045, this.context.currentTime + 1.4);
    this.master.connect(this.context.destination);

    const hum = this.context.createOscillator();
    const humGain = this.context.createGain();
    hum.type = "sine"; hum.frequency.value = 43; humGain.gain.value = 0.38;
    hum.connect(humGain).connect(this.master); hum.start();

    const buffer = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (0.4 + Math.sin(i / 29000) * 0.25);
    const wind = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const windGain = this.context.createGain();
    wind.buffer = buffer; wind.loop = true; filter.type = "bandpass"; filter.frequency.value = 310; filter.Q.value = 0.65; windGain.gain.value = 0.2;
    wind.connect(filter).connect(windGain).connect(this.master); wind.start();
    this.nodes = [hum, wind]; this.enabled = true; this.cue("confirm");
    return true;
  }

  stop() {
    if (!this.master) return false;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    const nodes = this.nodes;
    window.setTimeout(() => nodes.forEach(node => { try { node.stop(); } catch {} }), 420);
    this.nodes = []; this.enabled = false; this.master = null;
    if (this.recording) { this.recording.pause(); this.recording = null; }
    this.transmissionQueue = [];
    return false;
  }

  playTransmission(key, source) {
    if (!this.enabled || !source || this.playedTransmissions.has(key)) return;
    this.playedTransmissions.add(key);
    this.transmissionQueue.push({key,source});
    this.playNextTransmission();
  }

  playNextTransmission() {
    if (!this.enabled || this.recording || !this.transmissionQueue.length) return;
    const {key,source} = this.transmissionQueue.shift();
    const recording = new Audio(source);
    recording.volume = 0.52;
    recording.addEventListener("ended", () => {
      if (this.recording === recording) this.recording = null;
      this.playNextTransmission();
    }, { once: true });
    recording.play().catch(() => {
      this.playedTransmissions.delete(key);
      if (this.recording === recording) this.recording = null;
      this.playNextTransmission();
    });
    this.recording = recording;
  }

  sync(state, view) {
    if (!this.enabled || !state || (view !== "shared" && ![1,3].includes(state.stage))) return;
    if (state.stage === 2) {
      for (const item of state.repairRun?.traffic||[]) {
        if (item.audio) this.playTransmission(`${state.code}:2:${item.ref}`, item.audio);
      }
      return;
    }
    const signal = state.signalTransmission;
    if (signal?.audio) this.playTransmission(`${state.code}:${state.stage}:${signal.id || signal.source}`, signal.audio);
  }

  cue(type = "confirm") {
    if (!this.enabled || !this.context || !this.master) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type === "error" ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(type === "commit" ? 92 : type === "error" ? 148 : 620, now);
    if (type === "commit") osc.frequency.exponentialRampToValueAtTime(46, now + 0.55);
    gain.gain.setValueAtTime(type === "commit" ? 0.16 : 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === "commit" ? 0.58 : 0.16));
    osc.connect(gain).connect(this.master); osc.start(now); osc.stop(now + (type === "commit" ? 0.6 : 0.18));
  }

  mechanical(type = "switch") {
    if (!this.enabled || !this.context || !this.master) return;
    const now = this.context.currentTime;
    const profiles = {
      transfer: [54, 31, 0.85], key: [880, 410, 0.16], hatch: [118, 43, 0.72],
      lid: [92, 38, 0.5], clamp: [240, 72, 0.3], fill: [360, 190, 0.4],
      vent: [220, 80, 0.48], test: [720, 520, 0.34], shaker: [145, 92, 0.2],
      purge: [78, 29, 0.95], arrival: [420, 155, 0.72], mask: [610, 280, 0.22],
      red: [190, 95, 0.28], white: [510, 255, 0.35], blue: [340, 170, 0.42],
      amber: [760, 380, 0.3], green: [260, 65, 0.68], switch: [620, 310, 0.14]
    };
    const [start, end, duration] = profiles[type] || profiles.switch;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = ["purge", "hatch", "lid", "transfer"].includes(type) ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(start, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
    gain.gain.setValueAtTime(["purge", "transfer"].includes(type) ? 0.19 : 0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master); osc.start(now); osc.stop(now + duration);
  }
}

export const stationAudio = new StationAudio();
