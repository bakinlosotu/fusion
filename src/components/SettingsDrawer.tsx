import React, { useState } from 'react';
import {
  X,
  Eye,
  EyeOff,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { ApiKeys, ProviderId, ProviderStatus } from '../types';
import {
  getKeys,
  saveKeys,
  getRememberKeys,
  setRememberKeys,
  clearAllKeys,
} from '../store/keys';
import { testProviderKey, PROVIDER_NAMES } from '../providers';
import { testTavilyKey } from '../lib/webSearch';
import { exportAllChats, clearAllData } from '../store/chats';
import { useToast } from './Toast';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  providerStatuses: Record<ProviderId, ProviderStatus>;
  setProviderStatuses: React.Dispatch<React.SetStateAction<Record<ProviderId, ProviderStatus>>>;
  onKeysChanged: () => void;
}

const PROVIDER_LIST: ProviderId[] = ['openai', 'anthropic', 'gemini', 'xai'];

const PROVIDER_LINKS: Record<ProviderId, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
  xai: 'https://console.x.ai',
};

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  providerStatuses,
  setProviderStatuses,
  onKeysChanged,
}) => {
  const { showToast } = useToast();
  const [keys, setLocalKeys] = useState<ApiKeys>(getKeys);
  const [remember, setLocalRemember] = useState<boolean>(getRememberKeys);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [showGmailHelp, setShowGmailHelp] = useState(false);
  const [tavilyStatus, setTavilyStatus] = useState<{ testing?: boolean; success?: boolean; error?: string }>({});

  if (!isOpen) return null;

  const toggleShow = (id: string) => {
    setShowKey((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleKeyChange = (field: keyof ApiKeys, value: string) => {
    const updated = { ...keys, [field]: value };
    setLocalKeys(updated);
    saveKeys(updated);
    onKeysChanged();
  };

  const handleRememberToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setLocalRemember(checked);
    setRememberKeys(checked);
    onKeysChanged();
  };

  const runTest = async (p: ProviderId) => {
    const key = (keys[p] || '').trim();
    if (!key && p !== 'gemini') {
      setProviderStatuses((prev) => ({
        ...prev,
        [p]: { connected: false, error: 'Enter a key first' },
      }));
      return;
    }

    setProviderStatuses((prev) => ({
      ...prev,
      [p]: { ...prev[p], testing: true, error: undefined },
    }));

    const result = await testProviderKey(p, key);
    setProviderStatuses((prev) => ({
      ...prev,
      [p]: {
        testing: false,
        connected: result.success,
        modelsCount: result.count,
        error: result.error,
      },
    }));

    if (result.success) {
      showToast(`${PROVIDER_NAMES[p]} connected successfully`, 'success');
    } else {
      showToast(result.error || `${PROVIDER_NAMES[p]} test failed`, 'error');
    }
  };

  const runTavilyTest = async () => {
    const key = (keys.tavily || '').trim();
    if (!key) {
      setTavilyStatus({ error: 'Enter a Tavily key first' });
      return;
    }

    setTavilyStatus({ testing: true });
    const result = await testTavilyKey(key);
    setTavilyStatus({ testing: false, success: result.success, error: result.error });

    if (result.success) {
      showToast('Tavily search connected', 'success');
    } else {
      showToast(result.error || 'Tavily test failed', 'error');
    }
  };

  const handleForgetAll = () => {
    if (window.confirm('Forget all saved API keys?')) {
      clearAllKeys();
      setLocalKeys({});
      setProviderStatuses({
        openai: { connected: false },
        anthropic: { connected: false },
        gemini: { connected: false },
        xai: { connected: false },
      });
      setTavilyStatus({});
      onKeysChanged();
      showToast('All keys have been removed.', 'info');
    }
  };

  const handleExport = async () => {
    try {
      await exportAllChats((msg) => showToast(msg, 'warning'));
      showToast('Chats exported to harness-chats.json', 'success');
    } catch {
      showToast('Failed to export chats', 'error');
    }
  };

  const handleClearAllData = async () => {
    if (
      window.confirm(
        'Are you sure you want to delete ALL chats, documents, and keys? This cannot be undone.'
      )
    ) {
      await clearAllData();
      showToast('All data cleared. Reloading...', 'info');
      setTimeout(() => {
        window.location.reload();
      }, 600);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white dark:bg-[#171A21] border-l border-[#E3E6EB] dark:border-[#2A2F3A] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#E3E6EB] dark:border-[#2A2F3A]">
          <div>
            <h2 className="text-base font-semibold text-[#111827] dark:text-[#F3F4F6]">Settings</h2>
            <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF]">
              Storage: <span className="font-medium text-[#4F46E5] dark:text-[#818CF8]">{remember ? 'Saved on this device' : 'This tab only'}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] cursor-pointer"
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Storage toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A]">
            <div className="space-y-0.5">
              <label htmlFor="remember-keys" className="text-xs font-semibold text-[#111827] dark:text-[#F3F4F6] cursor-pointer">
                Remember keys on this device
              </label>
              <p className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">
                Uses localStorage instead of sessionStorage.
              </p>
            </div>
            <input
              id="remember-keys"
              type="checkbox"
              checked={remember}
              onChange={handleRememberToggle}
              className="w-4 h-4 rounded text-[#4F46E5] focus:ring-0 cursor-pointer"
            />
          </div>

          {/* Model Provider Keys */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF]">
              Model Provider Keys
            </h3>

            {PROVIDER_LIST.map((p) => {
              const status = providerStatuses[p];
              const val = keys[p] || '';
              const isMasked = !showKey[p];

              return (
                <div key={p} className="p-3.5 rounded-xl bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#111827] dark:text-[#F3F4F6]">
                      {PROVIDER_NAMES[p]}
                    </span>
                    <a
                      href={PROVIDER_LINKS[p]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#4F46E5] dark:text-[#818CF8] hover:underline inline-flex items-center gap-1"
                    >
                      Get a key <ExternalLink size={11} />
                    </a>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={isMasked ? 'password' : 'text'}
                        placeholder={
                          p === 'gemini'
                            ? 'Server key connected (or enter custom key)'
                            : `Enter ${PROVIDER_NAMES[p]} API key`
                        }
                        value={val}
                        onChange={(e) => handleKeyChange(p, e.target.value)}
                        className="w-full bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl px-3 py-1.5 text-xs text-[#111827] dark:text-[#F3F4F6] pr-8 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => toggleShow(p)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F3F4F6] cursor-pointer"
                        aria-label="Toggle password visibility"
                      >
                        {isMasked ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => runTest(p)}
                      disabled={(p !== 'gemini' && !val.trim()) || status?.testing}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] text-xs font-medium text-[#111827] dark:text-[#F3F4F6] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0 flex items-center gap-1.5"
                    >
                      {status?.testing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      Test
                    </button>
                  </div>

                  {/* Status line */}
                  {status && (
                    <div className="text-[11px] flex items-center gap-1.5 pt-0.5">
                      {status.testing ? (
                        <span className="text-[#6B7280] dark:text-[#9CA3AF]">Testing connection...</span>
                      ) : status.connected ? (
                        <span className="text-[#16A34A] dark:text-[#22C55E] flex items-center gap-1">
                          <CheckCircle size={12} />
                          Connected · {status.modelsCount || 0} models
                        </span>
                      ) : status.error ? (
                        <span className="text-[#DC2626] dark:text-[#F87171] flex items-center gap-1">
                          <AlertCircle size={12} />
                          {status.error}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Web Search Settings */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF]">
              Web Search Backup (Tavily)
            </h3>
            <div className="p-3.5 rounded-xl bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A] space-y-2">
              <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] leading-relaxed">
                Web search uses your free Google Gemini key first. Add a free Tavily key (1,000 searches/month, no card) as a backup.
              </p>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-semibold text-[#111827] dark:text-[#F3F4F6]">Tavily API Key</span>
                <a
                  href="https://app.tavily.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#4F46E5] dark:text-[#818CF8] hover:underline inline-flex items-center gap-1"
                >
                  Get a free key <ExternalLink size={11} />
                </a>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey.tavily ? 'text' : 'password'}
                    placeholder="Enter Tavily API key"
                    value={keys.tavily || ''}
                    onChange={(e) => handleKeyChange('tavily', e.target.value)}
                    className="w-full bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl px-3 py-1.5 text-xs text-[#111827] dark:text-[#F3F4F6] pr-8 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow('tavily')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F3F4F6] cursor-pointer"
                    aria-label="Toggle password visibility"
                  >
                    {showKey.tavily ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={runTavilyTest}
                  disabled={!keys.tavily?.trim() || tavilyStatus.testing}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] text-xs font-medium text-[#111827] dark:text-[#F3F4F6] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0 flex items-center gap-1.5"
                >
                  {tavilyStatus.testing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Test
                </button>
              </div>

              {tavilyStatus.success && (
                <div className="text-[11px] text-[#16A34A] dark:text-[#22C55E] flex items-center gap-1">
                  <CheckCircle size={12} /> Connected
                </div>
              )}
              {tavilyStatus.error && (
                <div className="text-[11px] text-[#DC2626] dark:text-[#F87171] flex items-center gap-1">
                  <AlertCircle size={12} /> {tavilyStatus.error}
                </div>
              )}
            </div>
          </div>

          {/* Gmail OAuth Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF]">
              Gmail Integration (Optional)
            </h3>
            <div className="p-3.5 rounded-xl bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A] space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#111827] dark:text-[#F3F4F6]">
                  Google OAuth Client ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 123456789-xyz.apps.googleusercontent.com"
                  value={keys.googleClientId || ''}
                  onChange={(e) => handleKeyChange('googleClientId', e.target.value)}
                  className="w-full bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl px-3 py-1.5 text-xs text-[#111827] dark:text-[#F3F4F6] outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowGmailHelp(!showGmailHelp)}
                className="text-xs text-[#4F46E5] dark:text-[#818CF8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>How do I get this?</span>
                {showGmailHelp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {showGmailHelp && (
                <div className="p-3 rounded-lg bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] text-xs text-[#6B7280] dark:text-[#9CA3AF] space-y-2">
                  <ol className="list-decimal pl-4 space-y-1 text-[11px] leading-relaxed">
                    <li>Go to console.cloud.google.com and create a project called <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">harness</code>.</li>
                    <li>In APIs & Services &rarr; Library, search <strong>Gmail API</strong> and click <strong>Enable</strong>.</li>
                    <li>In Google Auth Platform &rarr; Consent screen, choose <strong>External</strong>, set app name <em>Fusion</em>.</li>
                    <li>Under Audience &rarr; <strong>Test users</strong>, add your Gmail address.</li>
                    <li>Under Clients &rarr; Create client &rarr; <strong>Web application</strong>, add Authorized JavaScript origins: your deployed domain and <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">http://localhost:5173</code>.</li>
                    <li>Copy the <strong>Client ID</strong> and paste it here.</li>
                  </ol>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                    Note: Google OAuth cannot be used inside the AI Studio preview frame due to origin domain restrictions. Use Paste email mode, or test on your deployed domain.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Data Section */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF]">
              Data & Storage
            </h3>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] text-xs font-medium text-[#111827] dark:text-[#F3F4F6] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] cursor-pointer"
              >
                <Download size={14} />
                <span>Export all chats (JSON)</span>
              </button>

              <button
                type="button"
                onClick={handleForgetAll}
                className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 cursor-pointer"
              >
                <span>Forget all keys</span>
              </button>

              <button
                type="button"
                onClick={handleClearAllData}
                className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#171A21] border border-[#FCA5A5] dark:border-[#7F1D1D] text-xs font-medium text-[#DC2626] dark:text-[#F87171] hover:bg-red-50 dark:hover:bg-red-950/20 cursor-pointer"
              >
                <Trash2 size={14} />
                <span>Clear all data (IndexedDB & Keys)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
