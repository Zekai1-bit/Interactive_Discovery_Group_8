const SceneManager = {
  STORY_URL: 'assets/data/story.json',
  story: null,
  scenes: new Map(),
  index: new Map(),
  container: null,
  overlay: null,
  transitioning: false,
  ctx: null,

  async init() {
    GameState.load();
    this.container = document.getElementById('scene-container');
    this.overlay = document.getElementById('transition-overlay');

    try {
      if (location.protocol === 'file:') throw new Error('file-protocol');
      const res = await fetch(this.STORY_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.story = await res.json();
    } catch (err) {
      this.showRunHint(err);
      return;
    }

    this.story.scenes.forEach((scene) => this.scenes.set(scene.id, scene));
    this.buildIndex();
    UI.init(this.story, this.index);

    if (!this.scenes.has(GameState.current.scene)) GameState.current.scene = 'entry';

    if (GameState.isReturning()) {
      const resume = await UI.askContinue(this.scenes.get(GameState.current.scene).title);
      if (!resume) GameState.reset();
    }

    this.render(GameState.current.scene);
  },

  buildIndex() {
    this.story.scenes.forEach((scene) => {
      scene.objects.forEach((obj) => {
        this.index.set(obj.id, { ...obj, sceneId: scene.id });
        (obj.steps || []).forEach((step) => {
          this.index.set(step.id, { ...step, icon: obj.icon, sceneId: scene.id });
        });
      });
    });
  },

  evaluateCondition(condition) {

    if (!condition) return true;
    const [type, value] = condition.split(':');
    const state = GameState.current;
    if (type === 'collected') return GameState.hasCollected(value);
    if (type === 'visited') return state.visited.includes(value);
    if (type === 'path') return state.chosenPath === value;
    return false;
  },

  requiresMet(requires) {
    if (!requires) return true;
    const ids = Array.isArray(requires) ? requires : [requires];
    return ids.every((id) => GameState.isRevealed(id) || GameState.hasCollected(id));
  },

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, Interactions.reducedMotion ? Math.min(ms, 120) : ms));
  },

  async go(targetId, exit = {}) {
    if (this.transitioning || !this.scenes.has(targetId)) return;
    this.transitioning = true;

    this.container.classList.add('is-leaving');
    await this.wait(400);
    this.overlay.classList.add('is-active');
    Interactions.cancelAll();

    UI.audio.play('sceneChange');
    if (exit.action === 'reset') GameState.reset();
    if (exit.setPath) GameState.setPath(exit.setPath);

    await this.wait(200);
    this.render(targetId);
    this.overlay.classList.remove('is-active');
    this.container.classList.remove('is-leaving');
    window.scrollTo({ top: 0 });
    const title = this.container.querySelector('.scene__title');
    if (title) title.focus({ preventScroll: true });
    await this.wait(400);

    this.transitioning = false;
  },

  render(sceneId) {
    const scene = this.scenes.get(sceneId) || this.scenes.get('entry');
    Interactions.cancelAll();
    GameState.visit(scene.id);

    this.story.scenes.forEach((s) => document.body.classList.remove(s.theme));
    document.body.classList.add(scene.theme);

    const el = (tag, cls, text) => Interactions.el(tag, cls, text);
    const article = el('article', `scene scene--${scene.id}`);
    article.setAttribute('aria-labelledby', 'scene-title');

    const header = el('header', 'scene__header');
    const title = el('h1', 'scene__title', scene.title);
    title.id = 'scene-title';
    title.tabIndex = -1;
    header.append(el('p', 'scene__kicker', scene.kicker), title);

    const narration = el('p', 'scene__narration');
    const stage = el('section', 'scene__stage');
    stage.setAttribute('aria-label', 'Things to examine');
    const status = el('p', 'scene__status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    stage.append(status);
    const exits = el('nav', 'scene__exits');
    exits.setAttribute('aria-label', 'Where to go next');

    const side = el('div', 'scene__side');
    const intro = el('div', 'scene__intro');
    if (scene.image) intro.append(this.buildFigure('scene-hero', scene, scene.id !== this.story.scenes[0].id));
    intro.append(header, narration);
    const prompt = this.story.audio && this.story.audio.prompt;
    if (prompt && prompt.scene === scene.id) intro.append(UI.audio.buildPrompt(prompt));
    if (scene.motif) intro.append(this.buildFigure('scene-motif', scene.motif, true));
    side.append(intro, exits);
    article.append(side, stage);
    this.container.replaceChildren(article);
    UI.audio.setScene(scene.id);

    this.ctx = { scene, sceneEl: article, onChange: () => this.refresh() };

    scene.objects.forEach((obj) => {
      const card = Interactions.build(obj, this.ctx);
      if (obj.requires) {
        card.dataset.requires = 'true';
        if (!this.requiresMet(obj.requires)) this.lockCard(card, obj);
      }
      if (obj.delay && !GameState.isRevealed(obj.id)) {
        card.hidden = true;
        card.dataset.delayed = 'true';
        Interactions.schedule(() => {
          delete card.dataset.delayed;
          this.showCard(card);
        }, obj.delay);
      }
      stage.append(card);
      if (!card.hidden && card._onShow) card._onShow();
    });

    scene.exits.forEach((exit) => exits.append(this.buildExit(exit)));

    const pathText = (scene.narrationByPath && scene.narrationByPath[GameState.current.chosenPath]) || '';
    Interactions.typewrite(narration, scene.narration + pathText);

    this.refresh();
    UI.renderProgress(scene.id);
    UI.renderBoard();
  },

  buildFigure(className, data, lazy) {
    const fig = Interactions.el('figure', className);
    const img = Interactions.el('img');
    img.src = data.image;
    img.alt = data.alt || '';
    img.decoding = 'async';
    if (lazy) img.loading = 'lazy';
    fig.append(img);

    const cap = Interactions.el('figcaption', `${className}__caption`);
    if (data.caption) cap.append(Interactions.el('span', `${className}__note`, data.caption), ' · ');
    if (data.credit) {
      cap.append(`Photo: ${data.credit.photographer} / `);
      const link = Interactions.el('a', '', 'Pexels');
      link.href = data.credit.url;
      link.target = '_blank';
      link.rel = 'noopener';
      cap.append(link);
    }
    fig.append(cap);
    return fig;
  },

  lockCard(card, obj) {
    if (!obj.lockedText) {
      card.hidden = true;
      return;
    }
    card.classList.add('is-waiting');
    card.setAttribute('aria-disabled', 'true');
    [...card.children].forEach((child) => { child.hidden = true; });
    const note = Interactions.el('p', 'obj__locked', obj.lockedText);
    card.prepend(note);
  },

  showCard(card) {
    if (card.classList.contains('is-waiting')) {
      card.classList.remove('is-waiting');
      card.removeAttribute('aria-disabled');
      card.querySelector('.obj__locked').remove();
      [...card.children].forEach((child) => {
        if (!child.classList.contains('obj__reveal') || card.classList.contains('is-revealed')) child.hidden = false;
      });
      card.classList.add('is-appearing', 'is-new');
      const openLabel = card.querySelector('.obj__label');
      UI.announce((openLabel ? openLabel.textContent : 'Something') + ' is now open.');
      if (card._onShow) card._onShow();
      return;
    }
    if (!card.hidden) return;
    card.hidden = false;
    card.classList.add('is-appearing');

    if (!card.classList.contains('is-revealed') && card.dataset.id !== 'timeline') {
      card.classList.add('is-new');
      const newLabel = card.querySelector('.obj__label');
      UI.announce('New: ' + (newLabel ? newLabel.textContent : 'something') + ' appeared.');
    }
    if (card._onShow) card._onShow();
  },

  buildExit(exit) {
    const btn = Interactions.el('button', 'exit');
    btn.type = 'button';
    btn.append(Interactions.el('span', 'exit__label', exit.label));
    const arrow = Interactions.el('span', 'exit__arrow', '→');
    arrow.setAttribute('aria-hidden', 'true');
    btn.append(arrow);

    const hint = Interactions.el('span', 'exit__hint');
    hint.hidden = true;
    btn.append(hint);
    btn._exit = exit;
    if (exit.action === 'reset') btn.classList.add('exit--reset');

    if (exit.delay) {
      btn.hidden = true;
      btn.dataset.delayed = 'true';
      Interactions.schedule(() => {
        delete btn.dataset.delayed;
        btn.classList.add('is-appearing');
        this.refresh();
      }, exit.delay);
    }

    btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-disabled') === 'true') {
        btn.classList.remove('is-denied');
        void btn.offsetWidth;
        btn.classList.add('is-denied');
        UI.toast(exit.lockedHint, 'locked');
        return;
      }
      this.go(exit.target, exit);
    });
    return btn;
  },

  refresh() {
    if (!this.ctx) return;
    const article = this.ctx.sceneEl;

    article.querySelectorAll('.obj[data-requires]').forEach((card) => {
      const obj = this.ctx.scene.objects.find((o) => o.id === card.dataset.id);
      const waiting = card.hidden || card.classList.contains('is-waiting');
      if (waiting && !card.dataset.delayed && this.requiresMet(obj.requires)) this.showCard(card);
    });

    article.querySelectorAll('.exit').forEach((btn) => {
      const exit = btn._exit;
      const unlocked = Boolean(this.evaluateCondition(exit.condition));
      btn.classList.toggle('is-locked', !unlocked);
      btn.setAttribute('aria-disabled', String(!unlocked));
      const hint = btn.querySelector('.exit__hint');
      hint.textContent = !unlocked && exit.lockedHint ? `Locked: ${exit.lockedHint}` : '';
      hint.hidden = unlocked || !exit.lockedHint;
      if (!btn.dataset.delayed) btn.hidden = Boolean(exit.hideWhenLocked && !unlocked);
    });
  },

  showRunHint(err) {
    const card = Interactions.el('section', 'run-hint');
    card.append(
      Interactions.el('h1', 'run-hint__title', 'The frame needs a tiny local server'),
      Interactions.el('p', 'run-hint__body', 'This page loads its story from assets/data/story.json, and browsers block that when a file is opened directly. From the project folder, run:'),
      Interactions.el('code', 'run-hint__code', 'python3 -m http.server 8000'),
      Interactions.el('p', 'run-hint__body', 'Then open http://localhost:8000 in your browser.')
    );
    if (err && err.message !== 'file-protocol') {
      card.append(Interactions.el('p', 'run-hint__error', `Details: ${err.message}`));
    }
    this.container.replaceChildren(card);
  }
};

document.addEventListener('DOMContentLoaded', () => SceneManager.init());
