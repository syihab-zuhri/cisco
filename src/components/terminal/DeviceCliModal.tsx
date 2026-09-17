import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TermIcon } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { CliSession } from '../../engine/cli/cliEngine';
import { requestPing } from '../../hooks/useSimulationEngine';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CliDeviceCache {
  session: CliSession;
  history: string[];
  cmdHistory: string[];
}

const cliCacheByDeviceId = new Map<string, CliDeviceCache>();

export function clearCliCache(deviceId?: string) {
  if (deviceId) {
    cliCacheByDeviceId.delete(deviceId);
  } else {
    cliCacheByDeviceId.clear();
  }
}

export function DeviceCliModal() {
  const activeCliModalNodeId = useAppStore((s) => s.activeCliModalNodeId);
  const nodes = useAppStore((s) => s.nodes);
  const setActiveCliModalNodeId = useAppStore((s) => s.setActiveCliModalNodeId);

  const node = nodes.find((n) => n.id === activeCliModalNodeId);
  const terminalBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Jika perangkat dihapus saat terminal terbuka, tutup modal dengan aman
  useEffect(() => {
    if (activeCliModalNodeId && !node) {
      clearCliCache(activeCliModalNodeId);
      setActiveCliModalNodeId(null);
    }
  }, [activeCliModalNodeId, node, setActiveCliModalNodeId]);

  const [history, setHistory] = useState<string[]>([]);
  const [session, setSession] = useState<CliSession | null>(null);
  const [inputVal, setInputVal] = useState<string>('');
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);

  // Sesi CLI persisten per perangkat
  useEffect(() => {
    if (!activeCliModalNodeId) {
      setSession(null);
      return;
    }
    const deviceId = activeCliModalNodeId;
    const cached = cliCacheByDeviceId.get(deviceId);
    if (cached) {
      setSession(cached.session);
      setHistory(cached.history);
      setCmdHistory(cached.cmdHistory);
      return;
    }

    const cliSession = new CliSession({
      getDevice: () => {
        const current = useAppStore.getState().nodes.find((n) => n.id === deviceId);
        if (!current) {
          return {
            id: deviceId,
            label: 'Unknown',
            type: 'router',
            ports: [],
          };
        }
        return current.data;
      },
      setHostname: (name) => {
        useAppStore.getState().updateDeviceConfig(deviceId, { label: name });
      },
      setPortConfig: (portId, updates) => {
        useAppStore.getState().updatePortConfig(deviceId, portId, updates);
      },
      requestPing: async (targetIp) => {
        const result = await requestPing(deviceId, targetIp, {
          echoCount: 5,
          outputStyle: 'ios',
        });
        return { success: result.success, outputLines: result.outputLines };
      },
      addStaticRoute: (route) => {
        useAppStore.getState().addStaticRoute(deviceId, route);
      },
      removeStaticRoute: (index) => {
        useAppStore.getState().removeStaticRoute(deviceId, index);
      },
      setDefaultGateway: (gw) => {
        useAppStore.getState().updateDeviceConfig(deviceId, { defaultGateway: gw });
      },
      saveConfig: () => {
        const label = useAppStore.getState().nodes.find((n) => n.id === deviceId)?.data.label ?? deviceId;
        useAppStore.getState().pushToast('success', `Konfigurasi ${label} berhasil disimpan ke NVRAM.`);
      },
      setSubInterfaceConfig: (parentPortId, vlanId, updates, oldVlanId) => {
        const dev = useAppStore.getState().nodes.find((n) => n.id === deviceId)?.data;
        if (!dev) return;
        const port = dev.ports.find((p) => p.id === parentPortId);
        if (!port) return;
        const subInterfaces = [...(port.subInterfaces ?? [])];
        const searchVlan = oldVlanId ?? vlanId;
        const idx = subInterfaces.findIndex((s) => s.vlanId === searchVlan);
        if (idx >= 0) {
          subInterfaces[idx] = {
            ...subInterfaces[idx],
            vlanId,
            ...('ipAddress' in updates ? { ipAddress: updates.ipAddress ?? '' } : {}),
            ...('subnetMask' in updates ? { subnetMask: updates.subnetMask ?? '' } : {}),
          };
        } else {
          subInterfaces.push({
            vlanId,
            ipAddress: updates.ipAddress ?? '',
            subnetMask: updates.subnetMask ?? '255.255.255.0',
          });
        }
        useAppStore.getState().updatePortConfig(deviceId, parentPortId, { subInterfaces });
      },
      removeSubInterface: (parentPortId, vlanId) => {
        const dev = useAppStore.getState().nodes.find((n) => n.id === deviceId)?.data;
        if (!dev) return;
        const port = dev.ports.find((p) => p.id === parentPortId);
        if (!port) return;
        const subInterfaces = (port.subInterfaces ?? []).filter((s) => s.vlanId !== vlanId);
        useAppStore.getState().updatePortConfig(deviceId, parentPortId, { subInterfaces });
      },
      clearMacTable: () => {
        useAppStore.getState().clearMacTable(deviceId);
      },
      clearArpTable: () => {
        useAppStore.getState().clearArpTable(deviceId);
      },
    });

    const initialHistory = [
      'Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.1(4)M4',
      'OpenPacket Simulated IOS Terminal v1.3.0',
      'Ketik "help" atau "?" untuk bantuan perintah.',
      '',
    ];

    cliCacheByDeviceId.set(deviceId, {
      session: cliSession,
      history: initialHistory,
      cmdHistory: [],
    });

    setSession(cliSession);
    setHistory(initialHistory);
    setCmdHistory([]);
  }, [activeCliModalNodeId]);

  // Simpan riwayat interaksi terbaru ke cache
  useEffect(() => {
    if (activeCliModalNodeId && session) {
      const entry = cliCacheByDeviceId.get(activeCliModalNodeId);
      if (entry) {
        entry.history = history;
        entry.cmdHistory = cmdHistory;
      }
    }
  }, [activeCliModalNodeId, session, history, cmdHistory]);

  useEffect(() => {
    terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  if (!node || !session) return null;
  const device = node.data;

  const handleCommand = async (cmd: string) => {
    if (isBusy) return;
    const prompt = session.prompt();
    const newHistory = [...history, `${prompt} ${cmd}`];
    setHistory(newHistory);
    setInputVal('');
    setHistIdx(null);
    let newCmdHistory = cmdHistory;
    if (cmd.trim()) {
      newCmdHistory = [...cmdHistory.slice(-49), cmd];
      setCmdHistory(newCmdHistory);
    }

    if (activeCliModalNodeId) {
      const entry = cliCacheByDeviceId.get(activeCliModalNodeId);
      if (entry) {
        entry.history = newHistory;
        entry.cmdHistory = newCmdHistory;
      }
    }

    if (!cmd.trim()) return;

    setIsBusy(true);
    try {
      const lines = await session.handle(cmd);
      if (lines.length > 0) {
        setHistory((prev) => {
          const updated = [...prev, ...lines];
          if (activeCliModalNodeId) {
            const entry = cliCacheByDeviceId.get(activeCliModalNodeId);
            if (entry) entry.history = updated;
          }
          return updated;
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setHistory((prev) => {
        const updated = [...prev, `% Unhandled CLI exception: ${message}`];
        if (activeCliModalNodeId) {
          const entry = cliCacheByDeviceId.get(activeCliModalNodeId);
          if (entry) entry.history = updated;
        }
        return updated;
      });
    } finally {
      setIsBusy(false);
    }
    if (session.closeRequested) {
      setActiveCliModalNodeId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void handleCommand(inputVal);
      return;
    }
    // Navigasi riwayat perintah ala terminal asli
    if (e.key === 'ArrowUp' && cmdHistory.length > 0) {
      e.preventDefault();
      const next = histIdx === null ? cmdHistory.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInputVal(cmdHistory[next]);
    } else if (e.key === 'ArrowDown' && histIdx !== null) {
      e.preventDefault();
      const next = histIdx + 1;
      if (next >= cmdHistory.length) {
        setHistIdx(null);
        setInputVal('');
      } else {
        setHistIdx(next);
        setInputVal(cmdHistory[next]);
      }
    }
  };

  return (
    <Dialog
      open={Boolean(activeCliModalNodeId)}
      onOpenChange={(open) => { if (!open) setActiveCliModalNodeId(null); }}
    >
      <DialogContent
        showCloseButton
        className="flex h-[85vh] sm:h-[520px] w-[95vw] max-w-[640px] flex-col gap-0 overflow-hidden border p-0 font-mono sm:max-w-[640px]"
        style={{ backgroundColor: 'var(--term-bg)' }}
      >
        <DialogHeader className="flex-row items-center justify-between border-b bg-muted/60 px-4 py-0">
          <DialogTitle className="flex items-center gap-2 py-2.5 text-xs font-semibold">
            <TermIcon className="h-4 w-4 text-emerald-400" />
            Cisco IOS Terminal — {device.label}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Terminal emulasi Cisco IOS untuk {device.label}
          </DialogDescription>
        </DialogHeader>

        {/* Terminal Body - Klik untuk fokus otomatis ke baris input */}
        <div
          onClick={() => inputRef.current?.focus()}
          className="flex flex-1 flex-col gap-1 overflow-y-auto p-4 text-xs cursor-text"
          style={{ color: 'var(--term-text)' }}
        >
          {history.map((line, idx) => (
            <div key={idx} className="whitespace-pre-wrap leading-relaxed">
              {line}
            </div>
          ))}

          {/* Active Prompt Line */}
          <div className="flex items-center gap-2 pt-1">
            <span className="font-bold select-none shrink-0" style={{ color: 'var(--term-prompt)' }}>
              {session.prompt()}
            </span>
            <input
              ref={inputRef}
              type="text"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={isBusy}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent font-mono text-xs outline-none disabled:opacity-50 min-w-0"
              style={{ color: 'var(--term-text)' }}
            />
          </div>
          <div ref={terminalBottomRef} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
