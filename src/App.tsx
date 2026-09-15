import { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Toolbar } from '@/components/toolbar/Toolbar';
import { DevicePalette } from '@/components/palette/DevicePalette';
import { TopologyCanvas } from '@/components/canvas/TopologyCanvas';
import { PduInspectorDrawer } from '@/components/canvas/PduInspectorDrawer';
import { ClassroomStudentHUD } from '@/components/canvas/ClassroomStudentHUD';
import { EventLogPanel } from '@/components/log/EventLogPanel';
import { DeviceConfigModal } from '@/components/modal/DeviceConfigModal';
import { DeviceCliModal } from '@/components/terminal/DeviceCliModal';
import { DocumentationModal } from '@/components/modal/DocumentationModal';
import { LabModal } from '@/components/modal/LabModal';
import { ClassroomModal } from '@/components/modal/ClassroomModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ToastHost } from '@/components/ui/ToastHost';
import { useSimulationEngine } from '@/hooks/useSimulationEngine';

export default function App() {
  const { triggerPing } = useSimulationEngine();
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });
  const [isDocsOpen, setIsDocsOpen] = useState<boolean>(false);
  const [isLabOpen, setIsLabOpen] = useState<boolean>(false);
  const [isClassroomOpen, setIsClassroomOpen] = useState<boolean>(false);

  const handleTriggerPing = (sourceNodeId: string, targetIp: string) => {
    triggerPing(sourceNodeId, targetIp);
  };

  return (
    <ReactFlowProvider>
      <div className="flex h-screen w-screen flex-col bg-background text-foreground">
        <Toolbar
          onTriggerPing={handleTriggerPing}
          onOpenDocs={() => setIsDocsOpen(true)}
          onOpenLabs={() => setIsLabOpen(true)}
          onOpenClassroom={() => setIsClassroomOpen(true)}
        />
        <div className="flex flex-1 overflow-hidden">
          <DevicePalette
            isOpen={isSidebarOpen}
            onToggle={() => setIsSidebarOpen((prev) => !prev)}
          />
          <main className="flex flex-1 flex-col overflow-hidden">
            <div className="relative flex-1">
              <TopologyCanvas />
              <PduInspectorDrawer />
              <ClassroomStudentHUD />
            </div>
            <EventLogPanel />
          </main>
        </div>

        {/* Dual Mode Modals */}
        <DeviceConfigModal />
        <DeviceCliModal />
        <LabModal isOpen={isLabOpen} onClose={() => setIsLabOpen(false)} />
        <ClassroomModal
          isOpen={isClassroomOpen}
          onClose={() => setIsClassroomOpen(false)}
        />
        <DocumentationModal
          isOpen={isDocsOpen}
          onClose={() => setIsDocsOpen(false)}
        />
        <ConfirmDialog />
        <ToastHost />
      </div>
    </ReactFlowProvider>
  );
}
