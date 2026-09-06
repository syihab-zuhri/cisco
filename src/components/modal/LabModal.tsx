import { useEffect, useState } from 'react';
import { GraduationCap, X, Play, CheckCircle2, Circle, Lightbulb, LogOut, PartyPopper } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAppStore } from '../../store/useAppStore';
import { LAB_SCENARIOS, type LabScenario } from '../../data/labs';
import { useModalA11y } from '../../hooks/useModalA11y';

export function LabModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeLabId, labCompleted, startLab, stopLab } = useAppStore();
  const [selected, setSelected] = useState<LabScenario | null>(null);
  const dialogRef = useModalA11y({ onClose, enabled: isOpen });

  const activeLab = LAB_SCENARIOS.find((l) => l.id === activeLabId) ?? null;
  const allDone =
    !!activeLab && activeLab.objectives.every((o) => labCompleted[o.id]);

  useEffect(() => {
    if (allDone) {
      confetti({ particleCount: 160, spread: 75, origin: { y: 0.6 } });
    }
  }, [allDone]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lab-modal-title"
        className="flex max-h-[86vh] w-[680px] flex-col rounded-2xl border border-gray-700 bg-[#0F172A] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-gray-800 bg-[#1E293B] px-5">
          <div className="flex items-center gap-2.5">
            <GraduationCap className="h-5 w-5 text-amber-400" />
            <span id="lab-modal-title" className="text-sm font-bold text-white">Mode Lab Praktikum</span>
            {activeLab && (
              <span className="rounded bg-amber-950/70 px-2 py-0.5 text-[10px] text-amber-300 border border-amber-800/60">
                berjalan: {activeLab.title}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup modal lab"
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!activeLab && !selected && (
            <>
              <p className="text-xs text-gray-400 leading-relaxed">
                Skenario latihan dengan topologi terkunci dan verifikasi otomatis. Pilih lab untuk
                mulai — objektif akan tercentang sendiri begitu tercapai.
              </p>
              {LAB_SCENARIOS.map((lab) => (
                <button
                  key={lab.id}
                  onClick={() => setSelected(lab)}
                  className="w-full text-left rounded-xl border border-gray-800 bg-[#1E293B]/70 p-4 hover:border-blue-500 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-gray-100">{lab.title}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${
                        lab.difficulty === 'Dasar'
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                          : 'bg-amber-950/70 text-amber-300 border-amber-800'
                      }`}
                    >
                      {lab.difficulty}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{lab.story}</p>
                  <p className="mt-2 text-[11px] text-blue-300">
                    {lab.objectives.length} objektif · klik untuk detail
                  </p>
                </button>
              ))}
            </>
          )}

          {!activeLab && selected && (
            <div className="space-y-3">
              <button
                onClick={() => setSelected(null)}
                className="text-[11px] text-gray-400 hover:text-white"
              >
                ← kembali ke daftar lab
              </button>
              <h3 className="text-base font-bold text-white">{selected.title}</h3>
              <p className="text-xs text-gray-300 leading-relaxed">{selected.story}</p>
              <div className="rounded-lg border border-gray-800 bg-black/40 p-3">
                <div className="text-[10px] font-bold uppercase text-gray-400 mb-1.5">Objektif</div>
                <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
                  {selected.objectives.map((o) => (
                    <li key={o.id}>{o.description}</li>
                  ))}
                </ul>
              </div>
              <button
                onClick={() => {
                  startLab(selected);
                  setSelected(null);
                  onClose(); // tutup modal agar pengguna langsung di kanvas
                }}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
              >
                <Play className="h-3.5 w-3.5" />
                Mulai Lab (topologi akan dimuat & terkunci)
              </button>
            </div>
          )}

          {activeLab && (
            <div className="space-y-3">
              {allDone && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-950/60 p-3 text-emerald-200">
                  <PartyPopper className="h-5 w-5 shrink-0" />
                  <span className="text-xs font-bold">
                    Semua objektif tercapai — lab selesai! Lanjut ke lab lain atau keluar untuk kanvas bebas.
                  </span>
                </div>
              )}
              <p className="text-xs text-gray-300 leading-relaxed">{activeLab.story}</p>

              <div className="rounded-lg border border-gray-800 bg-black/40 p-3 space-y-1.5">
                <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">
                  Objektif ({Object.values(labCompleted).filter(Boolean).length}/{activeLab.objectives.length})
                </div>
                {activeLab.objectives.map((o) => {
                  const done = !!labCompleted[o.id];
                  return (
                    <div key={o.id} className="flex items-center gap-2 text-xs">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-gray-600 shrink-0" />
                      )}
                      <span className={done ? 'text-emerald-200 line-through' : 'text-gray-300'}>
                        {o.description}
                      </span>
                    </div>
                  );
                })}
              </div>

              <details className="rounded-lg border border-gray-800 bg-black/40 p-3">
                <summary className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 cursor-pointer">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Petunjuk (klik untuk buka)
                </summary>
                <ol className="mt-2 text-xs text-gray-400 space-y-1 list-decimal list-inside">
                  {activeLab.hints.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ol>
              </details>

              <button
                onClick={() => {
                  stopLab();
                  onClose();
                }}
                className="flex items-center gap-2 rounded-lg bg-red-600/80 px-4 py-2 text-xs font-bold text-white hover:bg-red-500"
              >
                <LogOut className="h-3.5 w-3.5" />
                Keluar Lab
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
