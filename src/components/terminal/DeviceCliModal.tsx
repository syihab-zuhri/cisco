import React, { useState, useRef, useEffect } from 'react';
import { Terminal as TermIcon, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { CliSession } from '../../engine/cli/cliEngine';
import { requestPing } from '../../hooks/useSimulationEngine';

export function DeviceCliModal() {
  const activeCliModalNodeId = useAppStore((s) => s.activeCliModalNodeId);
  const nodes = useAppStore((s) => s.nodes);
  const setActiveCliModalNodeId = useAppStore((s) => s.setActiveCliModalNodeId);

  const node = nodes.find((n) => n.id === activeCliModalNodeId);
  const terminalBottomRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<string[]>([
    'Cisco IOS Software, C2900 Software (C2900-UNIVERSALK9-M), Version 15.1(4)M4',
    'OpenPacket Simulated IOS Terminal v1.0.0',
    'Ketik "help" atau "?" untuk bantuan perintah.',
    '',
  ]);
  const [session, setSession] = useState<CliSession | null>(null);
  const [inputVal, setInputVal] = useState<string>('');
  const [isBusy, setIsBusy] = useState<boolean>(false);

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
      'OpenPacket Simulated IOS Terminal v1.0.0',
      'Ketik "help" atau "?" untuk bantuan perintah.',
      '',
    ]);
  }, [activeCliModalNodeId]);

  useEffect(() => {
    terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  if (!activeCliModalNodeId || !node || !session) return null;
  const device = node.data;

  const handleCommand = async (cmd: string) => {
    if (isBusy) return;
    const prompt = session.prompt();
    setHistory((prev) => [...prev, `${prompt} ${cmd}`]);
    setInputVal('');

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
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
      <div className="flex h-[520px] w-[640px] flex-col rounded-xl border border-gray-700 bg-[#050505] shadow-2xl overflow-hidden font-mono">
        {/* Terminal Header */}
        <div className="flex h-10 items-center justify-between border-b border-gray-800 bg-[#111827] px-4">
          <div className="flex items-center gap-2">
            <TermIcon className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-semibold text-gray-200">
              Cisco IOS Terminal — {device.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveCliModalNodeId(null)}
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Terminal Body */}
        <div className="flex-1 overflow-y-auto p-4 text-xs text-[#00FF66] space-y-1">
          {history.map((line, idx) => (
            <div key={idx} className="whitespace-pre-wrap leading-relaxed">
              {line}
            </div>
          ))}

          {/* Active Prompt Line */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-sky-400 font-bold select-none">{session.prompt()}</span>
            <input
              type="text"
              autoFocus
              disabled={isBusy}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-[#00FF66] outline-none font-mono text-xs disabled:opacity-50"
            />
          </div>
          <div ref={terminalBottomRef} />
        </div>
      </div>
    </div>
  );
}
