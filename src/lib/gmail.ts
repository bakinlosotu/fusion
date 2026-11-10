export interface GmailMessageSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

export interface GmailFullMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
}

// Global declaration for Google Identity Services
declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }): {
            requestAccessToken(): void;
          };
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

export function waitForGoogleOAuth(maxWaitMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) {
      resolve(true);
      return;
    }

    const start = Date.now();
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > maxWaitMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 200);
  });
}

export function mapGmailAuthError(errType: string): string {
  const lower = (errType || '').toLowerCase();
  if (lower.includes('popup_closed')) {
    return 'Sign-in window was closed.';
  }
  if (lower.includes('popup_failed_to_open') || lower.includes('blocked')) {
    return 'Your browser blocked the sign-in popup. Allow popups for this site.';
  }
  if (lower.includes('idpiframe_initialization_failed') || lower.includes('origin_mismatch')) {
    return "This site's address isn't on your Google OAuth client's Authorized JavaScript origins.";
  }
  return `Google sign-in error: ${errType}`;
}

export function mapGmailApiError(status: number): string {
  if (status === 401) {
    return 'Gmail session expired — reconnect.';
  }
  if (status === 403) {
    return 'Gmail access denied. Make sure the Gmail API is enabled and your address is a test user.';
  }
  return `Gmail error (HTTP ${status}).`;
}

export async function fetchGmailProfile(token: string): Promise<string> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(mapGmailApiError(res.status));
  }
  const json = await res.json();
  return json.emailAddress || '';
}

export async function listGmailMessages(token: string, query = ''): Promise<GmailMessageSummary[]> {
  const q = query.trim() || 'in:inbox';
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(q)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(mapGmailApiError(res.status));
  }

  const json = await res.json();
  const rawList: Array<{ id: string; threadId: string }> = json.messages || [];
  if (rawList.length === 0) {
    return [];
  }

  // Fetch metadata headers in parallel
  const detailsPromises = rawList.map(async (item) => {
    const metaUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) return null;
    const msg = await metaRes.json();

    const headers: Array<{ name: string; value: string }> = msg.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    const labelIds: string[] = msg.labelIds || [];
    const isUnread = labelIds.includes('UNREAD');

    return {
      id: item.id,
      threadId: item.threadId,
      from: getHeader('From'),
      subject: getHeader('Subject') || '(No subject)',
      date: getHeader('Date'),
      snippet: msg.snippet || '',
      isUnread,
    } as GmailMessageSummary;
  });

  const settled = await Promise.allSettled(detailsPromises);
  const results: GmailMessageSummary[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value) {
      results.push(s.value);
    }
  }

  return results;
}

function decodeBase64Url(dataStr: string): string {
  try {
    let base64 = dataStr.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    console.error('Base64url decode error', e);
    return '';
  }
}

interface MessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: MessagePart[];
}

function extractBodyFromPayload(payload?: MessagePart): string {
  if (!payload) return '';

  let plainText = '';
  let htmlText = '';

  function walk(part: MessagePart) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plainText += decodeBase64Url(part.body.data) + '\n';
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      htmlText += decodeBase64Url(part.body.data) + '\n';
    }

    if (Array.isArray(part.parts)) {
      for (const p of part.parts) {
        walk(p);
      }
    }
  }

  walk(payload);

  if (plainText.trim()) {
    return plainText.trim();
  }

  if (htmlText.trim()) {
    try {
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      return (doc.body.textContent || '').trim();
    } catch {
      return htmlText.replace(/<[^>]+>/g, ' ').trim();
    }
  }

  return '';
}

export async function fetchFullGmailMessage(token: string, messageId: string): Promise<GmailFullMessage> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(mapGmailApiError(res.status));
  }

  const json = await res.json();
  const headers: Array<{ name: string; value: string }> = json.payload?.headers || [];
  const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const body = extractBodyFromPayload(json.payload);

  return {
    id: json.id,
    threadId: json.threadId,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject') || '(No subject)',
    date: getHeader('Date'),
    body,
  };
}

export function buildOpenInGmailUrl(to: string, subject: string, draftBody: string): { url: string; fallbackNeeded: boolean } {
  let cleanSubject = subject.trim();
  if (!cleanSubject.toLowerCase().startsWith('re:')) {
    cleanSubject = `Re: ${cleanSubject}`;
  }

  const base = 'https://mail.google.com/mail/?view=cm&fs=1';
  const fullUrl = `${base}&to=${encodeURIComponent(to)}&su=${encodeURIComponent(cleanSubject)}&body=${encodeURIComponent(draftBody)}`;

  if (fullUrl.length > 1800) {
    const fallbackUrl = `${base}&to=${encodeURIComponent(to)}&su=${encodeURIComponent(cleanSubject)}`;
    return { url: fallbackUrl, fallbackNeeded: true };
  }

  return { url: fullUrl, fallbackNeeded: false };
}
