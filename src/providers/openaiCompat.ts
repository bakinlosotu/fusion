import { ModelInfo, ProviderId } from '../types';
import { parseSSE } from '../lib/sse';
import { friendlyError } from '../lib/errors';

export async function listOpenAIModels(key: string): Promise<ModelInfo[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${key}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    let errMsg = '';
    try {
      const errJson = JSON.parse(errorText);
      errMsg = errJson.error?.message || errorText;
    } catch {
      errMsg = errorText;
    }
    const mapped = friendlyError('openai', res.status, errMsg);
    throw new Error(mapped.message);
  }

  const json = await res.json();
  const rawList: { id: string }[] = json.data || [];

  const keepRegex = /^(gpt-|o\d|chatgpt-)/;
  const dropRegex = /(audio|realtime|transcribe|tts|image|embed|moderation|search|instruct|codex|-pro|computer-use|dall-e|whisper)/;

  const filtered = rawList
    .filter((item) => keepRegex.test(item.id) && !dropRegex.test(item.id))
    .map((item) => ({
      provider: 'openai' as ProviderId,
      id: item.id,
      label: item.id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return filtered;
}

export async function listXAIModels(key: string): Promise<ModelInfo[]> {
  const res = await fetch('https://api.x.ai/v1/models', {
    headers: {
      Authorization: `Bearer ${key}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    let errMsg = '';
    try {
      const errJson = JSON.parse(errorText);
      errMsg = errJson.error?.message || errorText;
    } catch {
      errMsg = errorText;
    }
    const mapped = friendlyError('xai', res.status, errMsg);
    throw new Error(mapped.message);
  }

  const json = await res.json();
  const rawList: { id: string }[] = json.data || [];

  const dropRegex = /(image|imagine|video|tts|voice)/;

  const filtered = rawList
    .filter((item) => item.id.toLowerCase().includes('grok') && !dropRegex.test(item.id))
    .map((item) => ({
      provider: 'xai' as ProviderId,
      id: item.id,
      label: item.id,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return filtered;
}

export async function streamOpenAICompat(
  provider: 'openai' | 'xai',
  key: string,
  modelId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  system: string,
  signal: AbortSignal,
  onToken: (token: string) => void
): Promise<void> {
  const url =
    provider === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://api.x.ai/v1/chat/completions';

  const bodyMessages = [
    { role: 'system', content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      stream: true,
      messages: bodyMessages,
    }),
    signal,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    let errMsg = '';
    try {
      const errJson = JSON.parse(errorText);
      errMsg = errJson.error?.message || errorText;
    } catch {
      errMsg = errorText;
    }

    if (
      errMsg.toLowerCase().includes('responses api') ||
      errMsg.toLowerCase().includes('not a chat model') ||
      errMsg.toLowerCase().includes('is not a chat completion model')
    ) {
      throw new Error("This model can't be used for chat here. Pick a different one.");
    }

    const mapped = friendlyError(provider, res.status, errMsg);
    throw new Error(mapped.message);
  }

  if (!res.body) {
    throw new Error('The model returned an empty reply. Try again or pick another model.');
  }

  let tokenCount = 0;

  await parseSSE(
    res.body,
    (chunk: unknown) => {
      const typed = chunk as {
        choices?: Array<{
          delta?: {
            content?: string;
          };
        }>;
      };
      const text = typed?.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text.length > 0) {
        tokenCount++;
        onToken(text);
      }
    },
    signal
  );

  if (tokenCount === 0 && !signal.aborted) {
    throw new Error('The model returned an empty reply. Try again or pick another model.');
  }
}
