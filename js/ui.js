const UI = {
  story: null,
  index: null,
  AUDIO_KEY: 'curiousCase.audio',

  init(story, index) {
    this.story = story;
    this.index = index;
    this.els = {
      title: document.getElementById('game-title'),
      board: document.getElementById('evidence-board'),
      backdrop: document.getElementById('board-backdrop'),
      journal: document.getElementById('journal-toggle'),
      journalCount: document.getElementById('journal-count'),
      close: document.getElementById('board-close'),
      path: document.getElementById('board-path'),
      rooms: document.getElementById('board-rooms'),
      clues: document.getElementById('board-clues'),
      log: document.getElementById('board-log'),
      progress: document.getElementById('progress'),
      audio: document.getElementById('audio-toggle'),
      toasts: document.getElementById('toast-region'),
      dialog: document.getElementById('continue-dialog')
    };

    this.els.board.inert = true;
    this.els.title.textContent = story.title;
    document.title = story.title;

    this.els.journal.addEventListener('click', () => this.toggleBoard());
    this.els.close.addEventListener('click', () => this.closeBoard());
    this.els.backdrop.addEventListener('click', () => this.closeBoard());
    this.els.board.addEventListener('keydown', (e) => this.trapBoardKeys(e));

    this.audio.init(this);
    this.renderBoard();
  },

  isBoardOpen() {
    return this.els.board.classList.contains('is-open');
  },

  toggleBoard() {
    if (this.isBoardOpen()) this.closeBoard();
    else this.openBoard();
  },

  openBoard() {
    this.renderBoard();
    const { board, backdrop, journal, close } = this.els;
    board.inert = false;
    backdrop.hidden = false;
    backdrop.getBoundingClientRect();
    board.classList.add('is-open');
    backdrop.classList.add('is-visible');
    journal.setAttribute('aria-expanded', 'true');
    journal.setAttribute('aria-label', 'Close the evidence board');
    close.focus({ preventScroll: true });
  },

  closeBoard() {
    const { board, backdrop, journal } = this.els;
    if (!this.isBoardOpen()) return;
    board.classList.remove('is-open');
    backdrop.classList.remove('is-visible');
    board.inert = true;
    journal.setAttribute('aria-expanded', 'false');
    journal.setAttribute('aria-label', 'Open the evidence board');
    setTimeout(() => { if (!this.isBoardOpen()) backdrop.hidden = true; }, 450);
    journal.focus({ preventScroll: true });
  },

  trapBoardKeys(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.closeBoard();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = [...this.els.board.querySelectorAll('button, [href], [tabindex]')].filter((el) => el.tabIndex >= 0);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  },

  renderBoard() {
    if (!this.story) return;
    const state = GameState.current;
    const ui = this.story.ui;
    const el = (tag, cls, text) => Interactions.el(tag, cls, text);

    this.els.path.textContent = ui.paths[state.chosenPath] || ui.paths.none;
    this.els.path.dataset.path = state.chosenPath || 'none';

    this.els.rooms.replaceChildren(...this.story.scenes.map((scene) => {
      const visited = state.visited.includes(scene.id);
      const li = el('li', 'board__room');
      li.classList.toggle('is-visited', visited);
      li.classList.toggle('is-current', state.scene === scene.id);
      li.textContent = visited ? scene.title : ui.unknownRoom;
      return li;
    }));

    const ids = Object.keys(state.collected).filter((id) => this.index.has(id));
    if (!ids.length) {
      this.els.clues.replaceChildren(el('li', 'board__empty', ui.emptyClues));
    } else {
      this.els.clues.replaceChildren(...ids.map((id) => {
        const item = this.index.get(id);
        const li = el('li', 'board__clue');
        if (item.image) {
          const img = el('img', 'board__thumb');
          img.src = item.image;
          img.alt = '';
          li.append(img);
        } else {
          const icon = el('span', 'board__icon', item.icon || '•');
          icon.setAttribute('aria-hidden', 'true');
          li.append(icon);
        }
        li.append(el('span', 'board__clue-label', item.boardLabel || item.label));
        return li;
      }));
    }

    if (!state.log.length) {
      this.els.log.replaceChildren(el('li', 'board__empty', ui.emptyLog));
    } else {
      this.els.log.replaceChildren(...state.log.map((entry) => el('li', 'board__entry', entry)));
    }

    this.els.journalCount.textContent = String(ids.length);
    this.els.journalCount.classList.toggle('is-empty', ids.length === 0);
  },

  pulseJournal() {
    const btn = this.els.journal;
    btn.classList.remove('is-pulsing');
    void btn.offsetWidth;
    btn.classList.add('is-pulsing');
  },

  renderProgress(sceneId) {
    const labels = this.story.ui.progressLabels;
    const state = GameState.current;
    const visitedSteps = new Set(
      this.story.scenes.filter((s) => state.visited.includes(s.id)).map((s) => s.step)
    );
    const currentStep = (this.story.scenes.find((s) => s.id === sceneId) || {}).step;

    this.els.progress.replaceChildren(...labels.map((label, step) => {
      const li = Interactions.el('li', 'progress__dot');
      const status = step === currentStep ? 'current' : visitedSteps.has(step) ? 'visited' : 'not yet visited';
      li.classList.toggle('is-visited', visitedSteps.has(step));
      li.classList.toggle('is-current', step === currentStep);
      li.setAttribute('aria-label', `${label}: ${status}`);
      if (step === currentStep) li.setAttribute('aria-current', 'step');
      return li;
    }));
  },

  announce(message) {
    const line = document.querySelector('.scene__status');
    if (line) line.textContent = message;
  },

  toast(message, variant = '') {
    if (!message) return;
    const t = Interactions.el('p', variant ? 'toast toast--' + variant : 'toast', message);
    this.els.toasts.append(t);
    setTimeout(() => t.classList.add('is-leaving'), 3200);
    setTimeout(() => t.remove(), 3700);
  },

  askContinue(sceneTitle) {
    const { dialog } = this.els;
    document.getElementById('continue-body').textContent =
      this.story.ui.continuePrompt.replace('{scene}', sceneTitle);

    return new Promise((resolve) => {
      const yes = document.getElementById('continue-yes');
      const no = document.getElementById('continue-no');
      const finish = (answer) => {
        yes.removeEventListener('click', onYes);
        no.removeEventListener('click', onNo);
        dialog.removeEventListener('cancel', onCancel);
        if (dialog.open) dialog.close();
        resolve(answer);
      };
      const onYes = () => finish(true);
      const onNo = () => finish(false);
      const onCancel = (e) => { e.preventDefault(); finish(true); };
      yes.addEventListener('click', onYes);
      no.addEventListener('click', onNo);
      dialog.addEventListener('cancel', onCancel);
      dialog.showModal();
      yes.focus();
    });
  },

  audio: {
    ui: null,
    on: false,
    ctx: null,
    master: null,
    MASTER_GAIN: 0.8,
    destinationConnected: false,
    buffers: {},
    failed: [],
    loadState: 'idle',
    loadPromise: null,
    sceneId: null,
    ambience: null,
    synth: null,
    noiseBuffer: null,
    promptBtn: null,
    log: [],

    get config() {
      return (this.ui.story && this.ui.story.audio) || {};
    },

    init(ui) {
      this.ui = ui;
      ui.els.audio.addEventListener('click', () => this.toggle());
      let pref = 'off';
      try { pref = localStorage.getItem(ui.AUDIO_KEY) || 'off'; } catch (err) {  }
      this.on = pref === 'on';
      this.refreshButtons();
      if (this.on) {

        const kick = (e) => {
          document.removeEventListener('pointerdown', kick);
          document.removeEventListener('keydown', kick);
          if (e.target.closest && e.target.closest('#audio-toggle, .sound-prompt')) return;
          if (this.on) this.start();
        };
        document.addEventListener('pointerdown', kick);
        document.addEventListener('keydown', kick);
      }
    },

    buildPrompt(cfg) {
      const btn = Interactions.el('button', 'sound-prompt');
      btn.type = 'button';
      btn.dataset.label = cfg.label;
      btn.dataset.onLabel = cfg.onLabel;
      btn.dataset.loadingLabel = cfg.loadingLabel;
      const icon = Interactions.el('span', 'sound-prompt__icon', '🔊');
      icon.setAttribute('aria-hidden', 'true');
      btn.append(icon, Interactions.el('span', 'sound-prompt__label'));
      btn.addEventListener('click', () => this.toggle());
      this.promptBtn = btn;
      this.refreshButtons();
      return btn;
    },

    refreshButtons() {
      const loading = this.on && this.loadState === 'loading';
      const state = loading ? 'loading' : this.on ? 'on' : 'off';
      const top = this.ui.els.audio;
      top.setAttribute('aria-pressed', String(this.on));
      top.setAttribute('aria-label', `Ambient sound: ${state}`);
      top.classList.toggle('is-on', this.on);
      top.classList.toggle('is-loading', loading);
      top.toggleAttribute('aria-busy', loading);

      const btn = this.promptBtn;
      if (!btn) return;
      btn.setAttribute('aria-pressed', String(this.on));
      btn.toggleAttribute('aria-busy', loading);
      btn.classList.toggle('is-on', this.on);
      btn.classList.toggle('is-loading', loading);
      btn.querySelector('.sound-prompt__label').textContent =
        loading ? btn.dataset.loadingLabel : this.on ? btn.dataset.onLabel : btn.dataset.label;
    },

    toggle() {
      this.on = !this.on;
      try { localStorage.setItem(this.ui.AUDIO_KEY, this.on ? 'on' : 'off'); } catch (err) {  }
      this.refreshButtons();
      if (this.on) this.start();
      else this.stop();
    },

    ensureContext() {
      if (this.ctx) return true;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
      this.destinationConnected = true;
      return true;
    },

    async start() {
      if (!this.ensureContext()) return;
      await this.ctx.resume();
      if (!this.on) return;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.MASTER_GAIN, now, 0.25);

      if (this.loadState !== 'ready') {
        await this.load();
        if (!this.on) return;
      }
      this.startAmbience(this.sceneId);
    },

    stop() {
      this.stopAmbience();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.15);
      setTimeout(() => { if (!this.on && this.ctx) this.ctx.suspend(); }, 700);
    },

    load() {
      if (this.loadPromise) return this.loadPromise;
      this.loadState = 'loading';
      this.refreshButtons();
      const files = this.config.files || {};
      this.loadPromise = Promise.all(Object.entries(files).map(async ([name, url]) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.arrayBuffer();
          if (!data.byteLength) throw new Error('empty file');
          this.buffers[name] = await this.ctx.decodeAudioData(data);
        } catch (err) {
          this.failed.push({ name, url, reason: err.message || String(err) });
          console.warn('[audio] ' + url + ' failed (' + (err.message || err) + '); using the synthesized fallback for ' + name + '.');
        }
      })).then(() => {
        this.loadState = 'ready';
        this.refreshButtons();
      });
      return this.loadPromise;
    },

    record(cue, source) {
      this.log.push({ cue, source, scene: this.sceneId, t: Math.round(performance.now()) });
      if (this.log.length > 200) this.log.shift();
    },

    setScene(sceneId) {
      this.sceneId = sceneId;
      if (!this.on || this.loadState !== 'ready' || !this.ctx) {
        this.stopAmbience();
        return;
      }
      this.startAmbience(sceneId);
    },

    startAmbience(sceneId) {
      this.stopAmbience();
      const cfg = (this.config.ambience || {})[sceneId];
      if (!cfg || !this.ctx) {
        this.record('ambience:none', 'none');
        return;
      }
      const buffer = this.buffers[cfg.file];
      if (!buffer) {
        this.startSynthAmbience(cfg.file === 'clock');
        this.record(`ambience:${cfg.file}`, 'synth');
        return;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = Boolean(cfg.loop);
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(cfg.gain, now + 0.4);
      src.connect(gain).connect(this.master);
      src.start();
      const entry = { sceneId, file: cfg.file, src, gain };
      src.onended = () => { if (this.ambience === entry) this.ambience = null; };
      this.ambience = entry;
      this.record(`ambience:${cfg.file}`, 'file');
    },

    stopAmbience() {
      if (this.ambience && this.ctx) {
        const { src, gain } = this.ambience;
        const now = this.ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.25);
        try { src.stop(now + 0.3); } catch (err) {  }
        this.record(`ambience-stop:${this.ambience.file}`, 'file');
      }
      this.ambience = null;
      this.stopSynthAmbience();
    },

    play(name, objectId) {
      if (!this.on || !this.ctx || this.ctx.state !== 'running' || this.loadState !== 'ready') return;
      const effects = this.config.effects || {};
      const cfg = (objectId && effects[objectId]) || effects[name];
      if (!cfg) return;
      const label = objectId && effects[objectId] ? objectId : name;
      const buffer = cfg.file && this.buffers[cfg.file];
      if (!buffer) {
        this.synthEffect(name === 'wrongOrder' ? 'buzz' : 'blip', cfg.gain);
        this.record(`effect:${label}`, 'synth');
        return;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = cfg.gain;
      src.connect(gain).connect(this.master);
      if (cfg.duration) {

        const end = this.ctx.currentTime + cfg.duration;
        gain.gain.setValueAtTime(cfg.gain, end - 0.2);
        gain.gain.linearRampToValueAtTime(0, end);
        src.start(0, 0, cfg.duration);
      } else {
        src.start();
      }
      this.record(`effect:${label}`, `file:${cfg.file}`);
    },

    getNoiseBuffer() {
      if (this.noiseBuffer) return this.noiseBuffer;
      const ctx = this.ctx;
      const length = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      }
      this.noiseBuffer = buffer;
      return buffer;
    },

    startSynthAmbience(withTick) {
      this.stopSynthAmbience();
      const ctx = this.ctx;
      const group = ctx.createGain();
      group.gain.value = 1;
      group.connect(this.master);
      const sources = [];

      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer();
      noise.loop = true;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 420;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.35;
      noise.connect(lowpass).connect(noiseGain).connect(group);
      noise.start();
      sources.push(noise);

      [55, 110].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.025 : 0.01;
        osc.connect(g).connect(group);
        osc.start();
        sources.push(osc);
      });

      let tickTimer = null;
      if (withTick) {
        let tock = false;
        tickTimer = setInterval(() => {
          this.synthTick(group, tock ? 2300 : 2900);
          tock = !tock;
        }, 1000);
      }
      this.synth = { group, sources, tickTimer };
    },

    stopSynthAmbience() {
      if (!this.synth) return;
      const { group, sources, tickTimer } = this.synth;
      clearInterval(tickTimer);
      const now = this.ctx.currentTime;
      group.gain.setTargetAtTime(0, now, 0.08);
      sources.forEach((s) => { try { s.stop(now + 0.4); } catch (err) {  } });
      this.synth = null;
    },

    synthTick(destination, freq) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer();
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = freq;
      band.Q.value = 9;
      const env = ctx.createGain();
      const t = ctx.currentTime;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(band).connect(env).connect(destination);
      src.start(t, Math.random() * 2, 0.06);
    },

    synthEffect(kind, gainValue) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      if (kind === 'buzz') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, t);
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 700;
        osc.connect(lowpass).connect(env);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(620, t + 0.12);
        osc.connect(env);
      }
      const length = kind === 'buzz' ? 0.32 : 0.14;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(gainValue, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t + length);
      env.connect(this.master);
      osc.start(t);
      osc.stop(t + length + 0.05);
    }
  }
};
