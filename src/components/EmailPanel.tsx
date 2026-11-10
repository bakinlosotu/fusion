import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Send,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronLeft,
  Loader2,
  AlertCircle,
  LogOut,
  KeyRound,
} from 'lucide-react';
import {
  GmailMessageSummary,
  GmailFullMessage,
  waitForGoogleOAuth,
  mapGmailAuthError,
  mapGmailApiError,
  fetchGmailProfile,
  listGmailMessages,
  fetchFullGmailMessage,
} from '../lib/gmail';
import { useToast } from './Toast';

export type EmailDraftTone = 'Brief' | 'Friendly' | 'Formal';

interface EmailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  googleClientId?: string;
  onOpenSettings: () => void;
  onDraftReply: (payload: {
    from: string;
    subject: string;
    date: string;
    body: string;
    tone: EmailDraftTone;
    customNotes?: string;
  }) => void;
}

export const EmailPanel: React.FC<EmailPanelProps> = ({
  isOpen,
  onClose,
  googleClientId,
  onOpenSettings,
  onDraftReply,
}) => {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'paste' | 'gmail'>('paste');

  // Paste mode state
  const [pastedEmail, setPastedEmail] = useState('');
  const [pasteFrom, setPasteFrom] = useState('');
  const [pasteSubject, setPasteSubject] = useState('');

  // Shared draft settings
  const [tone, setTone] = useState<EmailDraftTone>('Friendly');
  const [customNotes, setCustomNotes] = useState('');

  // Gmail mode state
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number>(0);
  const [gmailUserEmail, setGmailUserEmail] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<GmailFullMessage | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isTokenExpired = Date.now() > tokenExpiresAt;

  const handleConnectGmail = async () => {
    if (!googleClientId?.trim()) {
      onOpenSettings();
      return;
    }

    setIsConnecting(true);
    setGmailError(null);

    const isAvailable = await waitForGoogleOAuth(10000);
    if (!isAvailable) {
      setIsConnecting(false);
      setGmailError("Couldn't load Google sign-in. Check your ad blocker.");
      return;
    }

    try {
      const client = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: googleClientId.trim(),
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        callback: async (resp) => {
          setIsConnecting(false);
          if (resp.error) {
            setGmailError(mapGmailAuthError(resp.error));
            return;
          }
          if (resp.access_token) {
            const expTime = Date.now() + (resp.expires_in || 3600) * 1000;
            setAccessToken(resp.access_token);
            setTokenExpiresAt(expTime);

            try {
              const email = await fetchGmailProfile(resp.access_token);
              setGmailUserEmail(email);
              loadGmailMessages(resp.access_token);
            } catch (err) {
              setGmailError(err instanceof Error ? err.message : String(err));
            }
          }
        },
        error_callback: (err) => {
          setIsConnecting(false);
          setGmailError(mapGmailAuthError(err.type || 'popup_failed_to_open'));
        },
      });

      client.requestAccessToken();
    } catch (e) {
      setIsConnecting(false);
      setGmailError(e instanceof Error ? e.message : 'Failed to launch Google sign-in');
    }
  };

  const handleDisconnectGmail = () => {
    if (accessToken && window.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(accessToken, () => {});
    }
    setAccessToken(null);
    setTokenExpiresAt(0);
    setGmailUserEmail('');
    setMessages([]);
    setSelectedMessage(null);
    showToast('Disconnected Gmail', 'info');
  };

  const loadGmailMessages = async (token = accessToken, query = searchQuery) => {
    if (!token) return;
    setIsLoadingMessages(true);
    setGmailError(null);
    try {
      const list = await listGmailMessages(token, query);
      setMessages(list);
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : 'Failed to fetch messages');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleSelectMessage = async (msgSummary: GmailMessageSummary) => {
    if (!accessToken) return;
    setIsLoadingDetail(true);
    setGmailError(null);
    try {
      const full = await fetchFullGmailMessage(accessToken, msgSummary.id);
      setSelectedMessage(full);
    } catch (err) {
      setGmailError(err instanceof Error ? err.message : 'Failed to load email content');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleDraftFromPaste = () => {
    if (!pastedEmail.trim()) return;
    onDraftReply({
      from: pasteFrom.trim() || 'Sender',
      subject: pasteSubject.trim() || 'Email',
      date: new Date().toLocaleDateString(),
      body: pastedEmail.trim(),
      tone,
      customNotes: customNotes.trim() || undefined,
    });
    onClose();
  };

  const handleDraftFromGmail = () => {
    if (!selectedMessage) return;
    onDraftReply({
      from: selectedMessage.from,
      subject: selectedMessage.subject,
      date: selectedMessage.date,
      body: selectedMessage.body,
      tone,
      customNotes: customNotes.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white dark:bg-[#171A21] border-l border-[#E3E6EB] dark:border-[#2A2F3A] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#E3E6EB] dark:border-[#2A2F3A]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#4F46E5]/10 dark:bg-[#818CF8]/20 flex items-center justify-center text-[#4F46E5] dark:text-[#818CF8]">
              <Mail size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F3F4F6]">Email Assistant</h2>
              <p className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">Generate replies using current chat model</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] cursor-pointer"
            aria-label="Close email panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Segmented control */}
        <div className="p-3 border-b border-[#E3E6EB] dark:border-[#2A2F3A] bg-[#F6F7F9] dark:bg-[#11141A]">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A]">
            <button
              type="button"
              onClick={() => {
                setTab('paste');
                setSelectedMessage(null);
              }}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                tab === 'paste'
                  ? 'bg-[#4F46E5] text-white shadow-xs'
                  : 'text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F3F4F6]'
              }`}
            >
              Paste email
            </button>
            <button
              type="button"
              onClick={() => setTab('gmail')}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                tab === 'gmail'
                  ? 'bg-[#4F46E5] text-white shadow-xs'
                  : 'text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F3F4F6]'
              }`}
            >
              Gmail inbox
            </button>
          </div>
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'paste' ? (
            /* PASTE MODE (zero setup, always works) */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#111827] dark:text-[#F3F4F6]">
                  Paste Email Body *
                </label>
                <textarea
                  rows={8}
                  placeholder="Paste the email you received here…"
                  value={pastedEmail}
                  onChange={(e) => setPastedEmail(e.target.value)}
                  className="w-full bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl p-3 text-xs text-[#111827] dark:text-[#F3F4F6] placeholder-[#6B7280] dark:placeholder-[#9CA3AF] outline-none resize-none leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">
                    Sender (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. sender@example.com"
                    value={pasteFrom}
                    onChange={(e) => setPasteFrom(e.target.value)}
                    className="w-full bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl px-2.5 py-1.5 text-xs text-[#111827] dark:text-[#F3F4F6] outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">
                    Subject (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Project Update"
                    value={pasteSubject}
                    onChange={(e) => setPasteSubject(e.target.value)}
                    className="w-full bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl px-2.5 py-1.5 text-xs text-[#111827] dark:text-[#F3F4F6] outline-none"
                  />
                </div>
              </div>

              {/* Shared Draft Controls */}
              <div className="pt-2 border-t border-[#E3E6EB] dark:border-[#2A2F3A] space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#111827] dark:text-[#F3F4F6]">
                    Tone
                  </label>
                  <div className="flex gap-2">
                    {(['Brief', 'Friendly', 'Formal'] as EmailDraftTone[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTone(t)}
                        className={`flex-1 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                          tone === t
                            ? 'bg-[#4F46E5] text-white border-[#4F46E5]'
                            : 'bg-white dark:bg-[#171A21] border-[#E3E6EB] dark:border-[#2A2F3A] text-[#111827] dark:text-[#F3F4F6] hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#111827] dark:text-[#F3F4F6]">
                    Anything the reply must say?
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Confirm meeting at 3pm tomorrow, decline politely..."
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    className="w-full bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-[#111827] dark:text-[#F3F4F6] outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDraftFromPaste}
                  disabled={!pastedEmail.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-medium disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer shadow-xs"
                >
                  <Send size={14} />
                  <span>Draft reply</span>
                </button>
              </div>
            </div>
          ) : (
            /* GMAIL MODE */
            <div className="space-y-4">
              {!googleClientId?.trim() ? (
                /* No Client ID warning */
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>Add your Google OAuth Client ID in Settings to connect Gmail.</div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={onOpenSettings}
                      className="px-3 py-1.5 rounded-lg bg-[#4F46E5] text-white font-medium text-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <KeyRound size={13} />
                      Open Settings
                    </button>
                    <button
                      onClick={() => setTab('paste')}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#4F46E5] dark:text-[#818CF8] hover:underline cursor-pointer"
                    >
                      Use Paste email instead
                    </button>
                  </div>
                </div>
              ) : !accessToken || isTokenExpired ? (
                /* Connect button */
                <div className="p-5 text-center space-y-4 bg-[#F6F7F9] dark:bg-[#11141A] rounded-xl border border-[#E3E6EB] dark:border-[#2A2F3A]">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                    <Mail size={20} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-[#111827] dark:text-[#F3F4F6]">Connect your Gmail</h3>
                    <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] max-w-xs mx-auto">
                      Read inbox emails (read-only) and draft contextual replies with zero copy-pasting.
                    </p>
                  </div>

                  {gmailError && (
                    <div className="text-xs text-[#DC2626] dark:text-[#F87171] p-2 bg-red-50 dark:bg-red-950/40 rounded-lg">
                      {gmailError}
                    </div>
                  )}

                  <button
                    onClick={handleConnectGmail}
                    disabled={isConnecting}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {isConnecting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                    <span>{isTokenExpired && accessToken ? 'Reconnect Gmail' : 'Connect Gmail'}</span>
                  </button>

                  <div className="pt-2">
                    <button
                      onClick={() => setTab('paste')}
                      className="text-xs text-[#4F46E5] dark:text-[#818CF8] hover:underline cursor-pointer"
                    >
                      Use Paste email instead
                    </button>
                  </div>
                </div>
              ) : selectedMessage ? (
                /* Selected message view & draft reply */
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#E3E6EB] dark:border-[#2A2F3A]">
                    <button
                      onClick={() => setSelectedMessage(null)}
                      className="inline-flex items-center gap-1 text-xs text-[#4F46E5] dark:text-[#818CF8] hover:underline cursor-pointer"
                    >
                      <ChevronLeft size={14} />
                      Back to list
                    </button>
                    <span className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">{selectedMessage.date}</span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-[#111827] dark:text-[#F3F4F6]">
                      {selectedMessage.subject}
                    </h3>
                    <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF]">
                      From: <span className="text-[#111827] dark:text-[#F3F4F6] font-medium">{selectedMessage.from}</span>
                    </p>
                  </div>

                  <div className="max-h-56 overflow-y-auto p-3 rounded-xl bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A] text-xs text-[#111827] dark:text-[#F3F4F6] whitespace-pre-wrap leading-relaxed">
                    {selectedMessage.body || '(No body text found)'}
                  </div>

                  {/* Shared Draft Controls */}
                  <div className="pt-2 border-t border-[#E3E6EB] dark:border-[#2A2F3A] space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[#111827] dark:text-[#F3F4F6]">
                        Tone
                      </label>
                      <div className="flex gap-2">
                        {(['Brief', 'Friendly', 'Formal'] as EmailDraftTone[]).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTone(t)}
                            className={`flex-1 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                              tone === t
                                ? 'bg-[#4F46E5] text-white border-[#4F46E5]'
                                : 'bg-white dark:bg-[#171A21] border-[#E3E6EB] dark:border-[#2A2F3A] text-[#111827] dark:text-[#F3F4F6] hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#111827] dark:text-[#F3F4F6]">
                        Anything the reply must say?
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Confirming arrival, attached report..."
                        value={customNotes}
                        onChange={(e) => setCustomNotes(e.target.value)}
                        className="w-full bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl px-3 py-2 text-xs text-[#111827] dark:text-[#F3F4F6] outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleDraftFromGmail}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-medium transition-colors cursor-pointer shadow-xs"
                    >
                      <Send size={14} />
                      <span>Draft reply</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Connected Inbox view */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs pb-1 border-b border-[#E3E6EB] dark:border-[#2A2F3A]">
                    <span className="text-[#6B7280] dark:text-[#9CA3AF]">
                      Connected as <span className="font-medium text-[#111827] dark:text-[#F3F4F6]">{gmailUserEmail}</span>
                    </span>
                    <button
                      onClick={handleDisconnectGmail}
                      className="inline-flex items-center gap-1 text-[11px] text-[#DC2626] dark:text-[#F87171] hover:underline cursor-pointer"
                    >
                      <LogOut size={12} />
                      Disconnect
                    </button>
                  </div>

                  {/* Search box and refresh */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B7280] dark:text-[#9CA3AF]" />
                      <input
                        type="text"
                        placeholder="Search mail (e.g. is:unread)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadGmailMessages()}
                        className="w-full bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#111827] dark:text-[#F3F4F6] outline-none"
                      />
                    </div>
                    <button
                      onClick={() => loadGmailMessages()}
                      disabled={isLoadingMessages}
                      className="p-1.5 rounded-xl border border-[#E3E6EB] dark:border-[#2A2F3A] bg-white dark:bg-[#171A21] text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] cursor-pointer"
                      title="Refresh"
                    >
                      <RefreshCw size={14} className={isLoadingMessages ? 'animate-spin' : ''} />
                    </button>
                  </div>

                  {gmailError && (
                    <div className="text-xs text-[#DC2626] dark:text-[#F87171] p-2 bg-red-50 dark:bg-red-950/40 rounded-lg">
                      {gmailError}
                    </div>
                  )}

                  {isLoadingMessages ? (
                    <div className="py-12 text-center text-xs text-[#6B7280] dark:text-[#9CA3AF] flex flex-col items-center gap-2">
                      <Loader2 size={18} className="animate-spin text-[#4F46E5] dark:text-[#818CF8]" />
                      <span>Loading emails…</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-12 text-center text-xs text-[#6B7280] dark:text-[#9CA3AF]">
                      No emails found.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                      {messages.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleSelectMessage(m)}
                          className="w-full text-left p-2.5 rounded-xl border border-[#E3E6EB] dark:border-[#2A2F3A] bg-white dark:bg-[#171A21] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] transition-colors cursor-pointer space-y-1 relative"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-[#111827] dark:text-[#F3F4F6] truncate max-w-[200px] flex items-center gap-1.5">
                              {m.isUnread && (
                                <span className="w-2 h-2 rounded-full bg-[#4F46E5] dark:bg-[#818CF8] shrink-0" />
                              )}
                              {m.from.split('<')[0].replace(/"/g, '') || m.from}
                            </span>
                            <span className="text-[10px] text-[#6B7280] dark:text-[#9CA3AF] shrink-0">
                              {m.date ? new Date(m.date).toLocaleDateString() : ''}
                            </span>
                          </div>
                          <div className="text-xs font-medium text-[#111827] dark:text-[#F3F4F6] truncate">
                            {m.subject}
                          </div>
                          <p className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] line-clamp-1">
                            {m.snippet}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
