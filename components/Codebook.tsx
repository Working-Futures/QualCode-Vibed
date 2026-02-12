import React, { useState, useMemo } from 'react';
import { Code } from '../types';
import { Plus, Trash2, Folder } from 'lucide-react';

interface CodebookProps {
  codes: Code[];
  onUpdateCode: (id: string, updates: Partial<Code>) => void;
  onDeleteCode: (id: string) => void;
  onCreateCode: () => void;
}

export const Codebook: React.FC<CodebookProps> = ({ codes, onUpdateCode, onDeleteCode, onCreateCode }) => {
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);
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
    return [...codes].sort((a, b) => (a.parentId || '').localeCompare(b.parentId || '') || a.name.localeCompare(b.name));
  }, [codes]);

  return (
    <div className="flex h-full bg-[var(--bg-panel)]">
      {/* Sidebar List */}
      <div className="w-1/3 border-r border-[var(--border)] flex flex-col">
        <div className="p-4 border-b bg-[var(--bg-main)] flex justify-between items-center">
          <div>
            <h2 className="font-bold text-lg text-[var(--text-main)]">Codebook</h2>
            <p className="text-xs text-[var(--text-muted)]">{codes.length} codes defined</p>
          </div>
          <button
            onClick={onCreateCode}
            className="bg-[var(--accent)] hover:brightness-110 text-[var(--accent-text)] p-2 rounded shadow-sm transition-colors"
            title="Create New Code"
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {sortedCodes.map(code => (
            <div
              key={code.id}
              onClick={() => setSelectedCodeId(code.id)}
              className={`p-3 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--bg-main)] transition-colors flex items-center justify-between ${selectedCodeId === code.id ? 'bg-[var(--bg-main)] border-l-4 border-l-[var(--accent)]' : ''}`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <div
                  className="w-4 h-4 rounded-full shadow-sm flex-shrink-0"
                  style={{ backgroundColor: code.color }}
                />
                <div className="flex flex-col truncate">
                  <span className="font-medium truncate text-[var(--text-main)]">{code.name}</span>
                  {code.parentId && (
                    <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                      <Folder size={8} /> {codes.find(c => c.id === code.parentId)?.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Editor */}
      <div className="w-2/3 p-8 overflow-y-auto bg-[var(--bg-main)]">
        {activeCode ? (
          <div className="space-y-6 max-w-3xl mx-auto bg-[var(--bg-paper)] p-8 rounded-xl shadow-sm border border-[var(--border)]">
            {/* Header */}
            <div className="flex items-center gap-4 pb-4 border-b border-[var(--border)]">
              <input
                type="color"
                value={activeCode.color}
                onChange={(e) => onUpdateCode(activeCode.id, { color: e.target.value })}
                className="h-12 w-12 rounded cursor-pointer border-none p-1 bg-[var(--bg-paper)] shadow-sm"
              />
              <input
                type="text"
                value={activeCode.name}
                onChange={(e) => onUpdateCode(activeCode.id, { name: e.target.value })}
                className="text-3xl font-bold w-full border-none focus:ring-0 p-0 text-[var(--text-main)] bg-transparent placeholder-[var(--text-muted)]"
                placeholder="Code Name"
              />
            </div>

            {/* Parent Selector */}
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Parent Category
              </label>
              <select
                className="w-full p-2 border border-[var(--border)] rounded text-sm bg-[var(--bg-paper)] text-[var(--text-main)]"
                value={activeCode.parentId || ''}
                onChange={(e) => onUpdateCode(activeCode.id, { parentId: e.target.value || undefined })}
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
                className="w-full p-3 border border-[var(--border)] rounded-lg text-sm bg-[var(--bg-paper)] text-[var(--text-main)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] transition-all"
                rows={4}
                value={activeCode.description || ''}
                onChange={(e) => onUpdateCode(activeCode.id, { description: e.target.value })}
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
                  className="w-full p-3 border border-green-200 bg-green-50/30 rounded-lg text-sm focus:ring-green-500/20 focus:border-green-500 text-[var(--text-main)]"
                  rows={6}
                  value={activeCode.inclusionCriteria || ''}
                  onChange={(e) => onUpdateCode(activeCode.id, { inclusionCriteria: e.target.value })}
                  placeholder="When to use this code..."
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-red-700">
                  Exclusion Criteria
                </label>
                <textarea
                  className="w-full p-3 border border-red-200 bg-red-50/30 rounded-lg text-sm focus:ring-red-500/20 focus:border-red-500 text-[var(--text-main)]"
                  rows={6}
                  value={activeCode.exclusionCriteria || ''}
                  onChange={(e) => onUpdateCode(activeCode.id, { exclusionCriteria: e.target.value })}
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

            <div className="pt-6 border-t border-[var(--border)] flex justify-end">
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this code? All coding will be lost.')) {
                    onDeleteCode(activeCode.id);
                    setSelectedCodeId(null);
                  }
                }}
                className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded transition-colors text-sm font-medium"
              >
                <Trash2 size={16} /> Delete Code
              </button>
            </div>

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <div className="w-16 h-16 mb-4 rounded-full bg-[var(--bg-panel)] flex items-center justify-center border border-[var(--border)]">
              <Plus className="opacity-50" size={32} />
            </div>
            <p>Select a code to edit or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
};