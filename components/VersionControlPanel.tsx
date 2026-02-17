import React, { useState, useEffect, useMemo } from 'react';
import {
    Bell, GitPullRequest, FileText, History, X, Check, XCircle, ChevronDown, ChevronRight,
    GitMerge, Scissors, Plus, Edit2, Trash2, Clock, User, Shield, AlertTriangle, Eye,
    MessageSquare, ArrowRight
} from 'lucide-react';
import { DiffViewer } from './DiffViewer'; // Added import
import {
    CodebookChangeProposal, AppNotification, TranscriptChangeRequest,
    VersionControlEvent, Code, DocumentSnapshot
} from '../types';
import { ConfirmationModal, ModalType } from './ConfirmationModal';
import {
    subscribeToProposals, reviewProposal, subscribeToNotifications,
    markNotificationRead, respondToNotification,
    subscribeToChangeRequests, handleChangeRequestWithFeedback,
    subscribeToActivityLog, sendNotification,
    getDocumentSnapshots, getAllDocumentSnapshots,
    saveCodes, logCodeHistory,
    deleteTranscript, updateTranscript // Added imports
} from '../services/firestoreService';

interface VersionControlPanelProps {
    projectId: string;
    currentUserId: string;
    currentUserName: string;
    isAdmin: boolean;
    codes: Code[];
    onClose: () => void;
    onApplyProposal?: (proposal: CodebookChangeProposal) => void;
    onUpdateCodes?: (codes: Code[]) => void;
    onRestoreSnapshot?: (snapshot: DocumentSnapshot) => void;
    onNavigateToCode?: (codeId: string, type: 'master' | 'personal' | 'suggested') => void;
}

type Tab = 'notifications' | 'proposals' | 'requests' | 'activity';

