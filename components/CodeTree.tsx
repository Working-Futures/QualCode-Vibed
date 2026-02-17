import React, { useState, useMemo, useEffect } from 'react';
import { Code } from '../types';
import { ChevronRight, ChevronDown, Move, Eye } from 'lucide-react';

interface CodeTreeProps {
  codes: Code[];
  activeCodeId: string | null;
  onSelectCode: (id: string) => void;
  onUpdateCode: (id: string, updates: Partial<Code>) => void;
  onDeleteCode: (id: string) => void;
  onMergeCode: (sourceId: string, targetId: string) => void;
  searchQuery?: string;
  onConfirm: (title: string, message: string, callback: () => void) => void;
  hiddenCodeIds?: Set<string>;
  onToggleVisibility?: (codeId: string) => void;
}

interface TreeNode extends Code {
  children: TreeNode[];
  level: number;
}

export const CodeTree: React.FC<CodeTreeProps> = ({
  codes,
  activeCodeId,
  onSelectCode,
  onUpdateCode,
  onDeleteCode,
  onMergeCode,
  searchQuery = '',
  onConfirm,
  hiddenCodeIds,
  onToggleVisibility
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, codeId: string } | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const [isMergeMode, setIsMergeMode] = useState(false);
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [sourceCodeId, setSourceCodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Robust Tree Builder with Natural Sort and Search
  const tree = useMemo(() => {
    // Helper to normalize parentId (treat null/"" as undefined)
    const getParentId = (c: Code) => (c.parentId === null || c.parentId === '') ? undefined : c.parentId;

    // Natural Sort Comparator
    const naturalSort = (a: Code, b: Code) => {
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    };

    const buildTree = (targetParentId: string | undefined, level: number): TreeNode[] => {
      let children = [...codes] // Create a shallow copy to be safe
        .filter(c => getParentId(c) === targetParentId)
        .sort(naturalSort);

      // Recursively build
      let nodes = children.map(c => ({
        ...c,
        level,
        children: buildTree(c.id, level + 1)
      }));

      // Filter if searching
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        nodes = nodes.filter(node => {
          const matches = node.name.toLowerCase().includes(query);
          const hasMatchingChildren = node.children.length > 0; // Children are already filtered
          return matches || hasMatchingChildren;
        });
      }

      return nodes;
    };

    return buildTree(undefined, 0);
  }, [codes, searchQuery]);

  // Auto-expand if searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const getAllIds = (nodes: TreeNode[]): string[] => {
        return nodes.flatMap(n => [n.id, ...getAllIds(n.children)]);
      };
      setExpandedIds(new Set(getAllIds(tree)));
    }
  }, [searchQuery, tree]);

  // Auto-expand parent if active code is hidden (optional QoL)
  useEffect(() => {
    if (activeCodeId) {
      const findPath = (targetId: string, currentCodes: Code[]): string[] => {
        const code = currentCodes.find(c => c.id === targetId);
        if (!code || !code.parentId) return [];
        return [code.parentId, ...findPath(code.parentId, currentCodes)];
      };
      const path = findPath(activeCodeId, codes);
      if (path.length > 0) {
        setExpandedIds(prev => {
          const next = new Set(prev);
          path.forEach(id => next.add(id));
          return next;
        });
      }
    }
  }, [activeCodeId, codes]);

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const handleRightClick = (e: React.MouseEvent, codeId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, codeId });
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      onUpdateCode(editingId, { name: editName });
    }
    setEditingId(null);
  };

  const initiateMerge = () => {
    if (contextMenu) {
      setSourceCodeId(contextMenu.codeId);
      setIsMergeMode(true);
      setIsMoveMode(false);
      setContextMenu(null);
    }
  };

  const initiateMove = () => {
    if (contextMenu) {
      setSourceCodeId(contextMenu.codeId);
      setIsMoveMode(true);
      setIsMergeMode(false);
      setContextMenu(null);
    }
  };

  const handleTargetSelect = (targetId: string) => {
    if (!sourceCodeId) return;
    if (targetId === sourceCodeId) return;

    if (isMergeMode) {
      onConfirm('Confirm Merge', `Merge into "${codes.find(c => c.id === targetId)?.name}"?`, () => {
        onMergeCode(sourceCodeId, targetId);
        resetModes();
      });
    } else if (isMoveMode) {
      onUpdateCode(sourceCodeId, { parentId: targetId });
      setExpandedIds(prev => new Set(prev).add(targetId));
      resetModes();
    }
  };

  const moveToRoot = () => {
    if (sourceCodeId) {
      onUpdateCode(sourceCodeId, { parentId: undefined });
      resetModes();
    }
  };

  const resetModes = () => {
    setIsMergeMode(false);
    setIsMoveMode(false);
    setSourceCodeId(null);
    setContextMenu(null);
  };

  const renderNode = (node: TreeNode) => {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children.length > 0;
    const isEditing = editingId === node.id;

    const isSource = sourceCodeId === node.id;
    const isValidTarget = (isMergeMode || isMoveMode) && !isSource;
    const isDropTarget = dropTargetId === node.id;

    return (
      <div key={node.id}>
        <div
          onContextMenu={(e) => handleRightClick(e, node.id)}
          className="relative group"
        >
          <div
            draggable={!isMergeMode && !isMoveMode && !isEditing}
            onDragStart={(e) => {
              e.dataTransfer.setData('codeId', node.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDropTargetId(node.id);
            }}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDropTargetId(null);
              const draggedId = e.dataTransfer.getData('codeId');
              if (draggedId && draggedId !== node.id) {
                onConfirm('Confirm Merge', `Merge "${codes.find(c => c.id === draggedId)?.name}" into "${node.name}"?`, () => {
                  onMergeCode(draggedId, node.id);
                });
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              isValidTarget ? handleTargetSelect(node.id) : onSelectCode(node.id);
            }}
            className={`
                flex items-center gap-1 py-1.5 rounded cursor-pointer text-sm select-none transition-colors
                ${activeCodeId === node.id && !isMergeMode && !isMoveMode ? 'bg-[var(--accent)] text-[var(--accent-text)] font-medium' : 'text-[var(--text-main)]'}
                ${isValidTarget || isDropTarget ? 'bg-amber-100 border border-amber-300 border-dashed text-amber-900' : 'hover:bg-[var(--bg-main)] border border-transparent'}
                ${isSource ? 'opacity-50' : ''}
              `}
            style={{ paddingLeft: `${node.level * 12 + 4}px` }}
          >
            <div
              onClick={(e) => hasChildren ? toggleExpand(e, node.id) : null}
              className={`w-4 h-4 flex items-center justify-center text-[var(--text-muted)] ${hasChildren ? 'hover:text-[var(--text-main)]' : 'opacity-0'}`}
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </div>

            <div className="w-3 h-3 rounded-full flex-shrink-0 mr-1" style={{ backgroundColor: node.color }} />

            {/* Visibility Output */}
            {onToggleVisibility && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleVisibility(node.id); }}
                className={`w-4 h-4 flex items-center justify-center mr-1 text-[var(--text-muted)] hover:text-[var(--text-main)] ${hiddenCodeIds?.has(node.id) ? 'opacity-50' : ''}`}
                title={hiddenCodeIds?.has(node.id) ? "Show highlights" : "Hide highlights"}
              >
                {hiddenCodeIds?.has(node.id) ? (
                  <div className="relative">
                    <Eye size={12} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-full h-px bg-red-500 transform rotate-45"></div>
                    </div>
                  </div>
                ) : (
                  <Eye size={12} />
                )}
              </button>
            )}

            {isEditing ? (
              <input
                autoFocus
                value={editName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                className="w-full p-0 px-1 text-sm border rounded text-[var(--text-main)] bg-[var(--bg-panel)]"
              />
            ) : (
              <span className="truncate flex items-center gap-1">
                {node.name}
                {node.type && node.type !== 'personal' && (
                  <span className={`text-[8px] font-bold px-1 py-0 rounded-sm uppercase leading-tight flex-shrink-0 ${node.type === 'master' ? 'bg-blue-100 text-blue-600' :
                    node.type === 'suggested' ? 'bg-amber-100 text-amber-600' : ''
                    }`}>
                    {node.type === 'master' ? 'M' : node.type === 'suggested' ? 'S' : ''}
                  </span>
                )}
                {node.type === 'personal' && (
                  <span className="text-[8px] font-bold px-1 py-0 rounded-sm uppercase leading-tight flex-shrink-0 bg-green-100 text-green-600">P</span>
                )}
              </span>
            )}
          </div>
        </div>

        {isExpanded && node.children.map(renderNode)}
      </div>
    );
  };

  return (
    <div className="space-y-0.5 relative pb-20">
      {(isMergeMode || isMoveMode) && (
        <div className="sticky top-0 z-20 bg-amber-50 text-amber-900 p-2 text-xs font-bold mb-2 rounded border border-amber-200 shadow-sm">
          {isMergeMode ? "Select code to merge into..." : "Select new parent folder..."}
          <div className="flex gap-2 mt-1">
            {isMoveMode && (
              <button onClick={moveToRoot} className="px-2 py-0.5 bg-white border border-amber-300 rounded hover:bg-amber-100">
                Move to Root
              </button>
            )}
            <button onClick={resetModes} className="underline ml-auto">Cancel</button>
          </div>
        </div>
      )}

      {tree.map(renderNode)}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed bg-[var(--bg-panel)] shadow-xl border border-[var(--border)] rounded w-40 py-1 z-50 text-sm text-[var(--text-main)]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div onClick={() => { setEditingId(contextMenu.codeId); setEditName(codes.find(c => c.id === contextMenu.codeId)?.name || ''); setContextMenu(null); }} className="px-3 py-1.5 hover:bg-[var(--bg-main)] cursor-pointer">
              Rename
            </div>

            <div className="border-t border-[var(--border)] my-1"></div>

            <div onClick={initiateMove} className="px-3 py-1.5 hover:bg-[var(--bg-main)] cursor-pointer flex items-center">
              <Move size={14} className="mr-2 text-[var(--text-muted)]" /> Move to...
            </div>
            <div onClick={initiateMerge} className="px-3 py-1.5 hover:bg-[var(--bg-main)] cursor-pointer">
              Merge into...
            </div>

            <div className="border-t border-[var(--border)] my-1"></div>

            <div onClick={() => { onDeleteCode(contextMenu.codeId); setContextMenu(null); }} className="px-3 py-1.5 hover:bg-red-50 text-red-600 cursor-pointer">
              Delete
            </div>
          </div>
        </>
      )}
    </div>
  );
};