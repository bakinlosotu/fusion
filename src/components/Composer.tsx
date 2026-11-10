import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import {
  Paperclip,
  ArrowUp,
  Square,
  Globe,
  Loader2,
  X,
  FileText,
} from 'lucide-react';
import { ChatDoc } from '../types';
import { validateFile, processFile } from '../lib/docs';
import { isGemini429InSession } from '../lib/webSearch';
import { useToast } from './Toast';

export interface ComposerHandle {
  focus: () => void;
  setText: (val: string) => void;
}

interface ComposerProps {
  onSendMessage: (text: string) => void;
  onStopStreaming: () => void;
  isStreaming: boolean;
  disabled: boolean;
  disabledPlaceholder?: string;
  docs: ChatDoc[];
  onAddDoc: (doc: ChatDoc) => void;
  onRemoveDoc: (docId: string) => void;
  webSearchEnabled: boolean;
  onToggleWebSearch: (enabled: boolean) => void;
  canWebSearch: boolean;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(
  (
    {
      onSendMessage,
      onStopStreaming,
      isStreaming,
      disabled,
      disabledPlaceholder,
      docs,
      onAddDoc,
      onRemoveDoc,
      webSearchEnabled,
      onToggleWebSearch,
      canWebSearch,
    },
    ref
  ) => {
    const { showToast } = useToast();
    const [text, setText] = useState('');
    const [parsingFiles, setParsingFiles] = useState<string[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      setText: (val: string) => {
        setText(val);
        adjustHeight();
      },
    }));

