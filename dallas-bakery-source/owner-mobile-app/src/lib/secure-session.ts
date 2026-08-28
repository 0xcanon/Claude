import * as SecureStore from "expo-secure-store";

import type { MobileSession } from "../types";

const SESSION_KEY = "dallas_bakery_owner_session_v1";

export async function loadSession(): Promise<MobileSession | null> {
  try {
    const value = await SecureStore.getItemAsync(SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as Partial<MobileSession>;
    if (
      !session.token ||
      !session.user?.email ||
      !session.user.displayName ||
      !Number.isFinite(session.expiresAt) ||
      Number(session.expiresAt) <= Date.now()
    ) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      return null;
    }
    return {
      token: session.token,
      expiresAt: Number(session.expiresAt),
      requiresPasswordChange: Boolean(session.requiresPasswordChange),
      user: session.user,
    };
  } catch {
    return null;
  }
}

export async function saveSession(session: MobileSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
