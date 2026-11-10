import { get, set, del, keys } from 'idb-keyval';
import { Chat } from '../types';

const CHATS_INDEX_KEY = 'harness.chats';
const CHAT_PREFIX = 'harness.chat.';

// In-memory fallback if IndexedDB is unavailable (e.g. private mode in some browsers)
let idbAvailable = true;
const memoryStore = new Map<string, unknown>();
let hasWarnedIdb = false;

function markIdbFailed(onWarning?: (msg: string) => void) {
  idbAvailable = false;
  if (!hasWarnedIdb) {
    hasWarnedIdb = true;
    if (onWarning) {
      onWarning("Chats can't be saved in this browser mode.");
    }
  }
}

export async function getChatIndex(onWarning?: (msg: string) => void): Promise<string[]> {
  if (!idbAvailable) {
    return (memoryStore.get(CHATS_INDEX_KEY) as string[]) || [];
  }
  try {
    const list = await get<string[]>(CHATS_INDEX_KEY);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    markIdbFailed(onWarning);
    return (memoryStore.get(CHATS_INDEX_KEY) as string[]) || [];
  }
}

export async function getChat(id: string, onWarning?: (msg: string) => void): Promise<Chat | null> {
  const key = `${CHAT_PREFIX}${id}`;
  if (!idbAvailable) {
    return (memoryStore.get(key) as Chat) || null;
  }
  try {
    const chat = await get<Chat>(key);
    return chat || null;
  } catch (err) {
    markIdbFailed(onWarning);
    return (memoryStore.get(key) as Chat) || null;
  }
}

export async function saveChat(chat: Chat, onWarning?: (msg: string) => void): Promise<void> {
  const key = `${CHAT_PREFIX}${chat.id}`;
  if (!idbAvailable) {
    memoryStore.set(key, chat);
    const curr = (memoryStore.get(CHATS_INDEX_KEY) as string[]) || [];
    const filtered = curr.filter((id) => id !== chat.id);
    memoryStore.set(CHATS_INDEX_KEY, [chat.id, ...filtered]);
    return;
  }
  try {
    await set(key, chat);
    const list = await getChatIndex(onWarning);
    const updated = [chat.id, ...list.filter((id) => id !== chat.id)];
    await set(CHATS_INDEX_KEY, updated);
  } catch (err) {
    markIdbFailed(onWarning);
    memoryStore.set(key, chat);
    const curr = (memoryStore.get(CHATS_INDEX_KEY) as string[]) || [];
    const filtered = curr.filter((id) => id !== chat.id);
    memoryStore.set(CHATS_INDEX_KEY, [chat.id, ...filtered]);
  }
}

export async function deleteChat(id: string, onWarning?: (msg: string) => void): Promise<void> {
  const key = `${CHAT_PREFIX}${id}`;
  if (!idbAvailable) {
    memoryStore.delete(key);
    const curr = (memoryStore.get(CHATS_INDEX_KEY) as string[]) || [];
    memoryStore.set(CHATS_INDEX_KEY, curr.filter((cId) => cId !== id));
    return;
  }
  try {
    await del(key);
    const list = await getChatIndex(onWarning);
    const updated = list.filter((cId) => cId !== id);
    await set(CHATS_INDEX_KEY, updated);
  } catch (err) {
    markIdbFailed(onWarning);
    memoryStore.delete(key);
    const curr = (memoryStore.get(CHATS_INDEX_KEY) as string[]) || [];
    memoryStore.set(CHATS_INDEX_KEY, curr.filter((cId) => cId !== id));
  }
}

export async function getAllChats(onWarning?: (msg: string) => void): Promise<Chat[]> {
  const index = await getChatIndex(onWarning);
  const chats: Chat[] = [];
  for (const id of index) {
    const c = await getChat(id, onWarning);
    if (c) chats.push(c);
  }
  return chats;
}

export async function exportAllChats(onWarning?: (msg: string) => void): Promise<void> {
  const chats = await getAllChats(onWarning);
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(chats, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', 'harness-chats.json');
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export async function clearAllData(): Promise<void> {
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch (e) {
    console.error('Error clearing storage', e);
  }

  try {
    const allKeys = await keys();
    for (const k of allKeys) {
      if (typeof k === 'string' && (k.startsWith('harness.') || k === CHATS_INDEX_KEY)) {
        await del(k);
      }
    }
  } catch (e) {
    console.error('Error clearing idb-keyval', e);
  }
  memoryStore.clear();
}
