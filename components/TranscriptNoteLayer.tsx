import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StickyNote } from '../types';
import { Trash2, Lock, Unlock, GripHorizontal, Scaling } from 'lucide-react';
import { updateStickyNote, deleteStickyNote, addStickyNote } from '../services/firestoreService';
import { addToQueue } from '../utils/offlineQueue';

// ─── localStorage backup helpers ───
const NOTES_BACKUP_KEY = (projectId: string) => `sticky_notes_backup_${projectId}`;

function backupNotesToLocal(projectId: string, notes: StickyNote[]) {
    try {
        localStorage.setItem(NOTES_BACKUP_KEY(projectId), JSON.stringify(notes));
    } catch (e) {
        // localStorage full or unavailable
    }
}

interface Props {
    notes: StickyNote[];
    projectId: string;
    currentUser: { uid: string; displayName: string | null };
    activeTranscriptId?: string | null;
    codebookFilter: 'master' | 'personal' | 'all';
    onSyncStatusChange?: (status: 'idle' | 'saving' | 'saved' | 'error' | 'queued') => void;
    showTeamNotes?: boolean;
    containerRef: React.RefObject<HTMLDivElement>;
    readOnly?: boolean;
    onConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

export interface TranscriptNoteLayerHandle {
    addNote: () => Promise<void>;
    saveAll: () => Promise<void>;
}

export const TranscriptNoteLayer = React.forwardRef<TranscriptNoteLayerHandle, Props>(({
    notes,
    projectId,
    currentUser,
    activeTranscriptId,
    codebookFilter,
    onSyncStatusChange,
    showTeamNotes = false,
    containerRef,
    readOnly = false,
    onConfirm
}, ref) => {
    // ----------------------------
    // State Management
    // ----------------------------
    const [internalNotes, setInternalNotes] = useState<StickyNote[]>([]);
    const internalNotesRef = useRef<StickyNote[]>([]);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const [resizeId, setResizeId] = useState<string | null>(null);
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });

    // For saving optimization (debounce)
    const saveTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
    const unsavedChanges = useRef<Set<string>>(new Set());
    const optimisticIds = useRef<Set<string>>(new Set());

    // ----------------------------
    // Sync Logic
    // ----------------------------
    useEffect(() => {
        setInternalNotes(currentInternal => {
            const serverIds = new Set(notes.map(n => n.id));

            const merged = notes.map(serverNote => {
                const local = currentInternal.find(l => l.id === serverNote.id);
                if (local) {
                    // Maintain local position if dragging
                    if (dragId === local.id) return local;
                    // Maintain local text if unsaved changes exist
                    if (unsavedChanges.current.has(local.id)) {
                        return { ...serverNote, content: local.content };
                    }
                }
                return serverNote;
            });

            // Keep optimistic notes
            const stillOptimistic = currentInternal.filter(n => optimisticIds.current.has(n.id) && !serverIds.has(n.id));

            return [...merged, ...stillOptimistic];
        });
    }, [notes, dragId, resizeId]);

    // Keep ref in sync
    useEffect(() => {
        internalNotesRef.current = internalNotes;
        if (internalNotes.length > 0) backupNotesToLocal(projectId, internalNotes);
    }, [internalNotes, projectId]);

    // Filter for View
    const visibleNotes = internalNotes.filter(n => {
        if (activeTranscriptId && n.transcriptId !== activeTranscriptId) return false;

        // Codebook Type Filter
        const noteType = n.codebookType || 'personal'; // Default legacy notes to personal

        // If filter is specific (master/personal), must match
        if (codebookFilter !== 'all' && noteType !== codebookFilter) {
            // But wait, if I'm active on 'master', and I have a 'personal' note, I shouldn't see it?
            // "If you switch to personal or master codebook they should be fixed to that version"
            return false;
        }

        // Privacy/Team Filter
        const isMine = n.authorId === currentUser.uid;
        if (isMine) return true;

        // If it's not mine, it MUST be shared to be seen
        if (n.shared) {
            // If shared, respected the toggle
            if (showTeamNotes) return true;
        }

        return false;
    });

    // ----------------------------
    // Drag & Interaction
    // ----------------------------
    const handleDragStart = (e: React.MouseEvent, id: string) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();

