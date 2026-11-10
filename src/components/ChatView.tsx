import React, { useRef, useEffect } from 'react';
import { Chat, ChatMessage } from '../types';
import { Message } from './Message';
import { Sparkles } from 'lucide-react';

interface ChatViewProps {
  chat: Chat;
  isStreaming: boolean;
  streamingMessageId?: string;
  onRegenerate: () => void;
  onOpenSettings: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  chat,
  isStreaming,
  streamingMessageId,
  onRegenerate,
  onOpenSettings,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages or streaming tokens
  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages.length, isStreaming]);

  const lastAssistantIndex = (() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'assistant') {
        return i;
      }
    }
    return -1;
  })();

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="w-full max-w-[760px] mx-auto">
        {chat.messages.length === 0 ? (
          <div className="my-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#4F46E5]/10 dark:bg-[#818CF8]/20 text-[#4F46E5] dark:text-[#818CF8] flex items-center justify-center mx-auto">
              <Sparkles size={24} />
            </div>
            <h3 className="text-base font-semibold text-[#111827] dark:text-[#F3F4F6]">
              {chat.title || 'Start a conversation'}
            </h3>
            <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] max-w-sm mx-auto leading-relaxed">
              Ask anything, drag and drop documents to analyze, or enable Web search for real-time answers.
            </p>
          </div>
        ) : (
          chat.messages.map((msg: ChatMessage, index: number) => {
            const isLatestAssistant = index === lastAssistantIndex;
            const isThisStreaming = isStreaming && msg.id === streamingMessageId;

            return (
              <Message
                key={msg.id}
                message={msg}
                isStreaming={isThisStreaming}
                onRegenerate={isLatestAssistant && !isStreaming ? onRegenerate : undefined}
                onOpenSettings={onOpenSettings}
              />
            );
          })
        )}
        <div ref={bottomAnchorRef} />
      </div>
    </div>
  );
};
