import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (message: string) => console.log('Toast:', message),
    };
  }
  return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-lg border text-sm transition-all animate-in fade-in slide-in-from-bottom-2 ${
              toast.type === 'error'
                ? 'bg-[#FEF2F2] dark:bg-[#2A1616] border-[#FCA5A5] dark:border-[#7F1D1D] text-[#991B1B] dark:text-[#FCA5A5]'
                : toast.type === 'warning'
                ? 'bg-[#FFFBEB] dark:bg-[#2A2312] border-[#FCD34D] dark:border-[#78350F] text-[#92400E] dark:text-[#FDE68A]'
                : toast.type === 'success'
                ? 'bg-[#F0FDF4] dark:bg-[#132819] border-[#86EFAC] dark:border-[#14532D] text-[#166534] dark:text-[#86EFAC]'
                : 'bg-[#F6F7F9] dark:bg-[#171A21] border-[#E3E6EB] dark:border-[#2A2F3A] text-[#111827] dark:text-[#F3F4F6]'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'error' && <AlertCircle size={16} className="text-[#DC2626] dark:text-[#F87171]" />}
              {toast.type === 'warning' && <AlertCircle size={16} className="text-[#D97706] dark:text-[#FBBF24]" />}
              {toast.type === 'success' && <CheckCircle size={16} className="text-[#16A34A] dark:text-[#22C55E]" />}
              {toast.type === 'info' && <Info size={16} className="text-[#4F46E5] dark:text-[#818CF8]" />}
            </div>
            <div className="flex-1 text-xs leading-relaxed break-words">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 text-current opacity-60 hover:opacity-100 p-0.5 rounded cursor-pointer"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
