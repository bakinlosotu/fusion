import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Menu,
  Sparkles,
  Settings as SettingsIcon,
  Plus,
} from 'lucide-react';
import {
  Chat,
  ChatMessage,
  ChatDoc,
  ProviderId,
  ModelInfo,
  ProviderStatus,
} from './types';
import {
  getKeys,
  subscribeKeys,
} from './store/keys';
import {
  getChatIndex,
  getChat,
  saveChat,
  deleteChat,
} from './store/chats';
import {
  fetchProviderModels,
  executeStreamChat,
  PROVIDER_NAMES,
} from './providers';
import { retrieveDocContext } from './lib/docs';
import { performWebSearch } from './lib/webSearch';
import { buildPromptWithContext } from './lib/prompt';
import { friendlyError } from './lib/errors';

import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider, useToast } from './components/Toast';
import { Sidebar } from './components/Sidebar';
import { ModelPicker } from './components/ModelPicker';
import { ChatView } from './components/ChatView';
import { Composer, ComposerHandle } from './components/Composer';
import { WelcomeCard } from './components/WelcomeCard';
import { SettingsDrawer } from './components/SettingsDrawer';
import { EmailPanel, EmailDraftTone } from './components/EmailPanel';

const PROVIDERS: ProviderId[] = ['openai', 'anthropic', 'gemini', 'xai'];

