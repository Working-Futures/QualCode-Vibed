import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Project, Code, Selection, Transcript, AppSettings, CloudProject, UserProjectData, StickyNote, ChatMessage, DirectMessage, CodebookChangeProposal, AppNotification, DocumentSnapshot, VersionControlEvent } from './types';
import { Editor } from './components/Editor';
import { CodeTree } from './components/CodeTree';
import { AnalysisView } from './components/AnalysisView';
import { Codebook } from './components/Codebook';
import { VisualSettings } from './components/VisualSettings';
import { ProjectLauncher } from './components/ProjectLauncher';
import { MemoSidebar } from './components/MemoSidebar';
import { MemosView } from './components/MemosView';
import { TranscriptNoteLayer, TranscriptNoteLayerHandle } from './components/TranscriptNoteLayer';
import { CollaborationPanel } from './components/CollaborationPanel';
import { VersionControlPanel } from './components/VersionControlPanel';

import { useAuth } from './contexts/AuthContext';
import {
  getCloudProject,
  getTranscripts,
  getCodes,
  getUserProjectData,
  saveTranscript,
  saveCodes,
  saveSharedCode,
  deleteSharedCode,
  saveUserProjectData,
  updateCloudProject,
  deleteTranscript as deleteCloudTranscript,
  updateTranscript as updateCloudTranscript,
  subscribeToStickyNotes,
  subscribeToChatMessages,
  subscribeToCodes,
  addStickyNote,
  updateStickyNote,
  deleteStickyNote,
  sendChatMessage,
  subscribeToAllDirectMessages,
  submitChangeRequest,
  logCodeHistory,
  subscribeToNotifications,
  subscribeToProposals,
  logVersionControlEvent,
  saveDocumentSnapshot,
  sendNotification
} from './services/firestoreService';
import { parseTranscriptFile } from './utils/transcriptParser';
import { exportProjectData, parseCodebookFile, mergeCodesInProject, saveProjectFile, printTranscript, exportCodebook, generateId } from './utils/dataUtils';
import { removeHighlightsForCode, stripHighlights, restoreHighlights } from './utils/highlightUtils';
import { generateChildColor, generateColor } from './utils/colorUtils';
import { applyTheme } from './utils/themeUtils';
import { reconcileSelectionsAfterEdit } from './utils/selectionReconciler';
import { addToQueue, processQueue, getQueue } from './utils/offlineQueue';
import { ConfirmationModal, ModalType } from './components/ConfirmationModal'; // Added import
import { Eye, Save, LogOut, Trash2, Edit2, FileText, MoreHorizontal, Upload, Plus, StickyNote as StickyNoteIcon, Printer, Download, Cloud, Users, Wifi, WifiOff, Clock, GitPullRequest, Bell } from 'lucide-react';



const initialProject: Project = {
  id: 'default-project',
  name: 'My Vibe Project',
  created: Date.now(),
  lastModified: Date.now(),
  codes: [
    { id: '1', name: 'Joy', color: '#EF4444', description: 'Expressions of happiness' },
    { id: '2', name: 'Sorrow', color: '#3B82F6', description: 'Expressions of sadness' }
  ],
  transcripts: [],
  selections: [],
  projectMemo: ''
};

const defaultSettings: AppSettings = {
  fontFamily: 'sans',
  fontSize: 16,
  lineHeight: 1.6,
  zebraStriping: true,
  charSpacing: 0,
  theme: 'default'
};

