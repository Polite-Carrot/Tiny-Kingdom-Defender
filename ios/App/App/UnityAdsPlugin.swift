import AppTrackingTransparency
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
        CAPPluginMethod(name: "setConsent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isLoaded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "trackingStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestTracking", returnType: CAPPluginReturnPromise),
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

    /// The player's choice about personalised ads, passed to Unity as consent (GDPR in the EU and
    /// UK, and US privacy laws). Applies immediately, before or after initialising.
    @objc func setConsent(_ call: CAPPluginCall) {
        let personalised = call.getBool("personalised") ?? false
        DispatchQueue.main.async {
            let gdpr = UADSMetaData()
            _ = gdpr.set("gdpr.consent", value: personalised)
            gdpr.commit()
            let privacy = UADSMetaData()
            _ = privacy.set("privacy.consent", value: personalised)
            privacy.commit()
            call.resolve()
        }
    }

    /// Apple's App Tracking Transparency answer, without asking: "authorized", "denied",
    /// "restricted" or "notDetermined". Unity can only use the advertising ID when "authorized".
    @objc func trackingStatus(_ call: CAPPluginCall) {
        call.resolve(["status": Self.describe(ATTrackingManager.trackingAuthorizationStatus)])
    }

    /// Shows Apple's "Allow to track?" prompt (only ever once per install; later calls just
    /// return the answer) and resolves with the status, as trackingStatus does.
    @objc func requestTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            ATTrackingManager.requestTrackingAuthorization { status in
                call.resolve(["status": Self.describe(status)])
            }
        }
    }

    private static func describe(_ status: ATTrackingManager.AuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
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
