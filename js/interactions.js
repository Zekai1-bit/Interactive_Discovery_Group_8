const Interactions = {
  timers: new Set(),

  get reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  schedule(fn, ms) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  },

  cancelAll() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  },

  el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  },

  figure(src, alt, className = 'obj__figure') {
    const fig = this.el('figure', className);
    const img = this.el('img');
    img.src = src;
    img.alt = alt || '';
    img.decoding = 'async';
    fig.append(img);
    return fig;
  },

  typewrite(target, text, { speed = 40 } = {}) {
    target.textContent = '';
    target.classList.remove('is-typed');
    target.classList.add('typewriter', 'is-typing');

    const srText = this.el('span', 'visually-hidden', text);
    const visible = this.el('span', 'typewriter__text');
    const cursor = this.el('span', 'typewriter__cursor');
    visible.setAttribute('aria-hidden', 'true');
    cursor.setAttribute('aria-hidden', 'true');
    target.append(srText, visible, cursor);
    target.tabIndex = 0;
    target.title = 'Click or press Space to skip';

    let i = 0;
    let timer = null;
    let finished = false;
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      this.timers.delete(timer);
      visible.textContent = text;
      cursor.remove();
      target.classList.remove('is-typing');
      target.classList.add('is-typed');
      target.removeAttribute('title');
      target.removeAttribute('tabindex');
      target.removeEventListener('click', finish);
      target.removeEventListener('keydown', onKey);
      resolveDone();
    };

    const onKey = (e) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) finish();
      }
    };

    const tick = () => {
      if (finished) return;
      i += 1;
      visible.textContent = text.slice(0, i);
      if (i >= text.length) {
        finish();
        return;
      }

      const ch = text[i - 1];
      const pause = '.!?'.includes(ch) ? speed * 7 : ',;:'.includes(ch) ? speed * 3 : speed;
      timer = this.schedule(tick, pause);
    };

    target.addEventListener('click', finish);
    target.addEventListener('keydown', onKey);

    if (this.reducedMotion) finish();
    else timer = this.schedule(tick, speed);

    return { done, skip: finish };
  },

  build(obj, ctx) {
    const builder = this.builders[obj.type] || this.builders['click-reveal'];
    const card = this.el('article', `obj obj--${obj.type}`);
    card.dataset.id = obj.id;
    if (obj.zone) card.classList.add(`obj--zone-${obj.zone}`);
    builder.call(this, obj, card, ctx);
    return card;
  },

  header(obj) {
    const frag = document.createDocumentFragment();
    if (obj.icon) {
      const icon = this.el('span', 'obj__icon', obj.icon);
      icon.setAttribute('aria-hidden', 'true');
      frag.append(icon);
    }
    frag.append(this.el('span', 'obj__label', obj.label));
    if (obj.hint) frag.append(this.el('span', 'obj__hint', obj.hint));
    return frag;
  },

  head(obj) {
    const head = this.el('div', 'obj__head');
    head.append(this.header(obj));
    return head;
  },

  revealPanel(obj) {
    const panel = this.el('div', 'obj__reveal');
    panel.hidden = true;
    if (obj.image) panel.append(this.figure(obj.image, obj.alt));
    panel.append(this.el('p', 'obj__text', obj.reveal));
    return panel;
  },

  reveal(obj, card, ctx, { silent = false } = {}) {
    const panel = card.querySelector('.obj__reveal');
    if (panel) panel.hidden = false;
    card.classList.add('is-revealed');
    card.classList.remove('is-new');
    if (!silent) card.classList.add('is-revealing');
    if (obj.sceneClass) ctx.sceneEl.classList.add(obj.sceneClass);

    if (silent) return;
    GameState.reveal(obj.id);
    UI.audio.play('reveal', obj.id);
    if (obj.collectible) {
      const source = card.querySelector('.obj__reveal .obj__figure') || card.querySelector('.obj__icon') || card;
      this.collect(obj, source);
    }
    ctx.onChange();
  },

  collect(item, sourceEl) {
    if (!GameState.collect(item.id, item.collectMessage)) return;
    GameState.reveal(item.id);
    UI.audio.play('collect');
    this.flyToBoard(sourceEl);
    UI.toast(item.collectMessage || `Added to evidence: ${item.boardLabel || item.label}`);
    UI.renderBoard();
  },

  flyToBoard(sourceEl) {
    const target = document.getElementById('journal-toggle');
    if (!sourceEl || !target || this.reducedMotion) {
      UI.pulseJournal();
      return;
    }
    const from = sourceEl.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width || !from.height) {
      UI.pulseJournal();
      return;
    }

    const clone = sourceEl.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    clone.classList.add('fly-clone');
    clone.setAttribute('aria-hidden', 'true');
    Object.assign(clone.style, {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`
    });
    document.body.append(clone);

    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    const scale = Math.max(0.06, 28 / Math.max(from.width, from.height));

    clone.getBoundingClientRect();
    clone.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    clone.style.opacity = '0.35';

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clone.remove();
      UI.pulseJournal();
    };
    clone.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, 1100);
  },

  builders: {
    'click-reveal'(obj, card, ctx) {
      const trigger = this.el('button', 'obj__trigger');
      trigger.type = 'button';
      trigger.append(this.header(obj));
      card.append(trigger, this.revealPanel(obj));

      if (GameState.isRevealed(obj.id)) {
        this.reveal(obj, card, ctx, { silent: true });
        trigger.setAttribute('aria-expanded', 'true');
      } else {
        trigger.setAttribute('aria-expanded', 'false');
      }

      trigger.addEventListener('click', () => {
        if (card.classList.contains('is-revealed')) return;
        trigger.setAttribute('aria-expanded', 'true');
        this.reveal(obj, card, ctx);
      });
    },

    'hover-reveal'(obj, card, ctx) {
      const trigger = this.el('button', 'obj__trigger obj__trigger--peek');
      trigger.type = 'button';
      trigger.append(this.header(obj));
      const cover = this.el('span', 'obj__cover');
      cover.setAttribute('aria-hidden', 'true');
      trigger.append(cover);
      card.append(trigger, this.revealPanel(obj));

      const open = () => {
        if (card.classList.contains('is-revealed')) return;
        trigger.setAttribute('aria-expanded', 'true');
        this.reveal(obj, card, ctx);
      };

      if (GameState.isRevealed(obj.id)) {
        this.reveal(obj, card, ctx, { silent: true });
        trigger.setAttribute('aria-expanded', 'true');
        return;
      }
      trigger.setAttribute('aria-expanded', 'false');

      trigger.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') open(); });
      trigger.addEventListener('click', open);
    },

    drag(obj, card, ctx) {
      card.append(this.head(obj));
      const zone = this.el('div', 'drag-zone');
      const under = this.el('div', 'drag-zone__under');
      under.append(this.revealPanel(obj));
      const placeholder = this.el('p', 'drag-zone__placeholder', '?');
      placeholder.setAttribute('aria-hidden', 'true');
      under.append(placeholder);

      const item = this.el('button', 'drag-item');
      item.type = 'button';
      item.setAttribute('aria-label', `${obj.label}. Click or press Space to move it aside.`);
      const itemIcon = this.el('span', 'drag-item__icon', obj.icon || '▢');
      itemIcon.setAttribute('aria-hidden', 'true');
      item.append(itemIcon, this.el('span', 'drag-item__label', obj.label));
      zone.append(under, item);
      card.append(zone);

      const lift = (dx = 0, dy = 0) => {
        if (card.classList.contains('is-revealed')) return;

        const len = Math.hypot(dx, dy) || 1;
        const dist = Math.max(zone.clientWidth, 160) * 0.62;
        const ox = dx || dy ? (dx / len) * dist : dist * 0.7;
        const oy = dx || dy ? (dy / len) * dist : -dist * 0.35;
        item.style.setProperty('--drag-x', `${ox}px`);
        item.style.setProperty('--drag-y', `${oy}px`);
        item.classList.remove('is-dragging');
        item.classList.add('is-lifted');
        item.tabIndex = -1;
        placeholder.remove();
        this.reveal(obj, card, ctx);
      };

      if (GameState.isRevealed(obj.id)) {
        item.classList.add('is-lifted', 'is-gone');
        item.tabIndex = -1;
        placeholder.remove();
        this.reveal(obj, card, ctx, { silent: true });
        return;
      }

      let start = null;
      let moved = false;
      item.addEventListener('pointerdown', (e) => {
        start = { x: e.clientX, y: e.clientY };
        moved = false;
        item.setPointerCapture(e.pointerId);
        item.classList.add('is-dragging');
      });
      item.addEventListener('pointermove', (e) => {
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 6) moved = true;
        item.style.setProperty('--drag-x', `${dx}px`);
        item.style.setProperty('--drag-y', `${dy}px`);
      });
      const end = (e) => {
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        start = null;
        if (Math.hypot(dx, dy) > 60) {
          lift(dx, dy);
        } else {
          item.classList.remove('is-dragging');
          item.style.setProperty('--drag-x', '0px');
          item.style.setProperty('--drag-y', '0px');
        }
      };
      item.addEventListener('pointerup', end);
      item.addEventListener('pointercancel', end);

      item.addEventListener('click', () => { if (!moved) lift(); });
    },

    magnifier(obj, card, ctx) {
      card.append(this.head(obj));
      const album = this.el('div', 'album');
      const pages = this.el('div', 'album__pages');

      const lens = this.el('div', 'lens');
      lens.setAttribute('aria-hidden', 'true');
      const findings = this.el('ul', 'album__findings');
      findings.setAttribute('aria-live', 'polite');

      const spots = obj.targets.map((t, i) => {
        const spot = this.el('button', `album__spot album__spot--${i + 1}`);
        spot.type = 'button';
        spot.dataset.target = t.id;
        spot.append(this.el('span', 'album__spot-label', t.label));
        pages.append(spot);
        return { t, spot };
      });

      const panel = this.revealPanel(obj);
      album.append(pages, lens);
      card.append(album, findings, panel);

      const key = (t) => `${obj.id}:${t.id}`;
      const examine = (t, spot, silent = false) => {
        if (spot.classList.contains('is-examined')) return;
        spot.classList.add('is-examined');
        spot.setAttribute('aria-pressed', 'true');
        const li = this.el('li', 'album__finding', t.text);
        findings.append(li);
        if (silent) return;
        GameState.reveal(key(t));
        if (spots.every(({ t: other }) => GameState.isRevealed(key(other)))) {
          lens.classList.add('is-done');
          this.reveal(obj, card, ctx);
        }
      };

      spots.forEach(({ t, spot }) => {
        if (GameState.isRevealed(key(t))) examine(t, spot, true);
        spot.addEventListener('click', () => examine(t, spot));
      });
      if (GameState.isRevealed(obj.id)) {
        lens.classList.add('is-done');
        this.reveal(obj, card, ctx, { silent: true });
      }

      let pos = { x: 0.22, y: 0.76 };
      const place = () => {
        album.style.setProperty('--lens-x', `${pos.x * 100}%`);
        album.style.setProperty('--lens-y', `${pos.y * 100}%`);
      };
      const checkUnderLens = () => {
        const lr = lens.getBoundingClientRect();
        const cx = lr.left + lr.width / 2;
        const cy = lr.top + lr.height / 2;
        spots.forEach(({ t, spot }) => {
          const r = spot.getBoundingClientRect();
          if (cx > r.left && cx < r.right && cy > r.top && cy < r.bottom) examine(t, spot);
        });
      };
      place();

      let dragging = false;
      const moveTo = (clientX, clientY) => {
        const r = album.getBoundingClientRect();
        pos = {
          x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
          y: Math.min(1, Math.max(0, (clientY - r.top) / r.height))
        };
        place();
        checkUnderLens();
      };
      lens.addEventListener('pointerdown', (e) => {
        dragging = true;
        lens.setPointerCapture(e.pointerId);
        album.classList.add('is-searching');
      });
      lens.addEventListener('pointermove', (e) => { if (dragging) moveTo(e.clientX, e.clientY); });
      const stop = () => { dragging = false; album.classList.remove('is-searching'); };
      lens.addEventListener('pointerup', stop);
      lens.addEventListener('pointercancel', stop);
    },

    sequence(obj, card, ctx) {
      card.append(this.head(obj));
      const trail = this.el('div', 'trail');
      const status = this.el('p', 'trail__status');
      status.setAttribute('aria-live', 'polite');
      const found = this.el('div', 'trail__found');
      card.append(trail, status, found);

      const total = obj.steps.length;
      const foundCount = () => obj.steps.filter((s) => GameState.hasCollected(s.id)).length;

      const showFound = (step) => {
        const item = this.el('div', 'trail__item');
        item.append(this.figure(step.image, step.alt), this.el('p', 'obj__text', step.reveal));
        found.append(item);
        return item;
      };

      obj.steps.forEach((step) => {
        const spot = this.el('button', `trail__spot trail__spot--${step.strength}`);
        spot.type = 'button';
        spot.append(this.el('span', 'trail__strength', step.strength), this.el('span', 'trail__label', step.label));

        if (GameState.hasCollected(step.id)) {
          spot.classList.add('is-found');
          spot.disabled = true;
        }

        spot.addEventListener('click', () => {
          if (spot.classList.contains('is-found')) return;
          if (step.order !== foundCount() + 1) {
            status.textContent = obj.wrongMessage;
            UI.audio.play('wrongOrder');
            spot.classList.remove('is-wrong');
            void spot.offsetWidth;
            spot.classList.add('is-wrong');
            return;
          }
          spot.classList.add('is-found');
          spot.disabled = true;
          status.textContent = '';
          UI.audio.play('scentStep');
          const item = showFound(step);
          item.classList.add('is-revealing');
          this.collect({ ...step, icon: obj.icon }, item.querySelector('.obj__figure'));
          if (foundCount() === total) this.reveal(obj, card, ctx);
          else ctx.onChange();
        });
        trail.append(spot);
      });

      obj.steps
        .filter((s) => GameState.hasCollected(s.id))
        .sort((a, b) => a.order - b.order)
        .forEach(showFound);
      if (GameState.isRevealed(obj.id)) this.reveal(obj, card, ctx, { silent: true });
    },

    timeline(obj, card, ctx) {
      const strip = this.el('ol', 'timeline');
      const finale = this.el('p', 'timeline__finale');
      const frame = this.el('div', 'final-frame');
      frame.hidden = true;
      const windows = this.el('div', 'final-frame__windows');
      obj.framed.forEach((f) => windows.append(this.figure(f.image, f.alt, 'final-frame__window')));
      frame.append(windows, this.el('p', 'final-frame__caption', obj.framedCaption));

      const items = obj.items.map((it) => {
        const li = this.el('li', 'timeline__item');
        li.append(this.figure(it.image, it.alt, 'timeline__figure'), this.el('span', 'timeline__caption', it.caption));
        strip.append(li);
        return li;
      });
      card.append(strip, finale, frame);

      const showAll = () => {
        items.forEach((li) => li.classList.add('is-shown'));
        finale.textContent = obj.finale;
        finale.classList.add('is-typed');
        frame.hidden = false;
        frame.classList.add('is-shown');
      };

      if (GameState.isRevealed(obj.id)) {
        showAll();
        return;
      }

      card._onShow = () => {
        items.forEach((li, i) => {
          this.schedule(() => li.classList.add('is-shown', 'is-revealing'), (i + 1) * obj.interval);
        });
        this.schedule(async () => {
          await this.typewrite(finale, obj.finale).done;
          frame.hidden = false;
          frame.classList.add('is-shown', 'is-revealing');
          GameState.reveal(obj.id);
          ctx.onChange();
        }, (items.length + 1) * obj.interval);
      };
    }
  }
};
