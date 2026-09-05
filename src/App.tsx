import { useState } from 'react';
import { Toolbar } from './components/toolbar/Toolbar';
import { DevicePalette } from './components/palette/DevicePalette';
import { TopologyCanvas } from './components/canvas/TopologyCanvas';
import { EventLogPanel } from './components/log/EventLogPanel';
import { DeviceConfigModal } from './components/modal/DeviceConfigModal';
import { DeviceCliModal } from './components/terminal/DeviceCliModal';
import { DocumentationModal } from './components/modal/DocumentationModal';
import { useSimulationEngine } from './hooks/useSimulationEngine';

export default function App() {
  const { triggerPing } = useSimulationEngine();
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isDocsOpen, setIsDocsOpen] = useState<boolean>(false);

  const handleTriggerPing = (sourceNodeId: string, targetIp: string) => {
    triggerPing(sourceNodeId, targetIp);
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0B0F19] text-[#F9FAFB]">
      <Toolbar
        onTriggerPing={handleTriggerPing}
        onOpenDocs={() => setIsDocsOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <DevicePalette
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen((prev) => !prev)}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 relative">
            <TopologyCanvas />
          </div>
          <EventLogPanel />
        </main>
      </div>

      {/* Dual Mode Modals */}
      <DeviceConfigModal />
      <DeviceCliModal />
      <DocumentationModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
      />
    </div>
  );
}