function AppContent() {
  const { showToast } = useToast();

  // State
  const [keys, setKeys] = useState(getKeys);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);

  // Models & Provider Status
  const [modelsByProvider, setModelsByProvider] = useState<Record<ProviderId, ModelInfo[]>>({
    openai: [],
    anthropic: [],
    gemini: [],
    xai: [],
  });
  const [providerStatuses, setProviderStatuses] = useState<Record<ProviderId, ProviderStatus>>({
    openai: { connected: false },
    anthropic: { connected: false },
    gemini: { connected: false },
    xai: { connected: false },
  });

  // Selected Model ("provider:modelId")
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('harness.lastModel') || '';
  });

  // Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const tokenThrottleTimeoutRef = useRef<number | null>(null);
  const accumulatedStreamTextRef = useRef<string>('');

  // UI Panels
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // Dark Theme
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('harness.theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const composerRef = useRef<ComposerHandle>(null);

  // Apply dark mode class to HTML element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('harness.theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('harness.theme', 'light');
    }
  }, [isDarkMode]);

  // Subscribe to keys changes
  useEffect(() => {
    return subscribeKeys((newKeys) => {
      setKeys(newKeys);
    });
  }, []);

  // Keyboard shortcut Ctrl/Cmd+K for new chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleCreateNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch models whenever keys change
  const refreshProviderModels = useCallback(async () => {
    const currentKeys = getKeys();
    const newStatuses: Record<ProviderId, ProviderStatus> = {
      openai: { connected: false },
      anthropic: { connected: false },
      gemini: { connected: false },
      xai: { connected: false },
    };
    const newModels: Record<ProviderId, ModelInfo[]> = {
      openai: [],
      anthropic: [],
      gemini: [],
      xai: [],
    };

    let firstFoundModel: string | null = null;

    for (const p of PROVIDERS) {
      const key = currentKeys[p]?.trim() || '';
      if (key || p === 'gemini') {
        try {
          const list = await fetchProviderModels(p, key, false);
          newModels[p] = list;
          newStatuses[p] = {
            connected: true,
            modelsCount: list.length,
          };
          if (!firstFoundModel && list.length > 0) {
            firstFoundModel = `${p}:${list[0].id}`;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          newStatuses[p] = {
            connected: false,
            error: errMsg,
          };
        }
      }
    }

    setModelsByProvider(newModels);
    setProviderStatuses(newStatuses);

    // If current selectedModel is empty or invalid, pick first connected
    setSelectedModel((prev) => {
      if (prev) {
        const [p] = prev.split(':');
        if (newStatuses[p as ProviderId]?.connected) {
          return prev;
        }
      }
      return firstFoundModel || prev;
    });
  }, []);

  useEffect(() => {
    refreshProviderModels();
  }, [keys, refreshProviderModels]);

  // Load Chats on Mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const index = await getChatIndex((msg) => showToast(msg, 'warning'));
      const loadedChats: Chat[] = [];
      for (const id of index) {
        const c = await getChat(id, (msg) => showToast(msg, 'warning'));
        if (c) loadedChats.push(c);
      }

      if (!isMounted) return;
      setChats(loadedChats);

      // Restore last active chat from storage or newest
      const lastActiveId = localStorage.getItem('harness.lastChatId');
      if (lastActiveId && loadedChats.some((c) => c.id === lastActiveId)) {
        setCurrentChatId(lastActiveId);
        const active = loadedChats.find((c) => c.id === lastActiveId);
        setCurrentChat(active || null);
      } else if (loadedChats.length > 0) {
        setCurrentChatId(loadedChats[0].id);
        setCurrentChat(loadedChats[0]);
      } else {
        // Create initial chat
        handleCreateNewChat();
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Update localStorage when active chat changes
  useEffect(() => {
    if (currentChatId) {
      localStorage.setItem('harness.lastChatId', currentChatId);
    }
  }, [currentChatId]);

  // Select a Chat
  const handleSelectChat = async (id: string) => {
    if (isStreaming) {
      handleStopStreaming();
    }
    setCurrentChatId(id);
    const c = chats.find((item) => item.id === id) || (await getChat(id));
    setCurrentChat(c || null);
    if (c?.model) {
      setSelectedModel(c.model);
    }
  };

  // Create New Chat
  const handleCreateNewChat = (initialTitle = 'New Chat', initialModel = selectedModel) => {
    const newChat: Chat = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: initialTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      docs: [],
      model: initialModel,
    };

    setChats((prev) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setCurrentChat(newChat);
    saveChat(newChat, (msg) => showToast(msg, 'warning'));
    return newChat;
  };

  // Delete Chat
  const handleDeleteChat = async (id: string) => {
    if (isStreaming && currentChatId === id) {
      handleStopStreaming();
    }

    await deleteChat(id, (msg) => showToast(msg, 'warning'));
    const remaining = chats.filter((c) => c.id !== id);
    setChats(remaining);

    if (currentChatId === id) {
      if (remaining.length > 0) {
        handleSelectChat(remaining[0].id);
      } else {
        handleCreateNewChat();
      }
    }
    showToast('Chat deleted', 'info');
  };

  // Rename Chat
  const handleRenameChat = async (id: string, newTitle: string) => {
    const updatedChats = chats.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c));
    setChats(updatedChats);

    const target = updatedChats.find((c) => c.id === id);
    if (target) {
      if (currentChatId === id) {
        setCurrentChat(target);
      }
      await saveChat(target, (msg) => showToast(msg, 'warning'));
    }
  };

  // Model Selection
  const handleSelectModel = (modelKey: string) => {
    setSelectedModel(modelKey);
    localStorage.setItem('harness.lastModel', modelKey);

    if (currentChat) {
      const updated = { ...currentChat, model: modelKey, updatedAt: Date.now() };
      setCurrentChat(updated);
      setChats((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      saveChat(updated, (msg) => showToast(msg, 'warning'));
    }
  };

  // Document Management on current chat
  const handleAddDoc = async (doc: ChatDoc) => {
    if (!currentChat) return;
    const updatedDocs = [...currentChat.docs, doc];
    const updatedChat = { ...currentChat, docs: updatedDocs, updatedAt: Date.now() };
    setCurrentChat(updatedChat);
    setChats((prev) => prev.map((c) => (c.id === updatedChat.id ? updatedChat : c)));
    await saveChat(updatedChat, (msg) => showToast(msg, 'warning'));
    showToast(`Attached ${doc.name}`, 'success');
  };

  const handleRemoveDoc = async (docId: string) => {
    if (!currentChat) return;
    const updatedDocs = currentChat.docs.filter((d) => d.id !== docId);
    const updatedChat = { ...currentChat, docs: updatedDocs, updatedAt: Date.now() };
    setCurrentChat(updatedChat);
    setChats((prev) => prev.map((c) => (c.id === updatedChat.id ? updatedChat : c)));
    await saveChat(updatedChat, (msg) => showToast(msg, 'warning'));
  };

  // Check if current selected model has valid API key
  const [currentProvider, currentModelId] = (selectedModel || '').split(':') as [ProviderId, string];
  const hasKeyForCurrentModel = Boolean(currentProvider && (currentProvider === 'gemini' || keys[currentProvider]?.trim()));
  const hasAnyWorkingKey = Object.values(providerStatuses).some((s) => s.connected);
  const canWebSearch = true; // Server-side Gemini Search grounding enabled by default

  // Stop Streaming
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (tokenThrottleTimeoutRef.current) {
      clearTimeout(tokenThrottleTimeoutRef.current);
      tokenThrottleTimeoutRef.current = null;
    }

    setIsStreaming(false);

    if (currentChat && streamingMessageId) {
      const stoppedText = accumulatedStreamTextRef.current
        ? `${accumulatedStreamTextRef.current} _(stopped)_`
        : '_(stopped)_';

      const updatedMessages = currentChat.messages.map((m) =>
        m.id === streamingMessageId ? { ...m, content: stoppedText } : m
      );

      const updatedChat = { ...currentChat, messages: updatedMessages, updatedAt: Date.now() };
      setCurrentChat(updatedChat);
      setChats((prev) => prev.map((c) => (c.id === updatedChat.id ? updatedChat : c)));
      saveChat(updatedChat, (msg) => showToast(msg, 'warning'));
    }

    setStreamingMessageId(undefined);
  };

  // Send Message Logic
  const handleSendMessage = async (
    userText: string,
    options?: {
      overrideModel?: string;
      emailContext?: string;
      emailMeta?: { to?: string; subject?: string };
      isDraftReply?: boolean;
    }
  ) => {
    const activeModel = options?.overrideModel || selectedModel;
    if (!activeModel) {
      showToast('Pick a model you have a key for.', 'warning');
      return;
    }

    const [provider, modelId] = activeModel.split(':') as [ProviderId, string];
    const providerKey = keys[provider]?.trim() || '';

    if (provider !== 'gemini' && !providerKey) {
      showToast('Pick a model you have a key for.', 'warning');
      return;
    }

    let chat = currentChat;
    if (!chat) {
      chat = handleCreateNewChat();
    }

    // Auto title if first user message
    const isFirstMessage = chat.messages.length === 0;
    const chatTitle = isFirstMessage ? userText.slice(0, 40) : chat.title;

    // 1. Add User Message
    const userMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: userText,
      createdAt: Date.now(),
    };

    const newMessages = [...chat.messages, userMessage];
    let updatedChat: Chat = {
      ...chat,
      title: chatTitle,
      messages: newMessages,
      model: activeModel,
      updatedAt: Date.now(),
    };

    setCurrentChat(updatedChat);
    setChats((prev) => prev.map((c) => (c.id === updatedChat.id ? updatedChat : c)));
    await saveChat(updatedChat, (msg) => showToast(msg, 'warning'));

    // 2. Prepare context: Documents
    let docsContext = '';
    let docSources: ChatMessage['sources'] = [];
    if (chat.docs.length > 0) {
      const retrieval = retrieveDocContext(chat.docs, userText);
      docsContext = retrieval.formattedContext;
      docSources = retrieval.sources;
      if (retrieval.wasTruncated) {
        showToast(
          `${retrieval.truncatedDocName} is large — only the most relevant parts are sent.`,
          'info'
        );
      }
    }

    // 3. Prepare context: Web Search if enabled
    let webContext = '';
    let webSources: ChatMessage['sources'] = [];
    if (webSearchEnabled && !options?.isDraftReply) {
      showToast('Searching the web…', 'info');
      try {
        const searchResult = await performWebSearch(userText, {
          gemini: keys.gemini,
          tavily: keys.tavily,
        }, {
          modelFallbacks: modelsByProvider.gemini.map((m) => m.id),
          onTavilyBlocked: () => {
            showToast("Tavily can't be called from this browser — web search will use Gemini only.", 'warning');
          },
        });

        if (searchResult && (searchResult.summary || searchResult.sources.length > 0)) {
          webContext = searchResult.formattedContext;
          webSources = searchResult.sources;
          if (searchResult.sources.length > 0) {
            showToast(`Grounded with ${searchResult.sources.length} web sources`, 'success');
          }
        } else {
          showToast('Web search failed — answering without it.', 'warning');
        }
      } catch (e) {
        console.warn('Web search error:', e);
        showToast('Web search failed — answering without it.', 'warning');
      }
    }

    // 4. Build prompt with trimming (80k budget)
    const promptPayload = buildPromptWithContext({
      history: updatedChat.messages.slice(0, -1), // prior history
      latestUserText: userText,
      docsContext,
      webContext,
      emailContext: options?.emailContext,
    });

    // 5. Add placeholder Assistant message
    const assistantMessageId = `${Date.now() + 1}-${Math.random().toString(36).slice(2, 7)}`;
    const initialSources = [...(docSources || []), ...(webSources || [])];

    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      model: activeModel,
      sources: initialSources.length > 0 ? initialSources : undefined,
      kind: options?.isDraftReply ? 'email-draft' : 'normal',
      emailMeta: options?.emailMeta,
      createdAt: Date.now(),
    };

    updatedChat = {
      ...updatedChat,
      messages: [...updatedChat.messages, assistantPlaceholder],
      updatedAt: Date.now(),
    };

    setCurrentChat(updatedChat);
    setChats((prev) => prev.map((c) => (c.id === updatedChat.id ? updatedChat : c)));

    // 6. Launch streaming
    setIsStreaming(true);
    setStreamingMessageId(assistantMessageId);
    accumulatedStreamTextRef.current = '';

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let localAccumulated = '';

    const flushTokenUpdate = () => {
      setCurrentChat((prevChat) => {
        if (!prevChat) return null;
        const msgs = prevChat.messages.map((m) =>
          m.id === assistantMessageId ? { ...m, content: localAccumulated } : m
        );
        return { ...prevChat, messages: msgs };
      });
      tokenThrottleTimeoutRef.current = null;
    };

    try {
      await executeStreamChat(
        provider,
        providerKey,
        modelId,
        promptPayload.messages,
        promptPayload.system,
        abortController.signal,
        (token: string) => {
          localAccumulated += token;
          accumulatedStreamTextRef.current = localAccumulated;

          // Throttle UI re-renders to every ~50ms
          if (!tokenThrottleTimeoutRef.current) {
            tokenThrottleTimeoutRef.current = window.setTimeout(flushTokenUpdate, 50);
          }
        }
      );

      // Final flush
      if (tokenThrottleTimeoutRef.current) {
        clearTimeout(tokenThrottleTimeoutRef.current);
        tokenThrottleTimeoutRef.current = null;
      }

      // Final save to IndexedDB
      setCurrentChat((prevChat) => {
        if (!prevChat) return null;
        const finalMsgs = prevChat.messages.map((m) =>
          m.id === assistantMessageId ? { ...m, content: localAccumulated } : m
        );
        const finalChat = { ...prevChat, messages: finalMsgs, updatedAt: Date.now() };
        saveChat(finalChat, (msg) => showToast(msg, 'warning'));
        setChats((all) => all.map((c) => (c.id === finalChat.id ? finalChat : c)));
        return finalChat;
      });
    } catch (err) {
      if (tokenThrottleTimeoutRef.current) {
        clearTimeout(tokenThrottleTimeoutRef.current);
        tokenThrottleTimeoutRef.current = null;
      }

      if (abortController.signal.aborted) {
        // Stopped by user, handled in handleStopStreaming
        return;
      }

      const mapped = friendlyError(provider, undefined, undefined, err);

      // Replace or update the assistant message to an error card
      setCurrentChat((prevChat) => {
        if (!prevChat) return null;
        const errorMsgs = prevChat.messages.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                content: mapped.message,
                kind: 'error' as const,
              }
            : m
        );
        const errorChat = { ...prevChat, messages: errorMsgs, updatedAt: Date.now() };
        saveChat(errorChat, (msg) => showToast(msg, 'warning'));
        setChats((all) => all.map((c) => (c.id === errorChat.id ? errorChat : c)));
        return errorChat;
      });
    } finally {
      setIsStreaming(false);
      setStreamingMessageId(undefined);
      abortControllerRef.current = null;
    }
  };

  // Regenerate Response
  const handleRegenerate = () => {
    if (!currentChat || isStreaming) return;

    // Find the last user message
    let lastUserMessage: ChatMessage | null = null;
    for (let i = currentChat.messages.length - 1; i >= 0; i--) {
      if (currentChat.messages[i].role === 'user') {
        lastUserMessage = currentChat.messages[i];
        break;
      }
    }

    if (!lastUserMessage) return;

    // Drop the last assistant/error message from history and re-send
    const slicedMessages = currentChat.messages.slice(0, -1);
    const updated = { ...currentChat, messages: slicedMessages };
    setCurrentChat(updated);

    handleSendMessage(lastUserMessage.content);
  };

  // Draft reply from Email Panel
  const handleDraftEmailReply = (payload: {
    from: string;
    subject: string;
    date: string;
    body: string;
    tone: EmailDraftTone;
    customNotes?: string;
  }) => {
    const chatTitle = `Reply: ${payload.subject.replace(/^re:\s*/i, '').slice(0, 35) || payload.body.slice(0, 35)}`;
    const emailChat = handleCreateNewChat(chatTitle);

    const emailTagContent = `<email>\nFrom: ${payload.from}\nSubject: ${payload.subject}\nDate: ${payload.date}\nBody: ${payload.body.slice(0, 20000)}\n</email>`;

    const userPrompt = `Draft a ${payload.tone.toLowerCase()} reply to this email.${
      payload.customNotes ? ` Notes: ${payload.customNotes}.` : ''
    }\nWrite only the reply email body, ready to send. No subject line, no commentary.`;

    handleSendMessage(userPrompt, {
      overrideModel: emailChat.model || selectedModel,
      emailContext: emailTagContent,
      emailMeta: {
        to: payload.from,
        subject: payload.subject,
      },
      isDraftReply: true,
    });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#0F1115] text-[#111827] dark:text-[#F3F4F6]">
      {/* Sidebar */}
      <Sidebar
        chats={chats}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleCreateNewChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenEmail={() => setIsEmailOpen(true)}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Navbar */}
        <header className="h-14 border-b border-[#E3E6EB] dark:border-[#2A2F3A] flex items-center justify-between px-4 bg-white/80 dark:bg-[#0F1115]/80 backdrop-blur-xs shrink-0 z-10">
          <div className="flex items-center gap-2">
            {/* Mobile hamburger */}
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-1.5 rounded-lg text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] md:hidden cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>

            {/* Logo in header for small screens / brand */}
            <div className="flex items-center gap-2 mr-2">
              <span className="font-bold text-sm tracking-tight text-[#111827] dark:text-[#F3F4F6]">
                Fusion
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wide rounded-md bg-[#4F46E5]/10 dark:bg-[#818CF8]/20 text-[#4F46E5] dark:text-[#818CF8] border border-[#4F46E5]/20 dark:border-[#818CF8]/30">
                BYOK
              </span>
            </div>

            {/* Model Picker */}
            <ModelPicker
              currentModelId={selectedModel}
              onSelectModel={handleSelectModel}
              modelsByProvider={modelsByProvider}
              providerStatuses={providerStatuses}
              onOpenSettings={() => setIsSettingsOpen(true)}
              hasKeyForCurrentModel={hasKeyForCurrentModel}
            />
          </div>

          <div className="flex items-center gap-1.5">
            {/* New chat icon button */}
            <button
              onClick={() => handleCreateNewChat()}
              className="p-1.5 rounded-xl border border-[#E3E6EB] dark:border-[#2A2F3A] text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] hover:text-[#111827] dark:hover:text-[#F3F4F6] transition-colors cursor-pointer"
              title="New chat (Cmd+K)"
            >
              <Plus size={16} />
            </button>

            {/* Settings button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 rounded-xl border border-[#E3E6EB] dark:border-[#2A2F3A] text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] hover:text-[#111827] dark:hover:text-[#F3F4F6] transition-colors cursor-pointer"
              title="Settings"
            >
              <SettingsIcon size={16} />
            </button>
          </div>
        </header>

        {/* Message Container or Welcome Card */}
        <main className="flex-1 overflow-hidden flex flex-col relative">
          {!hasAnyWorkingKey ? (
            <WelcomeCard
              onOpenSettings={() => setIsSettingsOpen(true)}
              providerStatuses={providerStatuses}
            />
          ) : currentChat ? (
            <ChatView
              chat={currentChat}
              isStreaming={isStreaming}
              streamingMessageId={streamingMessageId}
              onRegenerate={handleRegenerate}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          ) : null}
        </main>

        {/* Composer */}
        <Composer
          ref={composerRef}
          onSendMessage={handleSendMessage}
          onStopStreaming={handleStopStreaming}
          isStreaming={isStreaming}
          disabled={!hasAnyWorkingKey}
          disabledPlaceholder={
            !hasAnyWorkingKey ? 'Add an API key in Settings to start chatting' : undefined
          }
          docs={currentChat?.docs || []}
          onAddDoc={handleAddDoc}
          onRemoveDoc={handleRemoveDoc}
          webSearchEnabled={webSearchEnabled}
          onToggleWebSearch={setWebSearchEnabled}
          canWebSearch={canWebSearch}
        />
      </div>

      {/* Settings Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        providerStatuses={providerStatuses}
        setProviderStatuses={setProviderStatuses}
        onKeysChanged={refreshProviderModels}
      />

      {/* Email Panel */}
      <EmailPanel
        isOpen={isEmailOpen}
        onClose={() => setIsEmailOpen(false)}
        googleClientId={keys.googleClientId}
        onOpenSettings={() => {
          setIsEmailOpen(false);
          setIsSettingsOpen(true);
        }}
        onDraftReply={handleDraftEmailReply}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ErrorBoundary>
  );
}
