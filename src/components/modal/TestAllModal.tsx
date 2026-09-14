import { useState } from 'react';
import { ClipboardCheck, Play, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  TEST_SUITES,
  runTestAll,
  type TestAllResult,
  type TestSuiteId,
} from '../../utils/testAllRunner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function TestAllModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const nodes = useAppStore((s) => s.nodes);
  const edges = useAppStore((s) => s.edges);
  const addSimulationLog = useAppStore((s) => s.addSimulationLog);
  const [selected, setSelected] = useState<TestSuiteId[]>(['ping', 'gateway', 'dhcp', 'rip']);
  const [result, setResult] = useState<TestAllResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const toggle = (id: TestSuiteId) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
    setResult(null);
  };

  const handleRun = () => {
    if (selected.length === 0 || isRunning) return;
    setIsRunning(true);
    try {
      const devices = nodes
        .filter((n) => (n.data.nodeKind ?? 'device') === 'device')
        .map((n) => n.data);
      const links = edges.map((e) => ({
        sourceNodeId: e.source,
        sourcePortId: (e.sourceHandle as string) ?? 'fa0',
        targetNodeId: e.target,
        targetPortId: (e.targetHandle as string) ?? 'fa0',
        kind: (e.type === 'wirelessLink' ? 'wireless' : 'ethernet') as 'ethernet' | 'wireless',
      }));
      const res = runTestAll(devices, links, selected);
      setResult(res);
      const parts: string[] = [];
      if (selected.includes('ping')) parts.push(`Ping ${res.pingPass}/${res.pingPass + res.pingFail} lolos`);
      if (selected.includes('gateway')) parts.push(`Gateway ${res.gatewayPass}/${res.gatewayPass + res.gatewayFail} lolos`);
      if (selected.includes('rip') && res.ripRoutesAdded !== null) parts.push(`RIP +${res.ripRoutesAdded} rute`);
      addSimulationLog(
        res.pingFail + res.gatewayFail === 0 ? 'SUCCESS' : 'INFO',
        `Test All selesai — ${parts.join(' • ') || 'tidak ada suite terpilih'}.`
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[86vh] w-[760px] flex-col gap-0 p-0 sm:max-w-[760px]">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="flex items-center gap-2.5 text-sm font-bold">
            <ClipboardCheck className="h-5 w-5 text-emerald-400" />
            Test All — Uji Otomatis Seluruh Konfigurasi
          </DialogTitle>
          <DialogDescription className="sr-only">
            Uji ping, gateway, DHCP, dan RIP pada seluruh konfigurasi topologi.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          {/* Pilihan tes */}
          <section aria-label="Pilih tes yang dijalankan">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tes yang dijalankan
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TEST_SUITES.map((suite) => {
                const active = selected.includes(suite.id);
                return (
                  <button
                    key={suite.id}
                    onClick={() => toggle(suite.id)}
                    aria-pressed={active}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? 'border-emerald-500 bg-emerald-950/40'
                        : 'border-border bg-muted/40 hover:border-muted-foreground/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {active ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <MinusCircle className="h-4 w-4 text-muted-foreground/60" />
                      )}
                      <span className="text-sm font-bold">{suite.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{suite.hint}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <Button
            onClick={handleRun}
            disabled={selected.length === 0 || isRunning}
            className="w-full gap-2 py-2.5"
          >
            <Play className="h-4 w-4" />
            {isRunning ? 'Menguji…' : `Jalankan ${selected.length} Tes`}
          </Button>

          {/* Hasil */}
          {result && (
            <section aria-label="Hasil test all" className="flex flex-col gap-3">
              {selected.includes('ping') && (
                <ResultTable
                  title={`Ping Matrix — ${result.pingPass} lolos / ${result.pingFail} gagal`}
                  headers={['Sumber', 'Target', 'Status', 'RTT/TTL']}
                  rows={result.pingRows.map((r) => ({
                    key: `${r.sourceIp}-${r.targetIp}`,
                    cells: [
                      `${r.sourceLabel} (${r.sourceIp})`,
                      `${r.targetLabel ?? '?'} (${r.targetIp})`,
                      r.success ? 'PASS' : 'FAIL',
                      r.success ? `${r.rttMs}ms / TTL ${r.ttl}` : (r.error ?? 'gagal'),
                    ],
                    pass: r.success,
                  }))}
                  emptyText="Tidak ada pasangan ping (butuh ≥2 IP di topologi)."
                />
              )}
              {selected.includes('gateway') && (
                <ResultTable
                  title={`Gateway — ${result.gatewayPass} lolos / ${result.gatewayFail} gagal`}
                  headers={['Host', 'Gateway', 'Status']}
                  rows={result.gatewayRows.map((r) => ({
                    key: r.sourceId,
                    cells: [
                      `${r.sourceLabel} (${r.sourceIp})`,
                      r.gateway,
                      r.success ? 'PASS' : `FAIL — ${r.error ?? ''}`,
                    ],
                    pass: r.success,
                  }))}
                  emptyText="Tidak ada host dengan default gateway."
                />
              )}
              {selected.includes('dhcp') && (
                <ResultTable
                  title="DHCP — status port klien"
                  headers={['Perangkat', 'Port', 'Status']}
                  rows={result.dhcpRows.map((r) => ({
                    key: `${r.nodeId}-${r.portId}`,
                    cells: [
                      r.label,
                      r.portName,
                      r.status === 'ok'
                        ? `OK — ${r.ipAddress}`
                        : r.status === 'missing-ip'
                          ? 'BELUM DAPAT IP (dhcpEnabled, jalankan DHCP)'
                          : 'TANPA IP (tidak statis & tidak DHCP)',
                    ],
                    pass: r.status === 'ok',
                  }))}
                  emptyText="Tidak ada port DHCP / host tanpa IP."
                />
              )}
              {selected.includes('rip') && (
                <div className="rounded-xl border bg-muted/40 p-3">
                  <p className="text-sm font-bold">
                    RIP —{' '}
                    {result.ripRoutesAdded !== null
                      ? `+${result.ripRoutesAdded} rute dipelajari`
                      : 'dilewati'}
                  </p>
                  {result.ripOutput.map((line, i) => (
                    <p key={i} className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResultTable({
  title,
  headers,
  rows,
  emptyText,
}: {
  title: string;
  headers: string[];
  rows: Array<{ key: string; cells: string[]; pass: boolean }>;
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3">
      <p className="mb-2 text-sm font-bold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">{emptyText}</p>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-popover">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="px-2 py-1 font-semibold text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  {r.cells.map((c, i) => (
                    <td
                      key={i}
                      className={`px-2 py-1 font-mono ${
                        i === r.cells.length - 1
                          ? r.pass
                            ? 'font-bold text-emerald-400'
                            : 'text-red-400'
                          : 'text-foreground/90'
                      }`}
                    >
                      <span className="mr-1 inline-flex align-middle">
                        {i === r.cells.length - 1 &&
                          (r.pass ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          ))}
                      </span>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
