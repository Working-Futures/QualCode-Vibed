import React, { useState, useEffect } from 'react';
import * as mammoth from 'mammoth';
import { Project, Code, Selection, Transcript, AppSettings } from './types';
import { Editor } from './components/Editor';
import { CodeTree } from './components/CodeTree';
import { AnalysisView } from './components/AnalysisView';
import { Codebook } from './components/Codebook';
import { VisualSettings } from './components/VisualSettings';
import { ProjectLauncher } from './components/ProjectLauncher';
import { MemoSidebar } from './components/MemoSidebar';
import { exportProjectData, parseCodebookFile, mergeCodesInProject, saveProjectFile, printTranscript, exportCodebook, generateId } from './utils/dataUtils';
import { removeHighlightsForCode } from './utils/highlightUtils';
import { generateChildColor, generateColor } from './utils/colorUtils';
import { applyTheme } from './utils/themeUtils';
import { Eye, Save, LogOut, Trash2, Edit2, FileText, MoreHorizontal, Upload, Plus, StickyNote, Printer, Download } from 'lucide-react';

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
  const [project, setProject] = useState<Project | null>(null);
  const [activeView, setActiveView] = useState<'editor' | 'analysis' | 'codebook'>('editor');
  const [activeTranscriptId, setActiveTranscriptId] = useState<string | null>(null);
  const [activeCodeId, setActiveCodeId] = useState<string | null>(null);

  const [showVisualSettings, setShowVisualSettings] = useState(false);
  const [showMemoSidebar, setShowMemoSidebar] = useState(true); // Default Open
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultSettings);
  const [sidebarWidth, setSidebarWidth] = useState(288);

  const [transcriptMenu, setTranscriptMenu] = useState<{ id: string, x: number, y: number } | null>(null);

  // Search States
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<{ transcriptId: string, lineIndex: number, text: string }[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [codeSearchQuery, setCodeSearchQuery] = useState('');

  // --- Effects ---

  // Auto-save to LocalStorage per 30 seconds to prevent data loss
  useEffect(() => {
    if (!project) return;
    const saveInterval = setInterval(() => {
      localStorage.setItem('autosave_project', JSON.stringify(project));
      console.log('Autosaved project to browser storage');
    }, 30000);
    return () => clearInterval(saveInterval);
  }, [project]);


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
    if ((appSettings as any).sidebarWidth) {
      setSidebarWidth((appSettings as any).sidebarWidth);
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
        // Parse HTML content to text lines for searching
        const parser = new DOMParser();
        const doc = parser.parseFromString(t.content, 'text/html');
        const lines = doc.querySelectorAll('.transcript-line');

        lines.forEach((line, idx) => {
          const text = line.textContent || '';
          if (text.toLowerCase().includes(query)) {
            results.push({
              transcriptId: t.id,
              lineIndex: idx + 1, // 1-based
              text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
            });
          }
        });
      });
      setGlobalSearchResults(results);
    }, 300);

    return () => clearTimeout(timer);
  }, [globalSearchQuery, project]);


  if (!project) {
    return (
      <ProjectLauncher
        onOpenProject={(p) => setProject(p)}
        onCreateProject={() => setProject(initialProject)}
      />
    );
  }

  const activeTranscript = project.transcripts.find(t => t.id === activeTranscriptId) || null;
  const activeCode = project.codes.find(c => c.id === activeCodeId) || null;

  // --- Actions ---

  const handleProjectUpdate = (updatedProject: Project) => {
    setProject({ ...updatedProject, lastModified: Date.now() });
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
      let rawText = '';
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        rawText = result.value;
      } else {
        rawText = await file.text();
      }
      // Chunking Logic for Line Numbers
      const lines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);
      const formattedHtml = lines.map((line, index) =>
        `<div class="transcript-line" data-line="${index + 1}">${line}</div>`
      ).join('');

      const newTranscript: Transcript = {
        id: crypto.randomUUID(),
        name: file.name,
        content: formattedHtml,
        dateAdded: Date.now(),
        memo: ''
      };
      handleProjectUpdate({ ...project, transcripts: [...project.transcripts, newTranscript] });
      setActiveTranscriptId(newTranscript.id);
      e.target.value = '';
    } catch (err) {
      console.error(err);
      alert("Error importing file.");
    }
  };

  const deleteTranscript = (id: string) => {
    if (confirm("Delete this transcript and all its highlights?")) {
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
  };

  const handleSelectionDelete = (selectionId: string, updatedHtml: string) => {
    if (!activeTranscriptId) return;
    handleProjectUpdate({
      ...project,
      selections: project.selections.filter(s => s.id !== selectionId),
      transcripts: project.transcripts.map(t => t.id === activeTranscriptId ? { ...t, content: updatedHtml } : t)
    });
  };

  const createCode = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation(); // Prevent container click from deselecting immediately
    const parent = activeCodeId ? project.codes.find(c => c.id === activeCodeId) : null;
    let newColor = '#cccccc';

    if (parent) {
      // Child Code
      const siblings = project.codes.filter(c => c.parentId === parent.id).length;
      newColor = generateChildColor(parent.color, siblings);
    } else {
      // Root Code
      const roots = project.codes.filter(c => !c.parentId).length;
      newColor = generateColor(roots);
    }

    const newCode: Code = {
      id: generateId(),
      name: 'New Code',
      color: newColor,
      parentId: parent?.id
    };

    handleProjectUpdate({ ...project, codes: [...project.codes, newCode] });
    setActiveCodeId(newCode.id);
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
                            // TODO: Scroll to line
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowVisualSettings(!showVisualSettings)}
            className={`p-2 rounded hover:bg-white/10 transition-colors ${showVisualSettings ? 'bg-white/20 text-[var(--accent)]' : 'text-slate-300'}`}
            title="Visual Settings"
          >
            <Eye size={20} />
          </button>

          <div className="h-6 w-px bg-white/20 mx-1"></div>

          <button
            onClick={() => saveProjectFile(project)}
            className="px-3 py-1.5 bg-[var(--accent)] hover:brightness-110 rounded text-xs font-bold text-[var(--accent-text)] shadow-sm transition-all flex items-center gap-2"
          >
            <Save size={14} /> Save
          </button>

          <button
            onClick={() => { if (confirm("Close project? Unsaved changes will be lost.")) setProject(null); }}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-white/10 rounded transition-colors"
            title="Close Project"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

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
                  <input type="file" className="hidden" accept=".txt,.docx" onChange={handleTranscriptUpload} />
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
                  <input type="file" className="hidden" accept=".csv,.xlsx" onChange={handleImportCodes} />
                </label>
              </div>

              {/* Code List with Click-to-Deselect Background */}
              <div
                className="flex-1 overflow-y-auto px-2"
                onClick={() => setActiveCodeId(null)} // Click empty space to deselect
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
                  <StickyNote size={14} /> {showMemoSidebar ? 'Hide Memos' : 'Show Memos'}
                </button>
              </div>
              <div className="flex-1 overflow-hidden flex">
                <div className="flex-1">
                  <Editor
                    activeTranscript={activeTranscript}
                    activeCode={activeCode}
                    onSelectionCreate={handleSelectionCreate}
                    onSelectionDelete={handleSelectionDelete}
                    settings={appSettings}
                    codes={project.codes}
                  />
                </div>
              </div>
            </>
          )}

          {activeView === 'codebook' && (
            <Codebook
              codes={project.codes}
              onUpdateCode={(id, up) => handleProjectUpdate({ ...project, codes: project.codes.map(c => c.id === id ? { ...c, ...up } : c) })}
              onDeleteCode={(id) => handleProjectUpdate({ ...project, codes: project.codes.filter(c => c.id !== id) })}
              onCreateCode={createCode}
            />
          )}

          {activeView === 'analysis' && (
            <AnalysisView
              project={project}
              onClose={() => setActiveView('editor')}
              onExport={() => exportProjectData(project)}
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

      {/* Floating Transcript Menu */}
      {transcriptMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setTranscriptMenu(null)} />
          <div
            className="fixed bg-[var(--bg-panel)] shadow-xl border border-[var(--border)] rounded z-50 w-32 py-1 flex flex-col animate-in fade-in zoom-in-95 duration-75"
            style={{ top: transcriptMenu.y, left: transcriptMenu.x }}
          >
            <button
              onClick={() => { renameTranscript(transcriptMenu.id); setTranscriptMenu(null); }}
              className="px-3 py-2 hover:bg-[var(--bg-main)] text-left flex items-center gap-2 text-sm text-[var(--text-main)]"
            >
              <Edit2 size={12} /> Rename
            </button>
            <button
              onClick={() => { deleteTranscript(transcriptMenu.id); setTranscriptMenu(null); }}
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