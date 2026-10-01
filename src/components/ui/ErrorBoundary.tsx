import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Nama bagian yang dilindungi, dipakai pada pesan (mis. "Portal Kelas"). */
  label: string;
  /** `page` = layar penuh (seluruh aplikasi); `panel` = kartu kecil di pojok, aplikasi lain tetap jalan. */
  variant?: 'page' | 'panel';
  /** Dipanggil saat pengguna menekan tombol tutup/coba lagi, mis. menutup modal yang crash. */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Menahan error render supaya satu komponen yang gagal (mis. berkas .opsub rusak di panel
 * guru) tidak membuat seluruh React tree runtuh menjadi layar kosong.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.label}]`, error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isPage = (this.props.variant ?? 'panel') === 'page';
    return (
      <div
        role="alert"
        className={
          isPage
            ? 'flex h-screen w-screen items-center justify-center bg-background p-6 text-foreground'
            : 'fixed right-4 bottom-4 z-[1500] w-[min(24rem,calc(100vw-2rem))]'
        }
      >
        <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-danger-border bg-danger-bg p-4 text-danger-fg shadow-overlay">
          <div className="flex items-start gap-2.5">
            <TriangleAlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-semibold">{this.props.label} mengalami kesalahan</p>
              <p className="text-xs leading-relaxed break-words opacity-90">
                {error.message || 'Terjadi kesalahan tak terduga.'} Bagian lain aplikasi tetap aman; data topologi Anda tidak terhapus.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {!isPage && (
              <Button size="sm" variant="outline" onClick={this.reset}>
                Tutup panel
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Muat ulang halaman
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