export const VersionControlPanel: React.FC<VersionControlPanelProps> = ({
    projectId,
    currentUserId,
    currentUserName,
    isAdmin,
    codes,
    onClose,
    onApplyProposal,
    onUpdateCodes,
    onRestoreSnapshot,
    onNavigateToCode
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('notifications');
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [proposals, setProposals] = useState<CodebookChangeProposal[]>([]);
    const [changeRequests, setChangeRequests] = useState<TranscriptChangeRequest[]>([]);
    const [activityLog, setActivityLog] = useState<VersionControlEvent[]>([]);
    const [rejectionReason, setRejectionReason] = useState('');
    const [showRejectInput, setShowRejectInput] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [snapshotModal, setSnapshotModal] = useState<DocumentSnapshot[] | null>(null);
    const [snapshotTranscriptName, setSnapshotTranscriptName] = useState('');
    const [draftContents, setDraftContents] = useState<Record<string, string>>({});

    // Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        type: ModalType;
        title: string;
        message: string;
        showInput?: boolean;
        inputPlaceholder?: string;
        inputValue?: string;
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

    const openPrompt = (title: string, message: string, onConfirm: (val: string) => void, placeholder = '') => {
        setModalConfig({
            isOpen: true,
            type: 'confirm',
            title,
            message,
            showInput: true,
            inputPlaceholder: placeholder,
            inputValue: '',
            onConfirm: (val) => {
                if (val !== undefined) onConfirm(val);
                setModalConfig(prev => ({ ...prev, isOpen: false }));
            },
            onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            confirmLabel: 'Submit'
        });
    };

    const handleModalInputChange = (val: string) => {
        setModalConfig(prev => ({ ...prev, inputValue: val }));
    };

    // Subscriptions
    useEffect(() => {
        if (!projectId) return;
        const unsubs: (() => void)[] = [];

        unsubs.push(subscribeToNotifications(projectId, currentUserId, setNotifications));
        unsubs.push(subscribeToProposals(projectId, setProposals));
        unsubs.push(subscribeToChangeRequests(projectId, setChangeRequests));
        unsubs.push(subscribeToActivityLog(projectId, setActivityLog));

        return () => unsubs.forEach(u => u());
    }, [projectId, currentUserId]);

    const unreadCount = useMemo(() =>
        notifications.filter(n => !n.readBy.includes(currentUserId)).length
        , [notifications, currentUserId]);

    const displayedNotifications = useMemo(() =>
        notifications.filter(n => !n.readBy.includes(currentUserId))
        , [notifications, currentUserId]);

    const pendingProposals = useMemo(() =>
        proposals.filter(p => p.status === 'pending')
        , [proposals]);

    const pendingRequests = useMemo(() =>
        changeRequests.filter(r => r.status === 'pending')
        , [changeRequests]);

    // ─── Handlers ───

    const handleAcceptProposal = async (proposal: CodebookChangeProposal) => {
        try {
            await reviewProposal(projectId, proposal.id, 'accepted', currentUserId, currentUserName);

            // Send notification to proposer
            await sendNotification(projectId, {
                id: crypto.randomUUID(),
                projectId,
                type: 'proposal_accepted',
                title: 'Proposal Accepted ✅',
                message: `Your ${proposal.action} proposal "${getProposalTitle(proposal)}" was accepted by ${currentUserName}.`,
                timestamp: Date.now(),
                fromUserId: currentUserId,
                fromUserName: currentUserName,
                targetUserIds: [proposal.proposerId],
                readBy: [currentUserId]
            });

            // Apply the change
            onApplyProposal?.(proposal);
        } catch (e) {
            console.error('Failed to accept proposal:', e);
            openAlert('Error', 'Failed to accept proposal.', 'danger');
        }
    };

    const handleRejectProposal = async (proposal: CodebookChangeProposal) => {
        if (!rejectionReason.trim()) {
            openAlert('Missing Information', 'Please provide a reason for rejection.', 'alert');
            return;
        }
        try {
            await reviewProposal(projectId, proposal.id, 'rejected', currentUserId, currentUserName, rejectionReason);

            await sendNotification(projectId, {
                id: crypto.randomUUID(),
                projectId,
                type: 'proposal_rejected',
                title: 'Proposal Rejected ❌',
                message: `Your ${proposal.action} proposal "${getProposalTitle(proposal)}" was rejected by ${currentUserName}. Reason: "${rejectionReason}"`,
                timestamp: Date.now(),
                fromUserId: currentUserId,
                fromUserName: currentUserName,
                targetUserIds: [proposal.proposerId],
                readBy: [currentUserId]
            });

            setRejectionReason('');
            setShowRejectInput(null);
        } catch (e) {
        }
    };

    const handleContest = async (req: TranscriptChangeRequest) => {
        openPrompt('Contest Change', 'Please explain why you are contesting this change:', async (reason) => {
            if (!reason) return;

            try {
                await sendNotification(projectId, {
                    id: crypto.randomUUID(),
                    projectId,
                    type: 'change_request_submitted', // Use exiting type or generic 'proposal_submitted' to trigger notification
                    title: 'Change Contested ⚠️',
                    message: `${currentUserName} contested the change to "${req.transcriptName}". Reason: ${reason}`,
                    timestamp: Date.now(),
                    fromUserId: currentUserId,
                    fromUserName: currentUserName,
                    targetUserIds: req.reviewedBy ? [req.reviewedBy] : [], // Notify reviewer if known
                    readBy: [currentUserId],
                    relatedEntityId: req.id,
                    relatedEntityType: 'changeRequest'
                });
                openAlert('Success', 'Contest submitted. The reviewer has been notified.', 'info');
            } catch (e) {
                console.error('Failed to contest:', e);
                openAlert('Error', 'Failed to submit contest.', 'danger');
            }
        });
    };

    const handleAcceptChangeRequest = async (req: TranscriptChangeRequest) => {
        try {
            if (req.changeType === 'delete') {
                await deleteTranscript(projectId, req.transcriptId);
                await handleChangeRequestWithFeedback(projectId, req.id, 'accepted');
            } else if (req.changeType === 'rename' && req.newName) {
                await updateTranscript(projectId, req.transcriptId, { name: req.newName });
                await handleChangeRequestWithFeedback(projectId, req.id, 'accepted', undefined, undefined, undefined, currentUserId, currentUserName);
            } else {
                // Use draft content if modified in DiffViewer, else original request content
                const contentToApply = draftContents[req.id] !== undefined ? draftContents[req.id] : req.content;
                await handleChangeRequestWithFeedback(projectId, req.id, 'accepted', req.transcriptId, contentToApply, undefined, currentUserId, currentUserName);
            }

            await sendNotification(projectId, {
                id: crypto.randomUUID(),
                projectId,
                type: 'change_request_accepted',
                title: `${req.changeType === 'delete' ? 'Deletion' : req.changeType === 'rename' ? 'Rename' : 'Edit'} Accepted ✅`,
                message: `Your request for "${req.transcriptName}" was accepted by ${currentUserName}.`,
                timestamp: Date.now(),
                fromUserId: currentUserId,
                fromUserName: currentUserName,
                targetUserIds: [req.userId],
                readBy: [currentUserId]
            });

            // Also notify everyone about the change
            await sendNotification(projectId, {
                id: crypto.randomUUID(),
                projectId,
                type: 'document_change',
                title: 'Document Updated',
                message: `"${req.transcriptName}" was ${req.changeType}d by ${currentUserName} (requested by ${req.userName}).`,
                timestamp: Date.now(),
                fromUserId: currentUserId,
                fromUserName: currentUserName,
                targetUserIds: [],
                readBy: [currentUserId]
            });
        } catch (e) {
            console.error('Failed to accept change request:', e);
        }
    };

    const handleRejectChangeRequest = async (req: TranscriptChangeRequest) => {
        if (!rejectionReason.trim()) {
            openAlert('Missing Information', 'Please provide a reason for rejection.', 'alert');
            return;
        }
        try {
            await handleChangeRequestWithFeedback(projectId, req.id, 'rejected', undefined, undefined, rejectionReason);

            await sendNotification(projectId, {
                id: crypto.randomUUID(),
                projectId,
                type: 'change_request_rejected',
                title: 'Document Edit Rejected ❌',
                message: `Your edits to "${req.transcriptName}" were rejected by ${currentUserName}. Reason: "${rejectionReason}"`,
                timestamp: Date.now(),
                fromUserId: currentUserId,
                fromUserName: currentUserName,
                targetUserIds: [req.userId],
                readBy: [currentUserId]
            });

            setRejectionReason('');
            setShowRejectInput(null);
        } catch (e) {
            console.error('Failed to reject change request:', e);
        }
    };

    const handleNotificationResponse = async (notif: AppNotification, response: 'accepted' | 'rejected') => {
        if (response === 'rejected' && !rejectionReason.trim()) {
            setShowRejectInput(notif.id);
            return;
        }
        try {
            await respondToNotification(projectId, notif.id, currentUserId, response, response === 'rejected' ? rejectionReason : undefined);
            setRejectionReason('');
            setShowRejectInput(null);
        } catch (e) {
            console.error('Failed to respond to notification:', e);
        }
    };

    const handleMarkRead = async (notifId: string) => {
        try {
            await markNotificationRead(projectId, notifId, currentUserId);
        } catch (e) {
            console.error('Failed to mark notification read:', e);
        }
    };

    const handleViewSnapshots = async (transcriptId: string, transcriptName: string) => {
        try {
            const snapshots = await getDocumentSnapshots(projectId, transcriptId);
            setSnapshotModal(snapshots);
            setSnapshotTranscriptName(transcriptName);
        } catch (e) {
            console.error('Failed to load snapshots:', e);
            openAlert('Error', 'Failed to load version history.', 'danger');
        }
    };

    const handleClearAllNotifications = async () => {
        const unread = notifications.filter(n => !n.readBy.includes(currentUserId));
        for (const n of unread) {
            await handleMarkRead(n.id);
        }
    };

    const handleNotificationClick = (notif: AppNotification) => {
        if (!notif.readBy.includes(currentUserId)) {
            handleMarkRead(notif.id);
        }

        // Navigate based on type
        if (notif.type === 'proposal_submitted' || notif.type === 'codebook_change') {
            if (notif.relatedEntityId && onNavigateToCode) {
                // If it's a codebook change, go to codebook
                const code = codes.find(c => c.id === notif.relatedEntityId);
                if (code) {
                    onNavigateToCode(code.id, code.type || 'suggested');
                    return;
                }
            }
            setActiveTab('proposals');
            if (notif.relatedEntityId) setExpandedId(notif.relatedEntityId);
        } else if (notif.type === 'change_request_submitted') {
            setActiveTab('requests');
            if (notif.relatedEntityId) setExpandedId(notif.relatedEntityId);
        } else if (notif.type === 'proposal_accepted' || notif.type === 'proposal_rejected') {
            setActiveTab('proposals');
            if (notif.relatedEntityId) setExpandedId(notif.relatedEntityId);
        } else if (notif.type === 'change_request_accepted' || notif.type === 'change_request_rejected') {
            setActiveTab('requests');
            if (notif.relatedEntityId) setExpandedId(notif.relatedEntityId);
        }
    };

    // ─── Helpers ───

    const getProposalTitle = (p: CodebookChangeProposal) => {
        switch (p.action) {
            case 'add': return p.newCode?.name || 'New Code';
            case 'edit': return `Edit "${p.targetCodeName}"`;
            case 'delete': return `Remove "${p.deleteCodeName}"`;
            case 'merge': return `Merge "${p.mergeSourceName}" → "${p.mergeTargetName}"`;
            case 'split': return `Split "${p.splitSourceName}"`;
            default: return 'Unknown';
        }
    };

    const getProposalIcon = (action: string) => {
        switch (action) {
            case 'add': return <Plus size={14} className="text-green-600" />;
            case 'edit': return <Edit2 size={14} className="text-blue-600" />;
            case 'delete': return <Trash2 size={14} className="text-red-600" />;
            case 'merge': return <GitMerge size={14} className="text-purple-600" />;
            case 'split': return <Scissors size={14} className="text-orange-600" />;
            default: return <GitPullRequest size={14} />;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending': return <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-bold">Pending</span>;
            case 'accepted': return <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">Accepted</span>;
            case 'rejected': return <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold">Rejected</span>;
            default: return null;
        }
    };

    const getNotifIcon = (type: string) => {
        if (type.includes('accepted')) return <Check size={14} className="text-green-600" />;
        if (type.includes('rejected')) return <XCircle size={14} className="text-red-600" />;
        if (type.includes('document')) return <FileText size={14} className="text-blue-600" />;
        if (type.includes('codebook')) return <GitPullRequest size={14} className="text-purple-600" />;
        if (type.includes('proposal')) return <GitPullRequest size={14} className="text-amber-600" />;
        return <Bell size={14} className="text-slate-500" />;
    };

    const getEventIcon = (type: string) => {
        if (type.includes('edit')) return <Edit2 size={14} className="text-blue-500" />;
        if (type.includes('create')) return <Plus size={14} className="text-green-500" />;
        if (type.includes('delete')) return <Trash2 size={14} className="text-red-500" />;
        if (type.includes('merge')) return <GitMerge size={14} className="text-purple-500" />;
        if (type.includes('split')) return <Scissors size={14} className="text-orange-500" />;
        if (type.includes('proposal')) return <GitPullRequest size={14} className="text-amber-500" />;
        if (type.includes('change_request')) return <FileText size={14} className="text-cyan-500" />;
        if (type.includes('promoted')) return <Shield size={14} className="text-indigo-500" />;
        return <History size={14} className="text-slate-400" />;
    };

    const timeAgo = (ts: number) => {
        const diff = Date.now() - ts;
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return new Date(ts).toLocaleDateString();
    };

    const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
        { id: 'notifications', label: 'Notifications', icon: <Bell size={14} />, count: unreadCount },
        { id: 'proposals', label: 'Proposals', icon: <GitPullRequest size={14} />, count: pendingProposals.length },
        { id: 'requests', label: 'Doc Requests', icon: <FileText size={14} />, count: pendingRequests.length },
        { id: 'activity', label: 'Activity Log', icon: <History size={14} /> },
    ];

    return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <ConfirmationModal
                isOpen={modalConfig.isOpen}
                type={modalConfig.type}
                title={modalConfig.title}
                message={modalConfig.message}
                showInput={modalConfig.showInput}
                inputPlaceholder={modalConfig.inputPlaceholder}
                inputValue={modalConfig.inputValue}
                onInputChange={handleModalInputChange}
                onConfirm={modalConfig.onConfirm}
                onCancel={modalConfig.onCancel}
                confirmLabel={modalConfig.confirmLabel}
            />
            <div className="bg-[var(--bg-panel)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-[var(--border)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-4 border-b border-[var(--border)] bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                            <GitPullRequest size={20} />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">Version Control</h2>
                            <p className="text-xs text-white/70">Review changes, proposals, and history</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[var(--border)] bg-[var(--bg-main)]">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all border-b-2 ${activeTab === tab.id
                                ? 'border-indigo-500 text-indigo-600 bg-[var(--bg-panel)]'
                                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-panel)]'
                                }`}
                        >
                            {tab.icon}
                            {tab.label}
                            {(tab.count ?? 0) > 0 && (
                                <span className="bg-purple-600 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">

                    {/* ═══ NOTIFICATIONS TAB ═══ */}
                    {activeTab === 'notifications' && (
                        <div className="divide-y divide-[var(--border)]">
                            {unreadCount > 0 && (
                                <div className="p-2 bg-[var(--bg-main)] border-b border-[var(--border)] flex justify-end">
                                    <button
                                        onClick={handleClearAllNotifications}
                                        className="text-[10px] font-bold text-[var(--accent)] hover:underline px-2"
                                    >
                                        Mark All Read
                                    </button>
                                </div>
                            )}
                            {displayedNotifications.length === 0 ? (
                                <div className="p-12 text-center text-[var(--text-muted)]">
                                    <Bell size={40} className="mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No new notifications</p>
                                    <p className="text-xs mt-1">Read notifications are hidden.</p>
                                </div>
                            ) : (
                                displayedNotifications.map(notif => {
                                    const isRead = notif.readBy.includes(currentUserId);

                                    // Determine navigation target label
                                    let actionLabel = '';
                                    if (notif.type.includes('proposal')) actionLabel = 'View Proposal';
                                    else if (notif.type.includes('request')) actionLabel = 'View Request';

                                    return (
                                        <div
                                            key={notif.id}
                                            className={`p-4 transition-colors cursor-pointer ${!isRead ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : 'hover:bg-[var(--bg-main)]'}`}
                                            onClick={() => handleNotificationClick(notif)}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5 w-8 h-8 rounded-full bg-[var(--bg-main)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                                                    {getNotifIcon(notif.type)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-[var(--text-main)]">{notif.title}</span>
                                                        {!isRead && <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />}
                                                    </div>
                                                    <p className="text-sm text-[var(--text-muted)] mt-0.5">{notif.message}</p>
                                                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[var(--text-muted)]">
                                                        <User size={10} /> {notif.fromUserName}
                                                        <span>•</span>
                                                        <Clock size={10} /> {timeAgo(notif.timestamp)}
                                                    </div>

                                                    {/* Actions: Replaced Accept/Reject with View/OK */}
                                                    <div className="flex items-center gap-2 mt-2">
                                                        {actionLabel && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleNotificationClick(notif);
                                                                }}
                                                                className="px-3 py-1 bg-[var(--bg-panel)] border border-[var(--border)] text-[var(--text-main)] text-xs font-bold rounded hover:bg-[var(--bg-main)] transition-colors flex items-center gap-1"
                                                            >
                                                                <ArrowRight size={10} /> {actionLabel}
                                                            </button>
                                                        )}
                                                        {!isRead && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleMarkRead(notif.id);
                                                                }}
                                                                className="px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded hover:bg-purple-700 transition-colors shadow-sm"
                                                            >
                                                                OK
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}

                    {/* ═══ PROPOSALS TAB ═══ */}
                    {activeTab === 'proposals' && (
                        <div className="divide-y divide-[var(--border)]">
                            {proposals.length === 0 ? (
                                <div className="p-12 text-center text-[var(--text-muted)]">
                                    <GitPullRequest size={40} className="mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No codebook proposals</p>
                                    <p className="text-xs mt-1">Team members can suggest changes to the master codebook</p>
                                </div>
                            ) : (
                                proposals.map(proposal => {
                                    const isExpanded = expandedId === proposal.id;
                                    return (
                                        <div key={proposal.id} className="hover:bg-[var(--bg-main)] transition-colors">
                                            {/* Summary Row */}
                                            <div
                                                className="p-4 flex items-center gap-3 cursor-pointer"
                                                onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
                                            >
                                                <button className="text-[var(--text-muted)]">
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </button>
                                                <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel)] border border-[var(--border)] flex items-center justify-center">
                                                    {getProposalIcon(proposal.action)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-[var(--text-main)] truncate">{getProposalTitle(proposal)}</span>
                                                        {getStatusBadge(proposal.status)}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-muted)]">
                                                        <User size={10} /> {proposal.proposerName}
                                                        <span>•</span>
                                                        <Clock size={10} /> {timeAgo(proposal.timestamp)}
                                                        <span>•</span>
                                                        <span className="capitalize font-bold">{proposal.action}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Expanded Detail */}
                                            {isExpanded && (
                                                <div className="px-4 pb-4 pl-16 space-y-3 animate-in slide-in-from-top-1">
                                                    {/* Reason */}
                                                    <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border)]">
                                                        <p className="text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Reason for Change</p>
                                                        <p className="text-sm text-[var(--text-main)]">{proposal.reason || 'No reason provided'}</p>
                                                    </div>

                                                    {/* Action-Specific Details */}
                                                    {proposal.action === 'add' && proposal.newCode && (
                                                        <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                                                            <p className="text-xs font-bold text-green-800 mb-2">Proposed New Code</p>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <div className="w-4 h-4 rounded" style={{ backgroundColor: proposal.newCode.color || '#ccc' }} />
                                                                <span className="font-bold text-sm text-green-900">{proposal.newCode.name}</span>
                                                            </div>
                                                            {proposal.newCode.description && (
                                                                <p className="text-xs text-green-700 mt-1">{proposal.newCode.description}</p>
                                                            )}
                                                        </div>
                                                    )}

                                                    {proposal.action === 'edit' && (
                                                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                                            <p className="text-xs font-bold text-blue-800 mb-2">Proposed Changes to "{proposal.targetCodeName}"</p>
                                                            {proposal.proposedData && Object.entries(proposal.proposedData).map(([key, val]) => {
                                                                const prev = proposal.previousData?.[key as keyof Code];
                                                                if (String(val) === String(prev)) return null;
                                                                return (
                                                                    <div key={key} className="text-xs mb-1">
                                                                        <span className="font-bold text-blue-600">{key}: </span>
                                                                        <span className="line-through text-red-500 mr-1">{String(prev || '(empty)')}</span>
                                                                        <ArrowRight size={10} className="inline text-blue-400 mx-1" />
                                                                        <span className="text-green-700 font-medium">{String(val)}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {proposal.action === 'delete' && (
                                                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                                                            <p className="text-xs font-bold text-red-800">
                                                                Proposes removing "{proposal.deleteCodeName}" from the master codebook
                                                            </p>
                                                        </div>
                                                    )}

                                                    {proposal.action === 'merge' && (
                                                        <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                                                            <p className="text-xs font-bold text-purple-800 flex items-center gap-1">
                                                                <GitMerge size={12} />
                                                                Merge "{proposal.mergeSourceName}" <ArrowRight size={10} className="mx-1" /> "{proposal.mergeTargetName}"
                                                            </p>
                                                        </div>
                                                    )}

                                                    {proposal.action === 'split' && proposal.splitNewCodes && (
                                                        <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                                                            <p className="text-xs font-bold text-orange-800 mb-2 flex items-center gap-1">
                                                                <Scissors size={12} /> Split "{proposal.splitSourceName}" into:
                                                            </p>
                                                            {proposal.splitNewCodes.map((code, i) => (
                                                                <div key={i} className="flex items-center gap-2 text-xs text-orange-700 mb-1">
                                                                    <div className="w-3 h-3 rounded" style={{ backgroundColor: code.color || '#ccc' }} />
                                                                    <span className="font-medium">{code.name}</span>
                                                                    {code.description && <span className="text-orange-500">— {code.description}</span>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Admin Actions (only for pending) */}
                                                    {isAdmin && proposal.status === 'pending' && (
                                                        <div className="flex items-center gap-2 pt-2">
                                                            <button
                                                                onClick={() => onNavigateToCode?.(proposal.targetCodeId || proposal.newCode?.id || '', 'suggested')}
                                                                className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-sm"
                                                            >
                                                                <ArrowRight size={14} /> Review in Codebook
                                                            </button>

                                                            <div className="h-4 w-px bg-slate-200 mx-1"></div>

                                                            <button
                                                                onClick={() => handleAcceptProposal(proposal)}
                                                                className="px-3 py-2 bg-green-100 text-green-700 text-xs font-bold rounded-lg hover:bg-green-200 transition-colors flex items-center gap-1.5"
                                                                title="Apply changes and close proposal"
                                                            >
                                                                <Check size={14} /> Mark Completed
                                                            </button>

                                                            {showRejectInput === proposal.id ? (
                                                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-1">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Reason..."
                                                                        className="w-32 text-xs border border-red-200 rounded px-2 py-1 focus:ring-red-500 focus:border-red-500 bg-white"
                                                                        value={rejectionReason}
                                                                        onChange={(e) => setRejectionReason(e.target.value)}
                                                                        autoFocus
                                                                        onKeyDown={(e) => e.key === 'Enter' && handleRejectProposal(proposal)}
                                                                    />
                                                                    <button
                                                                        onClick={() => handleRejectProposal(proposal)}
                                                                        className="p-1 bg-red-600 text-white rounded hover:bg-red-700"
                                                                    >
                                                                        <Check size={12} />
                                                                    </button>
                                                                    <button onClick={() => { setShowRejectInput(null); setRejectionReason(''); }} className="text-slate-400 hover:text-slate-600">
                                                                        <X size={12} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setShowRejectInput(proposal.id)}
                                                                    className="px-3 py-2 text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                                                                >
                                                                    <XCircle size={14} /> Reject
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Rejection Reason Display */}
                                                    {proposal.status === 'rejected' && proposal.rejectionReason && (
                                                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                                                            <p className="text-xs font-bold text-red-700 mb-1">Rejection Reason</p>
                                                            <p className="text-sm text-red-800">{proposal.rejectionReason}</p>
                                                            {proposal.reviewedByName && (
                                                                <p className="text-[10px] text-red-500 mt-1">— {proposal.reviewedByName}</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}

                    {/* ═══ CHANGE REQUESTS TAB ═══ */}
                    {activeTab === 'requests' && (
                        <div className="divide-y divide-[var(--border)]">
                            {changeRequests.length === 0 ? (
                                <div className="p-12 text-center text-[var(--text-muted)]">
                                    <FileText size={40} className="mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No document change requests</p>
                                    <p className="text-xs mt-1">Non-admin edits will appear here for review</p>
                                </div>
                            ) : (
                                changeRequests.map(req => {
                                    const isExpanded = expandedId === req.id;
                                    return (
                                        <div key={req.id} className="hover:bg-[var(--bg-main)] transition-colors">
                                            <div
                                                className="p-4 flex items-center gap-3 cursor-pointer"
                                                onClick={() => setExpandedId(isExpanded ? null : req.id)}
                                            >
                                                <button className="text-[var(--text-muted)]">
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </button>
                                                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                                    <FileText size={14} className="text-blue-600" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-[var(--text-main)] truncate">
                                                            {req.changeType === 'delete' ? 'Delete: ' : req.changeType === 'rename' ? 'Rename: ' : 'Edit: '}
                                                            {req.transcriptName}
                                                        </span>
                                                        {getStatusBadge(req.status)}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-muted)]">
                                                        <User size={10} /> {req.userName}
                                                        <span>•</span>
                                                        <Clock size={10} /> {timeAgo(req.timestamp)}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleViewSnapshots(req.transcriptId, req.transcriptName); }}
                                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50"
                                                >
                                                    <History size={12} /> Versions
                                                </button>
                                            </div>

                                            {isExpanded && (
                                                <div className="px-4 pb-4 pl-16 space-y-3 animate-in slide-in-from-top-1">
                                                    {/* Diff Preview */}
                                                    {req.changeType === 'edit' && (
                                                        <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border)]">
                                                            <div className="flex justify-between items-center mb-2">
                                                                <p className="text-xs font-bold text-[var(--text-muted)]">Proposed Changes</p>
                                                                {req.status === 'accepted' && (
                                                                    <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 font-medium">
                                                                        Accepted by {req.reviewedByName || 'Admin'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <DiffViewer
                                                                originalContent={req.originalContent || ''}
                                                                modifiedContent={req.content || ''}
                                                                readOnly={req.status !== 'pending' || !isAdmin}
                                                                onContentChange={(val) => setDraftContents(prev => ({ ...prev, [req.id]: val }))}
                                                                defaultAccepted={false}
                                                                onAllResolved={() => {
                                                                    // Auto-accept the request when all individual diffs are resolved
                                                                    handleAcceptChangeRequest(req);
                                                                }}
                                                                showAcceptAll={isAdmin && req.status === 'pending'}
                                                            />
                                                            {/* Contest Button for Non-Admins */}
                                                            {!isAdmin && req.status === 'accepted' && (
                                                                <div className="mt-2 text-right">
                                                                    <button
                                                                        onClick={() => handleContest(req)}
                                                                        className="text-xs text-orange-600 hover:text-orange-800 underline font-bold"
                                                                    >
                                                                        Contest Change
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {req.changeType === 'rename' && (
                                                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                                            <p className="text-xs font-bold text-blue-800">
                                                                Proposed Rename: "{req.transcriptName}" → "{req.newName}"
                                                            </p>
                                                        </div>
                                                    )}
                                                    {req.changeType === 'delete' && (
                                                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                                                            <p className="text-xs font-bold text-red-800">
                                                                Requesting deletion of document "{req.transcriptName}"
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Admin Actions */}
                                                    {isAdmin && req.status === 'pending' && (
                                                        <div className="flex items-center gap-2 pt-2">
                                                            <button
                                                                onClick={() => handleAcceptChangeRequest(req)}
                                                                className="px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 shadow-sm"
                                                            >
                                                                <Check size={14} /> Accept Edits
                                                            </button>
                                                            {showRejectInput === req.id ? (
                                                                <div className="flex-1 flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Reason for rejection..."
                                                                        className="flex-1 text-xs border border-red-200 rounded-lg px-3 py-2 focus:ring-red-500 focus:border-red-500 bg-[var(--bg-paper)] text-[var(--text-main)]"
                                                                        value={rejectionReason}
                                                                        onChange={(e) => setRejectionReason(e.target.value)}
                                                                        autoFocus
                                                                        onKeyDown={(e) => e.key === 'Enter' && handleRejectChangeRequest(req)}
                                                                    />
                                                                    <button
                                                                        onClick={() => handleRejectChangeRequest(req)}
                                                                        className="px-3 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700"
                                                                    >
                                                                        Reject
                                                                    </button>
                                                                    <button onClick={() => { setShowRejectInput(null); setRejectionReason(''); }} className="text-slate-400 hover:text-slate-600">
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setShowRejectInput(req.id)}
                                                                    className="px-4 py-2 bg-red-100 text-red-700 text-xs font-bold rounded-lg hover:bg-red-200 transition-colors flex items-center gap-1.5"
                                                                >
                                                                    <XCircle size={14} /> Reject
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Show rejection reason for non-pending */}
                                                    {req.status === 'rejected' && (req as any).rejectionReason && (
                                                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                                                            <p className="text-xs text-red-700"><strong>Rejection reason:</strong> {(req as any).rejectionReason}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}

                    {/* ═══ ACTIVITY LOG TAB ═══ */}
                    {activeTab === 'activity' && (
                        <div className="divide-y divide-[var(--border)]">
                            {activityLog.length === 0 ? (
                                <div className="p-12 text-center text-[var(--text-muted)]">
                                    <History size={40} className="mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No activity recorded</p>
                                    <p className="text-xs mt-1">All version control events will be logged here</p>
                                </div>
                            ) : (
                                activityLog.map(event => (
                                    <div key={event.id} className="p-4 flex items-start gap-3 hover:bg-[var(--bg-main)] transition-colors">
                                        <div className="mt-0.5 w-8 h-8 rounded-full bg-[var(--bg-main)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                                            {getEventIcon(event.eventType)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-[var(--text-main)]">
                                                <span className="font-bold">{event.userName}</span> {event.description}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--text-muted)]">
                                                <Clock size={10} /> {timeAgo(event.timestamp)}
                                                <span>•</span>
                                                <span className="capitalize bg-[var(--bg-panel)] px-1.5 py-0.5 rounded font-bold">
                                                    {event.eventType.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Snapshot Modal */}
                {snapshotModal && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-8 z-60 backdrop-blur-sm" onClick={() => setSnapshotModal(null)}>
                        <div className="bg-[var(--bg-panel)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[70vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-main)]">
                                <h3 className="font-bold text-[var(--text-main)] flex items-center gap-2">
                                    <History size={16} className="text-indigo-500" />
                                    Version History: {snapshotTranscriptName}
                                </h3>
                                <button onClick={() => setSnapshotModal(null)} className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1 rounded hover:bg-[var(--border)]">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border)]">
                                {snapshotModal.length === 0 ? (
                                    <div className="p-8 text-center text-[var(--text-muted)]">
                                        <p>No version snapshots found for this document.</p>
                                    </div>
                                ) : (
                                    snapshotModal.map(snap => (
                                        <div key={snap.id} className="p-4 flex items-center justify-between hover:bg-[var(--bg-main)]">
                                            <div>
                                                <p className="text-sm font-bold text-[var(--text-main)]">Version {snap.version}</p>
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    by {snap.savedByName} • {new Date(snap.timestamp).toLocaleString()}
                                                </p>
                                                {snap.description && <p className="text-xs text-[var(--text-muted)] italic mt-0.5">{snap.description}</p>}
                                            </div>
                                            {onRestoreSnapshot && isAdmin && (
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`Restore to Version ${snap.version}? This will replace the current content.`)) {
                                                            onRestoreSnapshot(snap);
                                                            setSnapshotModal(null);
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 flex items-center gap-1"
                                                >
                                                    <History size={12} /> Restore
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
