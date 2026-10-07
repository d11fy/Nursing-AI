import { registerPlugin, Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export interface SecureStoragePluginInterface {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string | null }): Promise<{ success: boolean }>;
  remove(options: { key: string }): Promise<{ success: boolean }>;
  clear(): Promise<{ success: boolean }>;
}

// Native plugin backed by Android KeyStore (AES-256-GCM)
const NativeSecureStorage = registerPlugin<SecureStoragePluginInterface>("SecureStorage");

/**
 * Retrieves a secret securely.
 * On native Android: Decrypted on-the-fly using the hardware-backed AES-256-GCM key in AndroidKeyStore.
 * Migrates seamlessly from plain Preferences if an unencrypted token existed previously.
 */
export async function getSecureItem(key: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await NativeSecureStorage.get({ key });
      if (res && res.value) {
        return res.value;
      }

      // Backward compatibility / migration: Check if older unencrypted Preferences has the value
      try {
        const legacy = await Preferences.get({ key });
        if (legacy && legacy.value) {
          // Immediately migrate to hardware-backed secure storage
          await NativeSecureStorage.set({ key, value: legacy.value });
          await Preferences.remove({ key });
          return legacy.value;
        }
      } catch {
        // Migration check failed, continue
      }

      return null;
    } catch {
      return null;
    }
  }

  // Fallback for Web/Dev browser preview
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Stores a secret securely using hardware-backed AES-256-GCM encryption.
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await NativeSecureStorage.set({ key, value });
      // Ensure any legacy unencrypted copy is purged
      try {
        await Preferences.remove({ key });
      } catch {}
      return;
    } catch (error) {
      throw error;
    }
  }

  // Fallback for Web/Dev browser preview
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}

/**
 * Deletes a secret from secure storage.
 */
export async function removeSecureItem(key: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await NativeSecureStorage.remove({ key });
    } catch {}
    // Also remove any legacy unencrypted key
    try {
      await Preferences.remove({ key });
    } catch {}
    return;
  }

  // Fallback for Web/Dev browser preview
  try {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch {}
}

/**
 * Clears all secrets in the secure vault.
 */
export async function clearSecureStorage(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await NativeSecureStorage.clear();
    } catch {}
    return;
  }

  try {
    sessionStorage.clear();
  } catch {}
}
