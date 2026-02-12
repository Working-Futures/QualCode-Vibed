import React, { useState } from 'react';
import { Transcript } from '../types';
import { stripHighlights } from '../utils/highlightUtils';
import { AlertTriangle, Save, X } from 'lucide-react';

interface Props {
    transcript: Transcript;
    onSave: (content: string) => void;
    onClose: () => void;
}

export const TranscriptEditorModal: React.FC<Props> = ({ transcript, onSave, onClose }) => {
    // Initialize with stripped content (raw text)
    const [content, setContent] = useState(stripHighlights(transcript.content));

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-[var(--bg-panel)] w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl flex flex-col border border-[var(--border)] animate-in fade-in zoom-in-95">
                <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-header)] text-[var(--text-main)] rounded-t-xl">
                    <h2 className="font-bold flex items-center gap-2 text-white">
                        Review / Edit Transcript: {transcript.name}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-2 px-6">
                    <AlertTriangle size={14} />
                    Warning: Saving changes will remove ALL existing highlights/codes from this document to preserve data integrity.
                </div>

                <div className="flex-1 p-4 overflow-hidden bg-[var(--bg-main)]">
                    <textarea
                        className="w-full h-full resize-none p-4 rounded-lg bg-[var(--bg-paper)] text-[var(--text-main)] border border-[var(--border)] focus:ring-2 focus:ring-[var(--accent)] outline-none font-mono text-sm leading-relaxed"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Edit transcript content here..."
                    />
                </div>

                <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2 bg-[var(--bg-panel)] rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)] rounded">
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(content)}
                        className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-text)] text-sm font-bold rounded shadow-sm hover:brightness-110 flex items-center gap-2"
                    >
                        <Save size={14} /> Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};
