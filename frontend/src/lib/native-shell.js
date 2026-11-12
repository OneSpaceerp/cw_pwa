/**
 * Native app behaviour the web app gets from the browser: the Android back button,
 * opening the right screen from a notification, the status bar, the launch screen.
 */
import { appRouteFromServerUrl, isNative } from "./native";

export async function initNativeShell(router) {
	if (!isNative()) return;

	// A notification was tapped: local reminders carry an in-app route, server
	// notifications a server URL ("/cw/visits/...").
	window.addEventListener("cw:open-url", ({ detail }) => {
		if (detail) router.push(appRouteFromServerUrl(detail)).catch(() => {});
	});

	const [{ App }, { LocalNotifications }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
		import("@capacitor/app"),
		import("@capacitor/local-notifications"),
		import("@capacitor/status-bar"),
		import("@capacitor/splash-screen"),
	]);

	// A browser-style back: the router guard closes an open sheet first, as on the web.
	App.addListener("backButton", ({ canGoBack }) => {
		if (canGoBack || window.history.state?.back) window.history.back();
		else App.minimizeApp();
	});

	LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
		window.dispatchEvent(new CustomEvent("cw:open-url", { detail: notification?.extra?.url }));
	});

	try {
		const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
		await StatusBar.setOverlaysWebView({ overlay: false });
		await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
		await StatusBar.setBackgroundColor({ color: dark ? "#13272F" : "#FFFFFF" });
	} catch {
		// iOS has no status bar colour; the page colour shows through
	}
	// The app's own animated launch screen (index.html) takes over from the native one.
	SplashScreen.hide().catch(() => {});
}
