import React, { useState, useEffect } from 'react';
import { Project, Transcript, CollaboratorData } from '../types';
import { Book, FileText, Users, Download, ChevronDown, ChevronRight, User } from 'lucide-react';
import { exportMemos } from '../utils/dataUtils';
import { getAllCollaboratorData } from '../services/firestoreService';

interface Props {
    project: Project;
    onUpdateProject: (p: Project) => void;
    cloudProjectId?: string;
    currentUserId?: string;
    readOnly?: boolean;
}

export const MemosView: React.FC<Props> = ({ project, onUpdateProject, cloudProjectId, currentUserId, readOnly = false }) => {
    const [activeTab, setActiveTab] = useState<'journal' | 'documents' | 'compare'>('journal');
    const [collaboratorData, setCollaboratorData] = useState<CollaboratorData[]>([]);
    const [loadingCollab, setLoadingCollab] = useState(false);

    // Expanded states for lists
    const [expandedTranscripts, setExpandedTranscripts] = useState<Record<string, boolean>>({});
    const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (activeTab === 'compare' && cloudProjectId && collaboratorData.length === 0) {
            loadCollaboratorData();
        }
    }, [activeTab, cloudProjectId]);

    const loadCollaboratorData = async () => {
        if (!cloudProjectId) return;
        setLoadingCollab(true);
        try {
            const data = await getAllCollaboratorData(cloudProjectId, currentUserId); // Exclude self
            setCollaboratorData(data);
        } catch (err) {
            console.error("Failed to load collaborator memos:", err);
        } finally {
            setLoadingCollab(false);
        }
    };

    const handleProjectMemoChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        if (readOnly) return;
        onUpdateProject({ ...project, projectMemo: e.target.value });
    };

    const handleTranscriptMemoChange = (transcriptId: string, newText: string) => {
        if (readOnly) return;
        onUpdateProject({
            ...project,
            transcripts: project.transcripts.map(t =>
                t.id === transcriptId ? { ...t, memo: newText } : t
            )
        });
    };

    const toggleTranscriptExpand = (id: string) => {
        setExpandedTranscripts(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const toggleUserExpand = (id: string) => {
        setExpandedUsers(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="flex flex-col h-full bg-[var(--bg-main)] text-[var(--text-main)]">
            {/* Header / Tabs */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-panel)]">
                <div className="flex space-x-4">
                    <button
                        onClick={() => setActiveTab('journal')}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-bold transition-all ${activeTab === 'journal'
                                ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-md'
                                : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)] hover:text-[var(--text-main)]'
                            }`}
                    >
                        <Book size={18} />
                        <span>Project Journal</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('documents')}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-bold transition-all ${activeTab === 'documents'
                                ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-md'
                                : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)] hover:text-[var(--text-main)]'
                            }`}
                    >
                        <FileText size={18} />
                        <span>Document Memos</span>
                    </button>

                    {cloudProjectId && (
                        <button
                            onClick={() => setActiveTab('compare')}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-bold transition-all ${activeTab === 'compare'
                                    ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-md'
                                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)] hover:text-[var(--text-main)]'
                                }`}
                        >
                            <Users size={18} />
                            <span>Compare Memos</span>
                        </button>
                    )}
                </div>

                <button
                    onClick={() => exportMemos(project)}
                    className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)] rounded-lg transition-colors border border-transparent hover:border-[var(--border)]"
                    title="Export Memos to Text"
                >
                    <Download size={16} />
                    <span>Export</span>
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">

                {/* Project Journal View */}
                {activeTab === 'journal' && (
                    <div className="animate-in fade-in duration-300">
                        <h2 className="text-2xl font-bold mb-2 flex items-center">
                            <Book className="mr-3 text-[var(--accent)]" /> Project Journal
                        </h2>
                        <p className="text-[var(--text-muted)] mb-6">
                            Use this space for high-level reflections, research questions, and synthesis across the entire project.
                        </p>
                        <div className="bg-[var(--bg-panel)] rounded-xl shadow-lg border border-[var(--border)] p-1">
                            <textarea
                                className={`w-full h-[60vh] p-6 text-base bg-[var(--bg-panel)] text-[var(--text-main)] focus:outline-none resize-none rounded-lg ${readOnly ? 'opacity-75 cursor-not-allowed' : ''}`}
                                placeholder="Start writing your project journal here..."
                                value={project.projectMemo || ''}
                                onChange={handleProjectMemoChange}
                                readOnly={readOnly}
                                spellCheck={false}
                            />
                        </div>
                    </div>
                )}

                {/* Document Memos View */}
                {activeTab === 'documents' && (
                    <div className="animate-in fade-in duration-300 space-y-6">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold mb-2 flex items-center">
                                <FileText className="mr-3 text-[var(--accent)]" /> Document Memos
                            </h2>
                            <p className="text-[var(--text-muted)]">
                                Specific notes and memos attached to individual transcripts.
                            </p>
                        </div>

                        <div className="grid gap-6">
                            {project.transcripts.map(t => (
                                <div key={t.id} className="bg-[var(--bg-panel)] rounded-xl shadow-sm border border-[var(--border)] overflow-hidden">
                                    <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-main)]/50 flex items-center justify-between">
                                        <h3 className="font-bold text-lg flex items-center">
                                            <FileText size={16} className="mr-2 opacity-50" />
                                            {t.name}
                                        </h3>
                                    </div>
                                    <div className="p-0">
                                        <textarea
                                            className={`w-full h-40 p-5 bg-[var(--bg-panel)] text-[var(--text-main)] focus:outline-none focus:bg-[var(--bg-main)]/30 transition-colors resize-y ${readOnly ? 'opacity-75 cursor-not-allowed' : ''}`}
                                            placeholder={`Memo for ${t.name}...`}
                                            value={t.memo || ''}
                                            onChange={(e) => handleTranscriptMemoChange(t.id, e.target.value)}
                                            readOnly={readOnly}
                                        />
                                    </div>
                                </div>
                            ))}

                            {project.transcripts.length === 0 && (
                                <div className="text-center p-12 text-[var(--text-muted)] border-2 border-dashed border-[var(--border)] rounded-xl">
                                    No documents found in this project.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Compare Memos View */}
                {activeTab === 'compare' && (
                    <div className="animate-in fade-in duration-300">
                        <h2 className="text-2xl font-bold mb-6 flex items-center">
                            <Users className="mr-3 text-[var(--accent)]" /> Team Memos
                        </h2>

                        {loadingCollab ? (
                            <div className="flex items-center justify-center h-64 text-[var(--text-muted)] animate-pulse">
                                Loading team memos...
                            </div>
                        ) : collaboratorData.length === 0 ? (
                            <div className="text-center p-12 text-[var(--text-muted)] border-2 border-dashed border-[var(--border)] rounded-xl">
                                No other team members found.
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {collaboratorData.map(user => {
                                    const isExpanded = expandedUsers[user.userId] ?? true; // Default open
                                    return (
                                        <div key={user.userId} className="bg-[var(--bg-panel)] rounded-xl shadow-md border border-[var(--border)] overflow-hidden">
                                            <div
                                                className="px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-main)]/50 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-main)] transition-colors"
                                                onClick={() => toggleUserExpand(user.userId)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                                                        {user.displayName.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-lg">{user.displayName}</h3>
                                                        <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
                                                    </div>
                                                </div>
                                                {isExpanded ? <ChevronDown size={20} className="text-[var(--text-muted)]" /> : <ChevronRight size={20} className="text-[var(--text-muted)]" />}
                                            </div>

                                            {isExpanded && (
                                                <div className="p-6 bg-[var(--bg-panel)] space-y-8">
                                                    {/* User's Project Journal */}
                                                    <div>
                                                        <h4 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center">
                                                            <Book size={14} className="mr-2" /> Project Journal
                                                        </h4>
                                                        <div className="p-4 bg-[var(--bg-main)] rounded-lg border border-[var(--border)] text-sm whitespace-pre-wrap min-h-[100px]">
                                                            {user.personalMemo ? user.personalMemo : <span className="text-[var(--text-muted)] italic">No journal entry.</span>}
                                                        </div>
                                                    </div>

                                                    {/* User's Transcript Memos */}
                                                    <div>
                                                        <h4 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center">
                                                            <FileText size={14} className="mr-2" /> Document Memos
                                                        </h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {project.transcripts.map(t => {
                                                                const userMemo = user.transcriptMemos[t.id];
                                                                if (!userMemo) return null; // Only show documents they have commented on? Or show detailed "empty"? Let's hide empty to save space.

                                                                return (
                                                                    <div key={t.id} className="p-4 bg-[var(--bg-main)] rounded-lg border border-[var(--border)]">
                                                                        <div className="font-bold text-sm mb-2 text-[var(--accent)]">{t.name}</div>
                                                                        <div className="text-sm whitespace-pre-wrap">
                                                                            {userMemo}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                            {Object.keys(user.transcriptMemos).filter(k => project.transcripts.some(t => t.id === k)).length === 0 && (
                                                                <div className="text-sm text-[var(--text-muted)] italic col-span-2">
                                                                    No document memos written.
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};