        const note = internalNotesRef.current.find(n => n.id === id);
        // Only allow dragging if I am the author
        if (note && note.authorId === currentUser.uid) {
            setDragId(id);
            const containerRect = containerRef.current?.getBoundingClientRect();
            // If dragging relative to a container, calculate offset
            if (containerRect) {
                setDragOffset({
                    x: e.clientX - containerRect.left - note.x,
                    y: e.clientY - containerRect.top - note.y
                });
            }
        }
    };

    const handleResizeStart = (e: React.MouseEvent, id: string) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        const note = internalNotesRef.current.find(n => n.id === id);
        if (note && note.authorId === currentUser.uid) {
            setResizeId(id);
            setResizeStart({
                x: e.clientX,
                y: e.clientY,
                w: note.width || 220,
                h: note.height || 180
            });
        }
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (dragId && containerRef.current) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const mouseX = e.clientX - containerRect.left;
            const mouseY = e.clientY - containerRect.top;

            const newX = mouseX - dragOffset.x;
            const newY = mouseY - dragOffset.y;

            setInternalNotes(prev => prev.map(n => n.id === dragId ? { ...n, x: newX, y: newY } : n));
        }

        if (resizeId) {
            const dx = e.clientX - resizeStart.x;
            const dy = e.clientY - resizeStart.y;
            const newW = Math.max(150, resizeStart.w + dx);
            const newH = Math.max(100, resizeStart.h + dy);

            setInternalNotes(prev => prev.map(n => n.id === resizeId ? { ...n, width: newW, height: newH } : n));
        }
    }, [dragId, dragOffset, resizeId, resizeStart, containerRef]);

    const handleMouseUp = useCallback(async () => {
        if (dragId) {
            const note = internalNotesRef.current.find(n => n.id === dragId);
            setDragId(null);
            if (note) {
                onSyncStatusChange?.('saving');
                try {
                    await updateStickyNote(projectId, note.id, { x: note.x, y: note.y });
                    onSyncStatusChange?.('saved');
                    setTimeout(() => onSyncStatusChange?.('idle'), 2000);
                } catch (err) {
                    addToQueue({ type: 'save_sticky_note', projectId, note });
                    onSyncStatusChange?.('queued');
                }
            }
        }
        if (resizeId) {
            const note = internalNotesRef.current.find(n => n.id === resizeId);
            setResizeId(null);
            if (note) {
                onSyncStatusChange?.('saving');
                try {
                    await updateStickyNote(projectId, note.id, { width: note.width, height: note.height });
                    onSyncStatusChange?.('saved');
                    setTimeout(() => onSyncStatusChange?.('idle'), 2000);
                } catch (err) {
                    addToQueue({ type: 'save_sticky_note', projectId, note });
                }
            }
        }
    }, [dragId, resizeId, projectId, onSyncStatusChange]);

    useEffect(() => {
        if (dragId || resizeId) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [dragId, resizeId, handleMouseMove, handleMouseUp]);

    // ----------------------------
    // Content Editing
    // ----------------------------
    const handleContentIsChanging = (id: string, newContent: string) => {
        setInternalNotes(prev => prev.map(n => n.id === id ? { ...n, content: newContent } : n));
        unsavedChanges.current.add(id);

        if (saveTimeouts.current[id]) clearTimeout(saveTimeouts.current[id]);
        saveTimeouts.current[id] = setTimeout(() => handleSave(id, newContent), 2000);
    };

    const handleSave = async (id: string, contentOverride?: string) => {
        if (saveTimeouts.current[id]) clearTimeout(saveTimeouts.current[id]);
        const note = internalNotesRef.current.find(n => n.id === id);
        if (!note) return;

        const content = contentOverride ?? note.content;
        onSyncStatusChange?.('saving');

        try {
            await updateStickyNote(projectId, id, { content });
            unsavedChanges.current.delete(id);
            onSyncStatusChange?.('saved');
            setTimeout(() => onSyncStatusChange?.('idle'), 2000);
        } catch (err) {
            addToQueue({ type: 'save_sticky_note', projectId, note: { ...note, content } });
            onSyncStatusChange?.('queued');
        }
    };

    const handleDelete = async (id: string) => {
        onConfirm("Delete Note", "Are you sure you want to delete this sticky note?", async () => {
            // Optimistic remove
            setInternalNotes(prev => prev.filter(n => n.id !== id));

            try {
                await deleteStickyNote(projectId, id);
            } catch (err) {
                console.error(err);
            }
        });
    };

    // ----------------------------
    // Handle Actions
    // ----------------------------
    const addNote = async () => {
        if (!activeTranscriptId) return;

        // Determine type based on filter. Default to 'personal' if 'all'.
        const typeToUse = codebookFilter === 'all' ? 'personal' : codebookFilter;

        const newNote: StickyNote = {
            id: crypto.randomUUID(),
            transcriptId: activeTranscriptId,
            content: '',
            authorId: currentUser.uid,
            authorName: currentUser.displayName || 'Anonymous',
            codebookType: typeToUse, // Ensure new notes get assigned the correct type
            color: '#fef3c7',
            x: -250, // Start in left margin/grey area
            y: 100,
            width: 220,
            height: 180,
            timestamp: Date.now(),
            shared: false
        };

        optimisticIds.current.add(newNote.id);
        setInternalNotes(prev => [...prev, newNote]);

        try {
            await addStickyNote(projectId, newNote);
        } catch (err) {
            console.warn("Add note failed", err);
            addToQueue({ type: 'save_sticky_note', projectId, note: newNote });
        }
    };

    const saveAll = async () => {
        const idsToSave = Array.from(unsavedChanges.current);
        if (idsToSave.length === 0) return;


        await Promise.all(idsToSave.map(id => handleSave(id)));
    };

    React.useImperativeHandle(ref, () => ({
        addNote,
        saveAll
    }));

    const colors = ['#fef08a', '#fda4af', '#93c5fd', '#86efac', '#e9d5ff'];

    return (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 50, overflow: 'visible' }}>
            {visibleNotes.map(note => (
                <div
                    key={note.id}
                    className="group absolute flex flex-col shadow-md rounded-lg transition-shadow hover:shadow-xl pointer-events-auto"
                    style={{
                        left: note.x,
                        top: note.y,
                        width: note.width || 220,
                        height: note.height || 180,
                        backgroundColor: note.color,
                        transform: `rotate(${Math.sin(note.timestamp) * 1}deg)`,
                        cursor: note.authorId === currentUser.uid ? (dragId === note.id ? 'grabbing' : 'grab') : 'default',
                        zIndex: dragId === note.id || resizeId === note.id ? 20 : 10 // Bring to front on interaction
                    }}
                >
                    {/* Header: Grip + Privacy + Delete */}
                    <div
                        className={`h-6 flex items-center justify-between px-2 bg-black/5 ${note.authorId === currentUser.uid ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                        onMouseDown={(e) => {
                            if (note.authorId === currentUser.uid) {
                                handleDragStart(e, note.id);
                            }
                        }}
                    >
                        <GripHorizontal size={12} className={note.authorId === currentUser.uid ? "text-black/30" : "text-black/10"} />

                        {note.authorId === currentUser.uid && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={async () => {
                                        const newVal = !note.shared;
                                        setInternalNotes(prev => prev.map(n => n.id === note.id ? { ...n, shared: newVal } : n));
                                        updateStickyNote(projectId, note.id, { shared: newVal }).catch(console.error);
                                    }}
                                    className="p-0.5 hover:bg-black/10 rounded"
                                    title={note.shared ? "Shared with team" : "Private to you"}
                                    onMouseDown={e => e.stopPropagation()}
                                >
                                    {note.shared ? <Unlock size={10} className="text-green-600" /> : <Lock size={10} className="text-slate-400" />}
                                </button>
                                <button
                                    onClick={() => handleDelete(note.id)}
                                    className="p-0.5 hover:bg-red-100 text-black/30 hover:text-red-500 rounded"
                                    onMouseDown={e => e.stopPropagation()}
                                >
                                    <Trash2 size={10} />
                                </button>
                            </div>
                        )}
                        {note.authorId !== currentUser.uid && (
                            <span className="text-[9px] font-bold uppercase text-black/40 truncate max-w-[80px]">{note.authorName}</span>
                        )}
                    </div>

                    {/* Content */}
                    <textarea
                        className="flex-1 w-full bg-transparent p-3 text-sm resize-none focus:outline-none leading-normal font-medium text-slate-800 cursor-text caret-indigo-600"
                        placeholder="Note..."
                        value={note.content}
                        onChange={(e) => handleContentIsChanging(note.id, e.target.value)}
                        onBlur={() => handleSave(note.id)}
                        readOnly={readOnly || note.authorId !== currentUser.uid}
                        onMouseDown={e => e.stopPropagation()}
                        style={{ fontFamily: 'var(--font-primary, sans-serif)' }}
                    />

                    {/* Color Footer */}
                    {note.authorId === currentUser.uid && (
                        <div className="h-6 flex items-center px-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={e => e.stopPropagation()}>
                            {colors.map(c => (
                                <button
                                    key={c}
                                    className="w-3 h-3 rounded-full border border-black/10 hover:scale-125 transition-transform"
                                    style={{ backgroundColor: c }}
                                    onClick={() => {
                                        setInternalNotes(prev => prev.map(n => n.id === note.id ? { ...n, color: c } : n));
                                        updateStickyNote(projectId, note.id, { color: c }).catch(console.error);
                                    }}
                                />
                            ))}
                        </div>
                    )}
                    {/* Resize Handle */}
                    {note.authorId === currentUser.uid && (
                        <div
                            className="absolute bottom-0 right-0 p-1 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
                            onMouseDown={(e) => handleResizeStart(e, note.id)}
                        >
                            <Scaling size={12} className="text-black/20" />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
});

TranscriptNoteLayer.displayName = 'TranscriptNoteLayer';
