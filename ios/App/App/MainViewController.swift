import UIKit
import Capacitor

/// The game's web view, kept full-bleed.
class MainViewController: CAPBridgeViewController {
    override var prefersStatusBarHidden: Bool { true }

    // The home indicator is hidden by Capacitor's SystemBars plugin (`hidden` in capacitor.config.ts),
    // which already overrides prefersHomeIndicatorAutoHidden and does not allow it to be overridden again.
}
