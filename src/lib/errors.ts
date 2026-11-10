export function providerDisplayName(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic';
    case 'gemini':
      return 'Gemini';
    case 'xai':
      return 'xAI';
    case 'tavily':
      return 'Tavily';
    case 'gmail':
      return 'Gmail';
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}

export function friendlyError(
  provider: string,
  status?: number,
  bodyMessage?: string,
  err?: unknown
): { message: string; isAuthError?: boolean; isRetryable?: boolean; isContextTooLong?: boolean } {
  const pName = providerDisplayName(provider);

  if (err instanceof DOMException && err.name === 'AbortError') {
    return { message: '(stopped)' };
  }

  // Network / CORS / TypeError
  if (err instanceof TypeError || (err && (err as { name?: string }).name === 'TypeError')) {
    return {
      message: `Couldn't reach ${pName}. Check your internet connection or disable ad blockers for this site.`,
    };
  }

  const rawText = (bodyMessage || (err instanceof Error ? err.message : '') || '').toLowerCase();

  // Check for context length / token limits first regardless of status
  if (
    status === 413 ||
    rawText.includes('context') ||
    rawText.includes('too long') ||
    rawText.includes('token') ||
    rawText.includes('max_tokens') ||
    rawText.includes('maximum context length')
  ) {
    return {
      message: 'The message is too long for this model. Remove a document or start a new chat.',
      isContextTooLong: true,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    rawText.includes('api_key_invalid') ||
    rawText.includes('api key not valid') ||
    rawText.includes('invalid api key') ||
    rawText.includes('permission_denied')
  ) {
    return {
      message: `Your ${pName} key was rejected or not set. Check it in Settings or the Settings > Secrets panel.`,
      isAuthError: true,
    };
  }

  if (status === 402) {
    return {
      message: `Your ${pName} account is out of credit. Add billing on their site.`,
    };
  }

  if (status === 404) {
    return {
      message: `This model isn't available for your ${pName} key. Pick another model.`,
    };
  }

  if (status === 429) {
    return {
      message: `${pName} rate limit or quota reached. Wait a minute or check your billing.`,
    };
  }

  if (status && status >= 500 && status <= 599) {
    return {
      message: `${pName} is having problems right now. Try again shortly.`,
      isRetryable: true,
    };
  }

  if (status === 400) {
    // Sanitize any URL or key from bodyMessage
    const cleaned = (bodyMessage || 'Bad request').replace(/key=[^&\s]+/gi, 'key=***');
    return {
      message: `${pName} rejected the request: ${cleaned}`,
    };
  }

  if (rawText.includes('empty reply') || rawText.includes('empty response')) {
    return {
      message: 'The model returned an empty reply. Try again or pick another model.',
    };
  }

  const shortMsg = (bodyMessage || (err instanceof Error ? err.message : String(err || 'Unknown error')))
    .replace(/key=[^&\s]+/gi, 'key=***')
    .slice(0, 160);

  return {
    message: shortMsg ? `Something went wrong: ${shortMsg}` : 'Something went wrong. Please check your settings.',
  };
}
