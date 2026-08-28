import * as SecureStore from "expo-secure-store";

import type { BuyerSession } from "../types";

const SESSION_KEY = "dallas-bakery-buyer-session-v1";
const TRACKING_KEY = "dallas-bakery-buyer-application-v1";
const SELECTED_LOCATION_KEY = "dallas-bakery-buyer-location-v1";
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function loadBuyerSession() {
  try {
    const value = await SecureStore.getItemAsync(SESSION_KEY, secureOptions);
    if (!value) return null;
    const session = JSON.parse(value) as BuyerSession;
    return session.accessToken && Number.isFinite(session.expiresAt) ? session : null;
  } catch {
    return null;
  }
}

export async function saveBuyerSession(session: BuyerSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), secureOptions);
}

export async function clearBuyerSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY, secureOptions);
  await SecureStore.deleteItemAsync(SELECTED_LOCATION_KEY, secureOptions);
}

export async function loadApplicationTrackingToken() {
  try {
    return await SecureStore.getItemAsync(TRACKING_KEY, secureOptions);
  } catch {
    return null;
  }
}

export async function saveApplicationTrackingToken(token: string) {
  await SecureStore.setItemAsync(TRACKING_KEY, token, secureOptions);
}

export async function clearApplicationTrackingToken() {
  await SecureStore.deleteItemAsync(TRACKING_KEY, secureOptions);
}

export async function loadSelectedLocationId() {
  try {
    return await SecureStore.getItemAsync(SELECTED_LOCATION_KEY, secureOptions);
  } catch {
    return null;
  }
}

export async function saveSelectedLocationId(id: string) {
  await SecureStore.setItemAsync(SELECTED_LOCATION_KEY, id, secureOptions);
}
