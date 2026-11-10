export async function parseSSE(
  stream: ReadableStream<Uint8Array>,
  onData: (data: unknown) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const processLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) {
      return false;
    }
    if (trimmed.startsWith('data:')) {
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr) return false;
      if (dataStr === '[DONE]') {
        return true; // Finished signal
      }
      try {
        const parsed = JSON.parse(dataStr);
        onData(parsed);
      } catch {
        // Skip unparseable line; never throw
      }
    }
    return false;
  };

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last partial line in buffer
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const finished = processLine(line);
          if (finished) {
            return;
          }
        }
      }
    }

    // Flush any remaining text in buffer when stream ends
    if (buffer.length > 0) {
      buffer += decoder.decode(); // flush decoder
      const remainingLines = buffer.split('\n');
      for (const line of remainingLines) {
        processLine(line);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
