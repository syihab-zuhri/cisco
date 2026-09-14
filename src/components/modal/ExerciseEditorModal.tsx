import { useState, useEffect } from 'react';
import {
  FileEdit,
  Trash2,
  Save,
  Download,
  AlertCircle,
  Network,
  Cable,
  Activity,
  Layers,
  Cpu,
} from 'lucide-react';
import type { Exercise, ExerciseTarget } from '../../features/classroom/types';
import type { DeviceType } from '../../types/network';
import { TOPOLOGY_TEMPLATES } from '../../data/topologyTemplates';
import { validateExercise, exportExercisesToJsonFile } from '../../features/classroom/exerciseParser';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface ExerciseEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialExercise: Exercise | null;
  onSave: (savedExercise: Exercise) => void;
}

export function ExerciseEditorModal({
  isOpen,
  onClose,
  initialExercise,
  onSave,
}: ExerciseEditorModalProps) {
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [difficulty, setDifficulty] = useState<'Dasar' | 'Menengah' | 'Lanjutan'>('Menengah');
  const [starterTemplateId, setStarterTemplateId] = useState<string>('');
  const [includeStarterTopology, setIncludeStarterTopology] = useState(true);
  const [targets, setTargets] = useState<ExerciseTarget[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state saat modal dibuka
  useEffect(() => {
    if (initialExercise) {
      setTitle(initialExercise.title);
      setInstructions(initialExercise.instructions);
      setDifficulty(initialExercise.difficulty);
      setStarterTemplateId(initialExercise.starterTemplateId || '');
      setTargets(JSON.parse(JSON.stringify(initialExercise.targets)));
      setIncludeStarterTopology(Boolean(initialExercise.starterTopology));
      setErrorMsg(null);
    } else {
      // Buat soal baru kosongan
      setTitle('Tantangan Praktikum Baru');
      setInstructions('1. Konfigurasikan perangkat...\n2. Uji konektivitas antarmuka.');
      setDifficulty('Menengah');
      setStarterTemplateId('tpl-lan-basic');
      setTargets([
        {
          id: `tgt-${Date.now()}-1`,
          title: 'Konfigurasi IP PC-1 (192.168.1.10/24)',
          type: 'device_config',
          deviceId: 'PC-1',
          address: '192.168.1.10',
          subnetMask: '255.255.255.0',
        },
      ]);
      setErrorMsg(null);
    }
  }, [initialExercise, isOpen]);

  // Tambah kriteria target baru
  const handleAddTarget = (type: ExerciseTarget['type']) => {
    const newId = `tgt-${Date.now()}`;
    let newTarget: ExerciseTarget;

    switch (type) {
      case 'device_config':
        newTarget = {
          id: newId,
          title: 'Konfigurasi IP Interface',
          type: 'device_config',
          deviceId: 'PC-1',
          address: '192.168.1.10',
          subnetMask: '255.255.255.0',
        };
        break;
      case 'link_exists':
        newTarget = {
          id: newId,
          title: 'Sambungkan Kabel Antar Perangkat',
          type: 'link_exists',
          fromDeviceId: 'PC-1',
          toDeviceId: 'Switch-1',
        };
        break;
      case 'reachability':
        newTarget = {
          id: newId,
          title: 'Uji Konektivitas Ping',
          type: 'reachability',
          sourceDeviceId: 'PC-1',
          destinationDeviceId: 'Server-1',
        };
        break;
      case 'required_device_count':
        newTarget = {
          id: newId,
          title: 'Jumlah Perangkat di Topologi',
          type: 'required_device_count',
          deviceType: 'router',
          count: 1,
        };
        break;
      case 'vlan_config':
        newTarget = {
          id: newId,
          title: 'Konfigurasi Port VLAN Switch',
          type: 'vlan_config',
          deviceId: 'Switch-1',
          portId: 'fa0/1',
          vlanId: 10,
          mode: 'access',
        };
        break;
    }

    setTargets((prev) => [...prev, newTarget]);
  };

  const handleRemoveTarget = (index: number) => {
    setTargets((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateTarget = (index: number, updatedFields: Partial<ExerciseTarget>) => {
    setTargets((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updatedFields } as ExerciseTarget;
      return copy;
    });
  };

  const handleSave = () => {
    const rawCandidate: Exercise = {
      id: initialExercise?.id || `ex-custom-${Date.now()}`,
      title: title.trim(),
      instructions: instructions.trim(),
      difficulty,
      starterTemplateId: starterTemplateId.trim() || undefined,
      starterTopology:
        includeStarterTopology && initialExercise?.starterTopology
          ? initialExercise.starterTopology
          : undefined,
      targets,
    };

    const validated = validateExercise(rawCandidate);
    if (validated.error) {
      setErrorMsg(validated.error);
      return;
    }

    if (validated.exercise) {
      onSave(validated.exercise);
      onClose();
    }
  };

  const handleExportThis = () => {
    const candidate: Exercise = {
      id: initialExercise?.id || `ex-custom-${Date.now()}`,
      title: title.trim(),
      instructions: instructions.trim(),
      difficulty,
      starterTemplateId: starterTemplateId.trim() || undefined,
      starterTopology:
        includeStarterTopology && initialExercise?.starterTopology
          ? initialExercise.starterTopology
          : undefined,
      targets,
    };
    exportExercisesToJsonFile(candidate);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-primary/20 p-2 text-primary">
                <FileEdit className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold tracking-tight">
                  {initialExercise ? 'Sunting Soal Praktikum Guru' : 'Buat Soal Praktikum Baru'}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Sesuaikan teks materi, instruksi, dan kriteria evaluasi otomatis untuk siswa.
                </DialogDescription>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleExportThis}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Unduh .json
            </Button>
          </div>
        </DialogHeader>

        {/* Scrollable Form Body */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-lg border border-rose-800/60 bg-rose-950/30 p-3 text-xs text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Informasi Dasar */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              1. Informasi Soal &amp; Tingkat Kesulitan
            </h4>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="ex-title" className="text-xs">Judul Soal Latihan</Label>
                <Input
                  id="ex-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Tantangan 05: Konfigurasi Default Gateway"
                  className="text-xs font-semibold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ex-diff" className="text-xs">Tingkat Kesulitan</Label>
                <select
                  id="ex-diff"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as 'Dasar' | 'Menengah' | 'Lanjutan')}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="Dasar">Dasar</option>
                  <option value="Menengah">Menengah</option>
                  <option value="Lanjutan">Lanjutan</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="ex-instructions" className="text-xs">Materi Soal &amp; Instruksi Pengerjaan</Label>
                <Textarea
                  id="ex-instructions"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                  placeholder="Tuliskan petunjuk langkah kerja yang harus diselesaikan siswa..."
                  className="resize-y text-xs leading-relaxed"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ex-template" className="text-xs">Topologi Awal Siswa</Label>
                <select
                  id="ex-template"
                  value={starterTemplateId}
                  onChange={(e) => setStarterTemplateId(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">(Kanvas Kosong)</option>
                  {TOPOLOGY_TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-muted-foreground">
                  Jika dipilih, siswa dapat memuat template ini dengan satu klik.
                </span>

                {initialExercise?.starterTopology && (
                  <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-primary/40 bg-primary/10 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-primary">Topologi File JSON Guru</span>
                      <Badge variant="outline" className="text-[9px]">
                        {initialExercise.starterTopology.nodes.length} Node, {initialExercise.starterTopology.edges.length} Kabel
                      </Badge>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeStarterTopology}
                        onChange={(e) => setIncludeStarterTopology(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                      <span>Sertakan topologi ini agar siswa dapat memuatnya ke kanvas</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Section 2: Kriteria Target Penilaian */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                2. Kriteria Target Penilaian ({targets.length})
              </h4>

              {/* Quick Add Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Tambah Kriteria:</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddTarget('device_config')}
                  className="h-7 gap-1 text-[11px]"
                >
                  <Network className="h-3 w-3 text-sky-400" />
                  + IP
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddTarget('link_exists')}
                  className="h-7 gap-1 text-[11px]"
                >
                  <Cable className="h-3 w-3 text-emerald-400" />
                  + Kabel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddTarget('reachability')}
                  className="h-7 gap-1 text-[11px]"
                >
                  <Activity className="h-3 w-3 text-amber-400" />
                  + Ping
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddTarget('required_device_count')}
                  className="h-7 gap-1 text-[11px]"
                >
                  <Cpu className="h-3 w-3 text-emerald-400" />
                  + Perangkat
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddTarget('vlan_config')}
                  className="h-7 gap-1 text-[11px]"
                >
                  <Layers className="h-3 w-3 text-indigo-400" />
                  + VLAN
                </Button>
              </div>
            </div>

            {targets.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                Belum ada target penilaian. Tambahkan minimal satu kriteria di atas agar simulator dapat mengevaluasi lembar kerja siswa.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {targets.map((tgt, idx) => (
                  <Card key={tgt.id || idx} className="flex flex-col gap-3 p-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          #{idx + 1}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] uppercase font-semibold">
                          {tgt.type.replace('_', ' ')}
                        </Badge>
                        <Input
                          value={tgt.title}
                          onChange={(e) => handleUpdateTarget(idx, { title: e.target.value })}
                          placeholder="Judul Kriteria Target"
                          className="h-7 text-xs font-semibold"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveTarget(idx)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Field Detail Per Tipe Target */}
                    {tgt.type === 'device_config' && (
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Label Perangkat</Label>
                          <Input
                            value={tgt.deviceId}
                            onChange={(e) => handleUpdateTarget(idx, { deviceId: e.target.value })}
                            placeholder="e.g. PC-1"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Alamat IP</Label>
                          <Input
                            value={tgt.address}
                            onChange={(e) => handleUpdateTarget(idx, { address: e.target.value })}
                            placeholder="192.168.1.10"
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Subnet Mask (opsional)</Label>
                          <Input
                            value={tgt.subnetMask || ''}
                            onChange={(e) => handleUpdateTarget(idx, { subnetMask: e.target.value })}
                            placeholder="255.255.255.0"
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {tgt.type === 'link_exists' && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Perangkat A</Label>
                          <Input
                            value={tgt.fromDeviceId}
                            onChange={(e) => handleUpdateTarget(idx, { fromDeviceId: e.target.value })}
                            placeholder="e.g. PC-1"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Perangkat B</Label>
                          <Input
                            value={tgt.toDeviceId}
                            onChange={(e) => handleUpdateTarget(idx, { toDeviceId: e.target.value })}
                            placeholder="e.g. Switch-1"
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {tgt.type === 'reachability' && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Dari Perangkat Asal (Source)</Label>
                          <Input
                            value={tgt.sourceDeviceId}
                            onChange={(e) => handleUpdateTarget(idx, { sourceDeviceId: e.target.value })}
                            placeholder="e.g. PC-1"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Ke Perangkat Tujuan (Destination)</Label>
                          <Input
                            value={tgt.destinationDeviceId}
                            onChange={(e) => handleUpdateTarget(idx, { destinationDeviceId: e.target.value })}
                            placeholder="e.g. Server-1"
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {tgt.type === 'required_device_count' && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Tipe Perangkat</Label>
                          <select
                            value={tgt.deviceType}
                            onChange={(e) => handleUpdateTarget(idx, { deviceType: e.target.value as DeviceType })}
                            className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-0.5 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="router">Router</option>
                            <option value="switch">Switch</option>
                            <option value="pc">PC</option>
                            <option value="server">Server</option>
                            <option value="accessPoint">Access Point</option>
                            <option value="cloud">Cloud</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Jumlah Minimal</Label>
                          <Input
                            type="number"
                            value={tgt.count}
                            onChange={(e) => handleUpdateTarget(idx, { count: Number(e.target.value) })}
                            min={1}
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {tgt.type === 'vlan_config' && (
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Switch</Label>
                          <Input
                            value={tgt.deviceId}
                            onChange={(e) => handleUpdateTarget(idx, { deviceId: e.target.value })}
                            placeholder="e.g. Switch-1"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Port</Label>
                          <Input
                            value={tgt.portId}
                            onChange={(e) => handleUpdateTarget(idx, { portId: e.target.value })}
                            placeholder="fa0/1"
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">VLAN ID</Label>
                          <Input
                            type="number"
                            value={tgt.vlanId}
                            onChange={(e) => handleUpdateTarget(idx, { vlanId: Number(e.target.value) })}
                            placeholder="10"
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[10px] text-muted-foreground">Mode Port</Label>
                          <select
                            value={tgt.mode || 'access'}
                            onChange={(e) => handleUpdateTarget(idx, { mode: e.target.value as 'access' | 'trunk' })}
                            className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-0.5 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="access">Access</option>
                            <option value="trunk">Trunk</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t px-6 py-3.5">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Batal
          </Button>
          <Button size="sm" onClick={handleSave} className="gap-2 text-xs">
            <Save className="h-4 w-4" />
            Simpan Perubahan Soal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
