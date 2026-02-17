
import React, { useState, useEffect, useMemo } from 'react';
import { Check, X, ArrowRight, CornerDownRight, Edit2, Save, Undo } from 'lucide-react';
import { computeLineDiff, mergeDiff, DiffChunk } from '../utils/diffUtils';

interface DiffViewerProps {
    originalContent: string;
    modifiedContent: string;
    readOnly?: boolean;
    onContentChange?: (content: string) => void;
    showAcceptAll?: boolean;
    defaultAccepted?: boolean;
    onAllResolved?: () => void;
}

type VisualChunk =
    | { type: 'equal', lines: string[] }
    | { type: 'insert', lines: string[], diffIndex: number }
    | { type: 'delete', lines: string[], diffIndex: number }
    | { type: 'replace', oldLines: string[], newLines: string[], diffIndexDel: number, diffIndexIns: number };

// Helper to parse transcript HTML into text lines
const parseTranscriptLines = (html: string): string[] => {
    if (!html) return [];
    // If it's already plain text (no tags/newlines only), just split.
    // But we expect HTML structure <div class="transcript-line">...</div>
    const div = document.createElement('div');
    div.innerHTML = html;

    // Check for structured lines
    const lines = Array.from(div.querySelectorAll('.transcript-line'));
    if (lines.length > 0) {
        return lines.map(l => {
            // Basic text content, trimming might be needed but editor preserves whitespace structure usually
            // stripping possible gutter markers if any exist in stored content
            // clone to be safe
            const clone = l.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('.line-codes-gutter, .line-annotation-gutter').forEach(el => el.remove());
            // Also remove the "New Code" artifacts if present in text
            return (clone.textContent || '').replace(/^(\s*\{\s+[^{}]+\s*)+/g, '');
        });
    }

    // Fallback for plain text or different structure
    const text = div.textContent || '';
    return text.split(/\r?\n/);
};

export const DiffViewer: React.FC<DiffViewerProps> = ({
    originalContent,
    modifiedContent,
    readOnly = false,
    onContentChange,
    showAcceptAll = false,
    defaultAccepted = false,
    onAllResolved
}) => {
    const [diffs, setDiffs] = useState<DiffChunk[]>([]);

    // Status Map: Track the state of each diff index
    const [diffStatus, setDiffStatus] = useState<Record<number, 'pending' | 'accepted' | 'rejected'>>({});

    const [visualChunks, setVisualChunks] = useState<VisualChunk[]>([]);

    // Inline Edit State
    const [editingChunkIndex, setEditingChunkIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');

    // Compute diffs when content changes
    useEffect(() => {
        const originalLines = parseTranscriptLines(originalContent || '');
        const modifiedLines = parseTranscriptLines(modifiedContent || '');

        const originalText = originalLines.join('\n');
        const modifiedText = modifiedLines.join('\n');

        const computed = computeLineDiff(originalText, modifiedText);
        setDiffs(computed);

        // Initialize status based on defaultAccepted
        const initialStatus: Record<number, 'pending' | 'accepted' | 'rejected'> = {};
        computed.forEach((d, i) => {
            if (d.type !== 'equal') {
                initialStatus[i] = defaultAccepted ? 'accepted' : 'pending';
            }
        });
        setDiffStatus(initialStatus);

        // Reset edit state
        setEditingChunkIndex(null);
        setEditValue('');
    }, [originalContent, modifiedContent, defaultAccepted]);

    // Check for "All Resolved"
    useEffect(() => {
        const changeIndices = Object.keys(diffStatus);
        if (changeIndices.length === 0) return;

        const allResolved = changeIndices.every(idx => diffStatus[parseInt(idx)] !== 'pending');
        if (allResolved && onAllResolved) {
            // Use timeout to allow UI to update first
            setTimeout(() => {
                onAllResolved();
            }, 500);
        }
    }, [diffStatus, onAllResolved]);

    // Process visual chunks (group adjacent delete+insert into replace)
    useEffect(() => {
        const chunks: VisualChunk[] = [];
        for (let i = 0; i < diffs.length; i++) {
            const current = diffs[i];
            const next = diffs[i + 1];

            if (current.type === 'equal') {
                chunks.push({ type: 'equal', lines: current.lines });
            } else if (current.type === 'delete' && next && next.type === 'insert') {
                chunks.push({
                    type: 'replace',
                    oldLines: current.lines,
                    newLines: next.lines,
                    diffIndexDel: i,
                    diffIndexIns: i + 1
                });
                i++;
            } else if (current.type === 'delete') {
                chunks.push({ type: 'delete', lines: current.lines, diffIndex: i });
            } else if (current.type === 'insert') {
                chunks.push({ type: 'insert', lines: current.lines, diffIndex: i });
            }
        }
        setVisualChunks(chunks);
    }, [diffs]);

    // Notify parent of content changes
    useEffect(() => {
        if (onContentChange) {
            const acceptedIndices = new Set<number>();
            Object.entries(diffStatus).forEach(([key, status]) => {
                const idx = parseInt(key);
                if (status === 'accepted') {
                    acceptedIndices.add(idx);
                } else if (status === 'pending' && defaultAccepted) {
                    acceptedIndices.add(idx);
                }
            });

            const mergedText = mergeDiff(diffs, acceptedIndices);
            const lines = mergedText.split(/\r?\n/);

            const escape = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
            const metadataAttr = (i: number) => `data-line="${i + 1}"`;
            const html = lines.map((line, i) =>
                `<div class="transcript-line" ${metadataAttr(i)}>${escape(line)}</div>`
            ).join('');

            onContentChange(html);
        }
    }, [diffStatus, diffs, onContentChange, defaultAccepted]);

    const setStatus = (indices: number[], status: 'accepted' | 'rejected') => {
        setDiffStatus(prev => {
            const next = { ...prev };
            indices.forEach(i => next[i] = status);
            // After setting status, if this was the last pending item, 
            // the Effect [diffStatus] will trigger onAllResolved.
            return next;
        });
    };

    const handleAcceptAll = () => {
        const next: Record<number, 'accepted'> = {};
        diffs.forEach((d, i) => { if (d.type !== 'equal') next[i] = 'accepted'; });
        setDiffStatus(prev => ({ ...prev, ...next }));
    };

    const handleRejectAll = () => {
        const next: Record<number, 'rejected'> = {};
        diffs.forEach((d, i) => { if (d.type !== 'equal') next[i] = 'rejected'; });
        setDiffStatus(prev => ({ ...prev, ...next }));
    };

    const handleEditStart = (index: number, currentLines: string[]) => {
        setEditingChunkIndex(index);
        setEditValue(currentLines.join('\n'));
    };

    const handleEditCancel = () => {
        setEditingChunkIndex(null);
        setEditValue('');
    };

    const handleEditSave = (chunk: VisualChunk) => {
        if (!onContentChange) return;

        const lines: string[] = [];
        diffs.forEach((d, i) => {
            let isTargetChunk = false;
            if (chunk.type === 'insert' && (chunk as any).diffIndex === i) isTargetChunk = true;
            if (chunk.type === 'replace' && (chunk as any).diffIndexIns === i) isTargetChunk = true;

            if (isTargetChunk) {
                lines.push(...editValue.split(/\r?\n/));
            } else {
                if (d.type === 'equal' || d.type === 'insert') {
                    lines.push(...d.lines);
                }
            }
        });

        const escape = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        const metadataAttr = (i: number) => `data-line="${i + 1}"`;
        const html = lines.map((line, i) =>
            `<div class="transcript-line" ${metadataAttr(i)}>${escape(line)}</div>`
        ).join('');

        onContentChange(html);
        setEditingChunkIndex(null);
    };

    if (!originalContent && !modifiedContent) return null;

    const lineClass = "py-0.5 px-2 min-h-[1.5rem] leading-relaxed whitespace-pre-wrap font-sans text-sm";

    // Render plain text block (used for accepted/context lines)
    const renderPlainBlock = (lines: string[], key: number | string) => (
        <div key={key} className="bg-white text-slate-600 transition-colors hover:bg-slate-50">
            {lines.length > 5 ? (
                <>
                    <div className={lineClass}>{lines[0]}</div>
                    <div className={lineClass}>{lines[1]}</div>
                    <div className="text-[10px] bg-slate-50 text-slate-400 py-1 px-4 text-center cursor-help" title={`${lines.length - 4} collapsed lines`}>
                        ... {lines.length - 4} unchanged ...
                    </div>
                    <div className={lineClass}>{lines[lines.length - 2]}</div>
                    <div className={lineClass}>{lines[lines.length - 1]}</div>
                </>
            ) : (
                lines.map((l, i) => <div key={i} className={lineClass}>{l || <br />}</div>)
            )}
        </div>
    );

    const getChunkStatus = (chunk: VisualChunk): 'pending' | 'accepted' | 'rejected' => {
        if (chunk.type === 'replace') {
            const s1 = diffStatus[chunk.diffIndexDel];
            const s2 = diffStatus[chunk.diffIndexIns];
            if (s1 === 'accepted' && s2 === 'accepted') return 'accepted';
            if (s1 === 'rejected' && s2 === 'rejected') return 'rejected';
            return 'pending';
        } else if (chunk.type === 'insert') {
            return diffStatus[chunk.diffIndex] || 'pending';
        } else if (chunk.type === 'delete') {
            return diffStatus[chunk.diffIndex] || 'pending';
        }
        return 'pending';
    };

    return (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
            {!readOnly && showAcceptAll && Object.values(diffStatus).some(s => s === 'pending') && (
                <div className="bg-slate-50 p-2 border-b flex gap-2 justify-end sticky top-0 z-10">
                    <button onClick={handleAcceptAll} className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-bold hover:bg-green-200">Accept All</button>
                    <button onClick={handleRejectAll} className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-bold hover:bg-red-200">Reject All</button>
                </div>
            )}

            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {visualChunks.map((chunk, idx) => {
                    if (chunk.type === 'equal') {
                        return renderPlainBlock(chunk.lines, idx);
                    }

                    const status = getChunkStatus(chunk);
                    const isAccepted = status === 'accepted';
                    const isRejected = status === 'rejected';
                    const isEditing = editingChunkIndex === idx;

                    // --- RESOLVED STATES (Remove diff UI) ---

                    // Replace
                    if (chunk.type === 'replace') {
                        if (isAccepted) return renderPlainBlock(chunk.newLines, idx); // Show NEW
                        if (isRejected) return renderPlainBlock(chunk.oldLines, idx); // Show OLD
                    }

                    // Insert
                    if (chunk.type === 'insert') {
                        if (isAccepted) return renderPlainBlock(chunk.lines, idx); // Show Content
                        if (isRejected) return null; // Remove Content
                    }

                    // Delete
                    if (chunk.type === 'delete') {
                        if (isAccepted) return null; // Remove Content
                        if (isRejected) return renderPlainBlock(chunk.lines, idx); // Restore Content
                    }

                    // --- PENDING STATES (Render Diff UI) ---

                    if (chunk.type === 'replace') {
                        let divClass = "group relative border-l-4 transition-all bg-amber-50/40 border-amber-300";

                        return (
                            <div key={idx} className={divClass}>
                                <div className="p-2 space-y-1">
                                    {!isEditing && (
                                        <>
                                            <div className="bg-red-100/40 opacity-70 line-through decoration-red-400 text-red-800 rounded select-none">
                                                {chunk.oldLines.map((l, i) => <div key={i} className={lineClass}>{l}</div>)}
                                            </div>
                                            <div className="flex justify-center -my-2 opacity-20 relative z-0"><CornerDownRight size={16} /></div>
                                            <div className="bg-green-100/40 text-green-900 font-medium rounded shadow-sm">
                                                {chunk.newLines.map((l, i) => <div key={i} className={lineClass}>{l}</div>)}
                                            </div>
                                        </>
                                    )}

                                    {/* Edit Mode */}
                                    {isEditing && (
                                        <div className="mt-2 bg-white p-2 rounded shadow-sm border border-amber-200">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] uppercase text-slate-400 font-bold">New Content</span>
                                                <button
                                                    onClick={() => setEditValue(prev => (prev ? prev + '\n' : '') + chunk.oldLines.join('\n'))}
                                                    className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border hover:bg-slate-200 flex items-center gap-1"
                                                    title="Append original text to edit"
                                                >
                                                    <Undo size={10} /> Insert Original
                                                </button>
                                            </div>
                                            <textarea
                                                className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 bg-white"
                                                rows={chunk.newLines.length + 2}
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                autoFocus
                                            />
                                            <div className="flex gap-2 mt-2 justify-end">
                                                <button onClick={handleEditCancel} className="text-xs px-2 py-1 bg-slate-100 rounded hover:bg-slate-200">Cancel</button>
                                                <button onClick={() => handleEditSave(chunk)} className="text-xs px-2 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 flex items-center gap-1">
                                                    <Save size={12} /> Save
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {!readOnly && !isEditing && (
                                    <div className="absolute right-2 top-2 flex gap-1 z-20 bg-white/80 rounded-lg p-0.5 shadow-sm border border-slate-200">
                                        <button onClick={(e) => { e.stopPropagation(); handleEditStart(idx, chunk.newLines); }} className="p-1.5 rounded-full shadow-sm bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200" title="Edit change">
                                            <Edit2 size={12} />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); setStatus([chunk.diffIndexDel, chunk.diffIndexIns], 'rejected'); }} className="p-1.5 rounded-full shadow-sm border bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Reject">
                                            <X size={14} />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); setStatus([chunk.diffIndexDel, chunk.diffIndexIns], 'accepted'); }} className="p-1.5 rounded-full shadow-sm border bg-white text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors" title="Accept">
                                            <Check size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    }

                    if (chunk.type === 'insert') {
                        let divClass = "group relative border-l-4 transition-all bg-green-50/30 border-green-500";

                        return (
                            <div key={idx} className={divClass}>
                                <div className="p-2">
                                    {isEditing ? (
                                        <div>
                                            <textarea
                                                className="w-full text-sm p-2 border border-green-300 rounded focus:ring-2 focus:ring-green-500 bg-white"
                                                rows={chunk.lines.length + 1}
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                autoFocus
                                            />
                                            <div className="flex gap-2 mt-2 justify-end">
                                                <button onClick={handleEditCancel} className="text-xs px-2 py-1 bg-slate-100 rounded hover:bg-slate-200">Cancel</button>
                                                <button onClick={() => handleEditSave(chunk)} className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1">
                                                    <Save size={12} /> Save
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-green-100/20 text-green-900 border-none">
                                            {chunk.lines.map((l, i) => (
                                                <div key={i} className={lineClass}>{l}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {!readOnly && !isEditing && (
                                    <div className="absolute right-2 top-2 flex gap-1 z-20 bg-white/80 rounded-lg p-0.5 shadow-sm border border-slate-200">
                                        <button onClick={(e) => { e.stopPropagation(); handleEditStart(idx, chunk.lines); }} className="p-1.5 rounded-full shadow-sm bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200" title="Edit addition">
                                            <Edit2 size={12} />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); setStatus([chunk.diffIndex], 'rejected'); }} className="p-1.5 rounded-full shadow-sm border bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Reject">
                                            <X size={14} />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); setStatus([chunk.diffIndex], 'accepted'); }} className="p-1.5 rounded-full shadow-sm border bg-white text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors" title="Accept">
                                            <Check size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    }

                    if (chunk.type === 'delete') {
                        let divClass = "group relative border-l-4 transition-all bg-red-50/30 border-red-500";

                        return (
                            <div key={idx} className={divClass}>
                                <div className="p-2">
                                    <div className="bg-red-100/20 line-through decoration-red-400 text-red-900 opacity-60">
                                        {chunk.lines.map((l, i) => (
                                            <div key={i} className={lineClass}>{l}</div>
                                        ))}
                                    </div>
                                </div>
                                {!readOnly && (
                                    <div className="absolute right-2 top-2 flex gap-1 z-20 bg-white/80 rounded-lg p-0.5 shadow-sm border border-slate-200">
                                        <button onClick={(e) => { e.stopPropagation(); setStatus([chunk.diffIndex], 'rejected'); }} className="p-1.5 rounded-full shadow-sm border bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Reject (Keep Text)">
                                            <X size={14} />
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); setStatus([chunk.diffIndex], 'accepted'); }} className="p-1.5 rounded-full shadow-sm border bg-white text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors" title="Accept (Delete)">
                                            <Check size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    }
                })}
            </div>
            {/* Status Footer */}
            <div className="bg-slate-50 px-3 py-1.5 border-t text-[10px] text-slate-400 flex justify-between">
                <span>{diffs.filter(d => d.type !== 'equal' && diffStatus[diffs.indexOf(d)] === 'pending').length} pending changes</span>
                <span>{Object.values(diffStatus).filter(s => s === 'accepted').length} accepted, {Object.values(diffStatus).filter(s => s === 'rejected').length} rejected</span>
            </div>
        </div>
    );
};
