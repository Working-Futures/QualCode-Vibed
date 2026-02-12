import React, { useState, useEffect } from 'react';
import { Users, Eye, UserPlus, X, Trash2, RefreshCw, Mail, ChevronDown, ChevronRight } from 'lucide-react';
import { CloudProject, CollaboratorData, Code, Transcript, Selection } from '../types';
import {
    getAllCollaboratorData,
    createInvitation,
    removeProjectMember,
} from '../services/firestoreService';

interface Props {
    cloudProject: CloudProject;
    currentUserId: string;
    codes: Code[];
    transcripts: Transcript[];
    onClose: () => void;
}

export const CollaborationPanel: React.FC<Props> = ({
    cloudProject,
    currentUserId,
    codes,
    transcripts,
    onClose,
}) => {
    const [collaboratorData, setCollaboratorData] = useState<CollaboratorData[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviting, setInviting] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [expandedUser, setExpandedUser] = useState<string | null>(null);
    const [activeTranscriptId, setActiveTranscriptId] = useState<string | null>(null);

    const isAdmin = cloudProject.ownerId === currentUserId;

    useEffect(() => {
        loadCollaboratorData();
    }, [cloudProject.id]);

    const loadCollaboratorData = async () => {
        setLoading(true);
        try {
            const data = await getAllCollaboratorData(cloudProject.id, currentUserId);
            setCollaboratorData(data);
        } catch (err) {
            console.error('Error loading collaborator data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async () => {
        const email = inviteEmail.trim().toLowerCase();
        if (!email || !isAdmin) return;

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert('Please enter a valid email address.');
            return;
        }

        // Prevent self-invite
        const currentMember = cloudProject.members[currentUserId];
        if (currentMember?.email?.toLowerCase() === email) {
            alert("You can't invite yourself.");
            return;
        }

        // Prevent inviting existing members
        const alreadyMember = cloudProject.memberEmails.some(e => e.toLowerCase() === email);
        if (alreadyMember) {
            alert('This person is already a member of this project.');
            return;
        }

        setInviting(true);
        try {
            await createInvitation(
                cloudProject.id,
                cloudProject.name,
                email,
                currentUserId,
                currentMember?.displayName || 'Admin'
            );
            setInviteEmail('');
            setShowInvite(false);
            alert(`Invitation sent to ${email}`);
        } catch (err) {
            console.error(err);
            alert("Error sending invitation.");
        } finally {
            setInviting(false);
        }
    };

    const handleRemoveMember = async (userId: string, email: string, name: string) => {
        if (!confirm(`Remove ${name} from this project? Their coding data will be deleted.`)) return;
        try {
            await removeProjectMember(cloudProject.id, userId, email);
            setCollaboratorData(prev => prev.filter(c => c.userId !== userId));
        } catch (err) {
            console.error(err);
            alert("Error removing member.");
        }
    };

    const getCodeName = (codeId: string) => codes.find(c => c.id === codeId)?.name || 'Unknown';
    const getCodeColor = (codeId: string) => codes.find(c => c.id === codeId)?.color || '#999';
    const getTranscriptName = (tId: string) => transcripts.find(t => t.id === tId)?.name || 'Unknown';

    // Summary statistics for a collaborator
    const getStats = (data: CollaboratorData) => {
        const codeFreq: Record<string, number> = {};
        data.selections.forEach(s => {
            codeFreq[s.codeId] = (codeFreq[s.codeId] || 0) + 1;
        });
        return {
            totalSelections: data.selections.length,
            codesUsed: Object.keys(codeFreq).length,
            codeFreq,
            hasMemos: Object.values(data.transcriptMemos).some(m => m && m.trim()),
        };
    };

    return (
        <div className="fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />

            {/* Panel */}
            <div className="relative ml-auto w-full max-w-2xl bg-[var(--bg-panel)] shadow-2xl flex flex-col h-full animate-in slide-in-from-right">
                {/* Header */}
                <div className="p-6 bg-[var(--bg-header)] text-white">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Users size={20} /> Collaboration
                            </h2>
                            <p className="text-sm text-slate-400 mt-1">{cloudProject.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {Object.keys(cloudProject.members).length} member{Object.keys(cloudProject.members).length > 1 ? 's' : ''}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={loadCollaboratorData}
                                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                title="Refresh"
                            >
                                <RefreshCw size={16} />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Members List */}
                <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-main)]">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xs font-bold uppercase text-[var(--text-muted)] tracking-wider">Team Members</h3>
                        {isAdmin && (
                            <button
                                onClick={() => setShowInvite(!showInvite)}
                                className="text-xs flex items-center gap-1 text-[var(--accent)] hover:underline"
                            >
                                <UserPlus size={12} /> Invite
                            </button>
                        )}
                    </div>

                    {/* Invite Form */}
                    {showInvite && (
                        <div className="flex gap-2 mb-3">
                            <input
                                type="email"
                                placeholder="Email address..."
                                className="flex-1 px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--bg-panel)] text-[var(--text-main)] focus:ring-1 focus:ring-[var(--accent)]"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                            />
                            <button
                                onClick={handleInvite}
                                disabled={inviting || !inviteEmail.trim()}
                                className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-text)] rounded-lg text-sm font-bold disabled:opacity-50"
                            >
                                {inviting ? '...' : 'Send'}
                            </button>
                        </div>
                    )}

                    {/* Current Members Grid */}
                    <div className="flex flex-wrap gap-2">
                        {Object.values(cloudProject.members).map((member) => (
                            <div
                                key={member.userId}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${member.userId === currentUserId
                                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                                    : 'bg-[var(--bg-panel)] border-[var(--border)] text-[var(--text-main)]'
                                    }`}
                            >
                                <div
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                    style={{ backgroundColor: member.userId === currentUserId ? '#2563eb' : '#6366f1' }}
                                >
                                    {member.displayName[0]?.toUpperCase()}
                                </div>
                                <span>{member.displayName}</span>
                                {member.role === 'admin' && <span className="text-[10px] opacity-60">👑</span>}
                                {member.userId === currentUserId && <span className="text-[10px] opacity-60">(you)</span>}
                                {isAdmin && member.userId !== currentUserId && (
                                    <button
                                        onClick={() => handleRemoveMember(member.userId, member.email, member.displayName)}
                                        className="text-slate-400 hover:text-red-500 ml-1"
                                        title="Remove member"
                                    >
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Collaborator Coding Data */}
                <div className="flex-1 overflow-y-auto p-4">
                    <h3 className="text-xs font-bold uppercase text-[var(--text-muted)] tracking-wider mb-3">
                        Collaborator Coding
                    </h3>

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-pulse text-[var(--text-muted)] text-sm">Loading collaborator data...</div>
                        </div>
                    ) : collaboratorData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                            <Users className="w-10 h-10 mb-3 opacity-30" />
                            <p className="text-sm font-medium">No collaborator data yet</p>
                            <p className="text-xs mt-1">Invite team members to see their coding</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {collaboratorData.map((collab) => {
                                const stats = getStats(collab);
                                const isExpanded = expandedUser === collab.userId;

                                return (
                                    <div
                                        key={collab.userId}
                                        className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl overflow-hidden"
                                    >
                                        {/* Collaborator Header */}
                                        <button
                                            onClick={() => setExpandedUser(isExpanded ? null : collab.userId)}
                                            className="w-full p-4 flex items-center justify-between hover:bg-[var(--bg-main)] transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                                    {collab.displayName[0]?.toUpperCase()}
                                                </div>
                                                <div className="text-left">
                                                    <p className="font-semibold text-sm text-[var(--text-main)]">{collab.displayName}</p>
                                                    <p className="text-xs text-[var(--text-muted)]">{collab.email}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right text-xs text-[var(--text-muted)]">
                                                    <span className="font-bold text-[var(--text-main)]">{stats.totalSelections}</span> selections ·{' '}
                                                    <span className="font-bold text-[var(--text-main)]">{stats.codesUsed}</span> codes
                                                    {stats.hasMemos && <span className="ml-1">📝</span>}
                                                </div>
                                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                            </div>
                                        </button>

                                        {/* Expanded Content */}
                                        {isExpanded && (
                                            <div className="border-t border-[var(--border)] p-4 space-y-4">
                                                {/* Code Frequency */}
                                                <div>
                                                    <h4 className="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Code Usage</h4>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {Object.entries(stats.codeFreq)
                                                            .sort(([, a], [, b]) => b - a)
                                                            .map(([codeId, count]) => (
                                                                <span
                                                                    key={codeId}
                                                                    className="text-xs px-2 py-1 rounded-full font-medium"
                                                                    style={{
                                                                        backgroundColor: `${getCodeColor(codeId)}20`,
                                                                        color: getCodeColor(codeId),
                                                                        border: `1px solid ${getCodeColor(codeId)}40`,
                                                                    }}
                                                                >
                                                                    {getCodeName(codeId)} ({count})
                                                                </span>
                                                            ))}
                                                    </div>
                                                </div>

                                                {/* Transcript Filter */}
                                                <div>
                                                    <h4 className="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Selections by Document</h4>
                                                    <div className="flex flex-wrap gap-1 mb-2">
                                                        <button
                                                            onClick={() => setActiveTranscriptId(null)}
                                                            className={`text-xs px-2 py-1 rounded ${!activeTranscriptId ? 'bg-[var(--accent)] text-[var(--accent-text)]' : 'bg-[var(--bg-main)] text-[var(--text-muted)]'}`}
                                                        >
                                                            All
                                                        </button>
                                                        {transcripts.map((t) => (
                                                            <button
                                                                key={t.id}
                                                                onClick={() => setActiveTranscriptId(t.id)}
                                                                className={`text-xs px-2 py-1 rounded truncate max-w-[120px] ${activeTranscriptId === t.id ? 'bg-[var(--accent)] text-[var(--accent-text)]' : 'bg-[var(--bg-main)] text-[var(--text-muted)]'}`}
                                                            >
                                                                {t.name}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Selections List */}
                                                    <div className="max-h-60 overflow-y-auto space-y-1.5">
                                                        {collab.selections
                                                            .filter(s => !activeTranscriptId || s.transcriptId === activeTranscriptId)
                                                            .slice(0, 50)
                                                            .map((sel) => (
                                                                <div
                                                                    key={sel.id}
                                                                    className="p-2 bg-[var(--bg-main)] rounded-lg text-xs border border-[var(--border)]"
                                                                >
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span
                                                                            className="w-2 h-2 rounded-full shrink-0"
                                                                            style={{ backgroundColor: getCodeColor(sel.codeId) }}
                                                                        />
                                                                        <span className="font-bold" style={{ color: getCodeColor(sel.codeId) }}>
                                                                            {getCodeName(sel.codeId)}
                                                                        </span>
                                                                        <span className="text-[var(--text-muted)] truncate">
                                                                            — {getTranscriptName(sel.transcriptId)}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-[var(--text-muted)] line-clamp-2 italic">"{sel.text}"</p>
                                                                </div>
                                                            ))}
                                                        {collab.selections.filter(s => !activeTranscriptId || s.transcriptId === activeTranscriptId).length === 0 && (
                                                            <p className="text-xs text-[var(--text-muted)] py-4 text-center">No selections for this document</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Memos */}
                                                {stats.hasMemos && (
                                                    <div>
                                                        <h4 className="text-xs font-bold uppercase text-[var(--text-muted)] mb-2">Memos</h4>
                                                        <div className="space-y-2">
                                                            {Object.entries(collab.transcriptMemos)
                                                                .filter(([, memo]) => memo && memo.trim())
                                                                .map(([tId, memo]) => (
                                                                    <div key={tId} className="p-3 bg-[var(--bg-main)] rounded-lg border border-[var(--border)]">
                                                                        <p className="text-xs font-bold text-[var(--accent)] mb-1">{getTranscriptName(tId)}</p>
                                                                        <p className="text-xs text-[var(--text-main)] whitespace-pre-wrap">{memo}</p>
                                                                    </div>
                                                                ))}
                                                            {collab.personalMemo && (
                                                                <div className="p-3 bg-[var(--bg-main)] rounded-lg border border-[var(--border)]">
                                                                    <p className="text-xs font-bold text-[var(--accent)] mb-1">Personal Research Notes</p>
                                                                    <p className="text-xs text-[var(--text-main)] whitespace-pre-wrap">{collab.personalMemo}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
