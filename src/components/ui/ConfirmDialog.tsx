import { useAppStore } from '../../store/useAppStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TriangleAlertIcon } from 'lucide-react';

/**
 * Dialog konfirmasi untuk aksi destruktif (reset topologi, hapus perangkat).
 * Base UI AlertDialog: Escape = batal, klik scrim = batal, focus trap aktif.
 */
export function ConfirmDialog() {
  const confirmRequest = useAppStore((s) => s.confirmRequest);
  const cancelConfirm = useAppStore((s) => s.cancelConfirm);

  return (
    <AlertDialog
      open={confirmRequest !== null}
      onOpenChange={(open) => {
        if (!open) cancelConfirm();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/15 text-destructive">
            <TriangleAlertIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{confirmRequest?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmRequest?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelConfirm}>Batal</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              confirmRequest?.onConfirm();
              cancelConfirm();
            }}
          >
            {confirmRequest?.confirmLabel ?? 'Konfirmasi'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
