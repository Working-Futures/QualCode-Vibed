import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, Eye, UserPlus, X, Trash2, RefreshCw, Mail, ChevronDown, ChevronRight, Reply, Edit2, AtSign, MessageCircle, ArrowLeft, Send, FileText } from 'lucide-react';
import { CloudProject, CollaboratorData, Code, Transcript, Selection, ChatMessage, DirectMessage } from '../types';
import { ConfirmationModal, ModalType } from './ConfirmationModal';
import {
    getAllCollaboratorData,
    createInvitation,
    removeProjectMember,
    updateDirectMessage,
    deleteDirectMessage,
    updateChatMessage,
    sendDirectMessage,
    subscribeToDirectMessages,
    markDirectMessagesRead,
    getConversationKey,
    updateProjectMemberRole,
    subscribeToChangeRequests,
    handleRequestAction,
    deleteChatMessage,
    clearChatHistory
} from '../services/firestoreService';
import { TranscriptChangeRequest } from '../types';

interface Props {
    cloudProject: CloudProject;
    currentUserId: string;
    codes: Code[];
    transcripts: Transcript[];
    onClose: () => void;
    chatMessages?: ChatMessage[];
    onSendMessage?: (content: string, replyTo?: ChatMessage['replyTo'], mentions?: string[]) => Promise<void>;
    onViewCollaborator: (userId: string, userName: string) => void;
    /** All DMs involving the current user (for unread badge) */
    allDirectMessages?: DirectMessage[];
}

