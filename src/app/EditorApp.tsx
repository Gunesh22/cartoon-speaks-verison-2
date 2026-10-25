import React, { useEffect } from 'react';
import { useEditorStore } from '../state/editorStore';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { AssetPanel } from '../components/AssetPanel/AssetPanel';
import { StoryboardPanel } from '../components/StoryboardPanel/StoryboardPanel';
import { PreviewCanvas } from '../components/PreviewCanvas/PreviewCanvas';
import { PropertiesPanel } from '../components/PropertiesPanel/PropertiesPanel';
import { Timeline } from '../components/Timeline/Timeline';
import { LipSyncModal } from '../components/LipSyncModal/LipSyncModal';
import { ExportModal } from '../components/ExportModal/ExportModal';
import { ProjectModal } from '../components/ProjectModal/ProjectModal';
import { PromptModal } from '../components/PromptModal/PromptModal';
import { VoiceRecorderModal } from '../components/VoiceRecorder/VoiceRecorderModal';
import { SnapshotModal } from '../components/SnapshotModal/SnapshotModal';
import { ProjectHub } from '../components/ProjectHub/ProjectHub';

export const EditorApp: React.FC = () => {
  const { initStore, currentView } = useEditorStore();

  useEffect(() => {
    initStore();
  }, [initStore]);

  if (currentView === 'projects') {
    return (
      <div className="w-screen h-screen overflow-hidden bg-editor-bg text-editor-text font-sans">
        <ProjectHub />
        <ProjectModal />
        <PromptModal />
        <SnapshotModal />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-editor-bg text-editor-text select-none font-sans">
      {/* Top Application Toolbar */}
      <Toolbar />

      {/* Central Editing Surface: Left Assets, Center Canvas, Right Properties */}
      <div className="flex-1 flex overflow-hidden">
        <AssetPanel />
        <StoryboardPanel />
        <PreviewCanvas />
        <PropertiesPanel />
      </div>

      {/* Bottom Timeline */}
      <Timeline />

      {/* Modal Dialogs */}
      <LipSyncModal />
      <ExportModal />
      <ProjectModal />
      <PromptModal />
      <VoiceRecorderModal />
      <SnapshotModal />
    </div>
  );
};
