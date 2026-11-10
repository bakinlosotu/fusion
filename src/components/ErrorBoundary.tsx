import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0F1115] text-[#111827] dark:text-[#F3F4F6] p-4">
          <div className="max-w-md w-full bg-[#F6F7F9] dark:bg-[#171A21] border border-[#E3E6EB] dark:border-[#2A2F3A] rounded-xl p-6 text-center shadow-lg">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-950/60 text-[#DC2626] dark:text-[#F87171] flex items-center justify-center">
              <AlertCircle size={24} />
            </div>
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-[#6B7280] dark:text-[#9CA3AF] mb-6">
              An unexpected error occurred in the application.
            </p>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white font-medium text-sm transition-colors cursor-pointer"
            >
              <RefreshCw size={16} />
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
