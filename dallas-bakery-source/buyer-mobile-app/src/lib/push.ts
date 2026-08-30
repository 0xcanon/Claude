/**
 * Push notifications on the device.
 *
 * Asking for notification permission the second an app opens is how apps get
 * that permission denied forever. So this is called only after sign-in, when
 * the buyer has an account whose orders are worth being told about, and every
 * failure path is silent: a buyer who says no keeps a fully working app.
 *
 * Everything here degrades to a no-op on web and in Expo Go, where remote
 * push either does not exist or is not delivered.
 */

import Constants from "expo-constants";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

let cachedModule: NotificationsModule | null | undefined;

/**
 * Loads expo-notifications lazily. Requiring it at module scope would crash
 * the web build, where the native module does not exist.
 */
function notifications(): NotificationsModule | null {
  if (cachedModule !== undefined) return cachedModule;
  if (Platform.OS === "web") {
    cachedModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require("expo-notifications") as NotificationsModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/**
 * How an arriving notification behaves while the app is open: shown, with
 * sound, and never silently swallowed — an order or invoice alert the buyer
 * misses because they happened to have the app open is worse than a small
 * interruption.
 */
export function configureForegroundBehaviour() {
  const module = notifications();
  if (!module) return;
  module.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Asks for permission (only if it has not already been decided) and returns
 * this device's Expo push token, or null when notifications are unavailable
 * or declined.
 */
export async function getPushToken(): Promise<string | null> {
  const module = notifications();
  if (!module) return null;
  try {
    // Android needs a channel before anything is delivered.
    if (Platform.OS === "android") {
      await module.setNotificationChannelAsync("default", {
        name: "Order updates",
        importance: module.AndroidImportance.DEFAULT,
        sound: "default",
      });
    }

    const existing = await module.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      granted = (await module.requestPermissionsAsync()).granted;
    }
    if (!granted) return null;

    // The project id is what ties this token to this app's push credentials.
    // It comes from app.config.ts (extra.eas.projectId); without it, a signed
    // build cannot mint a token and this returns null.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const token = await module.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token?.data || null;
  } catch {
    // Expo Go without a project id, a simulator without push, a network
    // failure — none of these should surface to a buyer placing an order.
    return null;
  }
}

/** "ios" / "android" / "web", for the server's device record. */
export function devicePlatform() {
  return Platform.OS;
}