export default function App() {
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [activeView, setActiveView] = useState<'editor' | 'analysis' | 'codebook' | 'memos'>('editor');
  const [activeTranscriptId, setActiveTranscriptId] = useState<string | null>(null);
  const [history, setHistory] = useState<Project[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [activeCodeId, setActiveCodeId] = useState<string | null>(null);

  const [showVisualSettings, setShowVisualSettings] = useState(false);
  const [showMemoSidebar, setShowMemoSidebar] = useState(true);
  const [showCollabPanel, setShowCollabPanel] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultSettings);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  // Replaced editingTranscriptId with a boolean for inline editing of the *active* transcript
  const [isEditing, setIsEditing] = useState(false);

  const [transcriptMenu, setTranscriptMenu] = useState<{ id: string, x: number, y: number } | null>(null);

  // Cloud State
  const [cloudProject, setCloudProject] = useState<CloudProject | null>(null);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'queued'>('idle');

  // Collaboration State
  const [stickyNotes, setStickyNotes] = useState<StickyNote[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [allDirectMessages, setAllDirectMessages] = useState<DirectMessage[]>([]);
  const [showStickyBoard, setShowStickyBoard] = useState(false); // Toggle for sticky note board visibility
  const [showTeamNotes, setShowTeamNotes] = useState(false); // Toggle for team vs personal sticky note visibility
  const [viewingAsUser, setViewingAsUser] = useState<{ id: string, name: string } | null>(null);
  const [showVersionControl, setShowVersionControl] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type?: ModalType;
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
    title: '',
    message: '',
    onConfirm: () => { },
    onCancel: () => { }
  });

  const handleModalInputChange = (val: string) => {
    setConfirmModal(prev => ({ ...prev, inputValue: val }));
  };

  const showConfirm = (title: string, message: string, type: ModalType = 'confirm', confirmLabel = 'Confirm'): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmModal({
        isOpen: true,
        title,
        message,
        type,
        confirmLabel,
        onConfirm: () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          resolve(false);
        }
      });
    });
  };

  const showAlert = (title: string, message: string) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      type: 'info',
      confirmLabel: 'OK',
      onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
  };

  const showPrompt = (title: string, message: string, defaultValue = ''): Promise<string | null> => {
    return new Promise((resolve) => {
      setConfirmModal({
        isOpen: true,
        title,
        message,
        type: 'confirm',
        showInput: true,
        inputValue: defaultValue,
        inputPlaceholder: '',
        confirmLabel: 'OK',
        onConfirm: (val) => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          resolve(val !== undefined ? val : defaultValue);
        },
        onCancel: () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          resolve(null);
        }
      });
    });
  };

  // Refs for auto-save logic
  const projectRef = useRef<Project | null>(null);
  const stickyBoardRef = useRef<TranscriptNoteLayerHandle>(null);
  const mainWorkspaceRef = useRef<HTMLDivElement>(null);

  // Check admin status
  const isProjectAdmin = React.useMemo(() => {
    if (!cloudProject || !user) return true; // Local is always admin
    if (cloudProject.ownerId === user.uid) return true;
    const member = cloudProject.members[user.uid];
    return member?.role === 'admin';
  }, [cloudProject, user]);
  const cloudProjectRef = useRef<CloudProject | null>(null);
  const userRef = useRef<typeof user>(null);
  const lastSavedTime = useRef<number>(Date.now());



  // Search States
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<{ transcriptId: string, lineIndex: number, text: string }[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [codeSearchQuery, setCodeSearchQuery] = useState('');
  const [sidebarCodeFilter, setSidebarCodeFilter] = useState<'master' | 'personal'>('master');
  const [hiddenCodeIds, setHiddenCodeIds] = useState<Set<string>>(new Set());

  // Subscribe to Collaboration Data (Chat & Sticky Notes & Codes)
  // Subscribe to Collaboration Data (Chat & Sticky Notes & Codes)

  // 1. Sticky Notes Subscription
  useEffect(() => {
    if (!cloudProject?.id) return;

    const unsub = subscribeToStickyNotes(cloudProject.id, (serverNotes) => {

      setStickyNotes(serverNotes);
    });
    return () => unsub();
  }, [cloudProject?.id]);

  // 2. Chat Messages Subscription
  useEffect(() => {
    if (!cloudProject?.id) return;
    const unsub = subscribeToChatMessages(cloudProject.id, setChatMessages);
    return () => unsub();
  }, [cloudProject?.id]);

  // 3. Codes Subscription (shared codes only — merge with personal)
  useEffect(() => {
    if (!cloudProject?.id) return;
    const unsub = subscribeToCodes(cloudProject.id, (sharedCodes) => {
      // Merge shared codes with user's local personal codes AND draft suggested codes
      setProject(prev => {
        if (!prev) return null;
        // Keep personal codes and draft suggested codes that aren't in shared list
        const sharedIds = new Set(sharedCodes.map(c => c.id));
        const localCodes = prev.codes.filter(c =>
          c.type === 'personal' ||
          (c.type === 'suggested' && !sharedIds.has(c.id)) // Keep drafts not yet published
        );
        return { ...prev, codes: [...sharedCodes, ...localCodes] };
      });
    });
    return () => unsub();
  }, [cloudProject?.id]);

  // 4. Direct Messages Subscription
  useEffect(() => {
    if (!cloudProject?.id || !user?.uid) return;
    const unsub = subscribeToAllDirectMessages(cloudProject.id, user.uid, setAllDirectMessages);
    return () => unsub();
  }, [cloudProject?.id, user?.uid]); // Use primitive user.uid to avoid obj ref churn

  // 5. Notifications Subscription (Version Control)
  useEffect(() => {
    if (!cloudProject?.id || !user?.uid) return;
    const unsub = subscribeToNotifications(cloudProject.id, user.uid, setNotifications);
    return () => unsub();
  }, [cloudProject?.id, user?.uid]);

  // --- Effects ---

  // Save/Load Settings
  useEffect(() => {
    const saved = localStorage.getItem('appSettings');
    if (saved) {
      try { setAppSettings(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('appSettings', JSON.stringify(appSettings));
  }, [appSettings]);

  // Auto-save to LocalStorage per 30 seconds to prevent data loss
  useEffect(() => {
    if (!project) return;
    const saveInterval = setInterval(() => {
      localStorage.setItem('autosave_project', JSON.stringify(project));

    }, 30000);
    return () => clearInterval(saveInterval);
  }, [project]);


  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setProject(history[newIndex]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setProject(history[newIndex]);
    }
  }, [history, historyIndex]);

  // Undo / Redo Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Apply theme & font
  useEffect(() => {
    applyTheme(appSettings.theme);

    const fonts: Record<string, string> = {
      'sans': 'ui-sans-serif, system-ui, sans-serif',
      'serif': 'Merriweather, serif',
      'mono': 'ui-monospace, monospace',
      'dyslexic': 'OpenDyslexic, sans-serif',
      'times': '"Times New Roman", Times, serif',
      'arial': 'Arial, Helvetica, sans-serif',
      'georgia': 'Georgia, serif'
    };
    document.body.style.fontFamily = fonts[appSettings.fontFamily] || fonts['sans'];

    if (appSettings.fontFamily === 'dyslexic') {
      document.body.classList.add('font-dyslexic');
    } else {
      document.body.classList.remove('font-dyslexic');
    }
  }, [appSettings.theme, appSettings.fontFamily]);

  // Handle Sidebar Width Dynamic Update
  useEffect(() => {
    if (appSettings.sidebarWidth) {
      setSidebarWidth(appSettings.sidebarWidth);
    }
  }, [appSettings]);

  // Global Search Logic (Debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!globalSearchQuery.trim()) {
        setGlobalSearchResults([]);
        return;
      }

      const results: { transcriptId: string, lineIndex: number, text: string }[] = [];
      const query = globalSearchQuery.toLowerCase();

      project?.transcripts.forEach(t => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(t.content, 'text/html');
        const lines = doc.querySelectorAll('.transcript-line');

        lines.forEach((line, idx) => {
          const text = line.textContent || '';
          if (text.toLowerCase().includes(query)) {
            results.push({
              transcriptId: t.id,
              lineIndex: idx + 1,
              text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
            });
          }
        });
      });
      setGlobalSearchResults(results);
    }, 300);

    return () => clearTimeout(timer);
  }, [globalSearchQuery, project]);

  const saveToCloud = useCallback(async (
    currentProject: Project,
    currentCloudProject: CloudProject | null,
    currentUser: typeof user
  ) => {
    if (!currentCloudProject || !currentUser || viewingAsUser) return;


    setCloudSyncStatus('saving');
    try {
      // Force sticky notes to save pending changes
      if (stickyBoardRef.current) {

        await stickyBoardRef.current.saveAll();

      }

      // Save codes (shared codebook)

      await saveCodes(currentCloudProject.id, currentProject.codes);


      // Save user-specific data (selections + memos + personal codes)
      const transcriptMemos: Record<string, string> = {};
      currentProject.transcripts.forEach(t => {
        if (t.memo) transcriptMemos[t.id] = t.memo;
      });

      // Separate personal codes (and draft suggested codes) for per-user storage
      const personalCodes = currentProject.codes.filter(c =>
        ((c.type === 'personal') || (c.type === 'suggested' && c.status === 'draft')) &&
        c.createdBy === currentUser?.uid
      );


      await saveUserProjectData(currentCloudProject.id, currentUser.uid, {
        selections: currentProject.selections,
        transcriptMemos,
        personalMemo: currentProject.projectMemo || '',
        personalCodes,
      });


      // Update project metadata
      const updates = {
        lastModified: Date.now(),
        projectMemo: currentProject.projectMemo || '',
      };

      try {

        await updateCloudProject(currentCloudProject.id, updates);

      } catch (err) {
        console.warn("[saveToCloud] Failed immediate update, queueing...", err);
        addToQueue({ type: 'update_project', projectId: currentCloudProject.id, updates });
      }

      lastSavedTime.current = currentProject.lastModified;
      setCloudSyncStatus('saved');

      setTimeout(() => setCloudSyncStatus('idle'), 2000);
    } catch (err) {
      console.warn('[saveToCloud] Cloud save error - adding to offline queue:', err);

      // Add all core parts to queue
      try {
        addToQueue({ type: 'save_codes', projectId: currentCloudProject.id, codes: currentProject.codes });
        addToQueue({
          type: 'save_user_data',
          projectId: currentCloudProject.id,
          userId: currentUser.uid,
          data: {
            selections: currentProject.selections,
            transcriptMemos: {},
            personalMemo: currentProject.projectMemo || ''
          }
        });
      } catch (e) {
        console.error("Queue failed too", e);
      }

      setCloudSyncStatus('queued');
    }
  }, []);

  // Online/Offline status listeners
  useEffect(() => {
    // Process queue immediately on load (in case we have pending offline changes)
    processQueue();

    const handleOnline = () => {

      processQueue().then((success) => {
        if (success) setCloudSyncStatus('saved');
        else setCloudSyncStatus('error');
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // ─── Auto-Save Logic ───

  // Sync refs for proper interval access to avoid stale closures
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { cloudProjectRef.current = cloudProject; }, [cloudProject]);
  useEffect(() => { userRef.current = user; }, [user]);

  // Auto-save Interval (Every 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const p = projectRef.current;
      const cp = cloudProjectRef.current;
      const u = userRef.current;

      if (p && cp && u) {
        // Check if modified since last save
        if (p.lastModified > lastSavedTime.current) {
          saveToCloud(p, cp, u);
          // lastSavedTime is updated inside saveToCloud on success
        }
      }
    }, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [saveToCloud]);

  // Warn user before closing tab ONLY if unsaved
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const p = projectRef.current;
      // Only warn if dirty and unsaved
      if (p && cloudProjectRef.current && p.lastModified > lastSavedTime.current) {
        // Attempt immediate save (fire & forget, best effort)
        saveToCloud(p, cloudProjectRef.current, userRef.current!);

        // Show browser warning
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveToCloud]);



  // ─── Open Cloud Project ───
  const openCloudProject = async (cp: CloudProject) => {
    if (!user) return;


    try {
      // Load all cloud data

      const [transcripts, sharedCodes, userData] = await Promise.all([
        getTranscripts(cp.id),
        getCodes(cp.id),
        getUserProjectData(cp.id, user.uid),
      ]);


      // Merge shared codes with user's personal codes (and drafts)
      const userCodes = (userData.personalCodes || []).filter(c => c.type === 'personal' || c.type === 'suggested');
      // Deduplicate: If a user code is already in sharedCodes (e.g. it was published), prefer sharedCodes
      const sharedIds = new Set(sharedCodes.map(c => c.id));
      const uniqueUserCodes = userCodes.filter(c => !sharedIds.has(c.id));
      const codes = [...sharedCodes, ...uniqueUserCodes];


      // Convert cloud transcripts to local format

      const localTranscripts: Transcript[] = transcripts.map(t => ({
        id: t.id,
        name: t.name,
        // Highlights are user-local, we must re-apply them from selection metadata
        content: restoreHighlights(t.content, userData.selections.filter(s => s.transcriptId === t.id), codes),
        dateAdded: t.dateAdded,
        memo: userData.transcriptMemos[t.id] || '',
      }));


      // Construct a local Project from cloud data
      const localProject: Project = {
        id: cp.id,
        name: cp.name,
        created: cp.created,
        lastModified: cp.lastModified,
        codes,
        transcripts: localTranscripts,
        selections: userData.selections,
        projectMemo: userData.personalMemo || cp.projectMemo || '',
        isCloud: true,
        cloudProjectId: cp.id,
      };

      setCloudProject(cp);
      setProject(localProject);
      setActiveTranscriptId(localTranscripts.length > 0 ? localTranscripts[0].id : null);
      setIsEditing(false);

    } catch (err) {
      console.error('[openCloudProject] ❌ Error opening cloud project:', err);
      showAlert("Error", "Error opening cloud project. Please try again.");
    }
  };

  // ─── Landing Page ───
  if (!project) {
    return (
      <ProjectLauncher
        onOpenProject={(p) => {
          setCloudProject(null);
          setProject(p);
        }}
        onCreateProject={() => {
          setCloudProject(null);
          setProject(initialProject);
        }}
        onOpenCloudProject={openCloudProject}
      />
    );
  }

  const activeTranscript = project.transcripts.find(t => t.id === activeTranscriptId) || null;
  const activeCode = project.codes.find(c => c.id === activeCodeId) || null;

  // --- Actions ---

  const handleProjectUpdate = (updatedProject: Project, addToHistory = true) => {
    const p = { ...updatedProject, lastModified: Date.now() };

    if (addToHistory) {
      // Add to history
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(p);
      if (newHistory.length > 30) newHistory.shift(); // Keep last 30 states
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }

    setProject(p);
  };



  const handleImportCodes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const newCodes = await parseCodebookFile(file);
      const uniqueNewCodes = newCodes.filter(nc => !project.codes.some(c => c.name === nc.name));
      handleProjectUpdate({ ...project, codes: [...project.codes, ...uniqueNewCodes] });
      if (uniqueNewCodes.length < newCodes.length) showAlert('Import Info', `Imported ${uniqueNewCodes.length} codes (skipped duplicates).`);
    } catch (err) {
      showAlert('Import Failed', "Failed to parse codebook. Ensure headers are correct.");
    }
  };

  const handleTranscriptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { name, content } = await parseTranscriptFile(file);

      const newTranscript: Transcript = {
        id: crypto.randomUUID(),
        name,
        content,
        dateAdded: Date.now(),
        memo: ''
      };

      // If cloud project, save clean (no highlights) content to cloud
      if (cloudProject && user) {
        await saveTranscript(cloudProject.id, {
          id: newTranscript.id,
          name: newTranscript.name,
          content: stripHighlights(newTranscript.content),
          dateAdded: newTranscript.dateAdded,
          uploadedBy: user.uid,
        });
      }

      handleProjectUpdate({ ...project, transcripts: [...project.transcripts, newTranscript] });
      setActiveTranscriptId(newTranscript.id);
      e.target.value = '';
    } catch (err) {
      console.error(err);
      showAlert('Import Error', "Error importing file. Please check the file format.");
    }
  };

  const deleteTranscriptHandler = async (id: string) => {
    // If not admin and cloud project, submit request
    if (cloudProject && !isProjectAdmin) {
      const t = project.transcripts.find(tx => tx.id === id);
      if (await showConfirm('Request Deletion?', `You are not an admin. Do you want to submit a request to delete "${t?.name || 'this transcript'}"?`, 'confirm')) {
        if (user) {
          await submitChangeRequest(cloudProject.id, {
            id: crypto.randomUUID(),
            projectId: cloudProject.id,
            transcriptId: id,
            transcriptName: t?.name || 'Unknown',
            userId: user.uid,
            userName: user.displayName || 'User',
            changeType: 'delete',
            timestamp: Date.now(),
            status: 'pending'
          });
          showAlert('Request Submitted', 'Your deletion request has been sent to the admins.');
        }
      }
      return;
    }

    if (await showConfirm("Delete Transcript", "Are you sure you want to delete this transcript and all its highlights?", 'danger')) {
      // If cloud, delete from cloud too
      if (cloudProject) {
        deleteCloudTranscript(cloudProject.id, id).catch(console.error);
      }

      handleProjectUpdate({
        ...project,
        transcripts: project.transcripts.filter(t => t.id !== id),
        selections: project.selections.filter(s => s.transcriptId !== id)
      });
      if (activeTranscriptId === id) setActiveTranscriptId(null);
    }
  };

  const renameTranscript = async (id: string) => {
    const t = project.transcripts.find(tx => tx.id === id);
    if (!t) return;
    const newName = await showPrompt("Rename Transcript", "Enter new name:", t.name);

    if (newName && newName.trim()) {
      if (cloudProject && !isProjectAdmin) {
        if (user) {
          await submitChangeRequest(cloudProject.id, {
            id: crypto.randomUUID(),
            projectId: cloudProject.id,
            transcriptId: id,
            transcriptName: t.name,
            newName: newName,
            userId: user.uid,
            userName: user.displayName || 'User',
            changeType: 'rename',
            timestamp: Date.now(),
            status: 'pending'
          });
          showAlert('Request Submitted', 'Your rename request has been sent to the admins.');
        }
        return;
      }

      // If cloud, update cloud too
      if (cloudProject) {
        updateCloudTranscript(cloudProject.id, id, { name: newName }).catch(console.error);
      }

      handleProjectUpdate({
        ...project,
        transcripts: project.transcripts.map(tx => tx.id === id ? { ...tx, name: newName } : tx)
      });
    }
  };

  const handleSelectionCreate = (newSelection: Selection, updatedHtml: string) => {
    if (viewingAsUser) return;
    handleProjectUpdate({
      ...project,
      selections: [...project.selections, newSelection],
      transcripts: project.transcripts.map(t => t.id === newSelection.transcriptId ? { ...t, content: updatedHtml } : t)
    });

    // Note: we do NOT save highlighted HTML to cloud — highlights are user-local.
    // The cloud transcript stores clean content. Selections are saved via userdata.
  };

  const handleSelectionDelete = (selectionId: string, updatedHtml: string) => {
    if (!activeTranscriptId || viewingAsUser) return;
    handleProjectUpdate({
      ...project,
      selections: project.selections.filter(s => s.id !== selectionId),
      transcripts: project.transcripts.map(t => t.id === activeTranscriptId ? { ...t, content: updatedHtml } : t)
    });

    // Note: we do NOT save highlighted HTML to cloud — highlights are user-local.
    // Selections are saved via userdata.
  };

  const createCode = (typeOrEvent?: React.MouseEvent | 'master' | 'personal' | 'suggested') => {
    // Handle both event and string call styles
    let type: 'master' | 'personal' | 'suggested' = 'personal';
    if (typeof typeOrEvent === 'string') {
      type = typeOrEvent;
    } else if (typeOrEvent && 'stopPropagation' in typeOrEvent) {
      typeOrEvent.stopPropagation();
    }

    const parent = activeCodeId ? project.codes.find(c => c.id === activeCodeId) : null;
    let newColor = '#cccccc';

    if (parent) {
      const siblings = project.codes.filter(c => c.parentId === parent.id).length;
      newColor = generateChildColor(parent.color, siblings);
    } else {
      const roots = project.codes.filter(c => !c.parentId).length;
      newColor = generateColor(roots);
    }

    const newCode: Code = {
      id: generateId(),
      name: `New ${type === 'suggested' ? 'Suggested ' : ''}Code`,
      color: newColor,
      parentId: parent?.id,
      type: type,
      createdBy: user?.uid,
      suggestedBy: type === 'suggested' ? user?.uid : undefined,
      status: type === 'suggested' ? 'draft' : undefined // Draft codes are private until submitted
    };

    handleProjectUpdate({ ...project, codes: [...project.codes, newCode] });
    setActiveCodeId(newCode.id);

    // Sync to cloud immediately if shared (but not drafts)
    if (cloudProject && (newCode.type === 'master')) {
      saveSharedCode(cloudProject.id, newCode).catch(console.error);
    }
    // Log code creation history & activity
    if (cloudProject && user) {
      logCodeHistory(cloudProject.id, {
        id: crypto.randomUUID(),
        codeId: newCode.id,
        projectId: cloudProject.id,
        previousData: {},
        newData: newCode,
        changeType: 'create',
        userId: user.uid,
        userName: user.displayName || 'Me',
        timestamp: Date.now(),
        description: `Created ${type} code "${newCode.name}"`
      }).catch(console.error);

      logVersionControlEvent(cloudProject.id, {
        id: crypto.randomUUID(),
        projectId: cloudProject.id,
        eventType: 'code_create',
        userId: user.uid,
        userName: user.displayName || 'Me',
        timestamp: Date.now(),
        description: `Created ${type} code "${newCode.name}"`
      }).catch(console.error);


    }
  };

  const handleCloseProject = async () => {
    console.log('[handleCloseProject] ▶ Close project requested');
    // Check if project is dirty (unsaved changes)
    const isDirty = project && project.lastModified > lastSavedTime.current;
    console.log(`[handleCloseProject] isDirty=${isDirty}, isCloud=${!!cloudProject}, viewingAsUser=${!!viewingAsUser}`);

    if (cloudProject && user && project && !viewingAsUser) {
      if (isDirty) {
        // If dirty, await the save so we don't close before it finishes
        console.log('[handleCloseProject] Saving dirty cloud project before close...');
        setCloudSyncStatus('saving');
        await saveToCloud(project, cloudProject, user);
        console.log('[handleCloseProject] Save completed');
      }
      // Close immediately after save (or if clean)
      setProject(null);
      setCloudProject(null);
      setShowCollabPanel(false);
      setViewingAsUser(null);
      console.log('[handleCloseProject] ✅ Cloud project closed');
    } else {
      // Local Project: Always warn if closing
      if (await showConfirm("Close project?", "Any unsaved changes will be lost.", 'danger')) {
        setProject(null);
        setCloudProject(null);
        setShowCollabPanel(false);
        setViewingAsUser(null);
        console.log('[handleCloseProject] ✅ Local project closed');
      } else {
        console.log('[handleCloseProject] Close cancelled by user');
      }
    }
  };

  const handleViewCollaborator = async (userId: string, userName: string) => {
    // Prevent re-entering view mode if already viewing that user (though unlikely via UI)
    if (viewingAsUser?.id === userId) return;

    console.log(`[viewCollaborator] ▶ Starting view for user="${userName}" (${userId})`);
    if (!cloudProject || !project) {
      console.warn('[viewCollaborator] Aborted: no cloudProject or project loaded');
      return;
    }

    // Step 0: Auto-save current user's data before switching to view mode
    // This prevents data loss (memos, selections) when the project state is replaced
    if (user && !viewingAsUser) {

      try {
        await saveToCloud(project, cloudProject, user);

      } catch (saveErr) {
        console.warn('[viewCollaborator] Step 0: Auto-save failed, proceeding anyway:', saveErr);
      }
    }

    setViewingAsUser({ id: userId, name: userName });
    setIsEditing(false);


    try {
      // Step 1: Fetch the collaborator's user data (selections, memos, personal codes)

      const data = await getUserProjectData(cloudProject.id, userId);


      // Step 2: Prepare the codes for the view (Shared Codes + Collaborator's Personal Codes)
      // We filter out the *current* user's personal codes from the project
      // Note: project.codes currently contains (Shared + Current User Personal)
      const sharedCodes = project.codes.filter(c => c.type === 'master' || c.type === 'suggested');
      const collaboratorPersonalCodes = (data.personalCodes || []).filter(c => c.type === 'personal');
      const viewCodes = [...sharedCodes, ...collaboratorPersonalCodes];


      // Step 3: Hydrate transcripts with collaborator's selections using their codes

      const updatedTranscripts = project.transcripts.map(t => {
        // We use stripHighlights first to ensure clean slate if needed, though t.content might have current user's highlights?
        // Actually t.content in project state has highlights. We must strip them first or use clean content?
        // It is safer to strip highlights first.
        const cleanContent = stripHighlights(t.content);

        return {
          ...t,
          content: restoreHighlights(cleanContent, data.selections.filter(s => s.transcriptId === t.id), viewCodes),
          memo: data.transcriptMemos[t.id] || ''
        };
      });

      // Step 4: Update the project state with the collaborator's view

      setProject({
        ...project,
        codes: viewCodes, // Update codes to show collaborator's personal codes in CodeTree
        selections: data.selections,
        transcripts: updatedTranscripts,
        projectMemo: data.personalMemo || ''
      });


    } catch (e) {
      console.error('[viewCollaborator] ❌ Error loading collaborator data:', e);
      alert("Failed to load user view. Check the console for details.");
      setViewingAsUser(null);
    }
  };

  const handleExitViewMode = async () => {

    if (!cloudProject || !user || !project) {
      console.warn('[exitViewMode] Missing cloudProject, user, or project. Clearing viewingAsUser.');
      setViewingAsUser(null);
      return;
    }

    setViewingAsUser(null);


    try {
      // Step 1: Fetch the current user's data

      const data = await getUserProjectData(cloudProject.id, user.uid);

      // Step 2: Restore original codes (Shared + My Personal)

      // We assume project.codes currently has (Shared + Collab Personal).
      // We need to rebuild (Shared + My Personal).
      const sharedCodes = project.codes.filter(c => c.type === 'master' || c.type === 'suggested');
      // getUserProjectData returns personalCodes.
      const myPersonalCodes = (data.personalCodes || []).filter(c => c.type === 'personal');
      const restoredCodes = [...sharedCodes, ...myPersonalCodes];

      // Step 3: Hydrate transcripts with own selections

      const restoredTranscripts = project.transcripts.map(t => {
        const cleanContent = stripHighlights(t.content);
        return {
          ...t,
          content: restoreHighlights(cleanContent, data.selections.filter(s => s.transcriptId === t.id), restoredCodes),
          memo: data.transcriptMemos[t.id] || ''
        };
      });

      // Step 4: Update project state
      setProject({
        ...project,
        codes: restoredCodes,
        selections: data.selections,
        transcripts: restoredTranscripts,
        projectMemo: data.personalMemo || ''
      });


    } catch (e) {
      console.error('[exitViewMode] ❌ Error restoring user data:', e);
      alert("Error returning to your view. Please refresh.");
    }
  };

  const handleSaveProject = async () => {

    if (!project) {
      console.warn('[handleSaveProject] No project loaded, aborting');
      return;
    }

    if (viewingAsUser) {
      console.warn('[handleSaveProject] In view-only mode, blocking save');
      alert("You are in View Only mode. Exit View Mode to save changes.");
      return;
    }

    // If cloud, also do an immediate cloud save
    if (cloudProject && user) {

      await saveToCloud(project, cloudProject, user);

    } else {

      // Only export local file if NOT a cloud project
      saveProjectFile(project);

    }
  };

  return (
    <div className={`h-screen flex flex-col bg-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-300`}>

      {/* Header */}
      <header className="h-14 border-b border-[var(--border)] flex items-center justify-between px-4 bg-[var(--bg-header)] text-white shadow-md z-30 shrink-0">
        <div className="flex items-center gap-6">
          <span className="font-bold text-lg tracking-tight flex items-center gap-2">
            QualCode Vibed
          </span>
          <nav className="flex gap-1 bg-white/10 p-1 rounded-lg">
            {(['editor', 'codebook', 'analysis', 'memos'] as const).map(view => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeView === view ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-sm' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-md mx-4 relative">
          <div className="relative">
            <input
              type="text"
              placeholder="Search all documents..."
              className="w-full bg-white/10 border border-white/20 rounded-md py-1.5 pl-8 pr-4 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              value={globalSearchQuery}
              onChange={(e) => { setGlobalSearchQuery(e.target.value); setShowSearchResults(true); }}
              onFocus={() => setShowSearchResults(true)}
            />
            <div className="absolute left-2.5 top-2 text-slate-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            </div>
          </div>

          {/* Search Results Dropdown */}
          {showSearchResults && globalSearchQuery && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSearchResults(false)} />
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-panel)] border border-[var(--border)] rounded-md shadow-xl max-h-96 overflow-y-auto z-50 text-[var(--text-main)]">
                {globalSearchResults.length === 0 ? (
                  <div className="p-3 text-sm text-[var(--text-muted)]">No matches found.</div>
                ) : (
                  <div>
                    <div className="p-2 bg-[var(--bg-main)] text-xs font-bold text-[var(--text-muted)] sticky top-0">
                      Found {globalSearchResults.length} matches
                    </div>
                    {globalSearchResults.map((res, i) => {
                      const t = project.transcripts.find(tr => tr.id === res.transcriptId);
                      return (
                        <div
                          key={i}
                          className="p-3 border-b border-[var(--border)] hover:bg-[var(--bg-main)] cursor-pointer"
                          onClick={() => {
                            setActiveTranscriptId(res.transcriptId);
                            setActiveView('editor');
                            setShowSearchResults(false);
                          }}
                        >
                          <div className="text-xs font-bold text-[var(--accent)] mb-1">{t?.name} (Line {res.lineIndex})</div>
                          <div className="text-sm line-clamp-2 text-[var(--text-muted)]">"{res.text}"</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Cloud Sync Status */}
          {cloudProject && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${cloudSyncStatus === 'saving' ? 'bg-blue-500/20 text-blue-300' :
              cloudSyncStatus === 'saved' ? 'bg-green-500/20 text-green-300' :
                cloudSyncStatus === 'error' ? 'bg-red-500/20 text-red-300' :
                  cloudSyncStatus === 'queued' ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-white/10 text-slate-400'
              }`}>
              {cloudSyncStatus === 'saving' ? (
                <><Cloud size={12} className="animate-pulse" /> Syncing...</>
              ) : cloudSyncStatus === 'saved' ? (
                <><Cloud size={12} /> Synced</>
              ) : cloudSyncStatus === 'error' ? (
                <><WifiOff size={12} /> Sync Error</>
              ) : cloudSyncStatus === 'queued' ? (
                <><Clock size={12} /> Offline Queue</>
              ) : (
                <><Wifi size={12} /> Synced</>
              )}
            </div>
          )}

          {/* Sticky Notes Toggle */}
          {cloudProject && (
            <button
              onClick={() => setShowStickyBoard(!showStickyBoard)}
              className={`px-3 py-1.5 rounded transition-colors flex items-center gap-2 text-xs font-bold ${showStickyBoard ? 'bg-yellow-400 text-yellow-900 border border-yellow-500' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
              title="Sticky Notes Board"
            >
              <StickyNoteIcon size={16} /> Notes
            </button>
          )}

          {/* Collaboration Button */}
          {cloudProject && (() => {
            const unreadDmCount = allDirectMessages.filter(m => m.toId === user?.uid && !m.readBy.includes(user?.uid || '')).length;
            return (
              <button
                onClick={() => setShowCollabPanel(!showCollabPanel)}
                className={`px-3 py-1.5 rounded transition-colors flex items-center gap-2 text-xs font-bold relative ${showCollabPanel ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
                title="Collaboration"
              >
                <Users size={16} /> Team
                {unreadDmCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ring-2 ring-[var(--bg-header)] animate-pulse">
                    {unreadDmCount > 99 ? '99+' : unreadDmCount}
                  </span>
                )}
              </button>
            );
          })()}

          {/* Version Control Button */}
          {cloudProject && (() => {
            const unreadNotifs = notifications.filter(n => !n.readBy.includes(user?.uid || '')).length;
            return (
              <button
                onClick={() => setShowVersionControl(!showVersionControl)}
                className={`px-3 py-1.5 rounded transition-colors flex items-center gap-2 text-xs font-bold relative ${showVersionControl
                  ? 'bg-indigo-600 text-white'
                  : unreadNotifs > 0
                    ? 'bg-purple-600 text-white shadow-md animate-pulse' // Turn purple if notifications exist
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                title="Version Control"
              >
                <GitPullRequest size={16} /> VC
                {unreadNotifs > 0 && (
                  <span className="absolute -top-1 -right-1 bg-white text-purple-600 text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ring-2 ring-purple-600">
                    {unreadNotifs > 99 ? '99+' : unreadNotifs}
                  </span>
                )}
              </button>
            );
          })()}

          <button
            onClick={() => setShowVisualSettings(!showVisualSettings)}
            className={`px-3 py-1.5 rounded transition-colors flex items-center gap-2 text-xs font-bold ${showVisualSettings ? 'bg-white/20 text-[var(--accent)]' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
            title="Visual Settings"
          >
            <Eye size={16} /> Theme
          </button>

          <div className="h-6 w-px bg-white/20 mx-1"></div>

          <button
            onClick={handleSaveProject}
            className={`px-3 py-1.5 rounded text-xs font-bold shadow-sm transition-all flex items-center gap-2 ${cloudProject ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[var(--accent)] hover:brightness-110 text-[var(--accent-text)]'}`}
            title={cloudProject ? "Force Sync to Cloud" : "Export Local File (.qlab)"}
          >
            {cloudProject ? <Cloud size={14} /> : <Save size={14} />}
            {cloudProject ? "Cloud Save" : "Export File"}
          </button>

          <button
            onClick={handleCloseProject}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-white/10 rounded transition-colors"
            title="Close Project"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* View Mode Banner */}
      {viewingAsUser && (
        <div className="bg-indigo-600 text-white px-4 py-2 text-sm font-bold flex justify-between items-center shadow-md z-40 shrink-0">
          <div className="flex items-center gap-2">
            <Eye size={16} />
            Viewing as {viewingAsUser.name} (Read Only)
          </div>
          <button
            onClick={handleExitViewMode}
            className="bg-white text-indigo-600 px-3 py-1 rounded text-xs hover:bg-indigo-50"
          >
            Exit View
          </button>
        </div>
      )}

      {/* Sticky Notes Overlay */}
      {/* Sticky Notes Overlay - Only show in non-editor views (Editor has its own embedded board) */}


      {/* Visual Settings Overlay */}
      {showVisualSettings && (
        <VisualSettings settings={appSettings} onUpdate={setAppSettings} />
      )}

      {/* Version Control Panel Overlay (Global) */}
      {showVersionControl && cloudProject && user && (
        <VersionControlPanel
          projectId={cloudProject.id}
          currentUserId={user.uid}
          currentUserName={user.displayName || 'User'}
          isAdmin={isProjectAdmin}
          codes={project.codes}
          onClose={() => setShowVersionControl(false)}
          onApplyProposal={(proposal) => {
            // Apply proposal locally
            if (proposal.action === 'add' && proposal.newCode && proposal.newCode.id) {
              const newCode = { ...proposal.newCode, type: 'master' as const } as Code;
              const exists = project.codes.some(c => c.id === newCode.id);
              if (exists) {
                // Replace existing (e.g. promoting suggested to master) — removes from suggestions
                handleProjectUpdate({ ...project, codes: project.codes.map(c => c.id === newCode.id ? newCode : c) });
              } else {
                // Add as master, also remove any matching suggested code by name
                const updatedCodes = project.codes
                  .filter(c => !(c.type === 'suggested' && c.name === newCode.name && c.createdBy === proposal.proposerId))
                  .concat(newCode);
                handleProjectUpdate({ ...project, codes: updatedCodes });
              }
              // Sync to Cloud
              saveSharedCode(cloudProject.id, newCode).catch(console.error);
            } else if (proposal.action === 'edit' && proposal.targetCodeId && proposal.proposedData) {
              handleProjectUpdate({
                ...project,
                codes: project.codes.map(c => c.id === proposal.targetCodeId ? { ...c, ...proposal.proposedData } : c)
              });
              saveSharedCode(cloudProject.id, { id: proposal.targetCodeId, ...proposal.proposedData } as any).catch(console.error);
            } else if (proposal.action === 'delete' && proposal.deleteCodeId) {
              handleProjectUpdate({
                ...project,
                codes: project.codes.filter(c => c.id !== proposal.deleteCodeId)
              });
              deleteSharedCode(cloudProject.id, proposal.deleteCodeId).catch(console.error);
            } else if (proposal.action === 'merge' && proposal.mergeSourceId && proposal.mergeTargetId) {
              handleProjectUpdate(mergeCodesInProject(project, proposal.mergeSourceId, proposal.mergeTargetId));
              deleteSharedCode(cloudProject.id, proposal.mergeSourceId).catch(console.error);
            }

            // Log version control event
            logVersionControlEvent(cloudProject.id, {
              id: crypto.randomUUID(),
              projectId: cloudProject.id,
              eventType: proposal.action === 'add' ? 'code_create' :
                proposal.action === 'edit' ? 'code_edit' :
                  proposal.action === 'delete' ? 'code_delete' :
                    proposal.action === 'merge' ? 'code_merge' : 'proposal',
              userId: user.uid,
              userName: user.displayName || 'Admin',
              timestamp: Date.now(),
              description: `Accepted ${proposal.action} proposal from ${proposal.proposerName}`
            }).catch(console.error);

            // Notify everyone about the codebook change
            sendNotification(cloudProject.id, {
              id: crypto.randomUUID(),
              projectId: cloudProject.id,
              type: 'codebook_change',
              title: 'Codebook Updated',
              message: `${user.displayName || 'Admin'} applied a ${proposal.action} change to the master codebook (proposed by ${proposal.proposerName}).`,
              timestamp: Date.now(),
              fromUserId: user.uid,
              fromUserName: user.displayName || 'Admin',
              targetUserIds: [],
              readBy: [user.uid]
            }).catch(console.error);
          }}
          onUpdateCodes={(newCodes) => handleProjectUpdate({ ...project, codes: newCodes })}
          onRestoreSnapshot={(snapshot) => {
            if (snapshot.transcriptId) {
              // Restore transcript content locally
              handleProjectUpdate({
                ...project,
                transcripts: project.transcripts.map(t => t.id === snapshot.transcriptId ? { ...t, content: snapshot.content || '' } : t)
              });
              setActiveTranscriptId(snapshot.transcriptId);
              setActiveView('editor');
              setShowVersionControl(false);
            }
          }}
          onNavigateToCode={(codeId, type) => {
            // Switch to Codebook view and select the code
            setActiveView('codebook');
            setActiveCodeId(codeId);
            // Suggested codes appear under the master filter in the sidebar
            setSidebarCodeFilter(type === 'personal' ? 'personal' : 'master');
            setShowVersionControl(false);
          }}
        />
      )}


      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden relative" ref={mainWorkspaceRef}>

        {/* Sticky Notes Layer */}
        {cloudProject && user && activeView !== 'editor' && showStickyBoard && <TranscriptNoteLayer
          ref={stickyBoardRef}
          notes={stickyNotes}
          projectId={cloudProject.id}
          currentUser={viewingAsUser ? { uid: viewingAsUser.id, displayName: viewingAsUser.name } : user}
          activeTranscriptId={activeTranscriptId}
          codebookFilter={sidebarCodeFilter}
          onSyncStatusChange={setCloudSyncStatus}
          showTeamNotes={showTeamNotes}
          containerRef={mainWorkspaceRef}
          readOnly={!!viewingAsUser}
          onConfirm={(title, msg, cb) => showConfirm(title, msg, 'confirm').then(ok => ok && cb())}
        />
        }

        {/* Left Sidebar */}
        {activeView !== 'analysis' && activeView !== 'memos' && (
          <div className="border-r border-[var(--border)] bg-[var(--bg-panel)] flex flex-col shadow-inner z-10 shrink-0 transition-all duration-200" style={{ width: sidebarWidth }}>


            {/* Transcripts List */}
            <div className="flex-shrink-0 border-b border-[var(--border)] flex flex-col max-h-[40%]">
              <div className="p-3 pb-2 flex justify-between items-center">
                <h3 className="font-bold text-xs uppercase text-[var(--text-muted)] tracking-wider">Documents</h3>
                <label className="cursor-pointer hover:bg-[var(--bg-main)] p-1 rounded text-[var(--accent)] transition-colors" title="Import Document">
                  <Plus size={16} />
                  <input type="file" className="hidden" accept=".txt,.docx,.pdf" onChange={handleTranscriptUpload} />
                </label>
              </div>
              <div className="overflow-y-auto px-2 pb-2 space-y-1">
                {project.transcripts.map(t => (
                  <div
                    key={t.id}
                    className={`group relative px-3 py-2 rounded-md cursor-pointer text-sm transition-all border border-transparent flex justify-between items-center ${activeTranscriptId === t.id ? 'bg-[var(--bg-main)] border-[var(--border)] shadow-sm text-[var(--accent)] font-medium' : 'hover:bg-[var(--bg-main)] text-[var(--text-main)]'}`}
                    onClick={() => setActiveTranscriptId(t.id)}
                  >
                    <div className="flex items-center truncate">
                      <FileText size={14} className="mr-2 opacity-50" />
                      <span className="truncate">{t.name}</span>
                    </div>
                    <button
                      className="p-1 hover:bg-[var(--border)] rounded opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTranscriptMenu({ id: t.id, x: rect.right + 5, y: rect.top });
                      }}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Code Tree */}
            <div className="flex-1 overflow-hidden flex flex-col bg-[var(--bg-panel)] border-t border-[var(--border)]">
              <div className="p-3 pb-2 flex justify-between items-center flex-shrink-0 z-10">
                <h3 className="font-bold text-xs uppercase text-[var(--text-muted)] tracking-wider">Codes</h3>
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); exportCodebook(project.codes); }}
                    className="hover:bg-[var(--bg-main)] p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)]"
                    title="Export Codebook"
                  >
                    <Download size={14} />
                  </button>
                  <button onClick={() => {
                    let type: 'master' | 'personal' | 'suggested' = !cloudProject ? 'personal' : sidebarCodeFilter as any;
                    // If non-admin is on master tab, create a suggested code instead
                    if (cloudProject && type === 'master' && !isProjectAdmin) {
                      type = 'suggested';
                    }
                    createCode(type);
                  }} className="hover:bg-[var(--bg-main)] p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)]" title={cloudProject ? (sidebarCodeFilter === 'master' ? (isProjectAdmin ? 'Create Master Code' : 'Create Suggested Code') : 'Create Personal Code') : 'Create Code'}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Codebook Type Dropdown */}
              {cloudProject && (
                <div className="px-3 pb-2">
                  <select
                    value={sidebarCodeFilter}
                    onChange={(e) => setSidebarCodeFilter(e.target.value as 'master' | 'personal')}
                    className="w-full text-xs font-semibold p-1.5 rounded border border-[var(--border)] bg-[var(--bg-main)] text-[var(--text-main)] focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)] cursor-pointer"
                  >
                    <option value="master">Master Codebook</option>
                    <option value="personal">Personal Codebook</option>
                  </select>
                </div>
              )}

              {/* Code Search Bar */}
              <div className="px-3 pb-2">
                <input
                  type="text"
                  placeholder="Filter codes..."
                  className="w-full text-xs p-1.5 rounded border border-[var(--border)] bg-[var(--bg-main)] text-[var(--text-main)] focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                  value={codeSearchQuery}
                  onChange={(e) => setCodeSearchQuery(e.target.value)}
                />
              </div>

              <div className="px-3 pb-2">
                <label className="flex items-center justify-center w-full py-1.5 border border-dashed border-[var(--border)] rounded text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)] cursor-pointer transition-colors">
                  <Upload size={12} className="mr-2" /> Import Codebook
                  <input type="file" className="hidden" accept=".csv,.tsv,.xlsx,.xls" onChange={handleImportCodes} />
                </label>
              </div>

              {/* Code List with Click-to-Deselect Background */}
              <div
                className="flex-1 overflow-y-auto px-2"
                onClick={() => setActiveCodeId(null)}
              >
                <CodeTree
                  codes={!cloudProject ? project.codes : project.codes.filter(c => {
                    const type = c.type || 'personal';
                    if (sidebarCodeFilter === 'master') return type === 'master' || type === 'suggested';
                    return type === 'personal';
                  })}
                  activeCodeId={activeCodeId}
                  hiddenCodeIds={hiddenCodeIds}
                  onToggleVisibility={(id) => {
                    setHiddenCodeIds(prev => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                  onSelectCode={(id) => { setActiveCodeId(id); }}
                  onUpdateCode={(id, up) => {
                    const updatedCodes = project.codes.map(c => c.id === id ? { ...c, ...up } : c);
                    handleProjectUpdate({ ...project, codes: updatedCodes });
                    if (cloudProject) {
                      const code = updatedCodes.find(c => c.id === id);
                      if (code && (code.type === 'master' || code.type === 'suggested')) {
                        saveSharedCode(cloudProject.id, code).catch(console.error);
                      }
                    }
                  }}
                  onDeleteCode={(id) => {
                    handleProjectUpdate({
                      ...project,
                      codes: project.codes.filter(c => c.id !== id),
                      selections: project.selections.filter(s => s.codeId !== id),
                      transcripts: project.transcripts.map(t => ({ ...t, content: removeHighlightsForCode(t.content, id) }))
                    });
                    if (cloudProject) {
                      // Check if it was a shared code before deleting (we invoke delete regardless, it's safe)
                      // Ideally check type but ID-based delete is fine for cleanup
                      deleteSharedCode(cloudProject.id, id).catch(console.error);
                    }
                  }}
                  onMergeCode={(src, tgt) => {
                    handleProjectUpdate(mergeCodesInProject(project, src, tgt));
                    if (cloudProject) {
                      deleteSharedCode(cloudProject.id, src).catch(console.error);
                    }
                  }}
                  searchQuery={codeSearchQuery}
                  onConfirm={(title, message, callback) => {
                    showConfirm(title, message, 'confirm').then(confirmed => {
                      if (confirmed) callback();
                    });
                  }}
                />
              </div>

            </div>
          </div>
        )}

        {/* Center Content */}
        <div className="flex-1 overflow-hidden relative flex flex-col bg-[var(--bg-main)]">
          {activeView === 'editor' && (
            <>
              <div className="h-10 border-b border-[var(--border)] bg-[var(--bg-panel)] flex items-center justify-end px-4 gap-2">
                {cloudProject && (
                  <button
                    onClick={() => setShowTeamNotes(!showTeamNotes)}
                    className={`text-xs font-bold flex items-center gap-1 px-2 py-1 rounded transition-colors ${showTeamNotes ? 'bg-purple-100 text-purple-700' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}
                    title="Toggle visibility of team members' notes"
                  >
                    <Users size={14} /> {showTeamNotes ? 'Team Notes: ON' : 'Team Notes: OFF'}
                  </button>
                )}
                <div className="w-px h-4 bg-[var(--border)] mx-1"></div>

                <button
                  onClick={() => activeTranscript && printTranscript(activeTranscript, project, (msg) => showAlert('Popup Blocked', msg))}
                  className="text-xs font-bold flex items-center gap-1 px-2 py-1 rounded text-[var(--text-muted)] hover:bg-[var(--bg-main)]"
                  title="Export PDF / Print"
                >
                  <Printer size={14} /> Print / PDF
                </button>
                <button
                  onClick={() => setShowMemoSidebar(!showMemoSidebar)}
                  className={`text-xs font-bold flex items-center gap-1 px-2 py-1 rounded transition-colors ${showMemoSidebar ? 'bg-[var(--accent)] text-[var(--accent-text)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}
                >
                  <FileText size={14} /> {showMemoSidebar ? 'Hide Memos' : 'Show Memos'}
                </button>
              </div>
              <div className="flex-1 overflow-hidden flex">
                <div className="flex-1">
                  <Editor
                    onAlert={showAlert}
                    onConfirm={(title, msg, cb) => showConfirm(title, msg, 'confirm').then(ok => ok && cb())}
                    activeTranscript={activeTranscript}
                    activeCode={activeCode}
                    onSelectionCreate={handleSelectionCreate}
                    onSelectionDelete={handleSelectionDelete}
                    onSaveProject={handleSaveProject}
                    onCreateInVivoCode={(text, transcriptId) => {
                      // In-vivo coding: create a new code named after the selected text
                      const type = (sidebarCodeFilter === 'master' && isProjectAdmin) ? 'master' : 'personal';

                      // If creating a personal code while in master view, switch view so user sees it
                      if (sidebarCodeFilter === 'master' && type === 'personal') {
                        setSidebarCodeFilter('personal');
                      }

                      const newCode: Code = {
                        id: generateId(),
                        name: text.substring(0, 50),
                        color: generateColor(project.codes.filter(c => !c.parentId).length),
                        description: `In-vivo code created from: "${text}"`,
                        type,
                        createdBy: user?.uid
                      };
                      handleProjectUpdate({ ...project, codes: [...project.codes, newCode] });
                      setActiveCodeId(newCode.id);
                    }}
                    onAnnotateSelection={(selId, annotation) => {
                      handleProjectUpdate({
                        ...project,
                        selections: project.selections.map(s =>
                          s.id === selId ? { ...s, annotation } : s
                        )
                      });
                    }}
                    settings={appSettings}
                    codes={project.codes}
                    selections={project.selections}
                    codebookFilter={sidebarCodeFilter}
                    hiddenCodeIds={hiddenCodeIds}
                    // Editor Props
                    canEditDirectly={isProjectAdmin}
                    readOnly={!!viewingAsUser}
                    isEditing={isEditing}
                    onSaveContent={async (newContent) => {
                      if (!!viewingAsUser) return; // Guard against saving in read-only mode
                      if (!activeTranscriptId) return;

                      // Change Control for Non-Admins
                      if (cloudProject && !isProjectAdmin) {
                        if (activeTranscript && activeTranscript.content !== newContent) {
                          // Prompt user for description? Or just submit.
                          if (await showConfirm('Submit Changes?', 'You are a non-admin. Your changes will be submitted for review.', 'confirm')) {
                            await submitChangeRequest(cloudProject.id, {
                              id: crypto.randomUUID(),
                              projectId: cloudProject.id,
                              transcriptId: activeTranscriptId,
                              transcriptName: activeTranscript.name,
                              userId: user?.uid || 'unknown',
                              userName: user?.displayName || 'User',
                              changeType: 'edit',
                              content: newContent,
                              originalContent: activeTranscript.content,
                              timestamp: Date.now(),
                              status: 'pending'
                            });
                            showAlert("Changes Submitted", "Your edits have been sent to the admins for review.");
                            setIsEditing(false); // Exit edit mode
                          }
                        }
                        return;
                      }

                      // If cloud project, update transcript content in cloud immediately
                      if (cloudProject) {
                        updateCloudTranscript(cloudProject.id, activeTranscriptId, { content: newContent }).catch(console.error);

                        // Save a document snapshot for version history
                        if (isProjectAdmin && activeTranscript) {
                          saveDocumentSnapshot(cloudProject.id, {
                            id: crypto.randomUUID(),
                            projectId: cloudProject.id,
                            transcriptId: activeTranscriptId,
                            transcriptName: activeTranscript.name,
                            content: activeTranscript.content, // Save the OLD content as snapshot
                            savedBy: user?.uid || 'unknown',
                            savedByName: user?.displayName || 'Admin',
                            timestamp: Date.now(),
                            description: 'Before admin edit',
                            version: Date.now()
                          }).catch(console.error);

                          // Log activity
                          logVersionControlEvent(cloudProject.id, {
                            id: crypto.randomUUID(),
                            projectId: cloudProject.id,
                            eventType: 'document_edit',
                            userId: user?.uid || 'unknown',
                            userName: user?.displayName || 'Admin',
                            timestamp: Date.now(),
                            description: `Edited document "${activeTranscript.name}"`
                          }).catch(console.error);

                          // Notify everyone about the document change
                          sendNotification(cloudProject.id, {
                            id: crypto.randomUUID(),
                            projectId: cloudProject.id,
                            type: 'document_change',
                            title: 'Document Edited',
                            message: `${user?.displayName || 'Admin'} edited "${activeTranscript.name}". You can accept or reject this change.`,
                            timestamp: Date.now(),
                            fromUserId: user?.uid || 'unknown',
                            fromUserName: user?.displayName || 'Admin',
                            targetUserIds: [],
                            readBy: [user?.uid || ''],
                            relatedEntityId: activeTranscriptId,
                            relatedEntityType: 'transcript'
                          }).catch(console.error);
                        }
                      }

                      const updatedTranscript = { ...activeTranscript!, content: newContent };

                      // Update project with new content — reconcile selections, preserving codes on unmodified lines
                      handleProjectUpdate({
                        ...project,
                        transcripts: project.transcripts.map(t => t.id === activeTranscriptId ? updatedTranscript : t),
                        selections: reconcileSelectionsAfterEdit(
                          activeTranscript!.content, newContent, project.selections, activeTranscriptId
                        )
                      });
                      setIsEditing(false);
                    }}
                    onCancelEdit={() => setIsEditing(false)}
                    onAutoSave={(newContent) => {
                      if (!activeTranscriptId) return;

                      // Identify if content actually changed to avoid redundant saves
                      if (activeTranscript && activeTranscript.content === newContent) return;

                      // If cloud project, update transcript content in cloud immediately
                      if (cloudProject) {
                        // Non-admin check for Request Submission (Change Control)
                        if (!isProjectAdmin) {
                          // For now, we allow auto-save while typing to NOT trigger requests repeatedly.
                          // But for the final save (ctrl+s or explicit), we trigger request.
                          // However, onAutoSave fires frequently. We should ONLY intercept explicit saves or handle this carefully.
                          // ACTUALLY: The prompt says "On document edit come up with a similar proposition."
                          // If we block autosave for non-admins, they lose their work if they don't hit save.
                          // Better strategy: Let them edit locally, but when it *saves to cloud* (sync), intercept?
                          // No, onSaveContent is called on Ctrl+S or explicit save.
                          // onAutoSave is called periodically.
                          // We should probably BLOCK direct cloud updates in onAutoSave if !admin?
                          // If !admin, we can't updateCloudTranscript.
                          return; // Do nothing for auto-save if non-admin to prevent unauthorized writes log spam
                        }

                        // We don't set global 'saving' status here to avoid UI flickering, 
                        // but we could. For now, rely on the fact that handleProjectUpdate triggers the main auto-save loop 
                        // which WILL trigger saveToCloud (metadata). 
                        // We MUST update the text content in Firestore though.
                        if (isProjectAdmin) {
                          updateCloudTranscript(cloudProject.id, activeTranscriptId, { content: newContent }).catch(console.error);
                        } else {
                          return; // Stop here, do not update local state
                        }
                      }

                      const updatedTranscript = { ...activeTranscript!, content: newContent };

                      // Update project with new content — reconcile selections, preserving codes on unmodified lines
                      handleProjectUpdate({
                        ...project,
                        transcripts: project.transcripts.map(t => t.id === activeTranscriptId ? updatedTranscript : t),
                        selections: reconcileSelectionsAfterEdit(
                          activeTranscript!.content, newContent, project.selections, activeTranscriptId
                        )
                      }, false); // false = don't add to history
                    }}

                    // Sticky Notes
                    stickyNotes={stickyNotes}
                    showTeamNotes={showTeamNotes}
                    showStickyBoard={showStickyBoard}
                    onCloseStickyBoard={() => setShowStickyBoard(false)}
                    currentUserId={viewingAsUser ? viewingAsUser.id : user?.uid}
                    onAddStickyNote={(note) => {
                      if (!!viewingAsUser) return; // Prevent adding notes as another user
                      if (cloudProject) {
                        addStickyNote(cloudProject.id, note).catch(console.error);
                      } else {
                        // Local handling (optional, or just alert not supported yet)
                        alert("Sticky notes are currently only available in Cloud Projects.");
                      }
                    }}
                    onUpdateStickyNote={(id, updates) => {
                      if (cloudProject) {
                        updateStickyNote(cloudProject.id, id, updates).catch(console.error);
                      }
                    }}
                    onDeleteStickyNote={(id) => {
                      if (cloudProject) {
                        deleteStickyNote(cloudProject.id, id).catch(console.error);
                      }
                    }}
                    projectId={cloudProject?.id}
                  />
                </div>
              </div>
            </>
          )}

          {activeView === 'codebook' && (
            <Codebook
              codes={project.codes}
              hiddenCodeIds={hiddenCodeIds}
              onToggleVisibility={(id) => {
                setHiddenCodeIds(prev => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }}
              onUpdateCode={(id, up) => {
                const oldCode = project.codes.find(c => c.id === id);
                handleProjectUpdate({ ...project, codes: project.codes.map(c => c.id === id ? { ...c, ...up } : c) });

                // Log History
                if (cloudProject && user && oldCode) {
                  logCodeHistory(cloudProject.id, {
                    id: crypto.randomUUID(),
                    codeId: id,
                    projectId: cloudProject.id,
                    previousData: oldCode,
                    newData: { ...oldCode, ...up },
                    changeType: 'update',
                    userId: user.uid,
                    userName: user.displayName || 'Me',
                    timestamp: Date.now(),
                    description: `Updated ${Object.keys(up).join(', ')}`
                  });
                  // Sync update
                  const isDraft = oldCode.type === 'suggested' && oldCode.status === 'draft';
                  const isPromoting = up.type === 'master';
                  const isPublishing = up.status === 'proposed';

                  if (oldCode.type === 'master' || (!isDraft) || isPromoting || isPublishing) {
                    saveSharedCode(cloudProject.id, { ...oldCode, ...up }).catch(console.error);
                  }

                  // Notify if promoting
                  if (oldCode.type === 'suggested' && up.type === 'master') {
                    sendNotification(cloudProject.id, {
                      id: crypto.randomUUID(),
                      projectId: cloudProject.id,
                      type: 'codebook_change',
                      title: 'Suggestion Accepted',
                      message: `${user.displayName || 'Admin'} accepted the suggestion "${oldCode.name}" and promoted it to Master.`,
                      timestamp: Date.now(),
                      fromUserId: user.uid,
                      fromUserName: user.displayName || 'Admin',
                      targetUserIds: [], // To everyone
                      readBy: [user.uid]
                    }).catch(console.error);
                  }
                }
              }}
              onDeleteCode={(id) => {
                const code = project.codes.find(c => c.id === id);
                handleProjectUpdate({
                  ...project,
                  codes: project.codes.filter(c => c.id !== id),
                  selections: project.selections.filter(s => s.codeId !== id),
                  transcripts: project.transcripts.map(t => ({ ...t, content: removeHighlightsForCode(t.content, id) }))
                });
                if (cloudProject && user && code) {
                  logCodeHistory(cloudProject.id, {
                    id: crypto.randomUUID(),
                    codeId: id,
                    projectId: cloudProject.id,
                    previousData: code,
                    newData: {},
                    changeType: 'delete',
                    userId: user.uid,
                    userName: user.displayName || 'Me',
                    timestamp: Date.now(),
                    description: `Deleted code ${code.name}`
                  });
                  // Sync deletion
                  if (code.type === 'master' || code.type === 'suggested') {
                    deleteSharedCode(cloudProject.id, id).catch(console.error);
                  }
                }
              }}
              onCreateCode={(type) => {
                createCode(type);
                // History logging for creation is tricky because createCode doesn't return the ID immediately here easily without refactoring.
                // For now we skip creation log or move it to createCode.
              }}
              onMergeCode={(src, tgt) => {
                handleProjectUpdate(mergeCodesInProject(project, src, tgt));
                if (cloudProject && user) {
                  logCodeHistory(cloudProject.id, {
                    id: crypto.randomUUID(),
                    codeId: src,
                    projectId: cloudProject.id,
                    previousData: { id: src },
                    newData: { id: tgt },
                    changeType: 'merge',
                    userId: user.uid,
                    userName: user.displayName || 'Me',
                    timestamp: Date.now(),
                    description: `Merged into ${tgt}`
                  });
                  deleteSharedCode(cloudProject.id, src).catch(console.error);
                }
              }}
              currentUser={user || undefined}
              isAdmin={isProjectAdmin}
              projectId={cloudProject?.id}
            />
          )}

          {activeView === 'analysis' && (
            <AnalysisView
              project={project}
              onClose={() => setActiveView('editor')}
              onExport={() => exportProjectData(project)}
              cloudProjectId={cloudProject?.id}
              currentUserId={user?.uid}
              cloudProject={cloudProject}
            />
          )}

          {activeView === 'memos' && (
            <MemosView
              project={project}
              onUpdateProject={handleProjectUpdate}
              cloudProjectId={cloudProject?.id}
              currentUserId={user?.uid}
              readOnly={!!viewingAsUser}
            />
          )}
        </div>

        {/* Right Sidebar */}
        {showMemoSidebar && activeView === 'editor' && (
          <MemoSidebar
            project={project}
            activeTranscript={activeTranscript}
            onUpdateProject={handleProjectUpdate}
            onClose={() => setShowMemoSidebar(false)}
            readOnly={!!viewingAsUser}
          />
        )}

      </div>

      {/* Collaboration Panel (Cloud projects only) */}
      {/* Collaboration Panel (Cloud projects only) - Kept mounted to prevent listener crash on unmount */}
      {cloudProject && user && (
        <div className={showCollabPanel ? "block" : "hidden"}>
          <CollaborationPanel
            cloudProject={cloudProject}
            currentUserId={user.uid}
            codes={project.codes}
            transcripts={project.transcripts}
            chatMessages={chatMessages}
            allDirectMessages={allDirectMessages}
            onSendMessage={async (content, replyTo, mentions) => {
              if (user && cloudProject) {
                await sendChatMessage(cloudProject.id, {
                  id: crypto.randomUUID(),
                  content,
                  projectId: cloudProject.id,
                  senderId: user.uid,
                  senderName: user.displayName || 'User',
                  timestamp: Date.now(),
                  readBy: [user.uid],
                  ...(replyTo ? { replyTo } : {}),
                  ...(mentions ? { mentions } : {})
                });
              }
            }}
            onClose={() => setShowCollabPanel(false)}
            onViewCollaborator={handleViewCollaborator}
          />
        </div>
      )}

      {/* Version Control Panel */}




      {/* Floating Transcript Menu */}
      {transcriptMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setTranscriptMenu(null)} />
          <div
            className="fixed bg-[var(--bg-panel)] shadow-xl border border-[var(--border)] rounded z-50 w-32 py-1 flex flex-col animate-in fade-in zoom-in-95 duration-75"
            style={{ top: transcriptMenu.y, left: transcriptMenu.x }}
          >
            <button
              onClick={() => {
                if (viewingAsUser) {
                  showAlert("View Only", "Cannot edit in view-only mode.");
                  return;
                }
                if (transcriptMenu.id !== activeTranscriptId) {
                  setActiveTranscriptId(transcriptMenu.id);
                }
                setIsEditing(true);
                setTranscriptMenu(null);
              }}
              className={`px-3 py-2 text-left flex items-center gap-2 text-sm ${viewingAsUser ? 'text-slate-400 cursor-not-allowed' : 'hover:bg-[var(--bg-main)] text-[var(--text-main)]'}`}
            >
              <Edit2 size={12} /> Edit Text
            </button>
            <button
              onClick={() => { renameTranscript(transcriptMenu.id); setTranscriptMenu(null); }}
              className="px-3 py-2 hover:bg-[var(--bg-main)] text-left flex items-center gap-2 text-sm text-[var(--text-main)]"
            >
              <FileText size={12} /> Rename
            </button>
            <button
              onClick={() => { deleteTranscriptHandler(transcriptMenu.id); setTranscriptMenu(null); }}
              className="px-3 py-2 hover:bg-red-50 text-red-600 text-left flex items-center gap-2 text-sm"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </>
      )}

      {/* Modal Container */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
        showInput={confirmModal.showInput}
        inputPlaceholder={confirmModal.inputPlaceholder}
        inputValue={confirmModal.inputValue}
        onInputChange={handleModalInputChange}
        confirmLabel={confirmModal.confirmLabel}
      />

    </div>
  );
}