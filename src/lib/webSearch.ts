import { Source } from '../types';

let gemini429InSession = false;
let tavilyBlockedInSession = false;

export function isGemini429InSession(): boolean {
  return gemini429InSession;
}

export function isTavilyBlockedInSession(): boolean {
  return tavilyBlockedInSession;
}

export function setGemini429InSession(val: boolean): void {
  gemini429InSession = val;
}

export interface WebSearchResult {
  summary: string;
  sources: Source[];
  formattedContext: string;
  engineUsed: 'gemini' | 'tavily';
}

export async function testTavilyKey(key: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key.trim()}`,
      },
      body: JSON.stringify({
        query: 'test',
        search_depth: 'basic',
        max_results: 1,
      }),
    });
    if (!res.ok) {
      return { success: false, error: `Tavily returned HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    if (err instanceof TypeError) {
      tavilyBlockedInSession = true;
      return { success: false, error: "Tavily can't be called from this browser (CORS/network block)." };
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function searchWithGemini(
  query: string,
  geminiKey?: string,
  modelFallbacks: string[] = []
): Promise<{ summary: string; sources: Source[] }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (geminiKey && geminiKey.trim()) {
    headers['x-gemini-key'] = geminiKey.trim();
  }

  const preferredModel = modelFallbacks.find((m) => m.toLowerCase().includes('flash')) || 'gemini-3.8-flash';

  const res = await fetch('/api/gemini/search', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      modelId: preferredModel,
    }),
  });

  if (res.status === 429) {
    gemini429InSession = true;
    throw new Error('Gemini 429 quota reached');
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Gemini search failed with status ${res.status}`);
  }

  const json = await res.json();
  return {
    summary: json.summary || '',
    sources: json.sources || [],
  };
}

async function searchWithTavily(
  query: string,
  tavilyKey: string,
  onTavilyBlocked?: () => void
): Promise<{ summary: string; sources: Source[] }> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tavilyKey.trim()}`,
      },
      body: JSON.stringify({
        query: query.slice(0, 400),
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Tavily search failed with status ${res.status}`);
    }

    const json = await res.json();
    const parts: string[] = [];
    if (json.answer) {
      parts.push(json.answer);
    }

    const sources: Source[] = [];
    const results: Array<{ title?: string; url?: string; content?: string }> = json.results || [];
    for (const r of results) {
      if (r.content) {
        parts.push(r.content.slice(0, 1200));
      }
      if (r.url) {
        sources.push({
          kind: 'web',
          title: r.title || r.url,
          url: r.url,
        });
      }
    }

    return {
      summary: parts.join('\n\n'),
      sources,
    };
  } catch (err) {
    if (err instanceof TypeError) {
      tavilyBlockedInSession = true;
      if (onTavilyBlocked) {
        onTavilyBlocked();
      }
    }
    throw err;
  }
}

export async function performWebSearch(
  query: string,
  keys: { gemini?: string; tavily?: string },
  options?: {
    modelFallbacks?: string[];
    onTavilyBlocked?: () => void;
  }
): Promise<WebSearchResult | null> {
  // 1. Always attempt server search first (Google Search grounding with Wikipedia fallback)
  try {
    const res = await searchWithGemini(query, keys.gemini, options?.modelFallbacks);
    if (res && (res.summary || (res.sources && res.sources.length > 0))) {
      return formatResult(res.summary, res.sources, 'gemini');
    }
  } catch (e) {
    console.warn('Server search grounding bypassed, checking Tavily fallback:', e);
  }

  // 2. Try Tavily fallback if key provided
  const hasTavily = Boolean(keys.tavily?.trim()) && !tavilyBlockedInSession;
  if (hasTavily) {
    try {
      const res = await searchWithTavily(query, keys.tavily!, options?.onTavilyBlocked);
      if (res && (res.summary || (res.sources && res.sources.length > 0))) {
        return formatResult(res.summary, res.sources, 'tavily');
      }
    } catch (e) {
      console.warn('Tavily search failed:', e);
    }
  }

  return null;
}

function formatResult(summary: string, sources: Source[], engine: 'gemini' | 'tavily'): WebSearchResult {
  const parts: string[] = [];
  sources.forEach((s, idx) => {
    parts.push(`[${idx + 1}] ${s.title} — ${s.url || ''}`);
  });
  if (summary) {
    parts.push(summary);
  }

  const formattedContext = `<web_results>\n${parts.join('\n')}\n</web_results>`;

  return {
    summary,
    sources,
    formattedContext,
    engineUsed: engine,
  };
}
