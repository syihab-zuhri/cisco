import { AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useModalA11y } from '../../hooks/useModalA11y';

/**
 * Dialog konfirmasi untuk aksi destruktif (reset topologi, hapus perangkat).
 * Memakai useModalA11y: Escape = batal, klik scrim = batal, focus trap aktif.
 */
export function ConfirmDialog() {
  const confirmRequest = useAppStore((s) => s.confirmRequest);
  const cancelConfirm = useAppStore((s) => s.cancelConfirm);
  const dialogRef = useModalA11y({ onClose: cancelConfirm });

  if (!confirmRequest) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancelConfirm();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="w-[380px] rounded-xl border border-[#374151] bg-[#1F2937] p-5 shadow-2xl"
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-red-950/60 p-2 border border-red-800/60">
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <span id="confirm-dialog-title" className="text-sm font-bold text-gray-100">
            {confirmRequest.title}
          </span>
        </div>
        <p id="confirm-dialog-message" className="mt-3 text-xs leading-relaxed text-gray-300">
          {confirmRequest.message}
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={cancelConfirm}
            className="rounded px-3 py-1.5 text-xs text-gray-400 hover:text-white"
          >
            Batal
          </button>
          <button
            onClick={() => {
              confirmRequest.onConfirm();
              cancelConfirm();
            }}
            className="rounded bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-red-500"
          >
            {confirmRequest.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
