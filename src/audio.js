const CALL_FILES = ['seal-wawa.mp3'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class GameAudio {
  constructor() {
    this.context = null;
    this.muted = false;
    this.paused = false;
    this._disposed = false;
    this._loadState = 'locked';
    this._loadPromise = null;
    this._buffers = [];
    this._active = new Set();
    this._lastCallAt = -Infinity;
    this._callIndex = 0;
  }

  get status() {
    if (this._disposed) return 'disposed';
    if (this.paused) return 'paused';
    if (this.muted) return 'muted';
    return this._loadState;
  }

  async unlock() {
    if (this._disposed) return false;
    if (!this.context) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) {
        this._loadState = 'unavailable';
        return false;
      }
      try {
        this.context = new AudioContextClass();
        this._master = this.context.createGain();
        this._master.gain.value = this.muted || this.paused ? 0 : 0.52;
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 18;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.006;
        compressor.release.value = 0.2;
        this._master.connect(compressor);
        compressor.connect(this.context.destination);
        this._compressor = compressor;
      } catch {
        this._loadState = 'unavailable';
        return false;
      }
    }

    // Call resume before awaiting downloads so browsers retain the user gesture.
    const resumed = !this.paused && this.context.state !== 'running'
      ? this.context.resume().catch(() => {})
      : Promise.resolve();
    if (!this._loadPromise) {
      this._loadState = 'loading';
      const base = import.meta.env?.BASE_URL ?? '/';
      this._abort = new AbortController();
      this._loadPromise = Promise.allSettled(CALL_FILES.map(async (file) => {
        const response = await fetch(`${base}audio/${file}`, { signal: this._abort.signal });
        if (!response.ok) throw new Error(`Audio response ${response.status}`);
        return this.context.decodeAudioData(await response.arrayBuffer());
      })).then((results) => {
        if (this._disposed) return;
        this._buffers = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
        this._loadState = this._buffers.length === CALL_FILES.length
          ? 'ready' : this._buffers.length ? 'partial' : 'unavailable';
      });
    }
    await Promise.all([resumed, this._loadPromise]);
    return !this._disposed && this._buffers.length > 0;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this._updateMaster();
    if (this.muted) this._stopAll();
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this._updateMaster();
    if (this.paused) {
      this._stopAll();
      if (this.context?.state === 'running') this.context.suspend().catch(() => {});
    } else if (this.context?.state === 'suspended' && !this._disposed) {
      this.context.resume().catch(() => {});
    }
  }

  call({ age = '\u5e7c\u5e74', x = 0, species = '' } = {}) {
    if (!this._canPlay() || !this._buffers.length) return false;
    const now = this.context.currentTime;
    if (now - this._lastCallAt < 0.42) return false;
    if ([...this._active].filter((voice) => voice.kind === 'call').length >= 2) return false;
    this._lastCallAt = now;

    // The user's chosen 15-17 s Yantai excerpt keeps its original pitch and cadence.
    void species;
    void age;
    const buffer = this._buffers[this._callIndex++ % this._buffers.length];
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    const pan = Number.isFinite(Number(x)) ? clamp(Number(x), -1, 1) * 0.6 : 0;
    this._voice(source, buffer.duration / source.playbackRate.value, 0.82, pan, 'call');
    return true;
  }

  splash(strength = 1) {
    if (!this._canPlay()) return;
    const value = Number.isFinite(Number(strength)) ? clamp(Number(strength), 0.2, 2) : 1;
    this._noise(0.28 + value * 0.08, 1100, 180, 0.18 * value);
    this._tone(135, 62, 0.16, 0.075 * value);
  }

  throwFish() {
    if (!this._canPlay()) return;
    this._noise(0.17, 800, 2100, 0.035);
  }

  eat() {
    if (!this._canPlay()) return;
    this._tone(240, 85, 0.09, 0.09);
    this._noise(0.07, 800, 320, 0.025);
  }

  celebrate() {
    if (!this._canPlay()) return;
    [659.25, 783.99, 1046.5].forEach((frequency, index) => {
      this._tone(frequency, frequency * 1.005, 0.38, 0.042, index * 0.13);
    });
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._abort?.abort();
    this._stopAll();
    this._buffers.length = 0;
    this._noiseBuffer = null;
    this._master?.disconnect();
    this._compressor?.disconnect();
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
  }

  _canPlay() {
    return !this._disposed && !this.muted && !this.paused && this.context?.state === 'running';
  }

  _updateMaster() {
    if (!this._master || this._disposed) return;
    const now = this.context.currentTime;
    this._master.gain.cancelScheduledValues(now);
    this._master.gain.setTargetAtTime(this.muted || this.paused ? 0 : 0.52, now, 0.015);
  }

  _voice(source, duration, volume, pan = 0, kind = 'effect', delay = 0, filters = []) {
    const now = this.context.currentTime + delay;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.025, duration * 0.2));
    // Keep the complete selected phrase audible, including its final "wa".
    const fadeStart = kind === 'call' ? Math.max(0.025, duration - 0.025) : Math.max(0.025, duration * 0.55);
    gain.gain.setValueAtTime(volume, now + fadeStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    let tail = source;
    for (const filter of filters) {
      tail.connect(filter);
      tail = filter;
    }
    tail.connect(gain);
    const nodes = [source, ...filters, gain];
    if (this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(this._master);
      nodes.push(panner);
    } else {
      gain.connect(this._master);
    }
    const voice = { source, nodes, kind };
    this._active.add(voice);
    source.onended = () => {
      this._active.delete(voice);
      nodes.forEach((node) => node.disconnect());
    };
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  _noise(duration, from, to, volume) {
    if (!this._noiseBuffer) {
      const size = this.context.sampleRate;
      this._noiseBuffer = this.context.createBuffer(1, size, size);
      const data = this._noiseBuffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < data.length; i++) {
        previous = (previous + (Math.random() * 2 - 1) * 0.06) / 1.04;
        data[i] = previous * 3;
      }
    }
    const source = this.context.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(from, this.context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(to, this.context.currentTime + duration);
    this._voice(source, duration, volume, 0, 'effect', 0, [filter]);
  }

  _tone(from, to, duration, volume, delay = 0) {
    const source = this.context.createOscillator();
    source.type = 'sine';
    const now = this.context.currentTime + delay;
    source.frequency.setValueAtTime(from, now);
    source.frequency.exponentialRampToValueAtTime(to, now + duration);
    this._voice(source, duration, volume, 0, 'effect', delay);
  }

  _stopAll() {
    for (const voice of [...this._active]) {
      try { voice.source.stop(); } catch { /* Source may have ended just before pause. */ }
      voice.nodes.forEach((node) => node.disconnect());
    }
    this._active.clear();
    this._lastCallAt = -Infinity;
  }
}
