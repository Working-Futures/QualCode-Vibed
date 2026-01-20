import React, { useState, useEffect } from 'react';
import { HardDrive, FilePlus, Clock, FileText, X } from 'lucide-react';
import { Project } from '../types';

interface Props {
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
}

const RECENTS_KEY = 'qualilab_recent_files';

interface RecentFile {
  name: string;
  date: number;
}

export const ProjectLauncher: React.FC<Props> = ({ onOpenProject, onCreateProject }) => {
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(RECENTS_KEY);
    if (saved) setRecents(JSON.parse(saved));
  }, []);

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
        alert("Invalid .qlab file format.");
        return;
      }
      addToRecents(data.name);
      onOpenProject(data);
    } catch (err) {
      alert("Error opening file. It may be corrupted.");
    }
  };

  const loadAutosave = () => {
    const saved = localStorage.getItem('autosave_project');
    if (saved) {
      if (confirm("Found an unsaved project recovered from browser storage. would you like to load it?")) {
        onOpenProject(JSON.parse(saved));
      }
    } else {
      alert("No recovered project found.");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
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

      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex h-[600px]">
        {/* Left Panel */}
        <div className="w-2/5 bg-slate-900 p-8 text-white flex flex-col justify-between">
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-bold">QualiLab</h1>
              <p className="text-slate-400 text-sm">Distributed Analysis Tool</p>
            </div>

            <div className="space-y-4">
              <button
                onClick={onCreateProject}
                className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-500 rounded-xl flex items-center space-x-3 transition-all transform hover:-translate-y-1 shadow-lg group"
              >
                <div className="bg-white/20 p-2 rounded-lg group-hover:bg-white/30 transition-colors">
                  <FilePlus className="w-6 h-6 text-white" />
                </div>
                <div className="text-left">
                  <span className="block font-bold">New Project</span>
                  <span className="text-xs text-blue-200">Start from scratch</span>
                </div>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 px-6 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center space-x-3 transition-all border border-slate-700 hover:border-slate-600 group"
              >
                <div className="bg-slate-700 p-2 rounded-lg group-hover:bg-slate-600 transition-colors">
                  <HardDrive className="w-6 h-6 text-slate-300" />
                </div>
                <div className="text-left">
                  <span className="block font-bold text-slate-200">Open Project</span>
                  <span className="text-xs text-slate-400">Load .qlab file</span>
                </div>
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-500">v1.0.0</div>
          <button onClick={loadAutosave} className="mt-2 text-xs text-orange-400 hover:text-orange-300 underline text-left">
            Recover Unsaved Work
          </button>
        </div>

        {/* Right Panel: Recents */}
        <div className="flex-1 p-8 bg-slate-50 flex flex-col">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center">
            <Clock className="w-4 h-4 mr-2" /> Recent Files
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
                    // In web, we can't persist paths, so we prompt user to open the file again
                    alert(`Please select '${file.name}' from your files to load it.`);
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
                      <p className="text-xs text-slate-400">
                        {new Date(file.date).toLocaleDateString()}
                      </p>
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
        </div>
      </div>
    </div>
  );
};