import React from 'react';
import { KeyRound, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import { ProviderId } from '../types';
import { PROVIDER_NAMES } from '../providers';

interface WelcomeCardProps {
  onOpenSettings: () => void;
  providerStatuses: Record<ProviderId, { connected: boolean; modelsCount?: number }>;
}

const PROVIDERS: ProviderId[] = ['openai', 'anthropic', 'gemini', 'xai'];

const PROVIDER_COLORS: Record<ProviderId, string> = {
  openai: '#10A37F',
  anthropic: '#D97757',
  gemini: '#4285F4',
  xai: '#6B7280', // dark mode white/light mode dark
};

export const WelcomeCard: React.FC<WelcomeCardProps> = ({ onOpenSettings, providerStatuses }) => {
  return (
    <div className="max-w-[540px] w-full mx-auto my-auto px-4 py-8 animate-in fade-in duration-300">
      <div className="bg-[#F6F7F9] dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* App Title and Logo */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#4F46E5] dark:bg-[#818CF8] flex items-center justify-center text-white shadow-sm">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[#111827] dark:text-[#F3F4F6]">Fusion</h1>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wide rounded-md bg-[#4F46E5]/10 dark:bg-[#818CF8]/20 text-[#4F46E5] dark:text-[#818CF8] border border-[#4F46E5]/20 dark:border-[#818CF8]/30">
                BYOK
              </span>
            </div>
            <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF]">Direct multi-model chat harness</p>
          </div>
        </div>

        <p className="text-sm text-[#6B7280] dark:text-[#9CA3AF] mb-6 leading-relaxed">
          Connect your API keys to chat across models, inspect PDFs and documents, perform grounded web searches, and draft email replies.
        </p>

        {/* Provider Connection Statuses */}
        <div className="space-y-2 mb-6">
          {PROVIDERS.map((p) => {
            const isConn = providerStatuses[p]?.connected;
            return (
              <div
                key={p}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#0F1115] border border-[#E3E6EB] dark:border-[#2A2F3A] text-xs font-medium"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: p === 'xai' ? 'currentColor' : PROVIDER_COLORS[p] }}
                  />
                  <span className="text-[#111827] dark:text-[#F3F4F6]">{PROVIDER_NAMES[p]}</span>
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    isConn
                      ? 'bg-green-100 dark:bg-green-950/60 text-[#16A34A] dark:text-[#22C55E]'
                      : 'bg-gray-100 dark:bg-gray-800 text-[#6B7280] dark:text-[#9CA3AF]'
                  }`}
                >
                  {isConn ? 'Connected' : 'Not added'}
                </span>
              </div>
            );
          })}
        </div>

        {/* CTA to Settings */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white font-medium text-sm transition-colors cursor-pointer shadow-sm mb-4"
        >
          <KeyRound size={16} />
          <span>Add an API key in Settings</span>
          <ArrowRight size={16} className="ml-1" />
        </button>

        {/* Privacy Note per Part J0 */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-[#6B7280] dark:text-[#9CA3AF]">
          <ShieldCheck size={14} className="text-[#16A34A] dark:text-[#22C55E]" />
          <span>Keys stay in your browser.</span>
        </div>
      </div>
    </div>
  );
};
