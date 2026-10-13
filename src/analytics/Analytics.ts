// Analytics abstraction. Swap LocalAnalytics for a real backend implementation later.

export type AnalyticsEventName =
  | 'session_start'
  | 'level_start'
  | 'level_end'
  | 'wave_complete'
  | 'tower_built'
  | 'tower_upgraded'
  | 'hero_ability_used'
  | 'ad_offer_shown'
  | 'ad_offer_clicked'
  | 'ad_result'
  | 'interstitial_shown'
  | 'coins_earned'
  | 'coins_spent'
  | 'upgrade_purchased'
  | 'mission_complete'
  | 'daily_reward_claimed';

export type AnalyticsParams = Record<string, string | number | boolean | null>;

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  params: AnalyticsParams;
  /** ms since session start */
  t: number;
}

export interface Analytics {
  track(name: AnalyticsEventName, params?: AnalyticsParams): void;
  /** Events logged during this session (used by the debug screen). */
  sessionEvents(): readonly AnalyticsEvent[];
}

/** Logs structured events to the console and keeps them in memory (and a small rolling buffer in localStorage). */
export class LocalAnalytics implements Analytics {
  private events: AnalyticsEvent[] = [];
  private start = Date.now();

  constructor(private verbose = true) {}

  track(name: AnalyticsEventName, params: AnalyticsParams = {}): void {
    const ev: AnalyticsEvent = { name, params, t: Date.now() - this.start };
    this.events.push(ev);
    if (this.verbose) console.debug(`[analytics] ${name}`, params);
    try {
      const key = 'tkd_analytics_buffer';
      const buf = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
      buf.push({ ...ev, at: Date.now() });
      localStorage.setItem(key, JSON.stringify(buf.slice(-200)));
    } catch {
      /* storage unavailable */
    }
  }

  sessionEvents(): readonly AnalyticsEvent[] {
    return this.events;
  }
}

export interface AnalyticsSummary {
  adViewsByPlacement: Record<string, { offered: number; clicked: number; completed: number; skipped: number; failed: number }>;
  interstitials: number;
  coinsBySource: Record<string, number>;
  coinsBySink: Record<string, number>;
  levels: Record<string, { plays: number; wins: number }>;
  totalEvents: number;
}

export function summarise(events: readonly AnalyticsEvent[]): AnalyticsSummary {
  const s: AnalyticsSummary = { adViewsByPlacement: {}, interstitials: 0, coinsBySource: {}, coinsBySink: {}, levels: {}, totalEvents: events.length };
  const ad = (p: string) => (s.adViewsByPlacement[p] ??= { offered: 0, clicked: 0, completed: 0, skipped: 0, failed: 0 });
  for (const e of events) {
    const p = e.params;
    switch (e.name) {
      case 'ad_offer_shown': ad(String(p.placement)).offered++; break;
      case 'ad_offer_clicked': ad(String(p.placement)).clicked++; break;
      case 'ad_result': {
        const r = String(p.result) as 'completed' | 'skipped' | 'failed';
        if (r === 'completed' || r === 'skipped' || r === 'failed') ad(String(p.placement))[r]++;
        break;
      }
      case 'interstitial_shown': s.interstitials++; break;
      case 'coins_earned': s.coinsBySource[String(p.source)] = (s.coinsBySource[String(p.source)] ?? 0) + Number(p.amount); break;
      case 'coins_spent': s.coinsBySink[String(p.sink)] = (s.coinsBySink[String(p.sink)] ?? 0) + Number(p.amount); break;
      case 'level_end': {
        // Siege pushes: each ends at a checkpoint (success) or a retreat; bucket by 10-wave segment.
        const w = Math.max(1, Number(p.wave_reached) || 1);
        const seg = Math.floor((w - 1) / 10) * 10;
        const l = (s.levels[`${seg + 1}-${seg + 10}`] ??= { plays: 0, wins: 0 });
        l.plays++;
        if (p.result === 'checkpoint') l.wins++;
        break;
      }
      default:
    }
  }
  return s;
}
