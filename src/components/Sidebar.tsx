import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Mail,
  Settings,
  Trash2,
  Edit2,
  Sun,
  Moon,
  Sparkles,
  X,
} from 'lucide-react';
import { Chat } from '../types';

interface SidebarProps {
  chats: Chat[];
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
  onOpenEmail: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onOpenSettings,
  onOpenEmail,
  isOpenMobile,
  onCloseMobile,
  isDarkMode,
  onToggleTheme,
}) => {
  const [search, setSearch] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Group chats by date: Today, Previous 7 days, Older
  const groupedChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = chats.filter((c) => !q || c.title.toLowerCase().includes(q));

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;

    const today: Chat[] = [];
    const last7Days: Chat[] = [];
    const older: Chat[] = [];

    filtered.forEach((chat) => {
      const diff = now - chat.updatedAt;
      if (diff < oneDay) {
        today.push(chat);
      } else if (diff < sevenDays) {
        last7Days.push(chat);
      } else {
        older.push(chat);
      }
    });

    return [
      { label: 'Today', items: today },
      { label: 'Previous 7 days', items: last7Days },
      { label: 'Older', items: older },
    ].filter((g) => g.items.length > 0);
  }, [chats, search]);

  const handleStartRename = (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
  };

  const handleSaveRename = (chatId: string) => {
    if (editTitle.trim()) {
      onRenameChat(chatId, editTitle.trim());
    }
    setEditingChatId(null);
  };

  const handleDelete = (e: React.MouseEvent, chatId: string, chatTitle: string) => {
    e.stopPropagation();
    if (window.confirm(`Delete chat "${chatTitle}"?`)) {
      onDeleteChat(chatId);
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#F6F7F9] dark:bg-[#11141A] text-[#111827] dark:text-[#F3F4F6] w-64 border-r border-[#E3E6EB] dark:border-[#2A2F3A] select-none">
      {/* Top App Header & New Chat button */}
      <div className="p-3 border-b border-[#E3E6EB] dark:border-[#2A2F3A] space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#4F46E5] dark:bg-[#818CF8] flex items-center justify-center text-white">
              <Sparkles size={15} />
            </div>
            <span className="font-bold text-sm tracking-tight">Fusion</span>
            <span className="px-1.5 py-0.5 text-[10px] font-semibold tracking-wide rounded-md bg-[#4F46E5]/10 dark:bg-[#818CF8]/20 text-[#4F46E5] dark:text-[#818CF8] border border-[#4F46E5]/20 dark:border-[#818CF8]/30">
              BYOK
            </span>
          </div>
          {isOpenMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1 rounded-md text-[#6B7280] dark:text-[#9CA3AF] hover:bg-gray-200 dark:hover:bg-gray-800 md:hidden cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <button
          onClick={() => {
            onNewChat();
            if (isOpenMobile) onCloseMobile();
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] hover:bg-[#F0F2F5] dark:hover:bg-[#1E222B] text-xs font-semibold text-[#111827] dark:text-[#F3F4F6] shadow-2xs transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Plus size={15} className="text-[#4F46E5] dark:text-[#818CF8]" />
            New chat
          </span>
          <kbd className="text-[10px] text-[#6B7280] dark:text-[#9CA3AF] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-[#E3E6EB] dark:border-[#2A2F3A]">
            ⌘K
          </kbd>
        </button>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B7280] dark:text-[#9CA3AF]" />
          <input
            type="text"
            placeholder="Search chats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-[#111827] dark:text-[#F3F4F6] outline-none"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {groupedChats.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#6B7280] dark:text-[#9CA3AF]">
            {search ? 'No matching chats' : 'No conversations yet'}
          </div>
        ) : (
          groupedChats.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF]">
                {group.label}
              </div>
              {group.items.map((chat) => {
                const isSelected = chat.id === currentChatId;
                const isEditing = chat.id === editingChatId;

                return (
                  <div
                    key={chat.id}
                    onClick={() => {
                      if (!isEditing) {
                        onSelectChat(chat.id);
                        if (isOpenMobile) onCloseMobile();
                      }
                    }}
                    onDoubleClick={(e) => handleStartRename(e, chat)}
                    className={`group relative flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-white dark:bg-[#171A21] text-[#111827] dark:text-[#F3F4F6] font-medium shadow-2xs border border-[#E3E6EB] dark:border-[#2A2F3A]'
                        : 'text-[#6B7280] dark:text-[#9CA3AF] hover:bg-white/60 dark:hover:bg-[#171A21]/60 hover:text-[#111827] dark:hover:text-[#F3F4F6]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 mr-2">
                      <MessageSquare size={14} className="shrink-0 text-[#6B7280] dark:text-[#9CA3AF]" />
                      {isEditing ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => handleSaveRename(chat.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(chat.id);
                            if (e.key === 'Escape') setEditingChatId(null);
                          }}
                          autoFocus
                          className="bg-transparent border-b border-[#4F46E5] outline-none text-xs w-full text-[#111827] dark:text-[#F3F4F6]"
                        />
                      ) : (
                        <span className="truncate">{chat.title}</span>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => handleStartRename(e, chat)}
                          className="p-1 rounded text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F3F4F6] cursor-pointer"
                          title="Rename chat (or double click)"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, chat.id, chat.title)}
                          className="p-1 rounded text-[#6B7280] dark:text-[#9CA3AF] hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                          title="Delete chat"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Bottom utilities */}
      <div className="p-2 border-t border-[#E3E6EB] dark:border-[#2A2F3A] space-y-1">
        {/* Email button */}
        <button
          onClick={() => {
            onOpenEmail();
            if (isOpenMobile) onCloseMobile();
          }}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium text-[#111827] dark:text-[#F3F4F6] hover:bg-white dark:hover:bg-[#171A21] transition-colors cursor-pointer"
        >
          <Mail size={15} className="text-[#4F46E5] dark:text-[#818CF8]" />
          <span>Email Assistant</span>
        </button>

        {/* Settings button */}
        <button
          onClick={() => {
            onOpenSettings();
            if (isOpenMobile) onCloseMobile();
          }}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium text-[#111827] dark:text-[#F3F4F6] hover:bg-white dark:hover:bg-[#171A21] transition-colors cursor-pointer"
        >
          <Settings size={15} className="text-[#6B7280] dark:text-[#9CA3AF]" />
          <span>Settings</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-[#6B7280] dark:text-[#9CA3AF] hover:bg-white dark:hover:bg-[#171A21] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 text-[#111827] dark:text-[#F3F4F6]">
            {isDarkMode ? <Moon size={15} /> : <Sun size={15} />}
            <span>Theme</span>
          </span>
          <span className="text-[11px] capitalize">{isDarkMode ? 'Dark' : 'Light'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block h-screen shrink-0">{sidebarContent}</div>

      {/* Mobile drawer overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={onCloseMobile} />
          <div className="relative z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
