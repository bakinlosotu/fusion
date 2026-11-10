import { ModelInfo, ProviderId } from '../types';
import { parseSSE } from '../lib/sse';
import { friendlyError } from '../lib/errors';

export async function listAnthropicModels(key: string): Promise<ModelInfo[]> {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
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
    const mapped = friendlyError('anthropic', res.status, errMsg);
    throw new Error(mapped.message);
  }

  const json = await res.json();
  const rawList: { id: string; display_name?: string }[] = json.data || [];

  return rawList.map((item) => ({
    provider: 'anthropic' as ProviderId,
    id: item.id,
    label: item.display_name || item.id,
  }));
}

export async function streamAnthropic(
  key: string,
  modelId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  system: string,
  signal: AbortSignal,
  onToken: (token: string) => void
): Promise<void> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4096,
      stream: true,
      system: system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
    const mapped = friendlyError('anthropic', res.status, errMsg);
    throw new Error(mapped.message);
  }

  if (!res.body) {
    throw new Error('The model returned an empty reply. Try again or pick another model.');
  }

  let tokenCount = 0;
  let streamError: string | null = null;

  await parseSSE(
    res.body,
    (chunk: unknown) => {
      const event = chunk as {
        type?: string;
        delta?: {
          type?: string;
          text?: string;
        };
        error?: {
          message?: string;
        };
      };

      if (event?.type === 'error' && event.error?.message) {
        streamError = event.error.message;
        return;
      }

      if (
        event?.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta' &&
        typeof event.delta.text === 'string'
      ) {
        tokenCount++;
        onToken(event.delta.text);
      }
    },
    signal
  );

  if (streamError) {
    const mapped = friendlyError('anthropic', undefined, streamError);
    throw new Error(mapped.message);
  }

  if (tokenCount === 0 && !signal.aborted) {
    throw new Error('The model returned an empty reply. Try again or pick another model.');
  }
}
