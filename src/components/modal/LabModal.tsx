import { useEffect, useState } from 'react';
import { GraduationCap, Play, CheckCircle2, Circle, Lightbulb, LogOut, PartyPopper } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAppStore } from '../../store/useAppStore';
import { LAB_SCENARIOS, type LabScenario } from '../../data/labs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function LabModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const activeLabId = useAppStore((s) => s.activeLabId);
  const labCompleted = useAppStore((s) => s.labCompleted);
  const startLab = useAppStore((s) => s.startLab);
  const stopLab = useAppStore((s) => s.stopLab);
  const [selected, setSelected] = useState<LabScenario | null>(null);

  const activeLab = LAB_SCENARIOS.find((l) => l.id === activeLabId) ?? null;
  const allDone =
    !!activeLab && activeLab.objectives.every((o) => labCompleted[o.id]);

  useEffect(() => {
    if (allDone) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      confetti({ particleCount: 160, spread: 75, origin: { y: 0.6 } });
    }
  }, [allDone]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[86vh] w-[95vw] max-w-[680px] flex-col gap-0 p-0 sm:max-w-[680px]">
        <DialogHeader className="border-b px-4 sm:px-5 py-3">
          <DialogTitle className="flex items-center gap-2.5 text-sm font-bold">
            <GraduationCap className="h-5 w-5 text-amber-400" />
            Mode Lab Praktikum
            {activeLab && (
              <Badge variant="outline" className="border-amber-800/60 bg-amber-950/70 text-[11px] font-normal text-amber-300">
                berjalan: {activeLab.title}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Skenario latihan dengan topologi terkunci dan verifikasi otomatis.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
          {!activeLab && !selected && (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Skenario latihan dengan topologi terkunci dan verifikasi otomatis. Pilih lab untuk
                mulai — objektif akan tercentang sendiri begitu tercapai.
              </p>
              {LAB_SCENARIOS.map((lab) => (
                <button
                  key={lab.id}
                  onClick={() => setSelected(lab)}
                  className="w-full rounded-xl border bg-muted/40 p-4 text-left transition-colors hover:border-ring"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-bold">{lab.title}</span>
                    <Badge
                      variant="outline"
                      className={
                        lab.difficulty === 'Dasar'
                          ? 'border-emerald-800 bg-emerald-950/70 text-emerald-300'
                          : 'border-amber-800 bg-amber-950/70 text-amber-300'
                      }
                    >
                      {lab.difficulty}
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{lab.story}</p>
                  <p className="mt-2 text-[11px] text-sky-300">
                    {lab.objectives.length} objektif · klik untuk detail
                  </p>
                </button>
              ))}
            </>
          )}

          {!activeLab && selected && (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setSelected(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                ← kembali ke daftar lab
              </button>
              <h3 className="text-base font-bold">{selected.title}</h3>
              <p className="text-xs leading-relaxed text-foreground/90">{selected.story}</p>
              <div className="rounded-lg border bg-background/60 p-3">
                <div className="mb-1.5 text-[11px] font-bold uppercase text-muted-foreground">Objektif</div>
                <ul className="flex flex-col gap-1 list-inside list-disc text-xs text-foreground/90">
                  {selected.objectives.map((o) => (
                    <li key={o.id}>{o.description}</li>
                  ))}
                </ul>
              </div>
              <Button
                onClick={() => {
                  startLab(selected);
                  setSelected(null);
                  onClose(); // tutup modal agar pengguna langsung di kanvas
                }}
                className="gap-2"
              >
                <Play className="h-3.5 w-3.5" />
                Mulai Lab (topologi akan dimuat &amp; terkunci)
              </Button>
            </div>
          )}

          {activeLab && (
            <div className="flex flex-col gap-3">
              {allDone && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-950/60 p-3 text-emerald-200">
                  <PartyPopper className="h-5 w-5 shrink-0" />
                  <span className="text-xs font-bold">
                    Semua objektif tercapai — lab selesai! Lanjut ke lab lain atau keluar untuk kanvas bebas.
                  </span>
                </div>
              )}
              <p className="text-xs leading-relaxed text-foreground/90">{activeLab.story}</p>

              <div className="flex flex-col gap-1.5 rounded-lg border bg-background/60 p-3">
                <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">
                  Objektif ({Object.values(labCompleted).filter(Boolean).length}/{activeLab.objectives.length})
                </div>
                {activeLab.objectives.map((o) => {
                  const done = !!labCompleted[o.id];
                  return (
                    <div key={o.id} className="flex items-center gap-2 text-xs">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                      )}
                      <span className={done ? 'text-emerald-200 line-through' : 'text-foreground/90'}>
                        {o.description}
                      </span>
                    </div>
                  );
                })}
              </div>

              <details className="rounded-lg border bg-background/60 p-3">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Petunjuk (klik untuk buka)
                </summary>
                <ol className="mt-2 flex flex-col gap-1 list-inside list-decimal text-xs text-muted-foreground">
                  {activeLab.hints.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ol>
              </details>

              <Button
                variant="destructive"
                onClick={() => {
                  stopLab();
                  onClose();
                }}
                className="gap-2"
              >
                <LogOut className="h-3.5 w-3.5" />
                Keluar Lab
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
