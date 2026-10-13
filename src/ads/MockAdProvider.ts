// Mock ad provider: fullscreen overlay with a countdown and a close button.
// A debug setting can force 'skipped' or 'failed' outcomes.

import type { AdProvider, RewardedResult } from './AdProvider';
import type { AdOutcomeSetting } from '../core/Save';
import { MOCK_AD } from '../data/ads';

export class MockAdProvider implements AdProvider {
  private ready = false;

  constructor(
    private getOutcome: () => AdOutcomeSetting,
    private getUnavailable: () => boolean = () => false,
  ) {}

  async init(): Promise<void> {
    await new Promise((r) => setTimeout(r, MOCK_AD.loadDelayMs));
    this.ready = true;
  }

  isRewardedReady(): boolean {
    return this.ready && !this.getUnavailable();
  }

  isInterstitialReady(): boolean {
    return this.ready && !this.getUnavailable();
  }

  showRewarded(placement: string): Promise<RewardedResult> {
    let forced = this.getOutcome();
    if (forced === 'random') forced = (['completed', 'completed', 'skipped', 'failed'] as const)[Math.floor(Math.random() * 4)];
    if (forced === 'failed') {
      return new Promise((r) => setTimeout(() => r('failed'), 400));
    }
    return this.overlay(`Rewarded ad · ${placement}`, true, forced === 'skipped');
  }

  async showInterstitial(placement: string): Promise<void> {
    await this.overlay(`Interstitial · ${placement}`, false, false);
  }

  private overlay(title: string, rewarded: boolean, forceSkip: boolean): Promise<RewardedResult> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'mock-ad';
      el.innerHTML = `
        <div class="mock-ad__card">
          <div class="mock-ad__tag">AD · MOCK PROVIDER</div>
          <div class="mock-ad__title">${title}</div>
          <div class="mock-ad__art"><div class="mock-ad__spin"></div></div>
          <div class="mock-ad__count"></div>
          <div class="mock-ad__hint">${rewarded ? 'Watch to the end to earn your reward.' : 'Your game will resume shortly.'}</div>
        </div>
        <button class="mock-ad__close" aria-label="Close ad">✕</button>`;
      document.body.appendChild(el);
      const count = el.querySelector('.mock-ad__count') as HTMLElement;
      const close = el.querySelector('.mock-ad__close') as HTMLButtonElement;
      let remaining = MOCK_AD.durationSeconds;
      const tick = () => {
        count.textContent = remaining > 0 ? `Reward in ${remaining}s` : rewarded ? 'Reward earned! ✓' : 'You can close the ad';
        if (!rewarded) count.textContent = remaining > 0 ? `${remaining}s` : 'Close ✕';
        close.classList.toggle('ready', remaining <= 0);
      };
      tick();
      const timer = window.setInterval(() => {
        remaining--;
        tick();
        if (remaining <= 0) {
          window.clearInterval(timer);
          if (forceSkip) finish('skipped');
        }
      }, 1000);
      const finish = (r: RewardedResult) => {
        window.clearInterval(timer);
        el.classList.add('out');
        setTimeout(() => el.remove(), 250);
        resolve(r);
      };
      close.addEventListener('click', () => {
        // Rewarded ads closed early count as skipped. Interstitials can only close after the countdown.
        if (remaining > 0 && !rewarded) return;
        finish(remaining > 0 ? 'skipped' : 'completed');
      });
    });
  }
}
