import React from 'react';
import { Project, Transcript } from '../types';
import { StickyNote, X, Download } from 'lucide-react';
import { exportMemos } from '../utils/dataUtils';

interface Props {
  project: Project;
  activeTranscript: Transcript | null;
  onUpdateProject: (p: Project) => void;
  onClose: () => void;
  readOnly?: boolean;
}

export const MemoSidebar: React.FC<Props> = ({ project, activeTranscript, onUpdateProject, onClose, readOnly = false }) => {

  const handleProjectMemoChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    onUpdateProject({ ...project, projectMemo: e.target.value });
  };

  const handleTranscriptMemoChange = (newText: string) => {
    if (readOnly) return;
    if (!activeTranscript) return;
    onUpdateProject({
      ...project,
      transcripts: project.transcripts.map(t =>
        t.id === activeTranscript.id ? { ...t, memo: newText } : t
      )
    });
  };

  return (
    <div className="w-80 bg-[var(--bg-panel)] border-l border-[var(--border)] flex flex-col h-full shadow-xl z-20 shrink-0">
      <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-panel)] flex justify-between items-center">
        <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2">
          <StickyNote size={16} /> Memos
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => exportMemos(project)}
            className="text-[var(--text-muted)] hover:text-[var(--accent)] p-1 rounded hover:bg-[var(--bg-main)]"
            title="Export Memos to Text"
          >
            <Download size={16} />
          </button>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[var(--bg-main)]">

        {/* Transcript Specific Memo */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
            <span>Document Memo</span>
            {activeTranscript && <span className="text-[var(--text-muted)] truncate max-w-[100px]">{activeTranscript.name}</span>}
          </div>

          {activeTranscript ? (
            <textarea
              className={`w-full h-48 p-3 text-sm border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] bg-[var(--bg-panel)] text-[var(--text-main)] ${readOnly ? 'opacity-75 cursor-not-allowed' : ''}`}
              placeholder="Notes specific to this transcript..."
              value={activeTranscript.memo || ''}
              onChange={(e) => handleTranscriptMemoChange(e.target.value)}
              readOnly={readOnly}
            />
          ) : (
            <div className="h-24 flex items-center justify-center border border-dashed border-[var(--border)] rounded bg-[var(--bg-panel)] text-[var(--text-muted)] text-xs text-center p-4">
              Select a transcript to add notes
            </div>
          )}
        </div>

        {/* Global Project Memo */}
        <div className="space-y-2 h-1/2">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Project Journal
          </div>
          <textarea
            className={`w-full h-64 p-3 text-sm border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] bg-[var(--bg-panel)] text-[var(--text-main)] ${readOnly ? 'opacity-75 cursor-not-allowed' : ''}`}
            placeholder="Global project notes, hypothesis, etc..."
            value={project.projectMemo || ''}
            onChange={handleProjectMemoChange}
            readOnly={readOnly}
          />
        </div>

      </div>
    </div>
  );
};