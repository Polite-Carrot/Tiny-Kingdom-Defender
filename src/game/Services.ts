// Shared service container passed to game subsystems.

import type { Renderer } from '../core/Renderer';
import type { CameraRig } from '../core/CameraRig';
import type { SaveSystem } from '../core/Save';
import type { AudioSystem } from '../systems/Audio';
import type { UI } from '../ui/UI';
import type { Analytics } from '../analytics/Analytics';
import type { AdManager } from '../ads/AdManager';
import type { Meta } from './Meta';

export interface Services {
  renderer: Renderer;
  rig: CameraRig;
  save: SaveSystem;
  audio: AudioSystem;
  ui: UI;
  analytics: Analytics;
  ads: AdManager;
  meta: Meta;
}
