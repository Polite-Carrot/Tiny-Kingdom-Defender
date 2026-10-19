import UIKit
import Capacitor

/// The game's web view: registers the app's own plugins and keeps the screen full-bleed.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(UnityAdsPlugin())
    }

    override var prefersStatusBarHidden: Bool { true }

    override var prefersHomeIndicatorAutoHidden: Bool { true }
}
