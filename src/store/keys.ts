import { ApiKeys } from '../types';

const KEYS_STORAGE_KEY = 'harness.keys';
const REMEMBER_STORAGE_KEY = 'harness.rememberKeys';

type KeysListener = (keys: ApiKeys, remember: boolean) => void;
const listeners = new Set<KeysListener>();

function notify(keys: ApiKeys, remember: boolean) {
  listeners.forEach((listener) => {
    try {
      listener(keys, remember);
    } catch (e) {
      console.error('Error notifying keys listener', e);
    }
  });
}

export function getRememberKeys(): boolean {
  try {
    return localStorage.getItem(REMEMBER_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setRememberKeys(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_STORAGE_KEY, remember ? 'true' : 'false');
    const currentKeys = getKeys();
    if (remember) {
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(currentKeys));
      sessionStorage.removeItem(KEYS_STORAGE_KEY);
    } else {
      sessionStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(currentKeys));
      localStorage.removeItem(KEYS_STORAGE_KEY);
    }
    notify(currentKeys, remember);
  } catch (e) {
    console.error('Failed to update rememberKeys preference', e);
  }
}

export function getKeys(): ApiKeys {
  const remember = getRememberKeys();
  const storage = remember ? localStorage : sessionStorage;
  try {
    const raw = storage.getItem(KEYS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse keys from storage', e);
  }
  return {};
}

export function saveKeys(newKeys: ApiKeys): void {
  const remember = getRememberKeys();
  const cleanKeys: ApiKeys = {};

  (Object.keys(newKeys) as (keyof ApiKeys)[]).forEach((k) => {
    const val = newKeys[k];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed) {
        cleanKeys[k] = trimmed;
      }
    }
  });

  const storage = remember ? localStorage : sessionStorage;
  const otherStorage = remember ? sessionStorage : localStorage;

  try {
    storage.setItem(KEYS_STORAGE_KEY, JSON.stringify(cleanKeys));
    otherStorage.removeItem(KEYS_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to save keys', e);
  }

  notify(cleanKeys, remember);
}

export function clearAllKeys(): void {
  try {
    sessionStorage.removeItem(KEYS_STORAGE_KEY);
    localStorage.removeItem(KEYS_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear keys', e);
  }
  notify({}, getRememberKeys());
}

export function subscribeKeys(listener: KeysListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
