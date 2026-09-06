import type { ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle, AlertTriangle } from 'lucide-react';
import { useAppStore, type ToastItem } from '../../store/useAppStore';

const TOAST_STYLES: Record<
  ToastItem['type'],
  { border: string; icon: ReactNode }
> = {
  success: {
    border: 'border-l-emerald-500',
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />,
  },
  error: {
    border: 'border-l-red-500',
    icon: <XCircle className="h-4 w-4 shrink-0 text-red-400" />,
  },
  warning: {
    border: 'border-l-amber-500',
    icon: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />,
  },
  info: {
    border: 'border-l-blue-500',
    icon: <Info className="h-4 w-4 shrink-0 text-blue-400" />,
  },
};

/**
 * Host toast global (menggantikan alert() native): tumpukan kartu di kanan-atas,
 * auto-dismiss dari store, aria-live agar pembaca layar mendengar notifikasi.
 */
export function ToastHost() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-16 right-4 z-[70] flex w-80 flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-lg border border-[#374151] border-l-4 bg-[#1F2937] p-3 shadow-2xl ${TOAST_STYLES[toast.type].border}`}
        >
          {TOAST_STYLES[toast.type].icon}
          <p className="flex-1 text-xs leading-relaxed text-gray-200">{toast.message}</p>
          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Tutup notifikasi"
            className="rounded p-0.5 text-gray-500 hover:bg-gray-700 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
