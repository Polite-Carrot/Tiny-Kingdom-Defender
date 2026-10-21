// Screen / modal / toast / floating-text manager for the DOM overlay.

import { el } from './dom';
import { ICONS, icon } from './icons';

export interface ModalHandle {
  el: HTMLElement;
  layer: HTMLElement;
  close(): void;
  closed: boolean;
}

export class UI {
  readonly root: HTMLElement;
  private screens = new Map<string, HTMLElement>();
  private current = '';
  private modals: ModalHandle[] = [];
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private fxLayer: HTMLElement;
  private ftextPool: HTMLElement[] = [];
  private activeFtexts = 0;
  private coinPool: HTMLElement[] = [];
  private activeCoins = 0;
  private hintEl: HTMLElement | null = null;
  private hintRing: HTMLElement | null = null;
  private hintAnchor: (() => { x: number; y: number } | null) | null = null;
  private hintSide: 'above' | 'below' = 'above';
  onClick: () => void = () => {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.fxLayer = el('div', 'fx-layer');
    this.fxLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden';
    this.toastEl = el('div', 'toast');
    root.append(this.fxLayer, this.toastEl);
    // Global click sound for buttons.
    root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.onClick();
    });
  }

  addScreen(name: string, node: HTMLElement): HTMLElement {
    node.classList.add('screen', 'hidden');
    this.root.insertBefore(node, this.fxLayer);
    this.screens.set(name, node);
    return node;
  }

  show(name: string): void {
    if (this.current === name) return;
    const prev = this.screens.get(this.current);
    if (prev) {
      prev.classList.remove('on');
      const p = prev;
      setTimeout(() => {
        if (!p.classList.contains('on')) p.classList.add('hidden');
      }, 300);
    }
    this.current = name;
    const next = this.screens.get(name);
    if (next) {
      next.classList.remove('hidden');
      requestAnimationFrame(() => requestAnimationFrame(() => next.classList.add('on')));
    }
  }

  get currentScreen(): string {
    return this.current;
  }

  modal(build: (m: HTMLElement, h: ModalHandle) => void, opts: { closable?: boolean; wide?: boolean; onClose?: () => void; cls?: string } = {}): ModalHandle {
    const layer = el('div', 'modal-layer');
    const m = el('div', `modal ${opts.wide ? 'wide' : ''} ${opts.cls ?? ''}`);
    layer.append(m);
    const handle: ModalHandle = {
      el: m,
      layer,
      closed: false,
      close: () => {
        if (handle.closed) return;
        handle.closed = true;
        layer.classList.remove('on');
        this.modals = this.modals.filter((x) => x !== handle);
        setTimeout(() => layer.remove(), 250);
        opts.onClose?.();
      },
    };
    if (opts.closable !== false) {
      const x = el('button', 'modal-close', '✕');
      x.setAttribute('aria-label', 'Close');
      x.onclick = () => handle.close();
      m.append(x);
      layer.addEventListener('pointerdown', (e) => {
        if (e.target === layer) handle.close();
      });
    }
    const content = el('div', 'modal-content');
    m.append(content);
    build(content, handle);
    this.root.insertBefore(layer, this.toastEl);
    this.modals.push(handle);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('on')));
    return handle;
  }

  get modalOpen(): boolean {
    return this.modals.length > 0;
  }

  closeModals(): void {
    [...this.modals].forEach((m) => m.close());
  }

  toast(msg: string, ms = 2200): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('on');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  private achQueue: (() => void)[] = [];
  private achBusy = false;

  /** Achievement card that slides in at the top; queued so several never overlap. */
  achievement(name: string, desc: string, coins: number, gems: number): void {
    this.achQueue.push(() => {
      const card = el('div', 'ach-card', `<div class="ach-ico">${ICONS.trophy}</div><div class="ach-body"><small>Achievement unlocked</small><b>${name}</b><span>${desc}</span></div><div class="ach-reward">+${coins} ${icon('coin', 'inline')}${gems ? `<br/>+${gems} ${icon('gem', 'inline')}` : ''}</div>`);
      this.fxLayer.append(card);
      requestAnimationFrame(() => card.classList.add('on'));
      setTimeout(() => card.classList.remove('on'), 3000);
      setTimeout(() => {
        card.remove();
        this.achBusy = false;
        this.achQueue.shift()?.();
      }, 3400);
    });
    if (!this.achBusy) {
      this.achBusy = true;
      this.achQueue.shift()?.();
    }
  }

  private bannerQueue: { text: string; sub: string; cls: string }[] = [];
  private bannerBusy = false;

  /** Big centre banner. One at a time: later ones wait their turn (at most 2 waiting). */
  banner(text: string, sub = '', cls = ''): void {
    this.bannerQueue.push({ text, sub, cls });
    if (this.bannerQueue.length > 2) this.bannerQueue.shift();
    if (!this.bannerBusy) this.nextBanner();
  }

  private nextBanner(): void {
    const b = this.bannerQueue.shift();
    if (!b) {
      this.bannerBusy = false;
      return;
    }
    this.bannerBusy = true;
    const node = el('div', `banner ${b.cls}`);
    node.append(document.createTextNode(b.text));
    if (b.sub) {
      const small = el('small');
      small.textContent = b.sub;
      node.append(small);
    }
    this.fxLayer.append(node);
    setTimeout(() => {
      node.remove();
      this.nextBanner();
    }, 1900);
  }

  /** A boss steps out: a readable card with its name and what it does. */
  bossCard(name: string, desc: string): void {
    const card = el('div', 'boss-card');
    card.innerHTML = `<small>⚠ Boss</small><b></b><span></span>`;
    card.querySelector('b')!.textContent = name;
    card.querySelector('span')!.textContent = desc;
    this.fxLayer.append(card);
    setTimeout(() => card.remove(), 2600);
  }


  floatText(x: number, y: number, text: string, cls: string): void {
    if (this.activeFtexts > 40) return;
    const e = this.ftextPool.pop() ?? el('div');
    e.className = `ftext ${cls}`;
    e.textContent = text;
    this.fxLayer.append(e);
    this.activeFtexts++;
    const big = cls.includes('big') || cls.includes('boss');
    const anim = e.animate(
      [
        { transform: `translate(${x}px, ${y}px) translate(-50%, 0) scale(${big ? 0.5 : 0.7})`, opacity: 1 },
        { transform: `translate(${x}px, ${y - 18}px) translate(-50%, 0) scale(${big ? 1.25 : 1.05})`, opacity: 1, offset: 0.2 },
        { transform: `translate(${x}px, ${y - 48}px) translate(-50%, 0) scale(1)`, opacity: 0 },
      ],
      { duration: big ? 1300 : 800, easing: 'cubic-bezier(.2,.8,.4,1)' },
    );
    anim.onfinish = () => {
      e.remove();
      this.activeFtexts--;
      this.ftextPool.push(e);
    };
  }

  /** Coins flying from a screen point to a target element. */
  coinFly(x: number, y: number, target: HTMLElement | null, count = 1, onArrive?: () => void): void {
    if (!target) {
      onArrive?.();
      return;
    }
    const r = target.getBoundingClientRect();
    const tx = r.left + 20;
    const ty = r.top + r.height / 2;
    const n = Math.min(count, 8);
    for (let i = 0; i < n; i++) {
      if (this.activeCoins > 24) {
        if (i === n - 1) onArrive?.();
        continue;
      }
      const c = this.coinPool.pop() ?? el('div', 'coinfly', ICONS.coin);
      this.fxLayer.append(c);
      this.activeCoins++;
      const sx = x + (Math.random() - 0.5) * 30;
      const sy = y + (Math.random() - 0.5) * 20;
      const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 80;
      const my = Math.min(sy, ty) - 60 - Math.random() * 40;
      const anim = c.animate(
        [
          { transform: `translate(${sx - 11}px, ${sy - 11}px) scale(.4)` },
          { transform: `translate(${sx - 11}px, ${sy - 31}px) scale(1.1)`, offset: 0.15 },
          { transform: `translate(${mx - 11}px, ${my - 11}px) scale(1)`, offset: 0.55 },
          { transform: `translate(${tx - 11}px, ${ty - 11}px) scale(.7)` },
        ],
        { duration: 650 + i * 60 + Math.random() * 120, easing: 'ease-in' },
      );
      anim.onfinish = () => {
        c.remove();
        this.activeCoins--;
        this.coinPool.push(c);
        if (i === n - 1) onArrive?.();
      };
    }
  }

  // --- Hints ---------------------------------------------------------------------

  showHint(text: string, anchor: (() => { x: number; y: number } | null) | null, placement: 'above' | 'below' | 'free' = 'above'): void {
    this.clearHint();
    this.hintEl = el('div', 'hint', text);
    this.hintAnchor = anchor;
    this.hintSide = placement === 'below' ? 'below' : 'above';
    this.root.append(this.hintEl);
    if (anchor) {
      this.hintRing = el('div', 'hint-ring');
      this.root.append(this.hintRing);
    }
    this.updateHint();
  }

  clearHint(): void {
    this.hintEl?.remove();
    this.hintRing?.remove();
    this.hintEl = this.hintRing = null;
    this.hintAnchor = null;
  }

  get hintVisible(): boolean {
    return !!this.hintEl;
  }

  updateHint(): void {
    const hint = this.hintEl;
    if (!hint) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    // Keep clear of the top bar and the bottom controls.
    const top = 84;
    const bottom = H - 96;
    const w = hint.offsetWidth;
    const h = hint.offsetHeight;
    const raw = this.hintAnchor ? this.hintAnchor() : null;
    // An anchor off the screen (an enemy still in its tunnel) is shown as a free card instead.
    const pos = raw && raw.x > 0 && raw.x < W && raw.y > 0 && raw.y < H ? raw : null;
    if (!pos) {
      hint.className = 'hint free';
      hint.style.left = `${Math.round((W - w) / 2)}px`;
      hint.style.top = `${Math.round(Math.max(top + 8, H * 0.2))}px`;
      if (this.hintRing) this.hintRing.style.display = 'none';
      return;
    }
    const gap = 44;
    const fitsAbove = pos.y - gap - h >= top;
    const fitsBelow = pos.y + gap + h <= bottom;
    // Stay on the current side while it fits, so a bubble following a moving target doesn't flicker.
    if (this.hintSide === 'above' && !fitsAbove && fitsBelow) this.hintSide = 'below';
    else if (this.hintSide === 'below' && !fitsBelow && fitsAbove) this.hintSide = 'above';
    const left = Math.max(8, Math.min(W - w - 8, pos.x - w / 2));
    const y = this.hintSide === 'above' ? pos.y - gap - h : pos.y + gap;
    hint.className = `hint ${this.hintSide === 'above' ? 'down' : 'up'}`;
    hint.style.left = `${Math.round(left)}px`;
    hint.style.top = `${Math.round(Math.max(8, Math.min(H - h - 8, y)))}px`;
    // Point the arrow at the target even when the bubble is pushed in from a screen edge.
    hint.style.setProperty('--ax', `${Math.round(Math.max(18, Math.min(w - 18, pos.x - left)))}px`);
    if (this.hintRing) {
      this.hintRing.style.display = 'block';
      this.hintRing.style.left = `${pos.x}px`;
      this.hintRing.style.top = `${pos.y}px`;
    }
  }

}
