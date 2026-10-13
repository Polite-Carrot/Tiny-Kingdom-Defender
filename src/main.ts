import './ui/styles.css';
import { Game } from './game/Game';
import { renderThumbnails } from './ui/Thumbnails';

async function boot() {
  const bar = document.querySelector('.boot__bar div') as HTMLElement | null;
  const setProgress = (p: number) => bar && (bar.style.width = `${Math.round(p * 100)}%`);
  setProgress(0.2);
  await new Promise((r) => requestAnimationFrame(r));
  // Pre-render model portraits for the UI.
  renderThumbnails();
  setProgress(0.7);
  await new Promise((r) => requestAnimationFrame(r));
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const game = new Game(canvas, ui);
  (window as unknown as { tkd: Game }).tkd = game;
  await game.start();
  setProgress(1);
  const bootEl = document.getElementById('boot');
  bootEl?.classList.add('out');
  setTimeout(() => bootEl?.remove(), 600);
}

boot().catch((e) => {
  console.error(e);
  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.innerHTML = `<div style="color:#fff;padding:24px;text-align:center;font-family:sans-serif">Something went wrong starting the game.<br/><small>${String(e)}</small></div>`;
});
