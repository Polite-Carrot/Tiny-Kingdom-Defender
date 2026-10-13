// Screen / modal / toast / floating-text manager for the DOM overlay.

import { el } from './dom';
import { ICONS } from './icons';

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
  private hintPlacement: 'above' | 'below' | 'free' = 'above';
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

  banner(text: string, sub = '', cls = ''): void {
    const b = el('div', `banner ${cls}`, `${text}${sub ? `<small>${sub}</small>` : ''}`);
    this.fxLayer.append(b);
    setTimeout(() => b.remove(), 1900);
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
    this.hintEl = el('div', `hint ${placement === 'above' ? 'down' : placement === 'below' ? 'up' : 'free'}`, text);
    this.hintAnchor = anchor;
    this.hintPlacement = placement;
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
    if (!this.hintEl) return;
    const W = window.innerWidth;
    const pos = this.hintAnchor ? this.hintAnchor() : null;
    if (!pos) {
      this.hintEl.style.left = `${Math.max(10, W / 2 - 125)}px`;
      this.hintEl.style.top = `${window.innerHeight * 0.18}px`;
      if (this.hintRing) this.hintRing.style.display = 'none';
      return;
    }
    const w = this.hintEl.offsetWidth;
    const h = this.hintEl.offsetHeight;
    const left = Math.max(8, Math.min(W - w - 8, pos.x - w / 2));
    const top = this.hintPlacement === 'below' ? pos.y + 44 : pos.y - h - 44;
    this.hintEl.style.left = `${left}px`;
    this.hintEl.style.top = `${Math.max(8, top)}px`;
    if (this.hintRing) {
      this.hintRing.style.display = 'block';
      this.hintRing.style.left = `${pos.x}px`;
      this.hintRing.style.top = `${pos.y}px`;
    }
  }
}
