import { ModelInfo, ProviderId } from '../types';
import { parseSSE } from '../lib/sse';
import { friendlyError } from '../lib/errors';

export async function checkServerGeminiStatus(): Promise<{ available: boolean }> {
  try {
    const res = await fetch('/api/gemini/status');
    if (!res.ok) return { available: false };
    const data = await res.json();
    return { available: Boolean(data.available) };
  } catch {
    return { available: false };
  }
}

export async function listGeminiModels(key?: string): Promise<ModelInfo[]> {
  const headers: Record<string, string> = {};
  if (key && key.trim()) {
    headers['x-gemini-key'] = key.trim();
  }

  const res = await fetch('/api/gemini/models', { headers });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    let errMsg = '';
    try {
      const errJson = JSON.parse(errorText);
      errMsg = errJson.error || errorText;
    } catch {
      errMsg = errorText;
    }
    const mapped = friendlyError('gemini', res.status, errMsg);
    throw new Error(mapped.message);
  }

  const json = await res.json();
  const rawList: Array<{ id: string; label: string }> = json.models || [];

  return rawList.map((m) => ({
    provider: 'gemini' as ProviderId,
    id: m.id,
    label: m.label || m.id,
  }));
}

export async function streamGemini(
  key: string,
  modelId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  system: string,
  signal: AbortSignal,
  onToken: (token: string) => void
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (key && key.trim()) {
    headers['x-gemini-key'] = key.trim();
  }

  const res = await fetch('/api/gemini/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      modelId,
      messages,
      system,
    }),
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    let errMsg = '';
    try {
      const errJson = JSON.parse(errorText);
      errMsg = errJson.error || errorText;
    } catch {
      errMsg = errorText;
    }
    const mapped = friendlyError('gemini', res.status, errMsg);
    throw new Error(mapped.message);
  }

  if (!res.body) {
    throw new Error('The model returned an empty reply. Try again or pick another model.');
  }

  let tokenCount = 0;
  let serverStreamError: string | null = null;

  await parseSSE(
    res.body,
    (chunk: unknown) => {
      const data = chunk as { text?: string; error?: string };

      if (data?.error) {
        serverStreamError = data.error;
        return;
      }

      if (typeof data?.text === 'string' && data.text.length > 0) {
        tokenCount++;
        onToken(data.text);
      }
    },
    signal
  );

  if (serverStreamError) {
    const mapped = friendlyError('gemini', undefined, serverStreamError);
    throw new Error(mapped.message);
  }

  if (tokenCount === 0 && !signal.aborted) {
    throw new Error('The model returned an empty reply. Try again or pick another model.');
  }
}
