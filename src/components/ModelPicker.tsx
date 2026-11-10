import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Plus, AlertTriangle } from 'lucide-react';
import { ModelInfo, ProviderId } from '../types';
import { PROVIDER_NAMES } from '../providers';

interface ModelPickerProps {
  currentModelId?: string; // "provider:modelId"
  onSelectModel: (modelKey: string) => void;
  modelsByProvider: Record<ProviderId, ModelInfo[]>;
  providerStatuses: Record<ProviderId, { connected: boolean }>;
  onOpenSettings: () => void;
  hasKeyForCurrentModel: boolean;
}

const PROVIDERS: ProviderId[] = ['openai', 'anthropic', 'gemini', 'xai'];

const PROVIDER_DOTS: Record<ProviderId, string> = {
  openai: '#10A37F',
  anthropic: '#D97757',
  gemini: '#4285F4',
  xai: '#111827', // will adapt in dark mode
};

export const ModelPicker: React.FC<ModelPickerProps> = ({
  currentModelId,
  onSelectModel,
  modelsByProvider,
  providerStatuses,
  onOpenSettings,
  hasKeyForCurrentModel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customProvider, setCustomProvider] = useState<ProviderId>('openai');
  const [customId, setCustomId] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Parse current selected
  const [currentProvider, currentRawModel] = useMemo(() => {
    if (!currentModelId) return [undefined, undefined];
    const parts = currentModelId.split(':');
    return [parts[0] as ProviderId, parts.slice(1).join(':')];
  }, [currentModelId]);

  const currentLabel = useMemo(() => {
    if (!currentProvider || !currentRawModel) return 'Select Model';
    const list = modelsByProvider[currentProvider] || [];
    const found = list.find((m) => m.id === currentRawModel);
    return found ? found.label : currentRawModel;
  }, [currentProvider, currentRawModel, modelsByProvider]);

  // Filtered models
  const filteredByProvider = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result: Record<ProviderId, ModelInfo[]> = {
      openai: [],
      anthropic: [],
      gemini: [],
      xai: [],
    };

    PROVIDERS.forEach((p) => {
      const list = modelsByProvider[p] || [];
      if (!q) {
        result[p] = list;
      } else {
        result[p] = list.filter(
          (m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)
        );
      }
    });

    return result;
  }, [modelsByProvider, search]);

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customId.trim()) return;
    const modelKey = `${customProvider}:${customId.trim()}`;
    onSelectModel(modelKey);
    setShowCustomModal(false);
    setIsOpen(false);
    setCustomId('');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Picker button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
          !hasKeyForCurrentModel
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200'
            : 'bg-white dark:bg-[#171A21] border-[#E3E6EB] dark:border-[#2A2F3A] text-[#111827] dark:text-[#F3F4F6] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B]'
        }`}
        title={!hasKeyForCurrentModel ? 'Provider key missing for this model' : undefined}
      >
        {!hasKeyForCurrentModel ? (
          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
        ) : currentProvider ? (
          <span
            className="w-2 h-2 rounded-full inline-block shrink-0"
            style={{
              backgroundColor: currentProvider === 'xai' ? 'currentColor' : PROVIDER_DOTS[currentProvider],
            }}
          />
        ) : null}

        <span className="max-w-[140px] sm:max-w-[190px] truncate">{currentLabel}</span>
        <ChevronDown size={14} className="text-[#6B7280] dark:text-[#9CA3AF] shrink-0" />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-72 sm:w-80 rounded-xl bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search box inside dropdown */}
          <div className="p-2 border-b border-[#E3E6EB] dark:border-[#2A2F3A] flex items-center gap-2">
            <Search size={14} className="text-[#6B7280] dark:text-[#9CA3AF] ml-1 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-[#111827] dark:text-[#F3F4F6] placeholder-[#6B7280] dark:placeholder-[#9CA3AF] outline-none"
            />
          </div>

          {/* Model list grouped by provider */}
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-2">
            {PROVIDERS.map((p) => {
              const isConnected = providerStatuses[p]?.connected;
              const models = filteredByProvider[p];

              return (
                <div key={p} className="space-y-0.5">
                  <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-[#6B7280] dark:text-[#9CA3AF] uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full inline-block shrink-0"
                        style={{
                          backgroundColor: p === 'xai' ? 'currentColor' : PROVIDER_DOTS[p],
                        }}
                      />
                      <span>{PROVIDER_NAMES[p]}</span>
                    </div>
                    {!isConnected && (
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          onOpenSettings();
                        }}
                        className="text-[10px] lowercase text-[#4F46E5] dark:text-[#818CF8] hover:underline cursor-pointer"
                      >
                        add key in settings
                      </button>
                    )}
                  </div>

                  {!isConnected ? (
                    <div className="px-2 py-1 text-xs text-[#6B7280] dark:text-[#9CA3AF] italic">
                      Add key in Settings
                    </div>
                  ) : models.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-[#6B7280] dark:text-[#9CA3AF] italic">
                      {search ? 'No matching models' : 'No chat models found'}
                    </div>
                  ) : (
                    models.map((m) => {
                      const fullKey = `${p}:${m.id}`;
                      const isSelected = currentModelId === fullKey;
                      return (
                        <button
                          key={fullKey}
                          onClick={() => {
                            onSelectModel(fullKey);
                            setIsOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#4F46E5]/10 text-[#4F46E5] dark:text-[#818CF8] font-medium'
                              : 'text-[#111827] dark:text-[#F3F4F6] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B]'
                          }`}
                        >
                          <span className="truncate">{m.label}</span>
                          {isSelected && <span className="text-[10px] font-semibold">✓</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>

          {/* Custom model ID input row */}
          <div className="p-2 border-t border-[#E3E6EB] dark:border-[#2A2F3A] bg-[#F6F7F9] dark:bg-[#13161C]">
            {!showCustomModal ? (
              <button
                onClick={() => setShowCustomModal(true)}
                className="w-full flex items-center justify-center gap-1.5 py-1 text-xs font-medium text-[#4F46E5] dark:text-[#818CF8] hover:underline cursor-pointer"
              >
                <Plus size={14} />
                <span>Use a custom model ID…</span>
              </button>
            ) : (
              <form onSubmit={handleApplyCustom} className="space-y-1.5">
                <div className="text-[11px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">
                  Custom Model ID
                </div>
                <div className="flex gap-1.5">
                  <select
                    value={customProvider}
                    onChange={(e) => setCustomProvider(e.target.value as ProviderId)}
                    className="bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-lg px-1.5 py-1 text-xs text-[#111827] dark:text-[#F3F4F6] outline-none"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Gemini</option>
                    <option value="xai">xAI</option>
                  </select>
                  <input
                    type="text"
                    placeholder="e.g. gpt-4o-mini"
                    value={customId}
                    onChange={(e) => setCustomId(e.target.value)}
                    className="flex-1 bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-lg px-2 py-1 text-xs text-[#111827] dark:text-[#F3F4F6] outline-none"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCustomModal(false)}
                    className="px-2 py-0.5 text-xs text-[#6B7280] dark:text-[#9CA3AF] hover:underline cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!customId.trim()}
                    className="px-2.5 py-0.5 rounded-lg bg-[#4F46E5] text-white text-xs font-medium disabled:opacity-50 cursor-pointer"
                  >
                    Set
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