    // Auto resize textarea
    const adjustHeight = () => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      const newHeight = Math.min(el.scrollHeight, 200);
      el.style.height = `${Math.max(newHeight, 44)}px`;
    };

    useEffect(() => {
      adjustHeight();
    }, [text]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    const handleSubmit = () => {
      if (disabled || isStreaming) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      onSendMessage(trimmed);
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '44px';
      }
    };

    const handleWebSearchClick = () => {
      if (disabled || isStreaming) return;
      const trimmed = text.trim();

      // If user typed a query, clicking "Web search" submits immediately with search enabled!
      if (trimmed) {
        if (!webSearchEnabled) {
          onToggleWebSearch(true);
        }
        handleSubmit();
        return;
      }

      // If input is empty, toggle the web search state and give instant toast confirmation
      const next = !webSearchEnabled;
      onToggleWebSearch(next);
      showToast(
        next
          ? 'Web search enabled — live online sources will be used'
          : 'Web search turned off',
        'info'
      );
    };

    const handleFiles = async (files: FileList | File[]) => {
      const fileList = Array.from(files);
      if (fileList.length === 0) return;

      let currentCount = docs.length;

      for (const file of fileList) {
        const validation = validateFile(file, currentCount);
        if (!validation.valid) {
          showToast(validation.error || 'Invalid file', 'error');
          continue;
        }

        setParsingFiles((prev) => [...prev, file.name]);

        try {
          const chatDoc = await processFile(file);
          onAddDoc(chatDoc);
          currentCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : `Failed to parse ${file.name}`;
          showToast(msg, 'error');
        } finally {
          setParsingFiles((prev) => prev.filter((name) => name !== file.name));
        }
      }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(e.target.files);
        e.target.value = '';
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files);
      }
    };

    const showGemini429Note = webSearchEnabled && isGemini429InSession();

    return (
      <div
        className="w-full max-w-[760px] mx-auto px-4 pb-4"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Attached Docs & Parsing Chips */}
        {(docs.length > 0 || parsingFiles.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1">
            {docs.map((doc) => (
              <span
                key={doc.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#F6F7F9] dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] text-[#111827] dark:text-[#F3F4F6] shadow-2xs"
              >
                <FileText size={12} className="text-[#4F46E5] dark:text-[#818CF8]" />
                <span className="max-w-[140px] truncate">{doc.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveDoc(doc.id)}
                  className="hover:text-red-500 cursor-pointer p-0.5 rounded"
                  title="Remove document"
                >
                  <X size={12} />
                </button>
              </span>
            ))}

            {parsingFiles.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300"
              >
                <Loader2 size={12} className="animate-spin" />
                <span className="max-w-[140px] truncate">Reading {name}…</span>
              </span>
            ))}
          </div>
        )}

        {/* Input Card Container */}
        <div
          className={`relative rounded-2xl border transition-all ${
            isDragOver
              ? 'border-[#4F46E5] dark:border-[#818CF8] bg-indigo-50/20 dark:bg-indigo-950/20'
              : 'border-[#E3E6EB] dark:border-[#2A2F3A] bg-white dark:bg-[#171A21] shadow-sm focus-within:border-[#4F46E5] dark:focus-within:border-[#818CF8]'
          }`}
        >
          {/* Main textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={
              disabled
                ? disabledPlaceholder || 'Add an API key in Settings to start chatting'
                : 'Message Fusion…'
            }
            className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm text-[#111827] dark:text-[#F3F4F6] placeholder-[#6B7280] dark:placeholder-[#9CA3AF] outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          />

          {/* Bottom toolbar inside composer */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
            <div className="flex items-center gap-1.5">
              {/* File upload hidden input & trigger */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.csv,.json"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || docs.length >= 5}
                title="Attach documents (.pdf, .docx, .txt, .md, .csv, .json - max 15MB)"
                className="p-1.5 rounded-lg text-[#6B7280] dark:text-[#9CA3AF] hover:bg-[#F6F7F9] dark:hover:bg-[#1E222B] hover:text-[#111827] dark:hover:text-[#F3F4F6] disabled:opacity-40 disabled:pointer-events-none cursor-pointer transition-colors"
                aria-label="Attach documents"
              >
                <Paperclip size={18} />
              </button>

              {/* Web search toggle & action */}
              <button
                type="button"
                onClick={handleWebSearchClick}
                disabled={disabled}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  webSearchEnabled
                    ? 'bg-[#4F46E5] hover:bg-[#4338CA] text-white shadow-xs'
                    : 'bg-[#F6F7F9] dark:bg-[#11141A] border border-[#E3E6EB] dark:border-[#2A2F3A] text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F3F4F6] hover:bg-[#EAECEF] dark:hover:bg-[#1E222B]'
                } disabled:opacity-40 disabled:pointer-events-none`}
                aria-label="Web search toggle"
                title={
                  text.trim()
                    ? `Search web now for: "${text.trim().slice(0, 30)}${text.trim().length > 30 ? '…' : ''}"`
                    : webSearchEnabled
                    ? 'Web search is ON (click to turn off)'
                    : 'Click to enable Web search for live online answers'
                }
              >
                <Globe
                  size={14}
                  className={webSearchEnabled ? 'text-white' : 'text-[#6B7280] dark:text-[#9CA3AF]'}
                />
                <span>Web search</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-semibold transition-colors ${
                    webSearchEnabled
                      ? 'bg-white/20 text-white'
                      : 'bg-[#E5E7EB] dark:bg-[#2A2F3A] text-[#4B5563] dark:text-[#9CA3AF]'
                  }`}
                >
                  {webSearchEnabled ? 'ON' : 'OFF'}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    webSearchEnabled ? 'bg-emerald-300 animate-pulse' : 'bg-[#9CA3AF]'
                  }`}
                />
              </button>
            </div>

            {/* Action button: Send or Stop */}
            <div>
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStopStreaming}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white shadow-xs transition-colors cursor-pointer"
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <Square size={14} className="fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={disabled || !text.trim()}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white shadow-xs disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="Send message"
                  aria-label="Send message"
                >
                  <ArrowUp size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Gemini quota note under toggle if applicable */}
        {showGemini429Note && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 px-1">
            Gemini search quota used up today — using Tavily.
          </p>
        )}
      </div>
    );
  }
);
