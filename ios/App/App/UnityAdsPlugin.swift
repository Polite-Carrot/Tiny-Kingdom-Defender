import Capacitor
import UnityAds

/// Bridges Unity Ads to the game (`UnityAds` in JavaScript): initialise the SDK, keep each
/// placement loaded, and show it, resolving with "completed", "skipped" or "failed".
@objc(UnityAdsPlugin)
public class UnityAdsPlugin: CAPPlugin, CAPBridgedPlugin, UnityAdsInitializationDelegate, UnityAdsLoadDelegate, UnityAdsShowDelegate {
    public let identifier = "UnityAdsPlugin"
    public let jsName = "UnityAds"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isLoaded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
    ]

    // All state is touched on the main thread only.
    private var initCall: CAPPluginCall?
    private var loaded = Set<String>()
    private var loading = Set<String>()
    private var showCalls: [String: CAPPluginCall] = [:]

    @objc func initialize(_ call: CAPPluginCall) {
        guard let gameId = call.getString("gameId") else { return call.reject("gameId is required") }
        let testMode = call.getBool("testMode") ?? false
        DispatchQueue.main.async {
            if UnityAds.isInitialized() { return call.resolve() }
            self.initCall = call
            UnityAds.initialize(gameId, testMode: testMode, initializationDelegate: self)
        }
    }

    public func initializationComplete() {
        DispatchQueue.main.async {
            self.initCall?.resolve()
            self.initCall = nil
        }
    }

    public func initializationFailed(_ error: UnityAdsInitializationError, withMessage message: String) {
        DispatchQueue.main.async {
            self.initCall?.reject(message)
            self.initCall = nil
        }
    }

    @objc func load(_ call: CAPPluginCall) {
        guard let placementId = call.getString("placementId") else { return call.reject("placementId is required") }
        DispatchQueue.main.async {
            self.startLoad(placementId)
            call.resolve()
        }
    }

    private func startLoad(_ placementId: String) {
        guard !loaded.contains(placementId), !loading.contains(placementId) else { return }
        loading.insert(placementId)
        UnityAds.load(placementId, loadDelegate: self)
    }

    public func unityAdsAdLoaded(_ placementId: String) {
        DispatchQueue.main.async {
            self.loading.remove(placementId)
            self.loaded.insert(placementId)
        }
    }

    public func unityAdsAdFailed(toLoad placementId: String, withError error: UnityAdsLoadError, withMessage message: String) {
        DispatchQueue.main.async {
            self.loading.remove(placementId)
            // No fill or no network: try again a little later.
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) { self.startLoad(placementId) }
        }
    }

    @objc func isLoaded(_ call: CAPPluginCall) {
        let placementId = call.getString("placementId") ?? ""
        DispatchQueue.main.async { call.resolve(["loaded": self.loaded.contains(placementId)]) }
    }

    @objc func show(_ call: CAPPluginCall) {
        guard let placementId = call.getString("placementId") else { return call.reject("placementId is required") }
        DispatchQueue.main.async {
            guard self.loaded.contains(placementId), let vc = self.bridge?.viewController else {
                self.startLoad(placementId)
                return call.resolve(["result": "failed"])
            }
            self.loaded.remove(placementId)
            self.showCalls[placementId] = call
            UnityAds.show(vc, placementId: placementId, showDelegate: self)
        }
    }

    public func unityAdsShowComplete(_ placementId: String, withFinish state: UnityAdsShowCompletionState) {
        finish(placementId, state == .showCompletionStateCompleted ? "completed" : "skipped")
    }

    public func unityAdsShowFailed(_ placementId: String, withError error: UnityAdsShowError, withMessage message: String) {
        finish(placementId, "failed")
    }

    public func unityAdsShowStart(_ placementId: String) {}

    public func unityAdsShowClick(_ placementId: String) {}

    private func finish(_ placementId: String, _ result: String) {
        DispatchQueue.main.async {
            self.showCalls.removeValue(forKey: placementId)?.resolve(["result": result])
            // Have the next ad ready.
            self.startLoad(placementId)
        }
    }
}