export const CollaborationPanel: React.FC<Props> = ({
    cloudProject,
    currentUserId,
    codes,
    transcripts,
    onClose,
    chatMessages = [],
    onSendMessage,
    onViewCollaborator,
    allDirectMessages = []
}) => {
    const [activeTab, setActiveTab] = useState<'stats' | 'chat' | 'dm' | 'requests'>('stats');
    const [changeRequests, setChangeRequests] = useState<TranscriptChangeRequest[]>([]);
    const [collaboratorData, setCollaboratorData] = useState<CollaboratorData[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviting, setInviting] = useState(false);
    const [showInvite, setShowInvite] = useState(false);
    const [expandedUser, setExpandedUser] = useState<string | null>(null);
    const [newItem, setNewItem] = useState(''); // Chat input

    // Chat enhancements
    const [replyingTo, setReplyingTo] = useState<ChatMessage | DirectMessage | null>(null);
    const [editingMessage, setEditingMessage] = useState<ChatMessage | DirectMessage | null>(null);
    const [editContent, setEditContent] = useState('');
    const [viewingHistory, setViewingHistory] = useState<ChatMessage | DirectMessage | null>(null);
    const [showMentionDropdown, setShowMentionDropdown] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: ChatMessage | DirectMessage; type: 'chat' | 'dm' } | null>(null);
    const chatInputRef = React.useRef<HTMLInputElement>(null);
    const dmInputRef = React.useRef<HTMLInputElement>(null);

    // Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        type: ModalType;
        title: string;
        message: string;
        onConfirm: (value?: string) => void;
        onCancel: () => void;
        confirmLabel?: string;
    }>({
        isOpen: false,
        type: 'confirm',
        title: '',
        message: '',
        onConfirm: () => { },
        onCancel: () => { }
    });

    const openAlert = (title: string, message: string, type: ModalType = 'alert') => {
        setModalConfig({
            isOpen: true,
            type,
            title,
            message,
            onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            confirmLabel: 'OK'
        });
    };

    const openConfirm = (title: string, message: string, onConfirm: () => void, type: ModalType = 'confirm', confirmLabel = 'Confirm') => {
        setModalConfig({
            isOpen: true,
            type,
            title,
            message,
            onConfirm: () => {
                onConfirm();
                setModalConfig(prev => ({ ...prev, isOpen: false }));
            },
            onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            confirmLabel
        });
    };

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    // DM State
    const [dmTarget, setDmTarget] = useState<{ userId: string; name: string } | null>(null);
    const [dmMessages, setDmMessages] = useState<DirectMessage[]>([]);
    const [dmInput, setDmInput] = useState('');
    const dmEndRef = React.useRef<HTMLDivElement>(null);
    const [optimisticRoles, setOptimisticRoles] = useState<Record<string, 'admin' | 'collaborator' | 'viewer'>>({});

    // Reset optimistic roles when cloud project updates
    useEffect(() => {
        setOptimisticRoles({});
    }, [cloudProject.members]);

    const isOwner = cloudProject.ownerId === currentUserId;
    const isAdmin = isOwner || cloudProject.members[currentUserId]?.role === 'admin';

    // Subscribe to Change Requests for Admins
    useEffect(() => {
        if (isAdmin) {
            return subscribeToChangeRequests(cloudProject.id, setChangeRequests);
        }
    }, [isAdmin, cloudProject.id]);

    // Get member list for @mentions
    const memberNames = useMemo(() =>
        Object.values(cloudProject.members).map(m => ({
            userId: m.userId,
            name: m.displayName,
        })),
        [cloudProject.members]
    );

    const filteredMentions = useMemo(() =>
        memberNames.filter(m =>
            m.userId !== currentUserId &&
            m.name.toLowerCase().includes(mentionFilter.toLowerCase())
        ),
        [memberNames, mentionFilter, currentUserId]
    );

    // Calculate unread DM count per user
    const unreadDmCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        allDirectMessages.forEach(msg => {
            if (msg.toId === currentUserId && !msg.readBy.includes(currentUserId)) {
                counts[msg.fromId] = (counts[msg.fromId] || 0) + 1;
            }
        });
        return counts;
    }, [allDirectMessages, currentUserId]);

    const totalUnreadDms = useMemo(() =>
        Object.values(unreadDmCounts).reduce((a, b) => a + b, 0),
        [unreadDmCounts]
    );

    // Scroll to bottom of chat
    const chatEndRef = React.useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (activeTab === 'chat') {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, activeTab]);

    // Scroll to bottom of DM
    useEffect(() => {
        if (activeTab === 'dm' && dmTarget) {
            dmEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [dmMessages, activeTab, dmTarget]);

    // Subscribe to DMs when target changes
    useEffect(() => {
        if (!dmTarget) {
            setDmMessages([]);
            return;
        }

        const convKey = getConversationKey(currentUserId, dmTarget.userId);

        // Mark as read
        markDirectMessagesRead(cloudProject.id, convKey, currentUserId).catch(console.error);

        const unsub = subscribeToDirectMessages(cloudProject.id, convKey, (msgs) => {
            setDmMessages(msgs);
        });

        return () => unsub();
    }, [dmTarget, cloudProject.id, currentUserId]);

    const isMounted = React.useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    useEffect(() => {
        loadCollaboratorData();
    }, [cloudProject.id]);

    const loadCollaboratorData = async () => {
        if (!isMounted.current) return;

        setLoading(true);
        try {
            const data = await getAllCollaboratorData(cloudProject.id, currentUserId);
            if (isMounted.current) {
                setCollaboratorData(data);
            }
        } catch (err) {
            console.error('[CollaborationPanel.loadCollaboratorData] ❌ Error loading collaborator data:', err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const handleInvite = async () => {
        const email = inviteEmail.trim().toLowerCase();
        if (!email || !isAdmin) return;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            openAlert('Invalid Email', 'Please enter a valid email address.', 'alert');
            return;
        }
        const currentMember = cloudProject.members[currentUserId];
        if (currentMember?.email?.toLowerCase() === email) {
            openAlert('Invalid Invitation', "You can't invite yourself.", 'alert');
            return;
        }

        const alreadyMember = cloudProject.memberEmails.some(e => e.toLowerCase() === email);
        if (alreadyMember) {
            openAlert('Already Member', 'This person is already a member of this project.', 'info');
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
            openAlert('Invitation Sent', `Invitation sent to ${email}`, 'info');
        } catch (err) {
            console.error(err);
            openAlert('Error', "Error sending invitation.", 'danger');
        } finally {
            setInviting(false);
        }
    };

    const handleRemoveMember = async (userId: string, email: string, name: string) => {
        openConfirm('Remove Member', `Remove ${name} from this project? Their coding data will be deleted.`, async () => {
            try {
                await removeProjectMember(cloudProject.id, userId, email);
                setCollaboratorData(prev => prev.filter(c => c.userId !== userId));
            } catch (err) {
                console.error(err);
                openAlert('Error', "Error removing member.", 'danger');
            }
        }, 'danger', 'Remove');
    };

    // --- Chat helpers ---
    const handleChatInputChange = (value: string) => {
        setNewItem(value);
        const atIndex = value.lastIndexOf('@');
        if (atIndex !== -1 && atIndex === value.length - 1) {
            setShowMentionDropdown(true);
            setMentionFilter('');
        } else if (atIndex !== -1) {
            const afterAt = value.substring(atIndex + 1);
            if (!afterAt.includes(' ')) {
                setShowMentionDropdown(true);
                setMentionFilter(afterAt);
            } else {
                setShowMentionDropdown(false);
            }
        } else {
            setShowMentionDropdown(false);
        }
    };

    const insertMention = (name: string) => {
        const atIndex = newItem.lastIndexOf('@');
        const before = newItem.substring(0, atIndex);
        setNewItem(`${before}@${name} `);
        setShowMentionDropdown(false);
        chatInputRef.current?.focus();
    };

    const extractMentions = (text: string): string[] => {
        const mentions: string[] = [];
        memberNames.forEach(m => {
            if (text.includes(`@${m.name}`)) {
                mentions.push(m.name);
            }
        });
        return mentions;
    };

    const renderMessageContent = (content: string) => {
        let parts: (string | JSX.Element)[] = [content];

        memberNames.forEach(m => {
            const mentionStr = `@${m.name}`;
            const newParts: (string | JSX.Element)[] = [];
            parts.forEach((part, i) => {
                if (typeof part !== 'string') {
                    newParts.push(part);
                    return;
                }
                const segments = part.split(mentionStr);
                segments.forEach((seg, j) => {
                    if (j > 0) {
                        newParts.push(
                            <span key={`mention-${m.userId}-${i}-${j}`} className="bg-blue-100 text-blue-700 font-bold px-1 rounded text-xs">
                                @{m.name}
                            </span>
                        );
                    }
                    if (seg) newParts.push(seg);
                });
            });
            parts = newParts;
        });

        return parts;
    };

    const handleContextMenu = (e: React.MouseEvent, msg: ChatMessage | DirectMessage, type: 'chat' | 'dm') => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            message: msg,
            type
        });
    };

    const handleDeleteMessage = async (msgId: string, senderId: string) => {
        const isMyMessage = senderId === currentUserId;
        const confirmText = isMyMessage ? 'Unsend this message?' : 'Delete this message for yourself?';

        openConfirm('Delete Message', confirmText, async () => {
            try {
                if (isMyMessage) {
                    await deleteChatMessage(cloudProject.id, msgId);
                } else {
                    await deleteChatMessage(cloudProject.id, msgId, currentUserId);
                }
            } catch (err) {
                console.error('Failed to delete message:', err);
            }
        }, 'danger', 'Delete');
    };

    const handleDeleteDm = async (msgId: string, senderId: string) => {
        const isMyMessage = senderId === currentUserId;
        const confirmText = isMyMessage ? 'Unsend this message?' : 'Delete this message for yourself?';

        openConfirm('Delete Message', confirmText, async () => {
            try {
                if (isMyMessage) {
                    await deleteDirectMessage(cloudProject.id, msgId);
                } else {
                    await deleteDirectMessage(cloudProject.id, msgId, currentUserId);
                }
            } catch (err) {
                console.error('Failed to delete DM:', err);
            }
        }, 'danger', 'Delete');
    };

    const handleClearChat = async () => {
        openConfirm('Clear Chat History', 'Are you sure you want to clear the ENTIRE chat history? This cannot be undone.', async () => {
            try {
                await clearChatHistory(cloudProject.id);
            } catch (err) {
                console.error('Failed to clear chat:', err);
            }
        }, 'danger', 'Clear All');
    };

    const handleSendChat = async () => {
        if (!newItem.trim() || !onSendMessage) return;
        const mentions = extractMentions(newItem);
        const replyData = replyingTo && 'senderId' in replyingTo ? { // Check if ChatMessage
            id: replyingTo.id,
            senderName: replyingTo.senderName,
            content: replyingTo.content.substring(0, 100)
        } : undefined;

        try {
            await onSendMessage(newItem.trim(), replyData, mentions.length > 0 ? mentions : undefined);
            setNewItem('');
            setReplyingTo(null);
        } catch (err) {
            console.error('Failed to send message:', err);
            openAlert('Error', 'Failed to send message. Please try again.', 'danger');
        }
    };

    const handleEditSave = async () => {
        if (!editingMessage || !editContent.trim()) return;

        // Handle Chat Message Edit
        if ('senderId' in editingMessage) {
            try {
                await updateChatMessage(cloudProject.id, editingMessage.id, {
                    content: editContent.trim(),
                    editedAt: Date.now()
                }, editingMessage.content); // Pass previous content for history
                setEditingMessage(null);
                setEditContent('');
            } catch (err) {
                console.error('Error editing message:', err);
            }
        }
        // Handle DM Edit
        else if ('conversationKey' in editingMessage) {
            try {
                await updateDirectMessage(cloudProject.id, editingMessage.id, {
                    content: editContent.trim(),
                    editedAt: Date.now()
                }, editingMessage.content);
                setEditingMessage(null);
                setEditContent('');
            } catch (err) {
                console.error('Error editing DM:', err);
            }
        }
    };

    // --- DM helpers ---
    const openDm = (userId: string, name: string) => {
        setDmTarget({ userId, name });
        setActiveTab('dm');
    };

    const handleSendDm = async () => {
        if (!dmInput.trim() || !dmTarget) return;

        const currentMember = cloudProject.members[currentUserId];
        const convKey = getConversationKey(currentUserId, dmTarget.userId);

        // Handle reply
        const replyData = replyingTo && 'conversationKey' in replyingTo ? {
            id: replyingTo.id,
            senderName: replyingTo.fromName,
            content: replyingTo.content.substring(0, 100)
        } : undefined;

        const newMsg: DirectMessage = {
            id: crypto.randomUUID(),
            projectId: cloudProject.id,
            fromId: currentUserId,
            fromName: currentMember?.displayName || 'Me',
            toId: dmTarget.userId,
            toName: dmTarget.name,
            content: dmInput.trim(),
            timestamp: Date.now(),
            readBy: [currentUserId],
            conversationKey: convKey,
            replyTo: replyData
        };

        setDmInput('');
        setReplyingTo(null);
        // Optimistic update
        setDmMessages(prev => [...prev, newMsg]);
        try {
            await sendDirectMessage(cloudProject.id, newMsg);
        } catch (err) {
            console.error('Error sending DM:', err);
        }
    };

    const getCodeName = (codeId: string) => codes.find(c => c.id === codeId)?.name || 'Unknown';
    const getCodeColor = (codeId: string) => codes.find(c => c.id === codeId)?.color || '#999';

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

    // --- Render ---
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

                            {/* Tabs */}
                            <div className="flex gap-4 mt-4">
                                <button
                                    onClick={() => setActiveTab('stats')}
                                    className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeTab === 'stats' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
                                >
                                    Team Stats
                                </button>
                                <button
                                    onClick={() => setActiveTab('chat')}
                                    className={`text-sm font-bold pb-1 border-b-2 transition-colors ${activeTab === 'chat' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
                                >
                                    Team Chat
                                </button>
                                {activeTab === 'chat' && isAdmin && (
                                    <button
                                        onClick={handleClearChat}
                                        className="text-xs text-red-300 hover:text-white ml-2 px-2 py-0.5 border border-red-300/30 rounded hover:bg-red-500/20 transition-colors"
                                        title="Clear History"
                                    >
                                        Clear
                                    </button>
                                )}
                                <button
                                    onClick={() => { setActiveTab('dm'); setDmTarget(null); }}
                                    className={`text-sm font-bold pb-1 border-b-2 transition-colors relative ${activeTab === 'dm' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
                                >
                                    Messages
                                    {totalUnreadDms > 0 && (
                                        <span className="absolute -top-1.5 -right-4 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                                            {totalUnreadDms > 9 ? '9+' : totalUnreadDms}
                                        </span>
                                    )}
                                </button>
                                {isAdmin && (
                                    <button
                                        onClick={() => setActiveTab('requests')}
                                        className={`text-sm font-bold pb-1 border-b-2 transition-colors relative ${activeTab === 'requests' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-white'}`}
                                    >
                                        Requests
                                        {changeRequests.filter(r => r.status === 'pending').length > 0 && (
                                            <span className="absolute -top-1.5 -right-4 bg-yellow-500 text-yellow-900 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                                                {changeRequests.filter(r => r.status === 'pending').length}
                                            </span>
                                        )}
                                    </button>
                                )}
                            </div>
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

                {/* ─── STATS TAB ─── */}
                {activeTab === 'stats' && (
                    <div className="flex-1 flex flex-col overflow-hidden">
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
                            <div className="flex flex-wrap gap-2">
                                {Object.values(cloudProject.members).map((member) => {
                                    const role = optimisticRoles[member.userId] || member.role;
                                    return (
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
                                            {role === 'admin' && <span className="text-[10px] opacity-60">👑</span>}
                                            {member.userId === currentUserId && <span className="text-[10px] opacity-60">(you)</span>}
                                            {/* Remove Member Logic:
                                                - Owner can remove anyone (except self, handled by UI check)
                                                - Admins can remove collaborators, but NOT other admins
                                            */}
                                            {(isOwner || (isAdmin && role !== 'admin')) && member.userId !== currentUserId && (
                                                <button
                                                    onClick={() => handleRemoveMember(member.userId, member.email, member.displayName)}
                                                    className="text-slate-400 hover:text-red-500 ml-1"
                                                    title="Remove member"
                                                >
                                                    <X size={10} />
                                                </button>
                                            )}

                                            {/* Promote to Admin: Admins can promote collaborators */}
                                            {isAdmin && member.userId !== currentUserId && role !== 'admin' && (
                                                <button
                                                    onClick={() => {
                                                        setOptimisticRoles(prev => ({ ...prev, [member.userId]: 'admin' }));
                                                        updateProjectMemberRole(cloudProject.id, member.userId, 'admin');
                                                    }}
                                                    className="text-slate-400 hover:text-amber-500 ml-1 flex items-center gap-1 border border-slate-600 rounded px-1"
                                                    title="Make Admin"
                                                >
                                                    <span className="text-[9px]">Make Admin</span>
                                                </button>
                                            )}

                                            {/* Demote Admin: Only Owner can remove admin status */}
                                            {isOwner && member.userId !== currentUserId && role === 'admin' && (
                                                <button
                                                    onClick={() => {
                                                        openConfirm(
                                                            'Remove Admin',
                                                            `Remove admin privileges from ${member.displayName}?`,
                                                            () => {
                                                                setOptimisticRoles(prev => ({ ...prev, [member.userId]: 'collaborator' }));
                                                                updateProjectMemberRole(cloudProject.id, member.userId, 'collaborator');
                                                            },
                                                            'danger',
                                                            'Remove Admin'
                                                        );
                                                    }}
                                                    className="text-slate-400 hover:text-red-400 ml-1 flex items-center gap-1 border border-slate-600 rounded px-1"
                                                    title="Remove Admin"
                                                >
                                                    <span className="text-[9px]">Remove Admin</span>
                                                </button>
                                            )}

                                        </div>
                                    );
                                })}
                            </div>
                        </div>

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
                                        const unreadFromUser = unreadDmCounts[collab.userId] || 0;
                                        return (
                                            <div
                                                key={collab.userId}
                                                className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl overflow-hidden"
                                            >
                                                <button
                                                    onClick={() => setExpandedUser(isExpanded ? null : collab.userId)}
                                                    className="w-full p-4 flex items-center justify-between hover:bg-[var(--bg-main)] transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm relative">
                                                            {collab.displayName[0]?.toUpperCase()}
                                                            {/* Unread DM Badge */}
                                                            {unreadFromUser > 0 && (
                                                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center ring-2 ring-[var(--bg-panel)]">
                                                                    {unreadFromUser}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-left">
                                                            <p className="font-semibold text-sm text-[var(--text-main)]">{collab.displayName}</p>
                                                            <p className="text-xs text-[var(--text-muted)]">{collab.email}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {collab.userId !== currentUserId && (
                                                            <>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openDm(collab.userId, collab.displayName);
                                                                    }}
                                                                    className="px-3 py-1.5 text-xs bg-white border border-slate-200 text-slate-600 rounded-md hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300 flex items-center gap-1.5 font-bold transition-all shadow-sm relative"
                                                                    title={`Message ${collab.displayName}`}
                                                                >
                                                                    <MessageCircle size={14} /> Message
                                                                    {unreadFromUser > 0 && (
                                                                        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                                                            {unreadFromUser}
                                                                        </span>
                                                                    )}
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();

                                                                        onViewCollaborator(collab.userId, collab.displayName);
                                                                        onClose();
                                                                    }}
                                                                    className="px-3 py-1.5 text-xs bg-white border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50 hover:text-blue-600 hover:border-blue-300 flex items-center gap-1.5 font-bold transition-all shadow-sm"
                                                                    title={`View project as ${collab.displayName}`}
                                                                >
                                                                    <Eye size={14} /> View
                                                                </button>
                                                            </>
                                                        )}
                                                        <div className="text-right text-xs text-[var(--text-muted)] hidden sm:block">
                                                            <span className="font-bold text-[var(--text-main)]">{stats.totalSelections}</span> sel ·{' '}
                                                            <span className="font-bold text-[var(--text-main)]">{stats.codesUsed}</span> codes
                                                        </div>
                                                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                    </div>
                                                </button>
                                                {isExpanded && (
                                                    <div className="border-t border-[var(--border)] p-4 space-y-4">
                                                        {/* Code Frequency */}
                                                        <div>
                                                            <h4 className="text-xs font-bold uppercase text-[var(--text-muted)] mb-2 tracking-wider">Code Frequency</h4>
                                                            {Object.keys(stats.codeFreq).length === 0 ? (
                                                                <p className="text-xs text-[var(--text-muted)] italic">No coding data yet</p>
                                                            ) : (
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {Object.entries(stats.codeFreq)
                                                                        .sort(([, a], [, b]) => b - a)
                                                                        .map(([codeId, count]) => (
                                                                            <div
                                                                                key={codeId}
                                                                                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--bg-main)]"
                                                                            >
                                                                                <span
                                                                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                                                    style={{ backgroundColor: getCodeColor(codeId) }}
                                                                                />
                                                                                <span className="truncate max-w-[120px]">{getCodeName(codeId)}</span>
                                                                                <span className="text-[var(--accent)] font-bold">{count}</span>
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Per-Transcript Breakdown */}
                                                        <div>
                                                            <h4 className="text-xs font-bold uppercase text-[var(--text-muted)] mb-2 tracking-wider">By Document</h4>
                                                            <div className="space-y-1">
                                                                {transcripts.map(t => {
                                                                    const tSels = collab.selections.filter(s => s.transcriptId === t.id);
                                                                    if (tSels.length === 0) return null;
                                                                    const tMemo = collab.transcriptMemos[t.id];
                                                                    return (
                                                                        <div key={t.id} className="flex items-center justify-between px-2 py-1.5 rounded bg-[var(--bg-main)] text-xs">
                                                                            <span className="truncate font-medium text-[var(--text-main)]">{t.name}</span>
                                                                            <div className="flex items-center gap-2 text-[var(--text-muted)]">
                                                                                {tMemo && <span className="text-blue-500" title="Has memo">📝</span>}
                                                                                <span className="font-bold text-[var(--text-main)]">{tSels.length}</span>
                                                                                <span>selections</span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
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
                    </div>
                )}

                {/* ─── TEAM CHAT TAB ─── */}
                {activeTab === 'chat' && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-main)]">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {chatMessages.filter(msg => !msg.deletedFor?.includes(currentUserId)).length === 0 ? (
                                <div className="text-center text-[var(--text-muted)] py-10 opacity-50">
                                    <Mail size={40} className="mx-auto mb-2" />
                                    <p>No messages yet. Start the conversation!</p>
                                    <p className="text-xs mt-1">Use @name to mention teammates</p>
                                </div>
                            ) : (
                                chatMessages.filter(msg => !msg.deletedFor?.includes(currentUserId)).map(msg => (
                                    <div
                                        key={msg.id}
                                        onContextMenu={(e) => handleContextMenu(e, msg, 'chat')}
                                        className={`flex flex-col ${msg.senderId === currentUserId ? 'items-end' : 'items-start'} group`}
                                    >
                                        {/* Reply Context */}
                                        {msg.replyTo && (
                                            <div className={`max-w-[80%] mb-1 px-3 py-1.5 rounded-lg text-[10px] border-l-2 ${msg.senderId === currentUserId ? 'border-blue-400' : 'border-slate-400'} bg-[var(--bg-panel)] text-[var(--text-muted)] shadow-sm ${msg.senderId === currentUserId ? 'opacity-90' : ''
                                                }`}>
                                                <span className="font-bold">{msg.replyTo.senderName}:</span>{' '}
                                                <span className="italic">{msg.replyTo.content.substring(0, 80)}{msg.replyTo.content.length > 80 ? '...' : ''}</span>
                                            </div>
                                        )}

                                        {/* Message Bubble */}
                                        {editingMessage?.id === msg.id ? (
                                            <div className="max-w-[80%] w-full">
                                                <input
                                                    type="text"
                                                    value={editContent}
                                                    onChange={(e) => setEditContent(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleEditSave();
                                                        if (e.key === 'Escape') { setEditingMessage(null); setEditContent(''); }
                                                    }}
                                                    autoFocus
                                                    className="w-full p-2 text-sm border border-blue-400 rounded-lg bg-[var(--bg-panel)] text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                                <div className="flex gap-1 mt-1 justify-end">
                                                    <button onClick={() => { setEditingMessage(null); setEditContent(''); }} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] px-2 py-0.5 rounded">Cancel</button>
                                                    <button onClick={handleEditSave} className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold">Save</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={`max-w-[80%] rounded-xl p-3 text-sm relative ${msg.senderId === currentUserId
                                                ? 'bg-blue-600 text-white rounded-br-none'
                                                : 'bg-[var(--bg-panel)] border border-[var(--border)] text-[var(--text-main)] rounded-bl-none shadow-sm'
                                                }`}>
                                                <p>{renderMessageContent(msg.content)}</p>
                                                {msg.editedAt && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setViewingHistory(msg);
                                                        }}
                                                        className={`text-[9px] italic hover:underline cursor-pointer ${msg.senderId === currentUserId ? 'text-blue-200' : 'text-[var(--text-muted)]'}`}
                                                    >
                                                        (edited)
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Meta + Actions */}
                                        <div className="flex items-center gap-1 mt-1 px-1">
                                            <span className="text-[10px] text-[var(--text-muted)] font-bold">
                                                {msg.senderId === currentUserId ? 'You' : msg.senderName}
                                            </span>
                                            <span className="text-[10px] text-[var(--text-muted)] opacity-60">
                                                • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Reply Preview */}
                        {replyingTo && (
                            <div className="px-4 pt-2 bg-[var(--bg-panel)] border-t border-[var(--border)]">
                                <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2 text-xs border-l-3 border-blue-500 shadow-inner">
                                    <div className="truncate text-slate-700">
                                        <span className="font-bold text-blue-700">Replying to {'senderName' in replyingTo ? replyingTo.senderName : replyingTo.fromName}: </span>
                                        <span className="text-blue-600 italic">{replyingTo.content.substring(0, 60)}...</span>
                                    </div>
                                    <button onClick={() => setReplyingTo(null)} className="text-blue-400 hover:text-blue-600 ml-2 flex-shrink-0">
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Chat Input */}
                        <div className="p-4 bg-[var(--bg-panel)] border-t border-[var(--border)] relative">
                            {showMentionDropdown && filteredMentions.length > 0 && (
                                <div className="absolute bottom-full left-4 right-4 mb-1 bg-[var(--bg-panel)] border border-[var(--border)] rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto">
                                    <div className="p-1.5 text-[10px] text-[var(--text-muted)] font-bold uppercase border-b border-[var(--border)]">
                                        <AtSign size={10} className="inline mr-1" />Mention a teammate
                                    </div>
                                    {filteredMentions.map(m => (
                                        <button
                                            key={m.userId}
                                            onClick={() => insertMention(m.name)}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
                                        >
                                            <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                                                {m.name[0]?.toUpperCase()}
                                            </div>
                                            {m.name}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <form
                                className="flex gap-2"
                                onSubmit={(e) => { e.preventDefault(); handleSendChat(); }}
                            >
                                <input
                                    ref={chatInputRef}
                                    type="text"
                                    className="flex-1 bg-[var(--bg-main)] border border-[var(--border)] rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-[var(--text-main)] placeholder-[var(--text-muted)]"
                                    placeholder="Type a message... (@ to mention)"
                                    value={newItem}
                                    onChange={(e) => handleChatInputChange(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                            setShowMentionDropdown(false);
                                            setReplyingTo(null);
                                        }
                                    }}
                                />
                                <button
                                    type="submit"
                                    disabled={!newItem.trim()}
                                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Send size={20} />
                                </button>
                            </form>
                        </div>


                    </div>
                )}

                {/* ─── DM TAB ─── */}
                {activeTab === 'dm' && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-main)]">
                        {!dmTarget ? (
                            /* DM Inbox — list of conversations */
                            <div className="flex-1 overflow-y-auto p-4">
                                <h3 className="text-xs font-bold uppercase text-[var(--text-muted)] tracking-wider mb-3">Direct Messages</h3>
                                {Object.values(cloudProject.members)
                                    .filter(m => m.userId !== currentUserId)
                                    .map(member => {
                                        const unread = unreadDmCounts[member.userId] || 0;
                                        // Get last DM with this person
                                        const convKey = getConversationKey(currentUserId, member.userId);
                                        const lastMsg = allDirectMessages
                                            .filter(m => m.conversationKey === convKey)
                                            .sort((a, b) => b.timestamp - a.timestamp)[0];

                                        return (
                                            <button
                                                key={member.userId}
                                                onClick={() => openDm(member.userId, member.displayName)}
                                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-panel)] transition-colors mb-2 text-left"
                                            >
                                                <div className="relative">
                                                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                                        {member.displayName[0]?.toUpperCase()}
                                                    </div>
                                                    {unread > 0 && (
                                                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center ring-2 ring-[var(--bg-main)] animate-pulse">
                                                            {unread}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-sm text-[var(--text-main)]">{member.displayName}</p>
                                                    {lastMsg ? (
                                                        <p className="text-xs text-[var(--text-muted)] truncate">
                                                            {lastMsg.fromId === currentUserId ? 'You: ' : ''}{lastMsg.content}
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs text-[var(--text-muted)] italic">No messages yet</p>
                                                    )}
                                                </div>
                                                {lastMsg && (
                                                    <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                                                        {new Date(lastMsg.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                    </span>
                                                )}
                                                {unread > 0 && (
                                                    <ChevronRight size={16} className="text-red-500 flex-shrink-0" />
                                                )}
                                            </button>
                                        );
                                    })}
                            </div>
                        ) : (
                            /* DM Conversation View */
                            <>
                                {/* DM Header */}
                                <div className="p-3 border-b border-[var(--border)] bg-[var(--bg-panel)] flex items-center gap-3">
                                    <button
                                        onClick={() => setDmTarget(null)}
                                        className="p-1.5 rounded-lg hover:bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                                    >
                                        <ArrowLeft size={18} />
                                    </button>
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                        {dmTarget.name[0]?.toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm text-[var(--text-main)]">{dmTarget.name}</p>
                                        <p className="text-[10px] text-[var(--text-muted)]">Direct message</p>
                                    </div>
                                </div>

                                {/* DM Messages */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                    {dmMessages.length === 0 ? (
                                        <div className="text-center text-[var(--text-muted)] py-10 opacity-50">
                                            <MessageCircle size={40} className="mx-auto mb-2" />
                                            <p className="text-sm">No messages with {dmTarget.name} yet</p>
                                            <p className="text-xs mt-1">Send the first message!</p>
                                        </div>
                                    ) : (
                                        dmMessages.filter(msg => !msg.deletedFor?.includes(currentUserId)).map(msg => (
                                            <div
                                                key={msg.id}
                                                onContextMenu={(e) => handleContextMenu(e, msg, 'dm')}
                                                className={`flex flex-col ${msg.fromId === currentUserId ? 'items-end' : 'items-start'} group`}
                                            >
                                                {/* Reply Context */}
                                                {msg.replyTo && (
                                                    <div className={`max-w-[80%] mb-1 px-3 py-1.5 rounded-lg text-[10px] border-l-2 ${msg.fromId === currentUserId ? 'border-emerald-400' : 'border-slate-400'} bg-[var(--bg-panel)] text-[var(--text-muted)] shadow-sm ${msg.fromId === currentUserId ? 'opacity-90' : ''
                                                        }`}>
                                                        <span className="font-bold">{msg.replyTo.senderName}:</span>{' '}
                                                        <span className="italic">{msg.replyTo.content.substring(0, 80)}{msg.replyTo.content.length > 80 ? '...' : ''}</span>
                                                    </div>
                                                )}

                                                {/* Message Bubble */}
                                                {editingMessage?.id === msg.id ? (
                                                    <div className="max-w-[80%] w-full">
                                                        <input
                                                            type="text"
                                                            value={editContent}
                                                            onChange={(e) => setEditContent(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleEditSave();
                                                                if (e.key === 'Escape') { setEditingMessage(null); setEditContent(''); }
                                                            }}
                                                            autoFocus
                                                            className="w-full p-2 text-sm border border-emerald-400 rounded-lg bg-[var(--bg-panel)] text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                                        />
                                                        <div className="flex gap-1 mt-1 justify-end">
                                                            <button onClick={() => { setEditingMessage(null); setEditContent(''); }} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] px-2 py-0.5 rounded">Cancel</button>
                                                            <button onClick={handleEditSave} className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded font-bold">Save</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className={`max-w-[80%] rounded-xl p-3 text-sm relative ${msg.fromId === currentUserId
                                                        ? 'bg-emerald-600 text-white rounded-br-none'
                                                        : 'bg-[var(--bg-panel)] border border-[var(--border)] text-[var(--text-main)] rounded-bl-none shadow-sm'
                                                        }`}>
                                                        <p>{msg.content}</p>
                                                        {msg.editedAt && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setViewingHistory(msg);
                                                                }}
                                                                className={`text-[9px] italic hover:underline cursor-pointer ${msg.fromId === currentUserId ? 'text-emerald-200' : 'text-[var(--text-muted)]'}`}
                                                            >
                                                                (edited)
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                <span className="text-[10px] text-[var(--text-muted)] mt-0.5 px-1">
                                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                    <div ref={dmEndRef} />
                                </div>

                                {/* Reply Preview (DM) */}
                                {replyingTo && (
                                    <div className="px-4 pt-2 bg-[var(--bg-panel)] border-t border-[var(--border)]">
                                        <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2 text-xs border-l-3 border-emerald-500 shadow-inner">
                                            <div className="truncate text-slate-700">
                                                <span className="font-bold text-emerald-700">Replying to {'senderName' in replyingTo ? replyingTo.senderName : replyingTo.fromName}: </span>
                                                <span className="text-emerald-600 italic">{replyingTo.content.substring(0, 60)}...</span>
                                            </div>
                                            <button onClick={() => setReplyingTo(null)} className="text-emerald-400 hover:text-emerald-600 ml-2 flex-shrink-0">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* DM Input */}
                                <div className="p-4 bg-[var(--bg-panel)] border-t border-[var(--border)]">
                                    <form
                                        className="flex gap-2"
                                        onSubmit={(e) => { e.preventDefault(); handleSendDm(); }}
                                    >
                                        <input
                                            ref={dmInputRef}
                                            type="text"
                                            className="flex-1 bg-[var(--bg-main)] border border-[var(--border)] rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-[var(--text-main)] placeholder-[var(--text-muted)]"
                                            placeholder={`Message ${dmTarget.name}...`}
                                            value={dmInput}
                                            onChange={(e) => setDmInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Escape') setReplyingTo(null);
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            disabled={!dmInput.trim()}
                                            className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Send size={20} />
                                        </button>
                                    </form>
                                </div>
                            </>
                        )}
                    </div>
                )}
                {/* ─── REQUESTS TAB ─── */}
                {activeTab === 'requests' && isAdmin && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg-main)]">
                        <div className="p-4 bg-[var(--bg-header)] text-white border-b border-white/10 shrink-0">
                            <h3 className="font-bold flex items-center gap-2"><FileText size={18} /> Change Requests</h3>
                            <p className="text-xs opacity-70">Approve or reject edits from collaborators</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {changeRequests.length === 0 ? (
                                <div className="text-center text-[var(--text-muted)] py-10 opacity-50 flex flex-col items-center">
                                    <FileText size={40} className="mb-2" />
                                    <p>No change requests found.</p>
                                </div>
                            ) : (
                                changeRequests.map(req => (
                                    <div key={req.id} className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-[var(--text-main)]">{req.userName}</span>
                                                    <span className="text-xs text-[var(--text-muted)]">suggested edits for <span className="font-bold text-[var(--accent)]">{req.transcriptName}</span></span>
                                                </div>
                                                <span className="text-[10px] text-[var(--text-muted)] block mt-1">
                                                    {new Date(req.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                            <div className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${req.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                req.status === 'accepted' ? 'bg-green-100 text-green-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                {req.status}
                                            </div>
                                        </div>

                                        <div className="bg-[var(--bg-main)] p-3 rounded text-xs font-mono border border-[var(--border)] max-h-32 overflow-y-auto mb-3 whitespace-pre-wrap opacity-80">
                                            {req.content.substring(0, 300)}{req.content.length > 300 ? '...' : ''}
                                        </div>

                                        {req.status === 'pending' && (
                                            <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border)]">
                                                <button
                                                    onClick={() => {
                                                        openConfirm(
                                                            'Reject Request',
                                                            'Are you sure you want to reject this request?',
                                                            () => handleRequestAction(cloudProject.id, req.id, 'rejected'),
                                                            'danger',
                                                            'Reject'
                                                        );
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded border border-red-200 transition-colors"
                                                >
                                                    Reject
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        openConfirm(
                                                            'Accept Changes',
                                                            'This will update the transcript content. Continue?',
                                                            () => handleRequestAction(cloudProject.id, req.id, 'accepted', req.transcriptId, req.content),
                                                            'confirm',
                                                            'Accept'
                                                        );
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white hover:bg-green-700 rounded shadow-sm flex items-center gap-1 transition-colors"
                                                >
                                                    Accept Changes
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                type={modalConfig.type}
                title={modalConfig.title}
                message={modalConfig.message}
                onConfirm={modalConfig.onConfirm}
                onCancel={modalConfig.onCancel}
                confirmLabel={modalConfig.confirmLabel}
            />

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-[60] bg-[var(--bg-panel)] border border-[var(--border)] shadow-xl rounded-lg py-1 min-w-[150px] animate-in fade-in zoom-in-95 duration-100"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button
                        onClick={() => {
                            setReplyingTo(contextMenu.message);
                            setContextMenu(null);
                            if (contextMenu.type === 'chat') {
                                chatInputRef.current?.focus();
                            } else {
                                dmInputRef.current?.focus();
                            }
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg-main)] text-[var(--text-main)] flex items-center gap-2"
                    >
                        <Reply size={14} /> Reply
                    </button>

                    {/* Edit Option: Only if it's MY message */}
                    {((contextMenu.type === 'chat' && (contextMenu.message as ChatMessage).senderId === currentUserId) ||
                        (contextMenu.type === 'dm' && (contextMenu.message as DirectMessage).fromId === currentUserId)) && (
                            <button
                                onClick={() => {
                                    setEditingMessage(contextMenu.message);
                                    setEditContent(contextMenu.message.content);
                                    setContextMenu(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--bg-main)] text-[var(--text-main)] flex items-center gap-2"
                            >
                                <Edit2 size={14} /> Edit
                            </button>
                        )}

                    {/* Delete Option */}
                    <button
                        onClick={() => {
                            if (contextMenu.type === 'chat') {
                                const msg = contextMenu.message as ChatMessage;
                                handleDeleteMessage(msg.id, msg.senderId);
                            } else {
                                const msg = contextMenu.message as DirectMessage;
                                handleDeleteDm(msg.id, msg.fromId);
                            }
                            setContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 hover:text-red-700 flex items-center gap-2"
                    >
                        <Trash2 size={14} />
                        {/* Show "Unsend" if it's my message, otherwise "Delete" */}
                        {((contextMenu.type === 'chat' && (contextMenu.message as ChatMessage).senderId === currentUserId) ||
                            (contextMenu.type === 'dm' && (contextMenu.message as DirectMessage).fromId === currentUserId))
                            ? 'Unsend' : 'Delete'}
                    </button>
                </div>
            )}

            {/* History Modal */}
            {viewingHistory && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setViewingHistory(null)}>
                    <div className="bg-[var(--bg-panel)] w-full max-w-md rounded-xl shadow-2xl border border-[var(--border)] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-header)] text-white">
                            <h3 className="font-bold flex items-center gap-2">
                                <RefreshCw size={16} /> Edit History
                            </h3>
                            <button onClick={() => setViewingHistory(null)} className="hover:bg-white/10 p-1 rounded">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4 bg-[var(--bg-main)]">
                            {viewingHistory.editHistory?.slice().reverse().map((edit, i) => (
                                <div key={i} className="text-sm border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
                                    <div className="text-xs text-[var(--text-muted)] mb-1">
                                        {new Date(edit.timestamp).toLocaleString()}
                                    </div>
                                    <div className="bg-[var(--bg-panel)] p-2 rounded text-[var(--text-main)]">
                                        {edit.content}
                                    </div>
                                </div>
                            ))}
                            <div className="text-sm pt-2">
                                <div className="text-xs text-[var(--text-muted)] mb-1 font-bold">
                                    Current Version
                                </div>
                                <div className="bg-blue-50/50 p-2 rounded border border-blue-100 text-[var(--text-main)]">
                                    {viewingHistory.content}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
