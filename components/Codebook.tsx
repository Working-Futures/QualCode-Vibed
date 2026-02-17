import React, { useState, useMemo } from 'react';
import { Code, CodeHistoryEntry, CodebookChangeProposal } from '../types';
import { ConfirmationModal, ModalType } from './ConfirmationModal';
import { Plus, Trash2, Folder, Lock, User, Sparkles, Shield, Tag, History, AlertTriangle, GitPullRequest, Send, Edit2, GitMerge, X, Eye } from 'lucide-react';
import { getCodeHistory, logCodeHistory, submitProposal, sendNotification, saveSharedCode } from '../services/firestoreService';

interface CodebookProps {
  codes: Code[];
  onUpdateCode: (id: string, updates: Partial<Code>) => void;
  onDeleteCode: (id: string) => void;
  onCreateCode: (type: 'master' | 'personal' | 'suggested') => void;
  onMergeCode?: (sourceId: string, targetId: string) => void;
  currentUser?: { uid: string; displayName: string | null };
  isAdmin?: boolean;
  projectId?: string;
  onSubmitProposal?: (proposal: CodebookChangeProposal) => void;
  hiddenCodeIds?: Set<string>;
  onToggleVisibility?: (id: string) => void;
}

export const Codebook: React.FC<CodebookProps> = ({
  codes,
  onUpdateCode,
  onDeleteCode,
  onCreateCode,
  onMergeCode,
  currentUser,
  isAdmin = false,
  projectId,
  onSubmitProposal,
  hiddenCodeIds,
  onToggleVisibility
}) => {
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'master' | 'personal' | 'suggested'>('personal');
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [showMergeUI, setShowMergeUI] = useState(false);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [proposalReason, setProposalReason] = useState('');
  const [proposalAction, setProposalAction] = useState<'edit' | 'delete' | 'merge' | 'add'>('edit');
  const [proposalMergeTarget, setProposalMergeTarget] = useState('');
  const [proposalSubmitting, setProposalSubmitting] = useState(false);

  // Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: ModalType;
    title: string;
    message: string;
    onConfirm: () => void;
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

  const activeCode = codes.find(c => c.id === selectedCodeId);

  // Helper to get full path name for dropdown
  const getCodePath = (codeId: string | undefined): string => {
    if (!codeId) return '';
    const code = codes.find(c => c.id === codeId);
    if (!code) return '';
    if (code.parentId) return `${getCodePath(code.parentId)} > ${code.name}`;
    return code.name;
  };

  // Sort by hierarchy roughly
  const sortedCodes = useMemo(() => {
    const filtered = codes.filter(c => (c.type || 'personal') === filterType);

    return [...filtered].sort((a, b) => {
      // Master codes first, then suggested, then personal
      const typeScore = (type?: string) => type === 'master' ? 0 : type === 'suggested' ? 1 : 2;
      const scoreDiff = typeScore(a.type) - typeScore(b.type);
      if (scoreDiff !== 0) return scoreDiff;

      return (a.parentId || '').localeCompare(b.parentId || '') || a.name.localeCompare(b.name);
    });
  }, [codes, filterType]);

  const canEdit = (code: Code) => {
    if (code.type === 'master' && !isAdmin) return false;
    if (code.type === 'suggested' && code.createdBy !== currentUser?.uid && !isAdmin) return false;
    return true;
  };

  const getIcon = (type?: string) => {
    switch (type) {
      case 'master': return <Lock size={12} className="text-amber-600" />;
      case 'suggested': return <Sparkles size={12} className="text-purple-500" />;
      default: return <User size={12} className="text-slate-400" />;
    }
  };

  const getTypeLabel = (type?: string) => {
    switch (type) {
      case 'master': return 'Master Code (Locked)';
      case 'suggested': return 'Suggested Code';
      default: return 'Personal Code';
    }
  };

  /* State for History Modal and Collision Detection */
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<CodeHistoryEntry[]>([]);
  // const [collisionTarget, setCollisionTarget] = useState<Code | null>(null); // Unused

  const fetchHistory = async () => {
    if (!activeCode) return;
    if (!projectId) { openAlert("History Unavailable", "History is only available in cloud projects.", 'info'); return; }

    try {
      const entries = await getCodeHistory(projectId, activeCode.id);
      setHistoryEntries(entries);
      setShowHistory(true);
    } catch (e) {
      console.error(e);
      openAlert("Error", "Failed to fetch history.", 'danger');
    }
  };

  const handleSubmitProposal = async () => {
    if (!activeCode || !projectId || !currentUser) return;
    if (!proposalReason.trim()) { openAlert('Missing Information', 'Please provide a reason for your proposal.', 'alert'); return; }
    setProposalSubmitting(true);
    try {
      const proposal: CodebookChangeProposal = {
        id: crypto.randomUUID(),
        projectId,
        proposerId: currentUser.uid,
        proposerName: currentUser.displayName || 'Anonymous',
        action: proposalAction,
        timestamp: Date.now(),
        status: 'pending',
        reason: proposalReason,
      };

      if (proposalAction === 'edit') {
        proposal.targetCodeId = activeCode.id;
        proposal.targetCodeName = activeCode.name;
        proposal.previousData = { name: activeCode.name, color: activeCode.color, description: activeCode.description };
        proposal.proposedData = { name: activeCode.name, color: activeCode.color, description: activeCode.description };
      } else if (proposalAction === 'add') {
        // Proposing a suggested code to be added to master
        proposal.newCode = { ...activeCode, type: 'master' };
      } else if (proposalAction === 'delete') {
        proposal.deleteCodeId = activeCode.id;
        proposal.deleteCodeName = activeCode.name;
      } else if (proposalAction === 'merge') {
        const target = codes.find(c => c.id === proposalMergeTarget);
        if (!target) { openAlert('Selection Required', 'Select a code to merge into.', 'alert'); setProposalSubmitting(false); return; }
        proposal.mergeSourceId = activeCode.id;
        proposal.mergeSourceName = activeCode.name;
        proposal.mergeTargetId = target.id;
        proposal.mergeTargetName = target.name;
      }

      await submitProposal(projectId, proposal);

      // Notify (if not already handled by submitProposal... submitProposal writes to Firestore but notification is separate)
      await sendNotification(projectId, {
        id: crypto.randomUUID(),
        projectId,
        type: 'proposal_submitted',
        title: 'New Codebook Proposal',
        message: `${currentUser.displayName || 'A team member'} submitted a ${proposalAction} proposal for "${activeCode.name}". Reason: ${proposalReason}`,
        timestamp: Date.now(),
        fromUserId: currentUser.uid,
        fromUserName: currentUser.displayName || 'Anonymous',
        targetUserIds: [], // All admins will see
        readBy: [currentUser.uid],
        relatedEntityId: activeCode.id
      });

      onSubmitProposal?.(proposal);
      setShowProposalForm(false);
      setProposalReason('');
      onSubmitProposal?.(proposal);
      setShowProposalForm(false);
      setProposalReason('');
      openAlert('Success', 'Proposal submitted! An admin will review it.', 'info');
    } catch (e) {
      console.error('Failed to submit proposal:', e);
      openAlert('Error', 'Failed to submit proposal.', 'danger');
    }
    setProposalSubmitting(false);
  };

  const handleSuggestNewCode = async () => {
    setFilterType('suggested');
    onCreateCode('suggested');
  };



  return (
    <div className="flex h-full bg-[var(--bg-panel)] relative">
      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onCancel={modalConfig.onCancel}
        confirmLabel={modalConfig.confirmLabel}
      />
      {/* History Modal Overlay */}
      {showHistory && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-8 backdrop-blur-sm" onClick={() => setShowHistory(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-full flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg flex items-center gap-2 text-slate-700">
                <History className="text-slate-500" />
                History: {activeCode?.name}
              </h3>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-black hover:bg-slate-200 p-1 rounded"><Trash2 size={16} className="rotate-45" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {historyEntries.length === 0 ? (
                <div className="text-center text-slate-400 py-8">No history recorded for this code.</div>
              ) : (
                historyEntries.map(entry => (
                  <div key={entry.id} className="border-l-2 border-blue-500 pl-4 py-1">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span className="font-bold text-slate-700">{entry.userName}</span>
                      <span>{new Date(entry.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-sm text-slate-800">
                      {entry.description || `Performed ${entry.changeType}`}
                    </div>
                    {entry.changeType === 'update' && (
                      <div className="mt-1 text-xs font-mono bg-slate-100 p-2 rounded overflow-x-auto">
                        {Object.keys(entry.newData).filter(k => entry.newData[k as keyof Code] !== entry.previousData[k as keyof Code] && k !== 'lastModified').map(key => (
                          <div key={key}>
                            <span className="font-bold text-slate-500">{key}:</span>
                            {' '}
                            <span className="text-red-700 line-through mr-2 opacity-70">{String(entry.previousData[key as keyof Code] || '(none)')}</span>
                            <span className="text-green-700 font-medium">{String(entry.newData[key as keyof Code])}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sidebar List */}
      <div className="w-1/3 border-r border-[var(--border)] flex flex-col">
        <div className="p-4 border-b bg-[var(--bg-main)] space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg text-[var(--text-main)]">Codebook</h2>
              <p className="text-xs text-[var(--text-muted)]">{codes.length} codes</p>
            </div>
            <div className="flex gap-1">
              {isAdmin && (
                <button
                  onClick={() => onCreateCode('master')}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-800 p-2 rounded shadow-sm transition-colors"
                  title="Create Master Code"
                >
                  <Shield size={16} />
                </button>
              )}
              {!isAdmin && projectId && (
                <button
                  onClick={handleSuggestNewCode}
                  className="flex items-center gap-1 bg-purple-100 hover:bg-purple-200 text-purple-800 px-2 py-1.5 rounded shadow-sm transition-colors text-xs font-bold"
                  title="Suggest New Master Code"
                >
                  <Plus size={14} /> Suggest
                </button>
              )}
              <button
                onClick={() => {
                  if (filterType === 'personal') {
                    onCreateCode('personal');
                  } else if (filterType === 'suggested') {
                    onCreateCode('suggested');
                  } else {
                    // Master tab
                    if (isAdmin) onCreateCode('master');
                    else onCreateCode('suggested');
                  }
                }}
                className="bg-[var(--accent)] hover:brightness-110 text-[var(--accent-text)] p-2 rounded shadow-sm transition-colors"
                title={filterType === 'personal' ? 'New Personal Code' : filterType === 'suggested' ? 'New Suggestion' : isAdmin ? 'New Master Code' : 'New Suggested Code'}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex bg-[var(--bg-panel)] border border-[var(--border)] rounded-lg p-1">
            {['personal', 'master', 'suggested'].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t as any)}
                className={`flex-1 text-[10px] font-bold uppercase py-1.5 rounded-md transition-colors ${filterType === t ? 'bg-[var(--bg-main)] shadow text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {sortedCodes.map(code => (
            <div
              key={code.id}
              onClick={() => setSelectedCodeId(code.id)}
              className={`p-3 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--bg-main)] transition-colors flex items-center justify-between ${selectedCodeId === code.id ? 'bg-[var(--bg-main)] border-l-4 border-l-[var(--accent)]' : ''}`}
            >
              <div className="flex items-center gap-2 overflow-hidden w-full">
                <div
                  className="w-4 h-4 rounded-full shadow-sm flex-shrink-0"
                  style={{ backgroundColor: code.color }}
                />
                <div className="flex flex-col truncate flex-1">
                  <span className="font-medium truncate text-[var(--text-main)] flex items-center gap-2">
                    {code.name}
                    {getIcon(code.type)}
                  </span>
                  {code.parentId && (
                    <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                      <Folder size={8} /> {codes.find(c => c.id === code.parentId)?.name}
                    </span>
                  )}
                </div>
                {onToggleVisibility && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(code.id); }}
                    className={`p-1.5 rounded-full hover:bg-[var(--bg-panel)] mr-2 ${hiddenCodeIds?.has(code.id) ? 'text-[var(--text-muted)] opacity-50' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                    title={hiddenCodeIds?.has(code.id) ? "Show highlights" : "Hide highlights"}
                  >
                    {hiddenCodeIds?.has(code.id) ? (
                      <div className="relative">
                        <Eye size={14} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-full h-px bg-red-500 transform rotate-45"></div>
                        </div>
                      </div>
                    ) : (
                      <Eye size={14} />
                    )}
                  </button>
                )}
                {/* Quick Type Badge */}
                {code.type === 'master' && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">M</span>}
                {code.type === 'suggested' && <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">?</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Editor */}
      <div className="w-2/3 p-8 overflow-y-auto bg-[var(--bg-main)]">
        {activeCode ? (
          <div className="space-y-6 max-w-3xl mx-auto bg-[var(--bg-paper)] p-8 rounded-xl shadow-sm border border-[var(--border)] relative">

            {/* Type Indicator & History Button */}
            <div className="absolute top-4 right-4 flex gap-2 items-center">
              <button
                onClick={fetchHistory}
                className="px-3 py-1.5 bg-[var(--bg-main)] border border-[var(--border)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="View History"
              >
                <History size={12} /> History
              </button>
              <div className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${activeCode.type === 'master' ? 'bg-amber-100 text-amber-800' :
                activeCode.type === 'suggested' ? 'bg-purple-100 text-purple-800' :
                  'bg-slate-100 text-slate-600'
                }`}>
                {getIcon(activeCode.type)}
                {getTypeLabel(activeCode.type)}
              </div>
              <button
                onClick={() => setSelectedCodeId(null)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors ml-2"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Header */}
            <div className="flex items-center gap-4 pb-4 border-b border-[var(--border)] pt-4">
              <input
                type="color"
                value={activeCode.color}
                onChange={(e) => canEdit(activeCode) && onUpdateCode(activeCode.id, { color: e.target.value })}
                disabled={!canEdit(activeCode)}
                className="h-12 w-12 rounded cursor-pointer border-none p-1 bg-[var(--bg-paper)] shadow-sm disabled:opacity-50"
              />
              <div className="flex-1">
                <input
                  type="text"
                  value={activeCode.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    if (canEdit(activeCode)) {
                      // Check for collision with Master codes
                      if (activeCode.type !== 'master') {
                        const collision = codes.find(c => c.type === 'master' && c.name.toLowerCase() === newName.toLowerCase() && c.id !== activeCode.id);
                        if (collision) {
                          // Just warn for now
                          console.warn('Potential collision with master code:', collision.name);
                        }
                      }
                      onUpdateCode(activeCode.id, { name: newName });
                    }
                  }}
                  disabled={!canEdit(activeCode)}
                  className="text-3xl font-bold w-full border-none focus:ring-0 p-0 text-[var(--text-main)] bg-transparent placeholder-[var(--text-muted)] disabled:opacity-70"
                  placeholder="Code Name"
                />
                {/* Collision Warning */}
                {(() => {
                  const collision = codes.find(c => c.type === 'master' && c.name.toLowerCase() === activeCode.name.toLowerCase() && c.id !== activeCode.id);
                  if (collision && activeCode.type !== 'master') {
                    return (
                      <div className="mt-2 text-xs bg-amber-50 text-amber-800 p-2 rounded border border-amber-200 flex items-center gap-2">
                        <AlertTriangle size={12} />
                        <span>Conflict: A Master Code named <strong>"{collision.name}"</strong> already exists.</span>
                        {onMergeCode && (
                          <button
                            onClick={() => {
                              openConfirm(
                                'Merge Code',
                                `Merge this code into Master Code "${collision.name}"?`,
                                () => {
                                  onMergeCode(activeCode.id, collision.id);
                                  setSelectedCodeId(collision.id);
                                }
                              );
                            }}
                            className="underline font-bold hover:text-amber-900 ml-1"
                          >
                            Merge into it?
                          </button>
                        )}
                      </div>
                    )
                  }
                  return null;
                })()}
              </div>
            </div>

            {/* Reason for Suggestion (Only for Suggested Codes) */}
            {activeCode.type === 'suggested' && (
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-purple-800">
                  Reason for Suggestion
                </label>
                <textarea
                  className="w-full p-2 border border-purple-200 rounded text-sm bg-white text-[var(--text-main)] focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all disabled:opacity-50"
                  rows={2}
                  value={activeCode.reason || ''}
                  onChange={(e) => canEdit(activeCode) && onUpdateCode(activeCode.id, { reason: e.target.value })}
                  disabled={!canEdit(activeCode)}
                  placeholder="Why should this code be added to the master codebook?"
                />

                {/* Submit Suggestion Button - Only for non-admins creating suggestions */}
                {!isAdmin && projectId && (
                  <button
                    onClick={async () => {
                      if (!activeCode.reason?.trim()) { openAlert('Missing Information', 'Please provide a reason for your suggestion.', 'alert'); return; }

                      openConfirm(
                        'Submit Suggestion',
                        'Submit this code for admin approval?',
                        async () => {
                          const publishedCode = { ...activeCode, status: 'proposed' as const };

                          // Update local status first
                          onUpdateCode(activeCode.id, { status: 'proposed' });

                          const proposal: CodebookChangeProposal = {
                            id: crypto.randomUUID(),
                            projectId,
                            proposerId: currentUser?.uid || '',
                            proposerName: currentUser?.displayName || 'Anonymous',
                            action: 'add',
                            timestamp: Date.now(),
                            status: 'pending',
                            reason: activeCode.reason || '',
                            newCode: publishedCode
                          };

                          try {
                            await submitProposal(projectId, proposal);
                            // Publish to shared collection so admins can review it properly
                            await saveSharedCode(projectId, publishedCode);
                            await sendNotification(projectId, {
                              id: crypto.randomUUID(),
                              projectId,
                              type: 'proposal_submitted',
                              title: 'New Code Suggestion',
                              message: `${currentUser?.displayName || 'A team member'} suggested new code "${activeCode.name}".`,
                              timestamp: Date.now(),
                              fromUserId: currentUser?.uid || '',
                              fromUserName: currentUser?.displayName || 'Anonymous',
                              targetUserIds: [], // All admins
                              readBy: [currentUser?.uid || '']
                            });
                            openAlert('Success', 'Suggestion submitted for review!', 'info');
                          } catch (e) {
                            console.error(e);
                            openAlert('Error', 'Failed to submit suggestion.', 'danger');
                          }
                        }
                      );
                    }}
                    className="w-full bg-purple-600 text-white py-2 rounded text-sm font-bold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Send size={14} /> Submit Suggestion
                  </button>
                )}
              </div>
            )}

            {/* Admin Actions */}
            {isAdmin && activeCode.type === 'suggested' && (
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-purple-800 text-sm">Suggested Code</h4>
                    <p className="text-xs text-purple-600">Review this suggestion.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const collision = codes.find(c => c.type === 'master' && c.name.toLowerCase() === activeCode.name.toLowerCase());
                        if (collision) {
                          openAlert('Promotion Failed', `Cannot promote: Master Code "${collision.name}" already exists. Please merge or rename.`, 'danger');
                          return;
                        }
                        onUpdateCode(activeCode.id, { type: 'master' });
                      }}
                      className="bg-purple-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-purple-700 transition-colors"
                    >
                      Promote New
                    </button>
                    {onMergeCode && (
                      <button
                        onClick={() => setShowMergeUI(!showMergeUI)}
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-indigo-700 transition-colors"
                      >
                        Merge into Existing...
                      </button>
                    )}
                  </div>
                </div>

                {showMergeUI && onMergeCode && (
                  <div className="bg-white p-3 rounded border border-purple-200 animate-in fade-in slide-in-from-top-1">
                    <p className="text-xs font-bold text-purple-800 mb-1">Select Master Code to merge into:</p>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 text-sm border-purple-200 rounded"
                        value={mergeTargetId}
                        onChange={(e) => setMergeTargetId(e.target.value)}
                      >
                        <option value="">-- Select Code --</option>
                        {codes.filter(c => c.type === 'master').map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        disabled={!mergeTargetId}
                        onClick={() => {
                          openConfirm(
                            'Merge Code',
                            `Merge '${activeCode.name}' into selected code? This will reassign all usage and delete '${activeCode.name}'.`,
                            () => {
                              onMergeCode(activeCode.id, mergeTargetId);
                              setSelectedCodeId(null);
                              setShowMergeUI(false);
                            },
                            'danger',
                            'Merge & Delete'
                          );
                        }}
                        className="bg-purple-600 text-white px-3 py-1 rounded text-xs font-bold disabled:opacity-50"
                      >
                        Merge
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Parent Selector */}
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Parent Category
              </label>
              <select
                className="w-full p-2 border border-[var(--border)] rounded text-sm bg-[var(--bg-paper)] text-[var(--text-main)] disabled:opacity-50"
                value={activeCode.parentId || ''}
                onChange={(e) => canEdit(activeCode) && onUpdateCode(activeCode.id, { parentId: e.target.value || undefined })}
                disabled={!canEdit(activeCode)}
              >
                <option value="">(None - Root Level)</option>
                {codes
                  .filter(c => c.id !== activeCode.id) // Prevent self-parenting
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {getCodePath(c.id)}
                    </option>
                  ))}
              </select>
            </div>

            {/* Definition */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Definition
              </label>
              <textarea
                className="w-full p-3 border border-[var(--border)] rounded-lg text-sm bg-[var(--bg-paper)] text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all disabled:opacity-50"
                rows={4}
                value={activeCode.description || ''}
                onChange={(e) => canEdit(activeCode) && onUpdateCode(activeCode.id, { description: e.target.value })}
                disabled={!canEdit(activeCode)}
                placeholder="Define what this code represents..."
              />
            </div>

            {/* Criteria Grid */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-green-700">
                  Inclusion Criteria
                </label>
                <textarea
                  className="w-full p-3 border border-green-200 bg-green-50/30 rounded-lg text-sm focus:ring-green-500/20 focus:border-green-500 text-[var(--text-main)] disabled:opacity-50"
                  rows={6}
                  value={activeCode.inclusionCriteria || ''}
                  onChange={(e) => canEdit(activeCode) && onUpdateCode(activeCode.id, { inclusionCriteria: e.target.value })}
                  disabled={!canEdit(activeCode)}
                  placeholder="When to use this code..."
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-red-700">
                  Exclusion Criteria
                </label>
                <textarea
                  className="w-full p-3 border border-red-200 bg-red-50/30 rounded-lg text-sm focus:ring-red-500/20 focus:border-red-500 text-[var(--text-main)] disabled:opacity-50"
                  rows={6}
                  value={activeCode.exclusionCriteria || ''}
                  onChange={(e) => canEdit(activeCode) && onUpdateCode(activeCode.id, { exclusionCriteria: e.target.value })}
                  disabled={!canEdit(activeCode)}
                  placeholder="When NOT to use this code..."
                />
              </div>
            </div>

            {/* Code Memo */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                Research Memo
              </label>
              <textarea
                className="w-full p-3 border border-[var(--border)] rounded-lg text-sm bg-[var(--bg-paper)] text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all"
                rows={5}
                value={activeCode.memo || ''}
                onChange={(e) => onUpdateCode(activeCode.id, { memo: e.target.value })}
                placeholder="Analytical notes, reflexive thoughts, emerging patterns related to this code..."
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Write reflexive notes about how this code is being applied and what patterns you're seeing.
              </p>
            </div>

            {/* Non-Admin Proposal UI for Master Codes */}
            {!isAdmin && activeCode.type === 'master' && projectId && (
              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-indigo-800 text-sm flex items-center gap-1.5">
                      <GitPullRequest size={14} /> Suggest a Change
                    </h4>
                    <p className="text-xs text-indigo-600">Master codes require admin approval to modify.</p>
                  </div>
                  <button
                    onClick={() => setShowProposalForm(!showProposalForm)}
                    className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded font-bold hover:bg-indigo-700 transition-colors flex items-center gap-1"
                  >
                    <Send size={12} /> {showProposalForm ? 'Cancel' : 'Create Proposal'}
                  </button>
                </div>

                {showProposalForm && (
                  <div className="bg-white p-4 rounded-lg border border-indigo-200 space-y-3 animate-in slide-in-from-top-1">
                    <div>
                      <label className="text-xs font-bold text-indigo-800 block mb-1">Type of Change</label>
                      <div className="flex gap-2">
                        {(['edit', 'delete', 'merge'] as const).map(action => (
                          <button
                            key={action}
                            onClick={() => setProposalAction(action)}
                            className={`flex-1 text-xs py-1.5 rounded font-bold transition-colors flex items-center justify-center gap-1 ${proposalAction === action
                              ? 'bg-indigo-600 text-white'
                              : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                              }`}
                          >
                            {action === 'edit' && <><Edit2 size={10} /> Edit</>}
                            {action === 'delete' && <><Trash2 size={10} /> Remove</>}
                            {action === 'merge' && <><GitMerge size={10} /> Merge</>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {proposalAction === 'merge' && (
                      <div>
                        <label className="text-xs font-bold text-indigo-800 block mb-1">Merge into...</label>
                        <select
                          className="w-full text-sm border border-indigo-200 rounded p-2"
                          value={proposalMergeTarget}
                          onChange={e => setProposalMergeTarget(e.target.value)}
                        >
                          <option value="">-- Select Code --</option>
                          {codes.filter(c => c.type === 'master' && c.id !== activeCode.id).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-bold text-indigo-800 block mb-1">Reason for Change</label>
                      <textarea
                        className="w-full text-sm border border-indigo-200 rounded p-2 focus:ring-indigo-500 focus:border-indigo-500"
                        rows={3}
                        placeholder="Explain why this change should be made..."
                        value={proposalReason}
                        onChange={e => setProposalReason(e.target.value)}
                      />
                    </div>

                    <button
                      onClick={handleSubmitProposal}
                      disabled={proposalSubmitting || !proposalReason.trim()}
                      className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <Send size={14} /> {proposalSubmitting ? 'Submitting...' : 'Submit Proposal'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="pt-6 border-t border-[var(--border)] flex justify-end">
              {canEdit(activeCode) && (
                <button
                  onClick={() => {
                    openConfirm(
                      'Delete Code',
                      'Are you sure you want to delete this code? All coding will be lost.',
                      () => {
                        onDeleteCode(activeCode.id);
                        setSelectedCodeId(null);
                      },
                      'danger',
                      'Delete'
                    );
                  }}
                  className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded transition-colors text-sm font-medium"
                >
                  <Trash2 size={16} /> Delete Code
                </button>
              )}
            </div>

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <div className="w-16 h-16 mb-4 rounded-full bg-[var(--bg-panel)] flex items-center justify-center border border-[var(--border)]">
              <Tag className="opacity-50" size={32} />
            </div>
            <p className="font-medium">Select a code to edit</p>
            {!activeCode && (
              <div className="flex gap-2 mt-4">
                <button onClick={() => onCreateCode('personal')} className="text-sm bg-[var(--accent)] text-white px-3 py-1.5 rounded hover:opacity-90">
                  + New Personal Code
                </button>
                {projectId && (
                  <button onClick={handleSuggestNewCode} className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700">
                    + New Suggested Master Code
                  </button>
                )}
                {isAdmin && (
                  <button onClick={() => onCreateCode('master')} className="text-sm bg-amber-600 text-white px-3 py-1.5 rounded hover:opacity-90">
                    + New Master Code
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};