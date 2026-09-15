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
      setActiveCliModalNodeId(null);
    }
  }, [activeCliModalNodeId, node, setActiveCliModalNodeId]);

  const [history, setHistory] = useState<string[]>([
    'Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.1(4)M4',
    'OpenPacket Simulated IOS Terminal v1.3.0',
    'Ketik "help" atau "?" untuk bantuan perintah.',
    '',
  ]);
  const [session, setSession] = useState<CliSession | null>(null);
  const [inputVal, setInputVal] = useState<string>('');
  const [isBusy, setIsBusy] = useState<boolean>(false);
  // Riwayat perintah untuk navigasi ArrowUp/ArrowDown
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);

  // Sesi CLI baru setiap kali modal dibuka untuk perangkat tertentu
  useEffect(() => {
    if (!activeCliModalNodeId) {
      setSession(null);
      return;
    }
    const deviceId = activeCliModalNodeId;
    const cliSession = new CliSession({
      getDevice: () => {
        const current = useAppStore.getState().nodes.find((n) => n.id === deviceId);
        return current!.data;
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
    });
    setSession(cliSession);
    setHistory([
      'Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.1(4)M4',
      'OpenPacket Simulated IOS Terminal v1.3.0',
      'Ketik "help" atau "?" untuk bantuan perintah.',
      '',
    ]);
  }, [activeCliModalNodeId]);

  useEffect(() => {
    terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  if (!node || !session) return null;
  const device = node.data;

  const handleCommand = async (cmd: string) => {
    if (isBusy) return;
    const prompt = session.prompt();
    setHistory((prev) => [...prev, `${prompt} ${cmd}`]);
    setInputVal('');
    setHistIdx(null);
    if (cmd.trim()) {
      setCmdHistory((prev) => [...prev.slice(-49), cmd]);
    }

    if (!cmd.trim()) return;

    setIsBusy(true);
    try {
      const lines = await session.handle(cmd);
      if (lines.length > 0) {
        setHistory((prev) => [...prev, ...lines]);
      }
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
