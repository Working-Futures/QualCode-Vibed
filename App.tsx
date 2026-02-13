import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Project, Code, Selection, Transcript, AppSettings, CloudProject, UserProjectData, StickyNote, ChatMessage, DirectMessage } from './types';
import { Editor } from './components/Editor';
import { CodeTree } from './components/CodeTree';
import { AnalysisView } from './components/AnalysisView';
import { Codebook } from './components/Codebook';
import { VisualSettings } from './components/VisualSettings';
import { ProjectLauncher } from './components/ProjectLauncher';
import { MemoSidebar } from './components/MemoSidebar';
import { StickyNoteBoard } from './components/StickyNoteBoard';
import { CollaborationPanel } from './components/CollaborationPanel';
// import { TranscriptEditorModal } from './components/TranscriptEditorModal';
import { useAuth } from './contexts/AuthContext';
import {
  getCloudProject,
  getTranscripts,
  getCodes,
  getUserProjectData,
  saveTranscript,
  saveCodes,
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
  logCodeHistory
} from './services/firestoreService';
import { parseTranscriptFile } from './utils/transcriptParser';
import { exportProjectData, parseCodebookFile, mergeCodesInProject, saveProjectFile, printTranscript, exportCodebook, generateId } from './utils/dataUtils';
import { removeHighlightsForCode, stripHighlights, restoreHighlights } from './utils/highlightUtils';
import { generateChildColor, generateColor } from './utils/colorUtils';
import { applyTheme } from './utils/themeUtils';
import { addToQueue, processQueue, getQueue } from './utils/offlineQueue';
import { Eye, Save, LogOut, Trash2, Edit2, FileText, MoreHorizontal, Upload, Plus, StickyNote as StickyNoteIcon, Printer, Download, Cloud, Users, Wifi, WifiOff, Clock } from 'lucide-react';



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
  const [activeView, setActiveView] = useState<'editor' | 'analysis' | 'codebook'>('editor');
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

  // Refs for auto-save logic
  const projectRef = useRef<Project | null>(null);

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

  // Debounce ref (unused now but kept if needed for other things, or removing)
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search States
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<{ transcriptId: string, lineIndex: number, text: string }[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [codeSearchQuery, setCodeSearchQuery] = useState('');

  // Subscribe to Collaboration Data (Chat & Sticky Notes & Codes)
  useEffect(() => {
    if (!cloudProject || !user) return;

    const unsubNotes = subscribeToStickyNotes(cloudProject.id, (notes) => {
      setStickyNotes(notes);
    });

    const unsubChat = subscribeToChatMessages(cloudProject.id, (msgs) => {
      setChatMessages(msgs);
    });

    const unsubCodes = subscribeToCodes(cloudProject.id, (codes) => {
      // Update local project codes when cloud codes change
      setProject(prev => prev ? { ...prev, codes } : null);
    });

    const unsubDms = subscribeToAllDirectMessages(cloudProject.id, user.uid, (msgs) => {
      setAllDirectMessages(msgs);
    });

    return () => {
      unsubNotes();
      unsubChat();
      unsubCodes();
      unsubDms();
    };
  }, [cloudProject?.id, user]);

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
      console.log('Autosaved project to browser storage');
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

  // ─── Cloud Auto-Save (Debounced) ───
  const saveToCloud = useCallback(async (
    currentProject: Project,
    currentCloudProject: CloudProject | null,
    currentUser: typeof user
  ) => {
    if (!currentCloudProject || !currentUser || viewingAsUser) return;

    setCloudSyncStatus('saving');
    try {
      // Save codes (shared codebook)
      await saveCodes(currentCloudProject.id, currentProject.codes);

      // Save user-specific data (selections + memos)
      const transcriptMemos: Record<string, string> = {};
      currentProject.transcripts.forEach(t => {
        if (t.memo) transcriptMemos[t.id] = t.memo;
      });

      await saveUserProjectData(currentCloudProject.id, currentUser.uid, {
        selections: currentProject.selections,
        transcriptMemos,
        personalMemo: currentProject.projectMemo || '',
      });

      // Update project metadata
      const updates = {
        lastModified: Date.now(),
        projectMemo: currentProject.projectMemo || '',
      };

      try {
        await updateCloudProject(currentCloudProject.id, updates);
      } catch (err) {
        console.warn("Failed immediate update, queueing..."); // Non-blocking if previous passed
        addToQueue({ type: 'update_project', projectId: currentCloudProject.id, updates });
      }

      lastSavedTime.current = currentProject.lastModified;
      setCloudSyncStatus('saved');
      setTimeout(() => setCloudSyncStatus('idle'), 2000);
    } catch (err) {
      console.warn('Cloud save error - adding to offline queue:', err);

      // Add all core parts to queue
      try {
        addToQueue({ type: 'save_codes', projectId: currentCloudProject.id, codes: currentProject.codes });
        addToQueue({
          type: 'save_user_data',
          projectId: currentCloudProject.id,
          userId: currentUser.uid,
          data: {
            selections: currentProject.selections,
            transcriptMemos: {}, // Re-calculated above but scoped there. Re-do here or accept slightly stale if complex.
            // Actually, reconstructing data is better.
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
    const handleOnline = () => {
      console.log("Back online, processing queue...");
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
      const [transcripts, codes, userData] = await Promise.all([
        getTranscripts(cp.id),
        getCodes(cp.id),
        getUserProjectData(cp.id, user.uid),
      ]);

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
      setProject(localProject);
      setActiveTranscriptId(localTranscripts.length > 0 ? localTranscripts[0].id : null);
      setIsEditing(false);
    } catch (err) {
      console.error('Error opening cloud project:', err);
      alert("Error opening cloud project. Please try again.");
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
      if (uniqueNewCodes.length < newCodes.length) alert(`Imported ${uniqueNewCodes.length} codes (skipped duplicates).`);
    } catch (err) {
      alert("Failed to parse codebook. Ensure headers are correct.");
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
      alert("Error importing file. Please check the file format.");
    }
  };

  const deleteTranscriptHandler = (id: string) => {
    if (confirm("Delete this transcript and all its highlights?")) {
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

  const renameTranscript = (id: string) => {
    const t = project.transcripts.find(tx => tx.id === id);
    if (!t) return;
    const newName = prompt("Rename transcript:", t.name);
    if (newName && newName.trim()) {
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
    handleProjectUpdate({
      ...project,
      selections: [...project.selections, newSelection],
      transcripts: project.transcripts.map(t => t.id === newSelection.transcriptId ? { ...t, content: updatedHtml } : t)
    });

    // Note: we do NOT save highlighted HTML to cloud — highlights are user-local.
    // The cloud transcript stores clean content. Selections are saved via userdata.
  };

  const handleSelectionDelete = (selectionId: string, updatedHtml: string) => {
    if (!activeTranscriptId) return;
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
      suggestedBy: type === 'suggested' ? user?.uid : undefined
    };

    handleProjectUpdate({ ...project, codes: [...project.codes, newCode] });
    setActiveCodeId(newCode.id);
  };

  const handleCloseProject = async () => {
    // Check if project is dirty (unsaved changes)
    const isDirty = project && project.lastModified > lastSavedTime.current;

    if (cloudProject && user && project && !viewingAsUser) {
      if (isDirty) {
        // If dirty, await the save so we don't close before it finishes
        // We set status to saving manually just in case ui is still visible
        setCloudSyncStatus('saving');
        await saveToCloud(project, cloudProject, user);
      }
      // Close immediateley after save (or if clean)
      setProject(null);
      setCloudProject(null);
      setShowCollabPanel(false);
      setViewingAsUser(null);
    } else {
      // Local Project: Always warn if closing (unless they explicitely handle it, but standard app behavior)
      if (confirm("Close project? Any unsaved changes will be lost.")) {
        setProject(null);
        setCloudProject(null);
        setShowCollabPanel(false);
        setViewingAsUser(null);
      }
    }
  };

  const handleViewCollaborator = async (userId: string, userName: string) => {
    if (!cloudProject || !project) return;
    setViewingAsUser({ id: userId, name: userName });
    setIsEditing(false);

    // Fetch their data
    try {
      const data = await getUserProjectData(cloudProject.id, userId);
      if (data) {
        const updatedTranscripts = project.transcripts.map(t => ({
          ...t,
          memo: data.transcriptMemos[t.id] || ''
        }));

        setProject({
          ...project,
          selections: data.selections,
          transcripts: updatedTranscripts,
          projectMemo: data.personalMemo || ''
        });
      }
    } catch (e) {
      console.error("Error loading user data", e);
      alert("Failed to load user view.");
      setViewingAsUser(null);
    }
  };

  const handleExitViewMode = async () => {
    if (!cloudProject || !user || !project) {
      setViewingAsUser(null);
      return;
    }

    setViewingAsUser(null);
    // Restore my data
    try {
      const data = await getUserProjectData(cloudProject.id, user.uid);
      if (data) {
        const updatedTranscripts = project.transcripts.map(t => ({
          ...t,
          memo: data.transcriptMemos[t.id] || ''
        }));

        setProject({
          ...project,
          selections: data.selections,
          transcripts: updatedTranscripts,
          projectMemo: data.personalMemo || ''
        });
      }
    } catch (e) {
      console.error("Error restoring my data", e);
      alert("Error restoring your data. Please reload the project.");
    }
  };

  const handleSaveProject = async () => {
    if (!project) return;

    if (viewingAsUser) {
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
            {(['editor', 'codebook', 'analysis'] as const).map(view => (
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
      {showStickyBoard && cloudProject && user && (
        <StickyNoteBoard
          notes={stickyNotes}
          projectId={cloudProject.id}
          currentUser={user}
          activeTranscriptId={activeTranscriptId}
          onClose={() => setShowStickyBoard(false)}
          showAllUsers={showTeamNotes}
        />
      )}

      {/* Visual Settings Overlay */}
      {showVisualSettings && (
        <VisualSettings settings={appSettings} onUpdate={setAppSettings} />
      )}

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left Sidebar */}
        {activeView !== 'analysis' && (
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
                  <button onClick={() => createCode()} className="hover:bg-[var(--bg-main)] p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)]" title="Create Code (Select existing to nest)">
                    <Plus size={14} />
                  </button>
                </div>
              </div>

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
                  codes={project.codes}
                  activeCodeId={activeCodeId}
                  onSelectCode={(id) => { setActiveCodeId(id); }}
                  onUpdateCode={(id, up) => handleProjectUpdate({ ...project, codes: project.codes.map(c => c.id === id ? { ...c, ...up } : c) })}
                  onDeleteCode={(id) => {
                    handleProjectUpdate({
                      ...project,
                      codes: project.codes.filter(c => c.id !== id),
                      selections: project.selections.filter(s => s.codeId !== id),
                      transcripts: project.transcripts.map(t => ({ ...t, content: removeHighlightsForCode(t.content, id) }))
                    });
                  }}
                  onMergeCode={(src, tgt) => handleProjectUpdate(mergeCodesInProject(project, src, tgt))}
                  searchQuery={codeSearchQuery}
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
                  onClick={() => activeTranscript && printTranscript(activeTranscript, project)}
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
                    activeTranscript={activeTranscript}
                    activeCode={activeCode}
                    onSelectionCreate={handleSelectionCreate}
                    onSelectionDelete={handleSelectionDelete}
                    onSaveProject={handleSaveProject}
                    onCreateInVivoCode={(text, transcriptId) => {
                      // In-vivo coding: create a new code named after the selected text
                      const newCode: Code = {
                        id: generateId(),
                        name: text.substring(0, 50),
                        color: generateColor(project.codes.filter(c => !c.parentId).length),
                        description: `In-vivo code created from: "${text}"`
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
                    // Editor Props
                    canEditDirectly={isProjectAdmin}
                    readOnly={!!viewingAsUser}
                    isEditing={isEditing}
                    onSaveContent={(newContent) => {
                      if (!!viewingAsUser) return; // Guard against saving in read-only mode
                      if (!activeTranscriptId) return;
                      // If cloud project, update transcript content in cloud immediately
                      if (cloudProject) {
                        updateCloudTranscript(cloudProject.id, activeTranscriptId, { content: newContent }).catch(console.error);
                      }

                      const updatedTranscript = { ...activeTranscript!, content: newContent };

                      // Update project with new content and remove selections for this transcript (since they are now invalid)
                      handleProjectUpdate({
                        ...project,
                        transcripts: project.transcripts.map(t => t.id === activeTranscriptId ? updatedTranscript : t),
                        selections: project.selections.filter(s => s.transcriptId !== activeTranscriptId)
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
                        // We don't set global 'saving' status here to avoid UI flickering, 
                        // but we could. For now, rely on the fact that handleProjectUpdate triggers the main auto-save loop 
                        // which WILL trigger saveToCloud (metadata). 
                        // We MUST update the text content in Firestore though.
                        if (isProjectAdmin) {
                          updateCloudTranscript(cloudProject.id, activeTranscriptId, { content: newContent }).catch(console.error);
                        } else {
                          // Submit Change Request for non-admins
                          const request = {
                            id: crypto.randomUUID(),
                            projectId: cloudProject.id,
                            transcriptId: activeTranscriptId,
                            transcriptName: activeTranscript?.name || 'Unknown',
                            userId: user?.uid || 'unknown',
                            userName: user?.displayName || 'Anonymous',
                            content: newContent,
                            originalContent: activeTranscript?.content || '',
                            timestamp: Date.now(),
                            status: 'pending' as const
                          };
                          submitChangeRequest(cloudProject.id, request).then(() => {
                            alert("Since you are not an admin, your changes have been submitted as a request.");
                            setIsEditing(false);
                          }).catch(err => {
                            console.error("Failed to submit request", err);
                            alert("Failed to submit change request.");
                          });
                          return; // Stop here, do not update local state
                        }
                      }

                      const updatedTranscript = { ...activeTranscript!, content: newContent };

                      // Update project with new content WITHOUT adding to history stack (debounce handles history if needed, or we just don't history auto-saves)
                      // We also remove selections because offsets are invalid.
                      handleProjectUpdate({
                        ...project,
                        transcripts: project.transcripts.map(t => t.id === activeTranscriptId ? updatedTranscript : t),
                        selections: project.selections.filter(s => s.transcriptId !== activeTranscriptId)
                      }, false); // false = don't add to history
                    }}

                    // Sticky Notes
                    stickyNotes={stickyNotes}
                    showTeamNotes={showTeamNotes}
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
                  />
                </div>
              </div>
            </>
          )}

          {activeView === 'codebook' && (
            <Codebook
              codes={project.codes}
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
                }
              }}
              onDeleteCode={(id) => {
                const code = project.codes.find(c => c.id === id);
                handleProjectUpdate({ ...project, codes: project.codes.filter(c => c.id !== id) });
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
                }
              }}
              currentUser={user || undefined}
              isAdmin={!!cloudProject && cloudProject.ownerId === user?.uid}
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
        </div>

        {/* Right Sidebar */}
        {showMemoSidebar && activeView === 'editor' && (
          <MemoSidebar
            project={project}
            activeTranscript={activeTranscript}
            onUpdateProject={handleProjectUpdate}
            onClose={() => setShowMemoSidebar(false)}
          />
        )}

      </div>

      {/* Collaboration Panel (Cloud projects only) */}
      {showCollabPanel && cloudProject && user && (
        <CollaborationPanel
          cloudProject={cloudProject}
          currentUserId={user.uid}
          codes={project.codes}
          transcripts={project.transcripts}
          chatMessages={chatMessages}
          allDirectMessages={allDirectMessages}
          onSendMessage={(content, replyTo, mentions) => user && cloudProject && sendChatMessage(cloudProject.id, {
            id: crypto.randomUUID(),
            content,
            projectId: cloudProject.id,
            senderId: user.uid,
            senderName: user.displayName || 'User',
            timestamp: Date.now(),
            readBy: [user.uid],
            ...(replyTo ? { replyTo } : {}),
            ...(mentions ? { mentions } : {})
          })}
          onClose={() => setShowCollabPanel(false)}
          onViewCollaborator={handleViewCollaborator}
        />
      )}



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
                  alert("Cannot edit in view-only mode.");
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

    </div>
  );
}