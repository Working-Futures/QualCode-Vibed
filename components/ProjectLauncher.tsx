import React, { useState, useEffect } from 'react';
import { HardDrive, FilePlus, Clock, FileText, X, Cloud, LogIn, LogOut, Mail, Check, XCircle, Users, Trash2, UserPlus } from 'lucide-react';
import { Project, CloudProject, Invitation } from '../types';
import { ConfirmationModal, ModalType } from './ConfirmationModal';
import { useAuth } from '../contexts/AuthContext';
import {
  getUserProjects,
  createCloudProject,
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
  deleteCloudProject,
  saveUserProfile,
} from '../services/firestoreService';

interface Props {
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
  onOpenCloudProject: (cloudProject: CloudProject) => void;
}

const RECENTS_KEY = 'qualilab_recent_files';

interface RecentFile {
  name: string;
  date: number;
}

export const ProjectLauncher: React.FC<Props> = ({ onOpenProject, onCreateProject, onOpenCloudProject }) => {
  const { user, signInWithGoogle, signOut } = useAuth();
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudProject[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [activeTab, setActiveTab] = useState<'local' | 'cloud'>('cloud');
  const [showNewCloudDialog, setShowNewCloudDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  // Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type?: ModalType;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    onCancel: () => { }
  });

  const openAlert = (title: string, message: string, type: ModalType = 'alert') => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      type,
      confirmLabel: 'OK',
      onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
      onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
    });
  };

  const openConfirm = (title: string, message: string, onConfirm: () => void, type: ModalType = 'confirm', confirmLabel = 'Confirm') => {
    setModalConfig({
      isOpen: true,
      title,
      message,
      type,
      confirmLabel,
      onConfirm: () => {
        onConfirm();
        setModalConfig(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
    });
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(RECENTS_KEY);
    if (saved) setRecents(JSON.parse(saved));
  }, []);

  // Load cloud projects & invitations when user signs in
  useEffect(() => {
    if (user) {
      setActiveTab('cloud');
      loadCloudData();
    } else {
      setCloudProjects([]);
      setInvitations([]);
    }
  }, [user]);

  const loadCloudData = async () => {
    if (!user?.email) return;
    setLoadingCloud(true);
    try {
      const [projects, invites] = await Promise.all([
        getUserProjects(user.email),
        getMyInvitations(user.email),
      ]);
      setCloudProjects(projects.sort((a, b) => b.lastModified - a.lastModified));
      setInvitations(invites);
    } catch (err) {
      console.error('Error loading cloud data:', err);
    } finally {
      setLoadingCloud(false);
    }
  };

  const addToRecents = (name: string) => {
    const newItem = { name, date: Date.now() };
    const updated = [newItem, ...recents.filter(r => r.name !== name)].slice(0, 5);
    setRecents(updated);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  };

  const processFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.id || !data.transcripts) {
        openAlert("Invalid File", "Invalid .qlab file format.", 'alert');
        return;
      }
      addToRecents(data.name);
      onOpenProject(data);
    } catch (err) {
      openAlert("Error", "Error opening file. It may be corrupted.", 'alert');
    }
  };

  const loadAutosave = async () => {
    const saved = localStorage.getItem('autosave_project');
    if (saved) {
      openConfirm("Recover Project", "Found an unsaved project recovered from browser storage. Would you like to load it?", async () => {
        const p = JSON.parse(saved);
        if (p.isCloud && p.cloudProjectId && user) {
          setLoadingCloud(true);
          try {
            const cp = await import('../services/firestoreService').then(m => m.getCloudProject(p.cloudProjectId));
            if (cp) {
              onOpenCloudProject(cp);
            } else {
              openAlert("Connection Failed", "Could not reconnect to cloud project. Opening as local copy.", 'alert');
              onOpenProject(p);
            }
          } catch (e) {
            console.error(e);
            onOpenProject(p); // Fallback
          } finally {
            setLoadingCloud(false);
          }
        } else {
          onOpenProject(p);
        }
      });
    } else {
      openAlert("No Recovery Data", "No recovered project found.", 'info');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleCreateCloudProject = async () => {
    if (!user || !newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      // Save user profile on first project creation
      await saveUserProfile({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'User',
        photoURL: user.photoURL || '',
        createdAt: Date.now(),
      });

      const projectId = await createCloudProject(
        newProjectName.trim(),
        user.uid,
        user.email || '',
        user.displayName || 'User'
      );
      setShowNewCloudDialog(false);
      setNewProjectName('');
      await loadCloudData();

      // Open the project immediately
      const created = cloudProjects.find(p => p.id === projectId);
      if (created) {
        onOpenCloudProject(created);
      } else {
        // Reload and open
        const projects = await getUserProjects(user.email!);
        const newProject = projects.find(p => p.id === projectId);
        if (newProject) onOpenCloudProject(newProject);
      }
    } catch (err) {
      console.error(err);
      openAlert("Creation Error", "Error creating cloud project.", 'alert');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleAcceptInvitation = async (inv: Invitation) => {
    if (!user) return;
    try {
      await acceptInvitation(inv, user.uid, user.email || '', user.displayName || 'User');
      await loadCloudData();
    } catch (err) {
      console.error(err);
      openAlert("Invitation Error", "Error accepting invitation.", 'alert');
    }
  };

  const handleDeclineInvitation = async (inv: Invitation) => {
    try {
      await declineInvitation(inv.id);
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCloudProject = async (projectId: string, projectName: string) => {
    openConfirm("Delete Project", `Delete "${projectName}" permanently from the cloud? This cannot be undone.`, async () => {
      try {
        await deleteCloudProject(projectId);
        await loadCloudData();
      } catch (err) {
        console.error(err);
        openAlert("Delete Error", "Error deleting project.", 'alert');
      }
    }, 'danger', 'Delete Project');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".qlab,.json"
        style={{ display: 'none' }}
      />

      <div className="w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex h-[650px] border border-[var(--border)]">
        {/* Left Panel */}
        <div className="w-2/5 p-8 flex flex-col justify-between" style={{ backgroundColor: 'var(--bg-header)', color: '#ffffff' }}>
          <div>
            <div className="mb-6">
              <h1 className="text-3xl font-bold">QualCode Vibed</h1>
              <p className="opacity-70 text-sm">Qualitative Analysis Tool</p>
            </div>

            {/* Auth Section */}
            {user ? (
              <div className="bg-slate-800 rounded-xl p-4 mb-6 border border-slate-700">
                <div className="flex items-center gap-3 mb-3">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border-2 border-blue-500" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold">
                      {(user.displayName || user.email || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{user.displayName}</p>
                    <p className="text-xs text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={signOut}
                  className="w-full py-1.5 text-xs text-slate-400 hover:text-red-400 flex items-center justify-center gap-1 transition-colors"
                >
                  <LogOut size={12} /> Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="w-full py-4 px-6 bg-white/10 hover:bg-white/20 rounded-xl flex items-center space-x-3 transition-all border border-slate-700 hover:border-slate-500 group mb-6"
              >
                <div className="bg-white p-2 rounded-lg">
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                </div>
                <div className="text-left">
                  <span className="block font-bold text-slate-200">Sign in with Google</span>
                  <span className="text-xs text-slate-400">Enable cloud sync & collaboration</span>
                </div>
              </button>
            )}

            {/* Tab Toggle */}
            <div className="flex bg-black/20 rounded-lg p-1 mb-6">
              <button
                onClick={() => setActiveTab('cloud')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'cloud'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-white/50 hover:text-white'
                  }`}
              >
                <Cloud size={14} /> Cloud
              </button>
              <button
                onClick={() => setActiveTab('local')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'local'
                  ? 'bg-white/20 text-white shadow'
                  : 'text-white/50 hover:text-white'
                  }`}
              >
                <HardDrive size={14} /> Local
              </button>
            </div>

            {/* Action Buttons */}
            {activeTab === 'local' ? (
              <div className="space-y-3">
                <button
                  onClick={onCreateProject}
                  className="w-full py-3.5 px-5 bg-blue-600 hover:bg-blue-500 rounded-xl flex items-center space-x-3 transition-all transform hover:-translate-y-0.5 shadow-lg group"
                >
                  <div className="bg-white/20 p-2 rounded-lg group-hover:bg-white/30 transition-colors">
                    <FilePlus className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold text-sm">New Local Project</span>
                    <span className="text-xs text-blue-200">Saved on your computer</span>
                  </div>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3.5 px-5 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center space-x-3 transition-all border border-slate-700 hover:border-slate-600 group"
                >
                  <div className="bg-slate-700 p-2 rounded-lg group-hover:bg-slate-600 transition-colors">
                    <HardDrive className="w-5 h-5 text-slate-300" />
                  </div>
                  <div className="text-left">
                    <span className="block font-bold text-sm text-slate-200">Open .qlab File</span>
                    <span className="text-xs text-slate-400">Load from disk</span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {user ? (
                  <button
                    onClick={() => setShowNewCloudDialog(true)}
                    className="w-full py-3.5 px-5 bg-blue-600 hover:bg-blue-500 rounded-xl flex items-center space-x-3 transition-all transform hover:-translate-y-0.5 shadow-lg group"
                  >
                    <div className="bg-white/20 p-2 rounded-lg group-hover:bg-white/30 transition-colors">
                      <Cloud className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left">
                      <span className="block font-bold text-sm">New Cloud Project</span>
                      <span className="text-xs text-blue-200">Synced & shareable</span>
                    </div>
                  </button>
                ) : (
                  <div className="bg-slate-800/50 rounded-xl p-6 text-center border border-dashed border-slate-700">
                    <Cloud className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">Sign in with Google to access cloud projects and collaboration.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs opacity-50">v2.1.0 (Cloud + Collaboration)</div>
            <button onClick={loadAutosave} className="mt-2 text-xs text-orange-300 hover:text-orange-200 underline text-left">
              Recover Unsaved Work
            </button>
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 p-8 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-main)' }}>
          {activeTab === 'local' ? (
            <>
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center">
                <Clock className="w-4 h-4 mr-2" /> Recent Local Files
              </h2>
              <div className="flex-1 overflow-y-auto space-y-2">
                {recents.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-xl">
                    <FileText className="w-12 h-12 mb-2 opacity-50" />
                    <p>No recent files</p>
                  </div>
                ) : (
                  recents.map((file, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        openAlert("Load File", `Please select '${file.name}' from your files to load it.`);
                        fileInputRef.current?.click();
                      }}
                      className="w-full text-left group bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="bg-blue-50 p-2.5 rounded-lg text-blue-600 group-hover:bg-blue-100 transition-colors">
                          <FileText size={20} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-700 group-hover:text-blue-700">{file.name}</h3>
                          <p className="text-xs text-slate-400">{new Date(file.date).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {recents.length > 0 && (
                <button
                  onClick={() => { setRecents([]); localStorage.removeItem(RECENTS_KEY); }}
                  className="mt-4 text-xs text-red-400 hover:text-red-600 self-end flex items-center"
                >
                  <X size={12} className="mr-1" /> Clear History
                </button>
              )}
            </>
          ) : (
            <>
              {/* Invitations */}
              {invitations.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-bold text-amber-600 uppercase tracking-wider mb-3 flex items-center">
                    <Mail className="w-4 h-4 mr-2" /> Pending Invitations ({invitations.length})
                  </h2>
                  <div className="space-y-2">
                    {invitations.map((inv) => (
                      <div key={inv.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-slate-700">{inv.projectName}</h3>
                          <p className="text-xs text-slate-500">Invited by {inv.invitedByName}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptInvitation(inv)}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-500 flex items-center gap-1"
                          >
                            <Check size={12} /> Accept
                          </button>
                          <button
                            onClick={() => handleDeclineInvitation(inv)}
                            className="px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-red-100 hover:text-red-600 flex items-center gap-1"
                          >
                            <XCircle size={12} /> Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center">
                <Cloud className="w-4 h-4 mr-2" /> My Cloud Projects
              </h2>

              <div className="flex-1 overflow-y-auto space-y-2">
                {!user ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-xl p-8">
                    <LogIn className="w-12 h-12 mb-3 opacity-50" />
                    <p className="font-medium text-slate-400">Sign in to see your cloud projects</p>
                    <p className="text-xs text-slate-300 mt-1">Your data is encrypted and secure</p>
                  </div>
                ) : loadingCloud ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="animate-pulse text-slate-400 text-sm">Loading projects...</div>
                  </div>
                ) : cloudProjects.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 rounded-xl">
                    <Cloud className="w-12 h-12 mb-2 opacity-50" />
                    <p className="font-medium text-slate-400">No cloud projects yet</p>
                    <p className="text-xs text-slate-300 mt-1">Create one to get started</p>
                  </div>
                ) : (
                  cloudProjects.map((proj) => (
                    <div
                      key={proj.id}
                      className="group p-4 rounded-xl border border-[var(--border)] shadow-sm hover:shadow-md transition-all cursor-pointer bg-[var(--bg-panel)] hover:border-blue-500/50"
                      onClick={() => onOpenCloudProject(proj)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="bg-blue-50 p-2.5 rounded-lg text-blue-600 group-hover:bg-blue-100 transition-colors shrink-0">
                            <Cloud size={20} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-[var(--text-main)] group-hover:text-blue-500 truncate">{proj.name}</h3>
                            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                              <span>Modified {new Date(proj.lastModified).toLocaleDateString()}</span>
                              {Object.keys(proj.members).length > 1 && (
                                <span className="flex items-center gap-1 text-purple-500">
                                  <Users size={10} /> {Object.keys(proj.members).length} members
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {proj.ownerId === user?.uid && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteCloudProject(proj.id, proj.name); }}
                            className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            title="Delete project"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* New Cloud Project Dialog */}
      {showNewCloudDialog && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowNewCloudDialog(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md z-50">
            <h2 className="text-xl font-bold text-slate-800 mb-2">New Cloud Project</h2>
            <p className="text-sm text-slate-500 mb-6">This project will be synced to the cloud and can be shared with collaborators.</p>
            <input
              type="text"
              placeholder="Project name..."
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-6"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCloudProject()}
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowNewCloudDialog(false)}
                className="px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCloudProject}
                disabled={!newProjectName.trim() || creatingProject}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {creatingProject ? (
                  <span className="animate-pulse">Creating...</span>
                ) : (
                  <>
                    <Cloud size={14} /> Create Project
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onCancel={modalConfig.onCancel}
        confirmLabel={modalConfig.confirmLabel}
      />
    </div>
  );
};