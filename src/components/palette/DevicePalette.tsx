import { useState, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import {
  Cable,
  Cloud,
  Laptop,
  Monitor,
  Network,
  Router,
  Server,
  Plus,
  LayoutTemplate,
  Layers,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Wifi,
  Square,
  Type,
  Lock,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { type DeviceType } from '../../types/network';
import { TOPOLOGY_TEMPLATES } from '../../data/topologyTemplates';
import { type TopologyTemplate } from '../../types/network';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { classroomHub } from '@/features/classroom/classroomHub';

/** Urutan grup template: dari topologi kecil (klasik) sampai enterprise. */
const TEMPLATE_GROUPS: Array<{ category: TopologyTemplate['category']; title: string; blurb: string }> = [
  { category: 'Dasar', title: '1 · Topologi Dasar (Klasik)', blurb: 'Batu bata jaringan: P2P, star, bus, ring, daisy chain, hub.' },
  { category: 'LAN', title: '2 · LAN & Kantor', blurb: 'Jaringan lokal siap kerja dengan server.' },
  { category: 'Nirkabel', title: '3 · Nirkabel & Internet', blurb: 'Access Point, SSID, dan cloud internet.' },
  { category: 'Routing L3', title: '4 · Routing & WAN', blurb: 'Lintas subnet, WAN point-to-point, dynamic routing.' },
  { category: 'Enterprise', title: '5 · Enterprise / Perusahaan', blurb: 'Hierarkis, mesh, hybrid, dan segmentasi VLAN.' },
];

interface DevicePaletteProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function DevicePalette({ isOpen, onToggle }: DevicePaletteProps) {
  const { addDevice, addSquare, addText, loadTopology, addSimulationLog } = useAppStore();
  const labLocked = useAppStore((s) => s.activeLabId !== null);
  const reactFlow = useReactFlow();
  const [activeTab, setActiveTab] = useState<'devices' | 'templates'>('devices');
  const [isStudentInClass, setIsStudentInClass] = useState<boolean>(() => {
    return (
      classroomHub.getCurrentParticipant() !== null ||
      classroomHub.getLockedRole() === 'student'
    );
  });

  useEffect(() => {
    const checkStatus = () => {
      const inClass =
        classroomHub.getCurrentParticipant() !== null ||
        classroomHub.getLockedRole() === 'student';
      setIsStudentInClass(inClass);
      if (inClass && activeTab === 'templates') {
        setActiveTab('devices');
      }
    };
    const unsub = classroomHub.subscribe(checkStatus);
    checkStatus();
    return unsub;
  }, [activeTab]);

  // Titik tengah viewport kanvas + offset kaskade 28px per node yang menumpuk,
  // sehingga perangkat/anotasi sebelumnya tetap terlihat sebagian.
  const spawnPosition = (): { x: number; y: number } => {
    const canvasEl = document.querySelector('.react-flow');
    const rect = canvasEl?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const center = reactFlow.screenToFlowPosition({ x: centerX, y: centerY });

    const existing = useAppStore.getState().nodes;
    const stackedNearCenter = existing.filter(
      (n) =>
        Math.abs(n.position.x - center.x) < 160 &&
        Math.abs(n.position.y - center.y) < 160
    ).length;
    const shift = Math.min(stackedNearCenter, 10) * 28;
    return { x: center.x + shift, y: center.y + shift };
  };

  const handleAdd = (type: DeviceType) => {
    addDevice(type, spawnPosition());
  };

  const handleAddSquare = () => {
    addSquare(spawnPosition());
    addSimulationLog('INFO', 'Square anotasi ditambahkan — klik untuk ganti warna & resize.');
  };

  const handleAddText = () => {
    addText(spawnPosition());
    addSimulationLog('INFO', 'Teks anotasi ditambahkan — dobel-klik untuk mengedit isinya.');
  };

  const handleApplyTemplate = (template: TopologyTemplate) => {
    const nodes = JSON.parse(JSON.stringify(template.nodes));
    const edges = JSON.parse(JSON.stringify(template.edges));
    loadTopology({ nodes, edges });
    addSimulationLog('SUCCESS', `Template "${template.name}" berhasil diterapkan ke kanvas!`);
  };

  if (!isOpen) {
    return (
      <>
        {/* Desktop Collapsed Strip */}
        <div className="hidden md:flex relative z-10 flex-col items-center border-r bg-card py-3 px-1.5 select-none transition-all">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onToggle}
                  aria-label="Buka Panel Alat"
                >
                  <PanelLeftOpen />
                </Button>
              }
            />
            <TooltipContent side="right">Buka Sidebar Panel</TooltipContent>
          </Tooltip>
          <div className="mt-4 flex flex-col items-center gap-6">
            <span
              style={{ writingMode: 'vertical-rl' }}
              className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transform rotate-180"
            >
              Panel Alat
            </span>
          </div>
        </div>

        {/* Mobile Floating Button saat tertutup */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onToggle}
          className="md:hidden absolute top-3 left-3 z-20 h-8 gap-1.5 rounded-full border border-border/70 bg-card/90 px-3 text-xs font-semibold shadow-md backdrop-blur-sm"
          aria-label="Buka Palet Alat"
        >
          <Layers className="h-3.5 w-3.5 text-primary" />
          <span>Komponen</span>
        </Button>
      </>
    );
  }

  return (
    <>
      {/* Mobile Backdrop saat terbuka */}
      <div
        className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onToggle}
        aria-hidden="true"
      />

      <aside className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] md:relative md:inset-auto md:z-auto md:w-64 md:max-w-none flex flex-col border-r bg-card text-foreground select-none transition-all duration-200 shadow-2xl md:shadow-none">
        {/* Header with Close/Toggle Button */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            Panel Alat
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggle}
            aria-label="Tutup Panel Alat"
          >
            <PanelLeftClose />
          </Button>
        </div>

      {/* Tab Switcher */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'devices' | 'templates')}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList variant="line" className="h-10 w-full shrink-0 justify-stretch rounded-none border-b p-0">
          <TabsTrigger value="devices" className="h-full flex-1 gap-1.5 text-xs font-semibold tracking-wide">
            <Layers className="size-3.5" />
            <span>Komponen</span>
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            disabled={labLocked || isStudentInClass}
            title={
              isStudentInClass
                ? 'Template dinonaktifkan selama Anda mengikuti kelas aktif'
                : labLocked
                ? 'Template dinonaktifkan selama mode lab aktif'
                : undefined
            }
            className="h-full flex-1 gap-1.5 text-xs font-semibold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStudentInClass ? (
              <Lock className="size-3.5 text-amber-400" />
            ) : (
              <Sparkles className="size-3.5 text-amber-400" />
            )}
            <span>Template</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Perangkat Standar */}
        <TabsContent value="devices" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="flex flex-col p-3">
              <div className="mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Palet Perangkat
                </h2>
                <p className="text-[11px] text-muted-foreground/80">Klik untuk menambah ke kanvas</p>
              </div>

              <div className="flex flex-col gap-2">
                <PaletteButton
                  disabled={labLocked}
                  onClick={() => handleAdd('pc')}
                  icon={<Monitor className="h-4 w-4 text-sky-400" />}
                  title="PC Host"
                  subtitle="End Device (1 Port)"
                />

                <PaletteButton
                  disabled={labLocked}
                  onClick={() => handleAdd('laptop')}
                  icon={<Laptop className="h-4 w-4 text-cyan-400" />}
                  title="Laptop"
                  subtitle="End Device (1 Port)"
                />

                <PaletteButton
                  disabled={labLocked}
                  onClick={() => handleAdd('server')}
                  icon={<Server className="h-4 w-4 text-violet-400" />}
                  title="Server"
                  subtitle="End Device (1 Port)"
                />

                <PaletteButton
                  disabled={labLocked}
                  onClick={() => handleAdd('switch')}
                  icon={<Network className="h-4 w-4 text-emerald-400" />}
                  title="Switch L2"
                  subtitle="8 FE Ports (CAM Learning)"
                />

                <PaletteButton
                  disabled={labLocked}
                  onClick={() => handleAdd('hub')}
                  icon={<Cable className="h-4 w-4 text-orange-400" />}
                  title="Hub"
                  subtitle="8 FE Ports (Repeater Murni)"
                />

                <PaletteButton
                  disabled={labLocked}
                  onClick={() => handleAdd('accessPoint')}
                  icon={<Wifi className="h-4 w-4 text-fuchsia-400" />}
                  title="Access Point"
                  subtitle="Radio WiFi + Uplink"
                />

                <PaletteButton
                  disabled={labLocked}
                  onClick={() => handleAdd('router')}
                  icon={<Router className="h-4 w-4 text-amber-400" />}
                  title="Router L3"
                  subtitle="3 FE Ports (Routed)"
                />

                <PaletteButton
                  disabled={labLocked}
                  onClick={() => handleAdd('cloud')}
                  icon={<Cloud className="h-4 w-4 text-sky-300" />}
                  title="Cloud Internet"
                  subtitle="IP Publik Tersimulasi (8.8.8.8)"
                />
              </div>

              {/* Anotasi kanvas: square & teks custom */}
              <div className="mt-6 border-t pt-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-violet-400">
                  Anotasi (di belakang perangkat)
                </h3>
                <div className="mt-2 flex flex-col gap-2">
                  <PaletteButton
                    disabled={labLocked}
                    onClick={handleAddSquare}
                    icon={<Square className="h-4 w-4 text-violet-400" />}
                    title="Square"
                  />
                  <PaletteButton
                    disabled={labLocked}
                    onClick={handleAddText}
                    icon={<Type className="h-4 w-4 text-sky-400" />}
                    title="Teks"
                  />
                </div>
              </div>

              <div className="mt-6 border-t pt-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Petunjuk Sambungan
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Tarik handle port dari perangkat sumber ke target. Sambungan kabel otomatis terkunci 1-to-1.
                </p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Tab 2: Template Siap Pakai */}
        <TabsContent value="templates" className="min-h-0 flex-1 overflow-hidden">
          {isStudentInClass ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 mb-3">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-xs font-bold text-foreground">Template Dinonaktifkan</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Selama sesi kelas atau praktikum berlangsung, Anda diminta merakit topologi secara mandiri pada kanvas.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="flex flex-col p-3">
                <div className="mb-3">
                  <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    Template Topologi
                  </h2>
                  <p className="text-[11px] text-muted-foreground/80">
                    Dikelompokkan dari topologi kecil sampai enterprise
                  </p>
                </div>

              {TEMPLATE_GROUPS.map((group) => {
                const items = TOPOLOGY_TEMPLATES.filter((t) => t.category === group.category);
                if (items.length === 0) return null;
                return (
                  <div key={group.category} className="mb-4">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                        {group.title}
                      </span>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {items.length}
                      </Badge>
                    </div>
                    <p className="mb-2 text-[10px] text-muted-foreground">{group.blurb}</p>
                    <div className="flex flex-col gap-2.5">
                      {items.map((tpl) => (
                        <div
                          key={tpl.id}
                          className="group relative flex flex-col rounded-lg border bg-card p-3 transition-all hover:border-ring"
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">
                              {tpl.name}
                            </span>
                            <Badge variant="outline" className="font-mono text-[11px]">
                              {tpl.category}
                            </Badge>
                          </div>

                          <p className="mb-2.5 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
                            {tpl.description}
                          </p>

                          <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                            <span>
                              {tpl.nodes.length} Nodes • {tpl.edges.length} Links
                            </span>
                            <Button size="xs" onClick={() => handleApplyTemplate(tpl)}>
                              Terapkan
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </aside>
    </>
  );
}

/** Tombol item palet bergaya shadcn. */
function PaletteButton({
  icon,
  title,
  subtitle,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-between rounded-lg border bg-background p-2.5 text-left transition-all hover:border-ring hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      <div className="flex items-center gap-2.5">
        <div className="rounded-md border bg-muted p-1.5">{icon}</div>
        <div>
          <span className="block text-xs font-medium text-foreground">{title}</span>
          {subtitle && (
            <span className="block text-[11px] text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </div>
      <Plus className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
