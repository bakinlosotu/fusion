import { ModelInfo, ProviderId } from '../types';
import { listOpenAIModels, listXAIModels, streamOpenAICompat } from './openaiCompat';
import { listAnthropicModels, streamAnthropic } from './anthropic';
import { listGeminiModels, streamGemini } from './gemini';

// In-memory cache for listed models during this session
const modelsCache = new Map<ProviderId, { timestamp: number; keyHash: string; models: ModelInfo[] }>();

function hashKey(k: string): string {
  let hash = 0;
  for (let i = 0; i < k.length; i++) {
    hash = (hash << 5) - hash + k.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

export async function fetchProviderModels(provider: ProviderId, key: string, forceRefresh = false): Promise<ModelInfo[]> {
  if (provider !== 'gemini' && !key.trim()) return [];

  const keyH = hashKey(key || 'server-default');
  const cached = modelsCache.get(provider);
  if (!forceRefresh && cached && cached.keyHash === keyH) {
    return cached.models;
  }

  let models: ModelInfo[] = [];
  switch (provider) {
    case 'openai':
      models = await listOpenAIModels(key);
      break;
    case 'anthropic':
      models = await listAnthropicModels(key);
      break;
    case 'gemini':
      models = await listGeminiModels(key);
      break;
    case 'xai':
      models = await listXAIModels(key);
      break;
  }

  modelsCache.set(provider, {
    timestamp: Date.now(),
    keyHash: keyH,
    models,
  });

  return models;
}

export async function testProviderKey(
  provider: ProviderId,
  key: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const list = await fetchProviderModels(provider, key, true);
    return {
      success: true,
      count: list.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Normalizes message history before sending to providers:
 * - merge consecutive messages with the same role (join with \n\n)
 * - drop empty messages
 * - ensure the first message is 'user' (drop leading assistant messages)
 */
export function normalizeMessages(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const filtered = messages.filter((m) => m.content && m.content.trim().length > 0);
  if (filtered.length === 0) return [];

  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of filtered) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += '\n\n' + msg.content;
    } else {
      merged.push({ role: msg.role, content: msg.content });
    }
  }

  // Ensure first message is 'user'
  while (merged.length > 0 && merged[0].role !== 'user') {
    merged.shift();
  }

  return merged;
}

export async function executeStreamChat(
  provider: ProviderId,
  key: string,
  modelId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  system: string,
  signal: AbortSignal,
  onToken: (token: string) => void
): Promise<void> {
  const cleanMessages = normalizeMessages(messages);
  if (cleanMessages.length === 0) {
    throw new Error('No valid user messages to send.');
  }

  switch (provider) {
    case 'openai':
      return streamOpenAICompat('openai', key, modelId, cleanMessages, system, signal, onToken);
    case 'xai':
      return streamOpenAICompat('xai', key, modelId, cleanMessages, system, signal, onToken);
    case 'anthropic':
      return streamAnthropic(key, modelId, cleanMessages, system, signal, onToken);
    case 'gemini':
      return streamGemini(key, modelId, cleanMessages, system, signal, onToken);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export const PROVIDER_DOT_COLORS: Record<ProviderId, string> = {
  openai: '#10A37F',
  anthropic: '#D97757',
  gemini: '#4285F4',
  xai: 'currentColor', // dark mode white, light mode #111827
};

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  xai: 'xAI',
};
