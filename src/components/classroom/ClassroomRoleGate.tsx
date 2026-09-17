import { Users, GraduationCap, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ClassroomRoleGateProps {
  onSelectRole: (role: 'teacher' | 'student') => void;
}

export function ClassroomRoleGate({ onSelectRole }: ClassroomRoleGateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-6 max-w-2xl mx-auto w-full my-auto">
      <div className="text-center flex flex-col gap-1.5">
        <h3 className="text-lg font-bold text-foreground">
          Pilih Peran di Ruang Kelas
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
          Untuk menjaga independensi pengerjaan ujian, satu perangkat hanya dapat memegang satu peran aktif (Guru atau Siswa) dalam satu waktu.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        {/* Pilihan 1: Guru */}
        <div
          onClick={() => onSelectRole('teacher')}
          className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 transition-all hover:border-primary hover:shadow-lg cursor-pointer hover:bg-primary/5"
        >
          <div className="flex flex-col gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-foreground">
                Masuk Sebagai Guru
              </h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Buka sesi kelas baru, kelola dan siarkan paket soal ujian ke siswa, pantau skor secara live, dan unduh rekap nilai ke CSV.
              </p>
            </div>
          </div>
          <div className="mt-5 pt-3 border-t border-border/50">
            <Button className="w-full gap-2 text-xs font-semibold">
              <Play className="h-3.5 w-3.5" />
              Pilih Mode Guru
            </Button>
          </div>
        </div>

        {/* Pilihan 2: Siswa */}
        <div
          onClick={() => onSelectRole('student')}
          className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 transition-all hover:border-sky-500 hover:shadow-lg cursor-pointer hover:bg-sky-500/5"
        >
          <div className="flex flex-col gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition-all">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-foreground">
                Masuk Sebagai Siswa
              </h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Bergabung ke kelas dengan kode dari guru, buka paket tugas praktikum mandiri (.oplab), dan rakit topologi di kanvas.
              </p>
            </div>
          </div>
          <div className="mt-5 pt-3 border-t border-border/50">
            <Button variant="secondary" className="w-full gap-2 text-xs font-semibold">
              <Play className="h-3.5 w-3.5" />
              Pilih Mode Siswa
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
