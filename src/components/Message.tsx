import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  FileText,
  Globe,
  AlertCircle,
  Mail,
  Sparkles,
  KeyRound,
} from 'lucide-react';
import { ChatMessage, Source } from '../types';
import { buildOpenInGmailUrl } from '../lib/gmail';
import { useToast } from './Toast';

interface MessageProps {
  message: ChatMessage;
  onRegenerate?: () => void;
  onOpenSettings?: () => void;
  isStreaming?: boolean;
}

export const Message: React.FC<MessageProps> = ({
  message,
  onRegenerate,
  onOpenSettings,
  isStreaming,
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [activeDocSnippet, setActiveDocSnippet] = useState<{ title: string; snippet?: string; page?: number | null } | null>(null);

  const isUser = message.role === 'user';
  const isError = message.kind === 'error';
  const isEmailDraft = message.kind === 'email-draft';

  const handleCopyText = (text: string, label = 'Copied to clipboard') => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast(label, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInGmail = () => {
    const to = message.emailMeta?.to || '';
    const subject = message.emailMeta?.subject || 'Reply';
    const draftBody = message.content;

    const { url, fallbackNeeded } = buildOpenInGmailUrl(to, subject, draftBody);
    if (fallbackNeeded) {
      navigator.clipboard.writeText(draftBody);
      showToast('Draft copied — paste it into Gmail.', 'info');
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-5">
        <div className="max-w-[85%] rounded-2xl rounded-tr-xs bg-[#F6F7F9] dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] px-4 py-2.5 text-sm text-[#111827] dark:text-[#F3F4F6] shadow-2xs whitespace-pre-wrap leading-relaxed break-words">
          {message.content}
        </div>
      </div>
    );
  }

  // Error Card
  if (isError) {
    const isAuth = message.content.toLowerCase().includes('key') || message.content.toLowerCase().includes('settings');
    return (
      <div className="mb-5 animate-in fade-in duration-200">
        <div className="rounded-xl border border-[#FCA5A5] dark:border-[#7F1D1D] bg-[#FEF2F2] dark:bg-[#2A1616] p-4 text-xs text-[#991B1B] dark:text-[#FCA5A5] shadow-xs space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={16} className="text-[#DC2626] dark:text-[#F87171] shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{message.content}</div>
          </div>
          <div className="flex items-center gap-2 pt-1 pl-6">
            {isAuth && onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-medium cursor-pointer transition-colors"
              >
                <KeyRound size={12} />
                Open Settings
              </button>
            )}
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] text-xs font-medium text-[#111827] dark:text-[#F3F4F6] hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <RotateCcw size={12} />
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Email Draft Card
  if (isEmailDraft) {
    return (
      <div className="mb-5 animate-in fade-in duration-200">
        <div className="rounded-xl border border-[#4F46E5]/30 dark:border-[#818CF8]/30 bg-white dark:bg-[#171A21] shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#F6F7F9] dark:bg-[#13161C] border-b border-[#E3E6EB] dark:border-[#2A2F3A]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#4F46E5]/10 dark:bg-[#818CF8]/20 flex items-center justify-center text-[#4F46E5] dark:text-[#818CF8]">
                <Mail size={14} />
              </div>
              <span className="text-xs font-bold text-[#111827] dark:text-[#F3F4F6]">Draft Reply</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleCopyText(message.content, 'Draft copied')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#E3E6EB] dark:border-[#2A2F3A] text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
              >
                {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                <span>Copy</span>
              </button>
              <button
                onClick={handleOpenInGmail}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-medium cursor-pointer"
              >
                <span>Open in Gmail</span>
                <ExternalLink size={12} />
              </button>
            </div>
          </div>

          {/* Subject info */}
          {message.emailMeta?.subject && (
            <div className="px-4 py-2 text-xs border-b border-[#E3E6EB] dark:border-[#2A2F3A] text-[#6B7280] dark:text-[#9CA3AF] bg-[#FAFBFD] dark:bg-[#15181F]">
              <span className="font-medium text-[#111827] dark:text-[#F3F4F6]">Subject: </span>
              {message.emailMeta.subject.toLowerCase().startsWith('re:')
                ? message.emailMeta.subject
                : `Re: ${message.emailMeta.subject}`}
              {message.emailMeta.to && <span className="ml-3 font-medium text-[#111827] dark:text-[#F3F4F6]">To: {message.emailMeta.to}</span>}
            </div>
          )}

          {/* Body */}
          <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed text-[#111827] dark:text-[#F3F4F6]">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // Normal Assistant Reply
  const approxTokens = Math.ceil((message.content?.length || 0) / 4);

  return (
    <div className="mb-6 animate-in fade-in duration-200">
      {/* Sources chips if any */}
      {message.sources && message.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          {message.sources.map((s, idx) => {
            if (s.kind === 'doc') {
              return (
                <button
                  key={`${s.title}-${idx}`}
                  onClick={() => setActiveDocSnippet(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F6F7F9] dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] text-[#111827] dark:text-[#F3F4F6] hover:border-[#4F46E5] dark:hover:border-[#818CF8] transition-colors cursor-pointer"
                >
                  <FileText size={11} className="text-[#4F46E5] dark:text-[#818CF8]" />
                  <span>
                    📄 {s.title} {s.page != null ? `· p.${s.page}` : ''}
                  </span>
                </button>
              );
            }

            // Web source
            let domain = s.url || '';
            try {
              domain = new URL(s.url || '').hostname.replace(/^www\./, '');
            } catch {
              domain = s.title || 'link';
            }

            return (
              <a
                key={`${s.url}-${idx}`}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F6F7F9] dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] text-[#111827] dark:text-[#F3F4F6] hover:border-[#4F46E5] dark:hover:border-[#818CF8] transition-colors"
              >
                <Globe size={11} className="text-[#4F46E5] dark:text-[#818CF8]" />
                <span className="max-w-[150px] truncate">🌐 {domain}</span>
              </a>
            );
          })}
        </div>
      )}

      {/* Doc snippet popover modal */}
      {activeDocSnippet && (
        <div className="mb-3 p-3 rounded-xl bg-[#F6F7F9] dark:bg-[#171A21] border border-[#4F46E5]/40 dark:border-[#818CF8]/40 text-xs shadow-md animate-in fade-in">
          <div className="flex items-center justify-between font-semibold text-[#111827] dark:text-[#F3F4F6] pb-1.5 border-b border-[#E3E6EB] dark:border-[#2A2F3A]">
            <span>
              📄 {activeDocSnippet.title} {activeDocSnippet.page != null ? `(Page ${activeDocSnippet.page})` : ''}
            </span>
            <button
              onClick={() => setActiveDocSnippet(null)}
              className="text-[#6B7280] dark:text-[#9CA3AF] hover:text-black dark:hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
          <p className="mt-2 text-[#6B7280] dark:text-[#9CA3AF] italic leading-relaxed whitespace-pre-wrap">
            "{activeDocSnippet.snippet}"
          </p>
        </div>
      )}

      {/* Markdown Body */}
      <div className="text-sm leading-relaxed text-[#111827] dark:text-[#F3F4F6] prose dark:prose-invert max-w-none break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Code blocks: monospace, surface background, Copy button top-right
            code({ className, children, ...props }) {
              const isInline = !className && typeof children === 'string' && !children.includes('\n');
              const codeString = String(children).replace(/\n$/, '');

              if (isInline) {
                return (
                  <code
                    className="bg-[#F6F7F9] dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded px-1.5 py-0.5 text-xs font-mono text-[#4F46E5] dark:text-[#818CF8]"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              return (
                <div className="relative group my-3 rounded-xl border border-[#E3E6EB] dark:border-[#2A2F3A] bg-[#F6F7F9] dark:bg-[#171A21] overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#EAECEF] dark:bg-[#11141A] text-[11px] font-mono text-[#6B7280] dark:text-[#9CA3AF] border-b border-[#E3E6EB] dark:border-[#2A2F3A]">
                    <span>code</span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(codeString, 'Code copied')}
                      className="inline-flex items-center gap-1 hover:text-[#111827] dark:hover:text-[#F3F4F6] cursor-pointer"
                      title="Copy code"
                    >
                      <Copy size={12} />
                      <span>Copy</span>
                    </button>
                  </div>
                  <pre className="p-3.5 overflow-x-auto text-xs font-mono leading-relaxed">
                    <code>{children}</code>
                  </pre>
                </div>
              );
            },
            table({ children }) {
              return (
                <div className="my-3 overflow-x-auto border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl">
                  <table className="w-full text-xs text-left border-collapse">{children}</table>
                </div>
              );
            },
            th({ children }) {
              return (
                <th className="border-b border-[#E3E6EB] dark:border-[#2A2F3A] bg-[#F6F7F9] dark:bg-[#171A21] p-2.5 font-semibold text-[#111827] dark:text-[#F3F4F6]">
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td className="border-b border-[#E3E6EB] dark:border-[#2A2F3A] p-2.5 text-[#111827] dark:text-[#F3F4F6]">
                  {children}
                </td>
              );
            },
          }}
        >
          {message.content}
        </ReactMarkdown>

        {isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-[#4F46E5] dark:bg-[#818CF8] animate-pulse align-middle" />
        )}
      </div>

      {/* Footer bar: Model label · approx tokens, Copy and Regenerate buttons */}
      {!isStreaming && (
        <div className="flex items-center justify-between mt-3 pt-2 text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">
          <div className="flex items-center gap-2">
            <span>{message.model ? message.model.split(':').pop() : 'Fusion'}</span>
            <span>·</span>
            <span>~{approxTokens} tokens</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handleCopyText(message.content)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F3F4F6] cursor-pointer"
              title="Copy answer"
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              <span>Copy</span>
            </button>

            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F3F4F6] cursor-pointer"
                title="Regenerate response with current model"
              >
                <RotateCcw size={12} />
                <span>Regenerate</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
