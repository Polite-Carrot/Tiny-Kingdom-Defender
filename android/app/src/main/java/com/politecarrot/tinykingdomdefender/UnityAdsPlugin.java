package com.politecarrot.tinykingdomdefender;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.unity3d.ads.IUnityAdsInitializationListener;
import com.unity3d.ads.IUnityAdsLoadListener;
import com.unity3d.ads.IUnityAdsShowListener;
import com.unity3d.ads.UnityAds;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Bridges Unity Ads to the game ("UnityAds" in JavaScript), the same as the iOS plugin:
 * initialise the SDK, keep each placement loaded, and show it, resolving with
 * "completed", "skipped" or "failed". All state is touched on the main thread only.
 */
@CapacitorPlugin(name = "UnityAds")
public class UnityAdsPlugin extends Plugin implements IUnityAdsInitializationListener, IUnityAdsLoadListener, IUnityAdsShowListener {
    private final Handler main = new Handler(Looper.getMainLooper());
    private PluginCall initCall;
    private final Set<String> loaded = new HashSet<>();
    private final Set<String> loading = new HashSet<>();
    private final Map<String, PluginCall> showCalls = new HashMap<>();

    @PluginMethod
    public void initialize(PluginCall call) {
        String gameId = call.getString("gameId");
        if (gameId == null || gameId.isEmpty()) {
            call.reject("gameId is required");
            return;
        }
        boolean testMode = Boolean.TRUE.equals(call.getBoolean("testMode", false));
        main.post(() -> {
            if (UnityAds.isInitialized()) {
                call.resolve();
                return;
            }
            initCall = call;
            UnityAds.initialize(getContext().getApplicationContext(), gameId, testMode, this);
        });
    }

    @Override
    public void onInitializationComplete() {
        main.post(() -> {
            if (initCall != null) initCall.resolve();
            initCall = null;
        });
    }

    @Override
    public void onInitializationFailed(UnityAds.UnityAdsInitializationError error, String message) {
        main.post(() -> {
            if (initCall != null) initCall.reject(message);
            initCall = null;
        });
    }

    @PluginMethod
    public void load(PluginCall call) {
        String placementId = call.getString("placementId");
        if (placementId == null) {
            call.reject("placementId is required");
            return;
        }
        main.post(() -> {
            startLoad(placementId);
            call.resolve();
        });
    }

    private void startLoad(String placementId) {
        if (loaded.contains(placementId) || loading.contains(placementId)) return;
        loading.add(placementId);
        UnityAds.load(placementId, this);
    }

    @Override
    public void onUnityAdsAdLoaded(String placementId) {
        main.post(() -> {
            loading.remove(placementId);
            loaded.add(placementId);
        });
    }

    @Override
    public void onUnityAdsFailedToLoad(String placementId, UnityAds.UnityAdsLoadError error, String message) {
        main.post(() -> {
            loading.remove(placementId);
            // No fill or no network: try again a little later.
            main.postDelayed(() -> startLoad(placementId), 30_000);
        });
    }

    @PluginMethod
    public void isLoaded(PluginCall call) {
        String placementId = call.getString("placementId", "");
        main.post(() -> {
            JSObject ret = new JSObject();
            ret.put("loaded", loaded.contains(placementId));
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        String placementId = call.getString("placementId");
        if (placementId == null) {
            call.reject("placementId is required");
            return;
        }
        main.post(() -> {
            Activity activity = getActivity();
            if (!loaded.contains(placementId) || activity == null) {
                startLoad(placementId);
                resolveResult(call, "failed");
                return;
            }
            loaded.remove(placementId);
            showCalls.put(placementId, call);
            UnityAds.show(activity, placementId, this);
        });
    }

    @Override
    public void onUnityAdsShowComplete(String placementId, UnityAds.UnityAdsShowCompletionState state) {
        finish(placementId, state == UnityAds.UnityAdsShowCompletionState.COMPLETED ? "completed" : "skipped");
    }

    @Override
    public void onUnityAdsShowFailure(String placementId, UnityAds.UnityAdsShowError error, String message) {
        finish(placementId, "failed");
    }

    @Override
    public void onUnityAdsShowStart(String placementId) {}

    @Override
    public void onUnityAdsShowClick(String placementId) {}

    private void finish(String placementId, String result) {
        main.post(() -> {
            PluginCall call = showCalls.remove(placementId);
            if (call != null) resolveResult(call, result);
            // Have the next ad ready.
            startLoad(placementId);
        });
    }

    private static void resolveResult(PluginCall call, String result) {
        JSObject ret = new JSObject();
        ret.put("result", result);
        call.resolve(ret);
    }
}
