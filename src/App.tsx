import { useState } from 'react';
import { Toolbar } from './components/toolbar/Toolbar';
import { DevicePalette } from './components/palette/DevicePalette';
import { TopologyCanvas } from './components/canvas/TopologyCanvas';
import { PduInspectorDrawer } from './components/canvas/PduInspectorDrawer';
import { EventLogPanel } from './components/log/EventLogPanel';
import { DeviceConfigModal } from './components/modal/DeviceConfigModal';
import { DeviceCliModal } from './components/terminal/DeviceCliModal';
import { DocumentationModal } from './components/modal/DocumentationModal';
import { LabModal } from './components/modal/LabModal';
import { ToastHost } from './components/ui/ToastHost';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { useSimulationEngine } from './hooks/useSimulationEngine';

export default function App() {
  const { triggerPing } = useSimulationEngine();
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isDocsOpen, setIsDocsOpen] = useState<boolean>(false);
  const [isLabOpen, setIsLabOpen] = useState<boolean>(false);

  const handleTriggerPing = (sourceNodeId: string, targetIp: string) => {
    triggerPing(sourceNodeId, targetIp);
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0B0F19] text-[#F9FAFB]">
      <Toolbar
        onTriggerPing={handleTriggerPing}
        onOpenDocs={() => setIsDocsOpen(true)}
        onOpenLabs={() => setIsLabOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <DevicePalette
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen((prev) => !prev)}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 relative">
            <TopologyCanvas />
            <PduInspectorDrawer />
          </div>
          <EventLogPanel />
        </main>
      </div>

      {/* Dual Mode Modals */}
      <DeviceConfigModal />
      <DeviceCliModal />
      <LabModal isOpen={isLabOpen} onClose={() => setIsLabOpen(false)} />
      <DocumentationModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
      />
      <ConfirmDialog />
      <ToastHost />
    </div>
  );
}
