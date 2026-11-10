import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));

function isValidApiKey(key?: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (
    !trimmed ||
    trimmed === 'MY_GEMINI_API_KEY' ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed.length < 8
  ) {
    return false;
  }
  return true;
}

function getApiKey(customKey?: string): string {
  if (isValidApiKey(customKey)) {
    return customKey!.trim();
  }
  if (isValidApiKey(process.env.GEMINI_API_KEY)) {
    return process.env.GEMINI_API_KEY!.trim();
  }
  return '';
}

function getGenAIClient(customKey?: string): GoogleGenAI | null {
  const apiKey = getApiKey(customKey);
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// 1. Status endpoint
app.get('/api/gemini/status', (req, res) => {
  const customKey = (req.headers['x-gemini-key'] as string) || '';
  const hasValid = isValidApiKey(customKey) || isValidApiKey(process.env.GEMINI_API_KEY);
  res.json({
    available: hasValid,
    hasServerKey: isValidApiKey(process.env.GEMINI_API_KEY),
  });
});

// 2. List Gemini Models endpoint
app.get('/api/gemini/models', async (req, res) => {
  const customKey = (req.headers['x-gemini-key'] as string) || '';
  const ai = getGenAIClient(customKey);

  const fallbackModels = [
    { provider: 'gemini' as const, id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite' },
    { provider: 'gemini' as const, id: 'gemini-flash-latest', label: 'gemini-flash-latest' },
    { provider: 'gemini' as const, id: 'gemini-3.8-flash', label: 'gemini-3.8-flash' },
    { provider: 'gemini' as const, id: 'gemini-4-argon', label: 'gemini-4-argon' },
  ];

  if (!ai) {
    return res.json({ models: fallbackModels });
  }

  try {
    const listResponse = await ai.models.list({
      config: {
        pageSize: 100,
      },
    });

    const dropRegex = /(embedding|image|tts|live|audio|native-audio|robotics)/i;
    const models: Array<{ provider: 'gemini'; id: string; label: string }> = [];

    // Prioritize standard Gemini 3 and 2.5 models
    const preferredIds = [
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-4-argon',
      'gemini-flash-latest',
      'gemini-2.5-flash',
    ];

    for await (const m of listResponse) {
      const name = m.name || '';
      const cleanId = name.replace(/^models\//, '');
      const supported: string[] = (m as any).supportedGenerationMethods || (m as any).supportedActions || ['generateContent'];

      if (
        supported.includes('generateContent') &&
        cleanId.toLowerCase().includes('gemini') &&
        !dropRegex.test(cleanId)
      ) {
        models.push({
          provider: 'gemini',
          id: cleanId,
          label: m.displayName || cleanId,
        });
      }
    }

    // Ensure preferred models exist in list even if pagination / filters missed them
    preferredIds.forEach((pid) => {
      if (!models.some((m) => m.id === pid)) {
        models.unshift({
          provider: 'gemini',
          id: pid,
          label: pid,
        });
      }
    });

    res.json({ models });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (customKey && customKey.trim()) {
      return res.status(400).json({
        error: 'Your Gemini key was rejected or invalid. Check it in Settings or the Settings > Secrets panel.',
      });
    }
    console.warn('Gemini model list fallback used:', errMsg.slice(0, 120));
    res.json({ models: fallbackModels });
  }
});

async function streamSynthesizedWebAnswer(res: express.Response, content: string): Promise<void> {
  const match = content.match(/<web_results>([\s\S]*?)<\/web_results>/);
  const webContent = match ? match[1].trim() : '';
  const question = content
    .replace(/<web_results>[\s\S]*?<\/web_results>/g, '')
    .replace(/<documents>[\s\S]*?<\/documents>/g, '')
    .trim();

  let answer = '';
  if (webContent) {
    const rawParagraphs = webContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('['));

    const citations = webContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('['));

    answer = `### Web Search Results for "${question || 'Query'}"\n\n`;
    if (rawParagraphs.length > 0) {
      answer += rawParagraphs.join('\n\n') + '\n\n';
    } else {
      answer += webContent + '\n\n';
    }

    if (citations.length > 0) {
      answer += `**Sources:**\n` + citations.map((c) => `- ${c}`).join('\n');
    }
  } else {
    answer = `No web search results were found for "${question}".`;
  }

  const words = answer.split(' ');
  for (let i = 0; i < words.length; i += 4) {
    const chunk = words.slice(i, i + 4).join(' ') + (i + 4 < words.length ? ' ' : '');
    res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    await new Promise((r) => setTimeout(r, 20));
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

// 3. Streaming Chat endpoint
app.post('/api/gemini/stream', async (req, res) => {
  const customKey = (req.headers['x-gemini-key'] as string) || '';
  const { modelId, messages, system } = req.body;

  if (!modelId || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing modelId or messages array' });
  }

  const ai = getGenAIClient(customKey);
  const cleanModelId = modelId.replace(/^models\//, '');

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const lastUserMsg = messages[messages.length - 1]?.content || '';
  const hasWebResults = lastUserMsg.includes('<web_results>');

  if (!ai) {
    if (hasWebResults) {
      await streamSynthesizedWebAnswer(res, lastUserMsg);
      return;
    }
    res.write(`data: ${JSON.stringify({ error: 'Your Gemini key was rejected or not configured. Check it in Settings.' })}\n\n`);
    res.end();
    return;
  }

  // Map messages to SDK format
  const contents = messages.map((m: { role: string; content: string }) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const candidates = [cleanModelId, 'gemini-3.1-flash-lite', 'gemini-flash-latest'].filter(
    (m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx
  );

  let streamSuccess = false;
  let lastErrMsg = '';

  for (const candidateModel of candidates) {
    try {
      const stream = await ai.models.generateContentStream({
        model: candidateModel,
        contents,
        config: system ? { systemInstruction: system } : undefined,
      });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
      streamSuccess = true;
      break;
    } catch (err: unknown) {
      lastErrMsg = err instanceof Error ? err.message : String(err);
      console.warn(`Model ${candidateModel} failed:`, lastErrMsg.slice(0, 100));
      // Only retry if it is an availability error (503 / 404 / 429)
      const isRetryable =
        lastErrMsg.includes('503') ||
        lastErrMsg.includes('404') ||
        lastErrMsg.includes('UNAVAILABLE') ||
        lastErrMsg.includes('high demand') ||
        lastErrMsg.includes('no longer available');

      if (!isRetryable) {
        break;
      }
    }
  }

  if (!streamSuccess) {
    if (hasWebResults) {
      await streamSynthesizedWebAnswer(res, lastUserMsg);
    } else {
      res.write(`data: ${JSON.stringify({ error: lastErrMsg })}\n\n`);
      res.end();
    }
  }
});

async function searchWebFallback(
  query: string
): Promise<{ summary: string; sources: Array<{ kind: 'web'; title: string; url: string }> }> {
  try {
    const wikiUrl =
      'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent(query) +
      '&utf8=&format=json';
    const wikiRes = await fetch(wikiUrl, {
      headers: { 'User-Agent': 'FusionAI/1.0 (https://fusion.ai)' },
    });
    const wikiData = await wikiRes.json();
    const items = wikiData.query?.search || [];

    const sources: Array<{ kind: 'web'; title: string; url: string }> = [];
    const snippets: string[] = [];

    for (const item of items.slice(0, 5)) {
      const title = item.title;
      const cleanSnippet = (item.snippet || '').replace(/<[^>]+>/g, '').trim();
      const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
      sources.push({ kind: 'web', title, url: pageUrl });
      snippets.push(`**${title}**: ${cleanSnippet}`);
    }

    if (snippets.length === 0) {
      return {
        summary: `Web results retrieved for "${query}".`,
        sources: [
          {
            kind: 'web',
            title: `Search: ${query}`,
            url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
          },
        ],
      };
    }

    return {
      summary: snippets.join('\n\n'),
      sources,
    };
  } catch (err) {
    console.warn('Fallback search error:', err);
    return {
      summary: `Reference info for "${query}".`,
      sources: [
        {
          kind: 'web',
          title: `Search: ${query}`,
          url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
        },
      ],
    };
  }
}

// 4. Grounded Web Search endpoint
app.post('/api/gemini/search', async (req, res) => {
  const customKey = (req.headers['x-gemini-key'] as string) || '';
  const { query, modelId } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing query string' });
  }

  const ai = getGenAIClient(customKey);
  const targetModel = modelId ? modelId.replace(/^models\//, '') : 'gemini-3.1-flash-lite';

  // 1. Try Gemini with Google Search tool with a 3-second timeout
  if (ai) {
    try {
      const generatePromise = ai.models.generateContent({
        model: targetModel,
        contents: `Search the web and write a concise factual summary (with dates and numbers) that answers: ${query}`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Search tool timeout')), 3500)
      );

      const response = (await Promise.race([generatePromise, timeoutPromise])) as any;

      if (response) {
        const summary = response.text || '';
        const groundingChunks =
          response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

        const sources: Array<{ kind: 'web'; title: string; url: string }> = [];
        const seenUris = new Set<string>();

        for (const chunk of groundingChunks) {
          const web = chunk.web;
          if (web && web.uri && !seenUris.has(web.uri)) {
            seenUris.add(web.uri);
            sources.push({
              kind: 'web',
              title: web.title || web.uri,
              url: web.uri,
            });
            if (sources.length >= 6) break;
          }
        }

        if (summary) {
          return res.json({ summary, sources });
        }
      }
    } catch (err: unknown) {
      console.warn('Gemini search grounding tool bypassed, using fast web search:', err instanceof Error ? err.message.slice(0, 100) : String(err));
    }
  }

  // 2. Fast reliable web search fallback
  const fallback = await searchWebFallback(query);
  res.json(fallback);
});

// 5. WebSocket Live API bridge for voice / real-time streaming
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', async (clientWs: WebSocket) => {
  console.log('Live API client connected');
  let session: any = null;

  try {
    const ai = getGenAIClient();
    if (!ai) {
      clientWs.send(JSON.stringify({ error: 'Gemini API key is not configured on the server.' }));
      clientWs.close();
      return;
    }
    session = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction: 'You are Fusion, a helpful and natural conversational AI assistant.',
      },
      callbacks: {
        onmessage: (message: any) => {
          for (const part of message.serverContent?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
          }
          if (message.serverContent?.interrupted) {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          }
        },
      },
    });

    clientWs.on('message', (data: any) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.audio && session) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (parsed.text && session) {
          session.sendRealtimeInput({
            text: parsed.text,
          });
        }
      } catch (e) {
        console.error('Error parsing client live message:', e);
      }
    });

    clientWs.on('close', () => {
      console.log('Live API client disconnected');
      if (session) {
        try {
          session.close();
        } catch {
          // Ignore close error
        }
      }
    });
  } catch (err) {
    console.error('Error establishing Gemini Live session:', err);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Failed to connect to Live API',
        })
      );
      clientWs.close();
    }
  }
});

// Upgrade handling for WebSockets
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);
  if (pathname === '/live' || pathname === '/api/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// 6. Vite middleware in dev, static files in prod
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(port, () => {
    console.log(`Server listening on port ${port} (mode: ${process.env.NODE_ENV || 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
