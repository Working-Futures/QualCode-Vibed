import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StickyNote } from '../types';
import { X, Plus, Trash2, Save, Lock, Unlock } from 'lucide-react';
import { addStickyNote, updateStickyNote, deleteStickyNote } from '../services/firestoreService';

interface Props {
    notes: StickyNote[];
    projectId: string;
    currentUser: { uid: string; displayName: string | null };
    activeTranscriptId?: string | null;
    onClose: () => void;
    /** If true, show notes from all users. If false, only show current user's notes. */
    showAllUsers?: boolean;
}

export const StickyNoteBoard: React.FC<Props> = ({
    notes,
    projectId,
    currentUser,
    activeTranscriptId,
    onClose,
    showAllUsers = false
}) => {
    const [internalNotes, setInternalNotes] = useState<StickyNote[]>(notes);
    const internalNotesRef = useRef<StickyNote[]>(notes); // Clean ref for drag handlers
    const [dragId, setDragId] = useState<string | null>(null);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [unsavedChanges, setUnsavedChanges] = useState<Set<string>>(new Set());

    const containerRef = useRef<HTMLDivElement>(null);

    // Sync ref when notes change
    useEffect(() => {
        setInternalNotes(notes);
        internalNotesRef.current = notes;
    }, [notes]);

    // Keep ref in sync with local state changes
    useEffect(() => {
        internalNotesRef.current = internalNotes;
    }, [internalNotes]);

    // Filter notes: only current transcript, and respect privacy (personal unless showAllUsers)
    const visibleNotes = internalNotes.filter(n => {
        // Filter by transcript
        if (activeTranscriptId && n.transcriptId && n.transcriptId !== activeTranscriptId) return false;
        // Privacy: show own notes always, show shared notes if team view or note is explicitly shared
        if (n.authorId === currentUser.uid) return true;
        if (showAllUsers) return true;
        if (n.shared) return true;
        return false;
    });

    const handleDragStart = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        const note = internalNotesRef.current.find((n) => n.id === id);
        // Only allow dragging own notes
        if (note && note.authorId === currentUser.uid) {
            setDragId(id);
            const rect = (e.currentTarget as HTMLElement).closest('.sticky-note-card')?.getBoundingClientRect();
            if (rect) {
                setOffset({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                });
            }
        }
    };

    const handleDragMove = useCallback((e: MouseEvent) => {
        if (!dragId || !containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - containerRect.left - offset.x;
        const y = e.clientY - containerRect.top - offset.y;

        // Clamp within bounds
        const clampedX = Math.max(0, Math.min(x, containerRect.width - 256));
        const clampedY = Math.max(0, Math.min(y, containerRect.height - 200));

        // Update state directly without depending on closure state variables other than dragId/offset
        setInternalNotes((prev) =>
            prev.map((n) => (n.id === dragId ? { ...n, x: clampedX, y: clampedY } : n))
        );
    }, [dragId, offset]);

    const handleDragEnd = useCallback(async () => {
        if (dragId) {
            // Use ref to get the latest position without dependency on state
            const note = internalNotesRef.current.find((n) => n.id === dragId);
            if (note) {
                await updateStickyNote(projectId, dragId, { x: note.x, y: note.y });
            }
            setDragId(null);
        }
    }, [dragId, projectId]); // Removed internalNotes dependency

    // Use document-level mouse events for reliable drag
    useEffect(() => {
        if (dragId) {
            document.addEventListener('mousemove', handleDragMove);
            document.addEventListener('mouseup', handleDragEnd);
            return () => {
                document.removeEventListener('mousemove', handleDragMove);
                document.removeEventListener('mouseup', handleDragEnd);
            };
        }
    }, [dragId, handleDragMove, handleDragEnd]);

    const handleAddNote = async () => {
        const newNote: StickyNote = {
            id: crypto.randomUUID(),
            transcriptId: activeTranscriptId || undefined,
            content: '',
            color: '#fef3c7', // Default yellow
            x: 100 + Math.random() * 200,
            y: 100 + Math.random() * 100,
            authorId: currentUser.uid,
            authorName: currentUser.displayName || 'Anonymous',
            timestamp: Date.now()
        };
        // Optimistic update
        const newNotes = [...internalNotes, newNote];
        setInternalNotes(newNotes);
        internalNotesRef.current = newNotes;
        setEditingNoteId(newNote.id);
        await addStickyNote(projectId, newNote);
    };

    const handleUpdateContent = (id: string, content: string) => {
        setInternalNotes(prev => prev.map(n => n.id === id ? { ...n, content } : n));
        setUnsavedChanges(prev => new Set(prev).add(id));
    };

    const handleSaveContent = async (id: string) => {
        const note = internalNotes.find(n => n.id === id);
        if (note) {
            await updateStickyNote(projectId, id, { content: note.content });
            setUnsavedChanges(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            setEditingNoteId(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Delete this note?')) {
            setInternalNotes(prev => prev.filter(n => n.id !== id));
            await deleteStickyNote(projectId, id);
        }
    };

    const colors = ['#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7', '#f3f4f6'];

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm overflow-hidden"
            style={{ cursor: dragId ? 'grabbing' : 'default' }}
        >
            {/* Toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white px-6 py-2 rounded-full shadow-xl flex items-center gap-4 z-50">
                <span className="font-bold text-slate-700 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    {showAllUsers ? 'Team Board' : 'My Notes'}
                </span>
                <button
                    onClick={handleAddNote}
                    className="flex items-center gap-1 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 px-3 py-1 rounded-full text-xs font-bold transition-colors"
                >
                    <Plus size={14} /> New Note
                </button>
                <div className="w-px h-6 bg-slate-200"></div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                    <X size={18} />
                </button>
            </div>

            {visibleNotes.map((note) => (
                <div
                    key={note.id}
                    className="absolute w-64 shadow-lg rounded-lg flex flex-col transition-shadow hover:shadow-2xl animate-in zoom-in-95 duration-200 sticky-note-card"
                    style={{
                        left: note.x,
                        top: note.y,
                        backgroundColor: note.color,
                        transform: `rotate(${Math.sin(note.timestamp) * 2}deg)`,
                        cursor: dragId === note.id ? 'grabbing' : 'auto',
                        zIndex: dragId === note.id ? 100 : 10,
                        userSelect: dragId === note.id ? 'none' : 'auto'
                    }}
                >
                    {/* Note Header (Draggable) */}
                    <div
                        className="h-8 border-b border-black/5 flex justify-between items-center px-2 cursor-grab active:cursor-grabbing select-none"
                        onMouseDown={(e) => handleDragStart(e, note.id)}
                    >
                        <span className="text-[10px] font-bold opacity-50 uppercase tracking-wider">{note.authorName}</span>
                        <div className="flex items-center gap-1">
                            {/* Privacy Badge */}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${note.shared ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                {note.shared ? <><Unlock size={8} /> Shared</> : <><Lock size={8} /> Private</>}
                            </span>
                            {/* Save button - show when there are unsaved changes */}
                            {note.authorId === currentUser.uid && unsavedChanges.has(note.id) && (
                                <button
                                    onClick={() => handleSaveContent(note.id)}
                                    className="text-green-600 hover:text-green-700 p-1 animate-pulse"
                                    title="Save Note"
                                >
                                    <Save size={12} />
                                </button>
                            )}
                            {note.authorId === currentUser.uid && (
                                <button onClick={() => handleDelete(note.id)} className="text-black/30 hover:text-red-500 p-1">
                                    <Trash2 size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Note Content */}
                    <textarea
                        className="w-full h-40 bg-transparent resize-none p-3 text-sm font-medium focus:outline-none placeholder-black/20 text-slate-800 leading-relaxed"
                        placeholder="Write an idea..."
                        value={note.content}
                        onChange={(e) => handleUpdateContent(note.id, e.target.value)}
                        onBlur={() => {
                            if (unsavedChanges.has(note.id)) {
                                handleSaveContent(note.id);
                            }
                        }}
                        readOnly={note.authorId !== currentUser.uid}
                        onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking textarea
                    />

                    {/* Color Picker + Save Button (Only for author) */}
                    {note.authorId === currentUser.uid && (
                        <div className="h-8 border-t border-black/5 flex items-center px-2 gap-1 justify-between">
                            <div className="flex items-center gap-1">
                                {colors.map(c => (
                                    <button
                                        key={c}
                                        className="w-4 h-4 rounded-full border border-black/10 hover:scale-110 transition-transform"
                                        style={{ backgroundColor: c }}
                                        onClick={() => {
                                            setInternalNotes(prev => prev.map(n => n.id === note.id ? { ...n, color: c } : n));
                                            updateStickyNote(projectId, note.id, { color: c });
                                        }}
                                    />
                                ))}
                            </div>
                            {unsavedChanges.has(note.id) && (
                                <button
                                    onClick={() => handleSaveContent(note.id)}
                                    className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 hover:bg-green-200 px-2 py-0.5 rounded-full transition-colors"
                                >
                                    <Save size={10} /> Save
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    const newShared = !note.shared;
                                    setInternalNotes(prev => prev.map(n => n.id === note.id ? { ...n, shared: newShared } : n));
                                    updateStickyNote(projectId, note.id, { shared: newShared });
                                }}
                                className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${note.shared ? 'text-green-700 bg-green-100 hover:bg-green-200' : 'text-slate-500 bg-slate-100 hover:bg-slate-200'}`}
                                title={note.shared ? 'Make private' : 'Share with team'}
                            >
                                {note.shared ? <><Unlock size={9} /> Shared</> : <><Lock size={9} /> Private</>}
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
