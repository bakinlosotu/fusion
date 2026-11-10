export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'xai';

export interface ModelInfo {
  provider: ProviderId;
  id: string;
  label: string;
}

export interface Source {
  kind: 'doc' | 'web';
  title: string;
  url?: string;
  page?: number | null;
  snippet?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string; // what the user typed / what the model replied (no injected context)
  model?: string; // e.g. "anthropic:claude-3-7-sonnet"
  sources?: Source[];
  kind?: 'normal' | 'email-draft' | 'error';
  emailMeta?: { to?: string; subject?: string; threadId?: string };
  createdAt: number;
}

export interface DocChunk {
  text: string;
  page: number | null;
  part: number;
}

export interface ChatDoc {
  id: string;
  name: string;
  chars: number;
  chunks: DocChunk[];
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  docs: ChatDoc[];
  model?: string; // "provider:modelId"
}

export interface ApiKeys {
  openai?: string;
  anthropic?: string;
  gemini?: string;
  xai?: string;
  tavily?: string;
  googleClientId?: string;
}

export interface ProviderStatus {
  connected: boolean;
  modelsCount?: number;
  error?: string;
  testing?: boolean;
}
