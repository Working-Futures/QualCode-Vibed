import React, { useRef, useEffect, useCallback, memo, useState } from 'react';
import { Transcript, Code, Selection, AppSettings, StickyNote } from '../types';
import { Trash2, MessageSquare, Sparkles, X, Save, Plus, CornerDownLeft, AlertTriangle, ArrowDown, ArrowUp, StickyNote as StickyNoteIcon } from 'lucide-react';

interface EditorProps {
  activeTranscript: Transcript | null;
  activeCode: Code | null;
  onSelectionCreate: (selection: Selection, updatedHtml: string) => void;
  onSelectionDelete: (selectionId: string, updatedHtml: string) => void;
  onCreateInVivoCode?: (selectedText: string, transcriptId: string) => void;
  onAnnotateSelection?: (selectionId: string, annotation: string) => void;
  onSaveProject?: () => void;

  isEditing?: boolean;
  canEditDirectly?: boolean; // New prop for admin check
  readOnly?: boolean;
  onSaveContent?: (newContent: string) => void;
  onCancelEdit?: () => void;
  onAutoSave?: (newContent: string) => void;

  settings: AppSettings;
  codes: Code[];
  selections?: Selection[];

  // Sticky Notes Props
  stickyNotes?: StickyNote[];
  onAddStickyNote?: (note: StickyNote) => void;
  onUpdateStickyNote?: (id: string, updates: Partial<StickyNote>) => void;
  onDeleteStickyNote?: (id: string) => void;
  showTeamNotes?: boolean;
  currentUserId?: string;
}

interface EditableLine {
  id: string;
  content: string;
}

export const Editor = memo<EditorProps>(({
  activeTranscript,
  activeCode,
  onSelectionCreate,
  onSelectionDelete,
  onCreateInVivoCode,
  onAnnotateSelection,
  onSaveProject,
  isEditing = false,
  onSaveContent,
  onCancelEdit,
  onAutoSave,
  settings,
  codes,
  selections = [],
  stickyNotes = [],
  onAddStickyNote,
  onUpdateStickyNote,
  onDeleteStickyNote,
  showTeamNotes = false,
  currentUserId,
  readOnly = false,
  canEditDirectly = true // Default to true for backward compatibility
}) => {
  // Viewing Mode Refs
  const contentRef = useRef<HTMLDivElement>(null);

  // ... (rest of existing state)

  // Sticky Note Logic
  const handleTranscriptClick = (e: React.MouseEvent) => {
    if (isEditing || readOnly || !onAddStickyNote || !activeTranscript || !contentRef.current) return;

    // Only allow adding notes if holding Alt/Option key to avoid conflict with text selection
    // OR if double click (handled separately). Let's use Double Click for creation.
  };

  const handleTranscriptDoubleClick = (e: React.MouseEvent) => {
    if (isEditing || !onAddStickyNote || !activeTranscript || !contentRef.current || !currentUserId) return;

    // Prevent default selection behavior
    e.preventDefault();

    const rect = contentRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newNote: StickyNote = {
      id: crypto.randomUUID(),
      transcriptId: activeTranscript.id,
      content: 'New Note',
      authorId: currentUserId,
      authorName: 'Me', // This should typically come from user profile, but 'Me' is a safe fallback for local display until sync
      color: '#fef3c7', // Default yellow
      x,
      y,
      timestamp: Date.now()
    };

    onAddStickyNote(newNote);
  };

  // ... (rest of existing logic)

  // Editing Mode State
  const [editableLines, setEditableLines] = useState<EditableLine[]>([]);
  const lineRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  // Track if we should auto-save (skip first render)
  const isFirstRender = useRef(true);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string, text?: string } | null>(null);
  const [annotationInput, setAnnotationInput] = useState<string>('');
  const [showAnnotationInput, setShowAnnotationInput] = useState(false);
  const [inVivoSelection, setInVivoSelection] = useState<{ text: string, transcriptId: string } | null>(null);
  const [focusedCodeId, setFocusedCodeId] = useState<string | null>(null);

  interface SearchMatch {
    id: string; // lineIndex-matchIndex
    lineIndex: number;
    startIndex: number;
    endIndex: number;
    text: string;
    context: string;
  }

  // Find & Replace State
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [suggestedSearch, setSuggestedSearch] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [foundMatches, setFoundMatches] = useState<SearchMatch[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [fuzzyThreshold, setFuzzyThreshold] = useState(2);
  const [codebookFilter, setCodebookFilter] = useState<'all' | 'master' | 'personal'>('all');

  const visibleCodes = React.useMemo(() => {
    if (codebookFilter === 'all') return codes;
    return codes.filter(c => (c.type || 'personal') === codebookFilter);
  }, [codes, codebookFilter]);

  // Levenshtein Distance Helper
  const calculateLevenshtein = (a: string, b: string) => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // deletion
            Math.min(matrix[i][j - 1] + 1, // insertion
              matrix[i - 1][j] + 1) // substitution
          );
        }
      }
    }
    return matrix[b.length][a.length];
  };

  // Calculate matches & suggestions
  useEffect(() => {
    if (!findText) {
      setMatchCount(0);
      setFoundMatches([]);
      setSelectedMatches(new Set());
      setSuggestedSearch(null);
      return;
    }
    try {
      const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Ensure 'g' flag is always present for exec loop
      const flags = isCaseSensitive ? 'g' : 'gi';
      const regex = new RegExp(escapeRegExp(findText), flags);

      const newMatches: SearchMatch[] = [];
      let count = 0;

      editableLines.forEach((line, lineIdx) => {
        let match;
        // Reset regex state for each line if needed, though usually new RegExp handles it.
        // Actually, with a single RegExp instance, we must be careful if not recreating it inside loop?
        // No, we create it once per effect run.
        regex.lastIndex = 0; // Essential for global regex re-use

        while ((match = regex.exec(line.content)) !== null) {
          const start = match.index;
          const end = start + match[0].length;
          const contextStart = Math.max(0, start - 15);
          const contextEnd = Math.min(line.content.length, end + 15);
          const context = (contextStart > 0 ? '...' : '') +
            line.content.substring(contextStart, contextEnd) +
            (contextEnd < line.content.length ? '...' : '');

          newMatches.push({
            id: `${lineIdx}-${count}`,
            lineIndex: lineIdx,
            startIndex: start,
            endIndex: end,
            text: match[0],
            context
          });
          count++;
        }
      });

      setFoundMatches(newMatches);
      setMatchCount(count);
      // Select all by default
      setSelectedMatches(new Set(newMatches.map(m => m.id)));

      // Fuzzy Search Logic
      if (fuzzyThreshold > 0 && findText.length > 2) {
        const wordRegex = /[\w']+/g;
        editableLines.forEach((line, lineIdx) => {
          let match;
          while ((match = wordRegex.exec(line.content)) !== null) {
            const word = match[0];
            const start = match.index;
            const end = start + word.length;

            // Simple optimization: length difference check
            if (Math.abs(word.length - findText.length) > fuzzyThreshold) continue;

            const dist = calculateLevenshtein(findText.toLowerCase(), word.toLowerCase());

            if (dist > 0 && dist <= fuzzyThreshold) {
              // Check for overlap with existing exact matches
              const isOverlapping = newMatches.some(m =>
                m.lineIndex === lineIdx &&
                Math.max(start, m.startIndex) < Math.min(end, m.endIndex)
              );

              if (!isOverlapping) {
                const contextStart = Math.max(0, start - 15);
                const contextEnd = Math.min(line.content.length, end + 15);
                const context = (contextStart > 0 ? '...' : '') +
                  line.content.substring(contextStart, contextEnd) +
                  (contextEnd < line.content.length ? '...' : '');

                newMatches.push({
                  id: `fuzzy-${lineIdx}-${start}`,
                  lineIndex: lineIdx,
                  startIndex: start,
                  endIndex: end,
                  text: word,
                  context: `(~${dist}) ` + context
                });
                count++;
              }
            }
          }
        });

        // Sort matches by line index then start index
        newMatches.sort((a, b) => {
          if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
          return a.startIndex - b.startIndex;
        });

        // Update state with combined matches
        setFoundMatches(newMatches);
        setMatchCount(newMatches.length);
        // Select all newly found fuzzy matches too
        setSelectedMatches(new Set(newMatches.map(m => m.id)));
      }

      setSuggestedSearch(null); // Deprecate suggested search in favor of direct matches

    } catch (e) {
      console.error(e);
      setMatchCount(0);
      setFoundMatches([]);
    }
  }, [findText, isCaseSensitive, editableLines, fuzzyThreshold]);

  // Track last initialized transcript ID to prevent re-init on auto-save updates
  const lastInitId = useRef<string | null>(null);

  // Initialize Edit Mode
  useEffect(() => {
    if (!isEditing) {
      lastInitId.current = null;
      return;
    }

    if (activeTranscript) {
      // If we are already editing this transcript, don't re-initialize (preserves cursor/state)
      if (lastInitId.current === activeTranscript.id) return;

      // Parse content into lines
      const div = document.createElement('div');
      div.innerHTML = activeTranscript.content;

      const lines = Array.from(div.querySelectorAll('.transcript-line'));

      if (lines.length > 0) {
        setEditableLines(lines.map(l => ({
          id: crypto.randomUUID(),
          content: l.textContent || ''
        })));
      } else {
        // Fallback for raw text without structure
        const rawLines = (div.textContent || '').split('\n').filter(l => l.trim());
        setEditableLines(rawLines.map(l => ({
          id: crypto.randomUUID(),
          content: l
        })));
      }
      isFirstRender.current = true; // Reset on entry to edit mode
      lastInitId.current = activeTranscript.id;
    }
  }, [isEditing, activeTranscript]);

  const handleReplaceSelected = () => {
    if (!findText) return;

    // Group selected matches by line index
    const replacementsByLine = new Map<number, SearchMatch[]>();
    selectedMatches.forEach(id => {
      const match = foundMatches.find(m => m.id === id);
      if (match) {
        if (!replacementsByLine.has(match.lineIndex)) {
          replacementsByLine.set(match.lineIndex, []);
        }
        replacementsByLine.get(match.lineIndex)!.push(match);
      }
    });

    const newLines = editableLines.map((line, idx) => {
      const matchesInLine = replacementsByLine.get(idx);
      if (!matchesInLine || matchesInLine.length === 0) return line;

      // Sort matches by start index descending to replace from end to start
      matchesInLine.sort((a, b) => b.startIndex - a.startIndex);

      let content = line.content;
      matchesInLine.forEach(match => {
        const before = content.slice(0, match.startIndex);
        const after = content.slice(match.endIndex);
        content = before + replaceText + after;
      });

      return { ...line, content };
    });

    setEditableLines(newLines);
  };

  const generateHtmlContent = useCallback(() => {
    // escape html entities
    const escape = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

    // Reconstruct HTML
    return editableLines.map((line, i) =>
      `<div class="transcript-line" data-line="${i + 1}">${escape(line.content)}</div>`
    ).join('');
  }, [editableLines]);

  // Auto-Save Effect
  useEffect(() => {
    if (!isEditing || isFirstRender.current) {
      if (editableLines.length > 0) isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      if (onAutoSave) {
        onAutoSave(generateHtmlContent());
      }
    }, 2000); // 2 second debounce

    return () => clearTimeout(timer);
  }, [editableLines, isEditing, onAutoSave, generateHtmlContent]);

  // Handle Editing Actions
  const handleLineChange = (index: number, val: string) => {
    const newLines = [...editableLines];
    newLines[index].content = val;
    setEditableLines(newLines);

    // Auto-resize height
    const el = lineRefs.current[index];
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  };

  const handleLineKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Split line
      const currentLine = editableLines[index];
      const cursor = (e.target as HTMLTextAreaElement).selectionStart;
      const textBefore = currentLine.content.slice(0, cursor);
      const textAfter = currentLine.content.slice(cursor);

      const newLines = [...editableLines];
      newLines[index].content = textBefore;
      newLines.splice(index + 1, 0, { id: crypto.randomUUID(), content: textAfter });
      setEditableLines(newLines);

      // Focus next line after render
      setTimeout(() => lineRefs.current[index + 1]?.focus(), 0);
    } else if (e.key === 'Backspace') {
      const cursor = (e.target as HTMLTextAreaElement).selectionStart;
      if (cursor === 0 && index > 0) {
        e.preventDefault();
        // Merge with previous
        const currentContent = editableLines[index].content;
        const prevContent = editableLines[index - 1].content;

        const newLines = [...editableLines];
        newLines[index - 1].content = prevContent + currentContent;
        newLines.splice(index, 1);
        setEditableLines(newLines);

        // Focus prev line at merge point
        setTimeout(() => {
          const prevEl = lineRefs.current[index - 1];
          if (prevEl) {
            prevEl.focus();
            prevEl.setSelectionRange(prevContent.length, prevContent.length);
          }
        }, 0);
      }
    } else if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      lineRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowDown' && index < editableLines.length - 1) {
      e.preventDefault();
      lineRefs.current[index + 1]?.focus();
    }
  };

  const handleSaveEdit = () => {
    if (!onSaveContent) return;
    onSaveContent(generateHtmlContent());
  };

  // --- Viewer Mode Effects ---
  useEffect(() => {
    if (!isEditing && contentRef.current && activeTranscript) {
      contentRef.current.innerHTML = activeTranscript.content;
      updateGutterMarkers();
    }
  }, [activeTranscript?.id, activeTranscript?.content, isEditing]);

  // Apply Styles & Focused Code Logic (Viewer Only)
  useEffect(() => {
    if (contentRef.current && !isEditing) {
      contentRef.current.style.fontSize = `${settings.fontSize}px`;
      contentRef.current.style.lineHeight = `${settings.lineHeight}`;
      contentRef.current.style.letterSpacing = `${settings.charSpacing}px`;

      if (settings.fontFamily === 'dyslexic') {
        contentRef.current.style.fontFamily = 'OpenDyslexic, sans-serif';
        if (!document.getElementById('dyslexic-font')) {
          const style = document.createElement('style');
          style.id = 'dyslexic-font';
          style.textContent = `@font-face { font-family: 'OpenDyslexic'; src: url('https://cdnjs.cloudflare.com/ajax/libs/opendyslexic/0.91.0/OpenDyslexic-Regular.otf'); }`;
          document.head.appendChild(style);
        }
      } else {
        contentRef.current.style.fontFamily = 'inherit';
      }

      if (settings.zebraStriping) {
        contentRef.current.classList.add('zebra-active');
      } else {
        contentRef.current.classList.remove('zebra-active');
      }

      // Apply Focus Filter
      if (focusedCodeId) {
        contentRef.current.classList.add('filtering-active');
        const allSegments = contentRef.current.querySelectorAll('.coded-segment');
        allSegments.forEach((el) => {
          const span = el as HTMLElement;
          if (span.dataset.codeId === focusedCodeId) {
            span.classList.add('focused-segment');
            span.classList.remove('dimmed-segment');
          } else {
            span.classList.add('dimmed-segment');
            span.classList.remove('focused-segment');
          }
        });
      } else {
        contentRef.current.classList.remove('filtering-active');
        const allSegments = contentRef.current.querySelectorAll('.coded-segment');
        allSegments.forEach((el) => {
          const span = el as HTMLElement;
          span.classList.remove('focused-segment', 'dimmed-segment');
        });
      }
    }
  }, [settings, focusedCodeId, activeTranscript?.id, isEditing]);

  // Keyboard Shortcuts (Save)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isEditing) {
          handleSaveEdit();
        } else {
          onSaveProject?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSaveProject, isEditing, editableLines]); // Depends on editableLines for save

  const getGlobalOffsets = (root: HTMLElement, range: Range) => {
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(root);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    const start = preCaretRange.toString().length;
    const end = start + range.toString().length;
    return { start, end };
  };

  const highlightSafe = (range: Range, code: Code, selId: string): boolean => {
    const root = contentRef.current;
    if (!root) return false;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      }
    );

    const textNodes: Text[] = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      textNodes.push(currentNode as Text);
      currentNode = walker.nextNode();
    }

    if (textNodes.length === 0) return false;

    textNodes.forEach((node) => {
      const isStart = node === range.startContainer;
      const isEnd = node === range.endContainer;

      let startOffset = 0;
      let endOffset = node.length;

      if (isStart) startOffset = range.startOffset;
      if (isEnd) endOffset = range.endOffset;

      if (startOffset === endOffset) return;

      let targetNode = node;
      if (endOffset < node.length) targetNode.splitText(endOffset);
      if (startOffset > 0) targetNode = targetNode.splitText(startOffset);

      const span = document.createElement('span');
      span.style.backgroundColor = `${code.color}40`; // 25% opacity
      span.style.textDecoration = 'underline';
      span.style.textDecorationColor = code.color;
      span.className = "coded-segment cursor-pointer transition-colors";
      span.title = code.name;
      span.dataset.codeId = code.id;
      span.dataset.selectionId = selId;

      const parent = targetNode.parentNode;
      if (parent) {
        parent.insertBefore(span, targetNode);
        span.appendChild(targetNode);
      }
    });

    root.normalize();
    return true;
  };

  // --- Gutter Marker Logic ---
  const updateGutterMarkers = () => {
    if (!contentRef.current) return;

    const lines = contentRef.current.querySelectorAll('.transcript-line');

    lines.forEach(line => {
      const existing = line.querySelector('.line-codes-gutter');
      if (existing) existing.remove();

      // Also remove existing annotation markers
      const existingAnnotations = line.querySelector('.line-annotation-gutter');
      if (existingAnnotations) existingAnnotations.remove();

      const codeSpans = line.querySelectorAll('.coded-segment');
      const uniqueCodes = new Set<string>();
      const annotationsForLine: { codeName: string; codeColor: string; annotation: string }[] = [];

      codeSpans.forEach(span => {
        const el = span as HTMLElement;
        const codeId = el.dataset.codeId;
        const selId = el.dataset.selectionId;
        if (codeId) uniqueCodes.add(codeId);

        // Check if this selection has an annotation
        if (selId) {
          const sel = selections.find(s => s.id === selId);
          if (sel?.annotation) {
            if (sel?.annotation) {
              const code = visibleCodes.find(c => c.id === codeId);
              if (code) {
                annotationsForLine.push({
                  codeName: code.name,
                  codeColor: code.color,
                  annotation: sel.annotation
                });
              }
            }
          }
        }
      });

      if (uniqueCodes.size > 0) {
        const gutter = document.createElement('div');
        gutter.className = 'line-codes-gutter';

        uniqueCodes.forEach(codeId => {
          const code = visibleCodes.find(c => c.id === codeId);
          if (code) {
            const marker = document.createElement('div');
            marker.className = 'gutter-marker cursor-pointer hover:scale-105 transition-transform';
            marker.style.color = code.color;
            marker.innerHTML = `<span class="bracket">{</span> <span class="label">${code.name}</span>`;
            marker.onclick = (e) => {
              e.stopPropagation();
              setFocusedCodeId(prev => prev === codeId ? null : codeId);
            };
            gutter.appendChild(marker);
          }
        });
        line.insertBefore(gutter, line.firstChild);
      }

      // Annotation display on the right side (opposite gutter)
      if (annotationsForLine.length > 0) {
        const annotationGutter = document.createElement('div');
        annotationGutter.className = 'line-annotation-gutter';

        annotationsForLine.forEach(({ codeName, codeColor, annotation }) => {
          const bubble = document.createElement('div');
          bubble.className = 'annotation-bubble';
          bubble.style.borderLeftColor = codeColor;
          bubble.innerHTML = `<span class="annotation-code-label" style="color:${codeColor}">${codeName}</span><span class="annotation-text">${annotation}</span>`;
          annotationGutter.appendChild(bubble);
        });

        line.appendChild(annotationGutter);
      }
    });
  };

  const handleMouseUp = useCallback(() => {
    if (isEditing || !activeCode || !activeTranscript || !contentRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    if (!contentRef.current.contains(selection.anchorNode)) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString();

    try {
      const { start, end } = getGlobalOffsets(contentRef.current, range);
      const selId = crypto.randomUUID();
      const success = highlightSafe(range, activeCode, selId);

      if (success) {
        selection.removeAllRanges();
        const newSelection: Selection = {
          id: selId,
          codeId: activeCode.id,
          transcriptId: activeTranscript.id,
          text: selectedText,
          startIndex: start,
          endIndex: end,
          timestamp: Date.now()
        };

        const updatedHtml = contentRef.current.innerHTML;
        onSelectionCreate(newSelection, updatedHtml);
        updateGutterMarkers();
      }

    } catch (e) {
      console.error(e);
    }
  }, [activeCode, activeTranscript, onSelectionCreate, isEditing]);

  const handleClick = (e: React.MouseEvent) => {
    if (isEditing) return;

    // If clicking outside a marker or code, clear focus
    const target = e.target as HTMLElement;
    const isMarker = target.closest('.gutter-marker');
    const isCode = target.closest('.coded-segment');

    if (!isMarker) {
      if (!isCode && focusedCodeId) {
        setFocusedCodeId(null);
      }
    }

    const span = target.closest('.coded-segment') as HTMLElement;
    if (span) {
      e.preventDefault();
      e.stopPropagation();
      const selId = span.dataset.selectionId!;
      const sel = selections.find(s => s.id === selId);
      setAnnotationInput(sel?.annotation || '');
      setShowAnnotationInput(false);
      setContextMenu({ x: e.clientX, y: e.clientY, id: selId, text: span.textContent || '' });
    } else {
      setContextMenu(null);
      setShowAnnotationInput(false);
    }
  };

  const removeHighlight = () => {
    if (!contextMenu || !contentRef.current) return;
    const spans = contentRef.current.querySelectorAll(`span[data-selection-id="${contextMenu.id}"]`);
    spans.forEach(span => {
      const text = document.createTextNode(span.textContent || '');
      span.parentNode?.replaceChild(text, span);
    });
    contentRef.current.normalize();
    onSelectionDelete(contextMenu.id, contentRef.current.innerHTML);
    updateGutterMarkers();
    setContextMenu(null);
    setShowAnnotationInput(false);
  };

  const handleAnnotationSave = () => {
    if (!contextMenu) return;
    onAnnotateSelection?.(contextMenu.id, annotationInput);
    setShowAnnotationInput(false);
    setContextMenu(null);
  };

  const handleContextMenuEvent = (e: React.MouseEvent) => {
    if (!activeTranscript || isEditing) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString().trim();
    if (text && text.length > 0 && text.length < 80) {
      e.preventDefault();
      setInVivoSelection({ text, transcriptId: activeTranscript.id });
    }
  };

  if (!activeTranscript) {
    return <div className="flex items-center justify-center h-full text-[var(--text-muted)] bg-[var(--bg-main)]">Select a transcript to begin</div>;
  }

  // --- Render Editing Mode ---
  if (isEditing) {
    return (
      <div className="h-full flex flex-col relative bg-[var(--bg-main)]">
        {/* Editing Header / Toolbar */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 p-2 flex flex-col px-4 shrink-0">
          <div className="flex justify-between items-center w-full">
            <div className={`flex items-center gap-3 ${canEditDirectly ? 'text-amber-600' : 'text-blue-600'}`}>
              <AlertTriangle size={16} />
              <span className="text-sm font-bold">
                {canEditDirectly
                  ? "Editing Mode: Saving will reset all highlights."
                  : "Suggestion Mode: Changes will be submitted for review."}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFindReplace(!showFindReplace)}
                className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1 transition-colors ${showFindReplace ? 'bg-amber-200 text-amber-900' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}
                title="Find and Replace"
              >
                <Sparkles size={14} /> Clean / Replace
              </button>
              <div className="w-px h-6 bg-amber-500/20 mx-1"></div>
              <button
                onClick={onCancelEdit}
                className="px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--bg-main)] rounded flex items-center gap-1"
              >
                <X size={14} /> Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className={`px-4 py-1.5 text-xs font-bold ${canEditDirectly ? 'bg-[var(--accent)]' : 'bg-blue-600'} text-white hover:brightness-110 rounded flex items-center gap-1 shadow-sm`}
              >
                <Save size={14} /> {canEditDirectly ? "Save Changes" : "Propose Changes"}
              </button>
            </div>
          </div>

          {/* Find & Replace Toolbar */}
          {showFindReplace && (
            <div className="mt-2 pt-2 border-t border-amber-500/20 flex items-center gap-2 animate-in slide-in-from-top-2">
              <span className="text-xs font-bold text-amber-800">Find:</span>
              <div className="relative">
                <input
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="Text to find..."
                  className="px-2 py-1 text-xs border border-amber-300 rounded focus:ring-1 focus:ring-amber-500 outline-none w-48 pr-12"
                />
                {matchCount > 0 && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-amber-600 font-bold">
                    {matchCount} found
                  </span>
                )}
                {suggestedSearch && (
                  <button
                    onClick={() => setFindText(suggestedSearch)}
                    className="absolute top-full left-0 mt-1 bg-amber-100 text-amber-800 text-[10px] px-2 py-1 rounded shadow-md border border-amber-300 z-50 hover:bg-amber-200 whitespace-nowrap"
                  >
                    Did you mean <strong>{suggestedSearch}</strong>?
                  </button>
                )}
              </div>

              <button
                onClick={() => setIsCaseSensitive(!isCaseSensitive)}
                className={`px-2 py-1 text-xs font-bold border rounded transition-colors ${isCaseSensitive ? 'bg-amber-300 border-amber-400 text-amber-900' : 'bg-white border-amber-200 text-amber-500 hover:bg-amber-50'}`}
                title="Case Sensitive"
              >
                Aa
              </button>

              <div className="flex items-center gap-1 mx-2 pl-2 border-l border-amber-300">
                <span className="text-[10px] font-bold text-amber-800">Fuzzy: {fuzzyThreshold}</span>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={fuzzyThreshold}
                  onChange={(e) => setFuzzyThreshold(parseInt(e.target.value))}
                  className="w-16 h-1 bg-amber-200 rounded-lg appearance-none cursor-pointer"
                  title="Fuzzy Match Threshold"
                />
              </div>

              <span className="text-xs font-bold text-amber-800 ml-2">Replace with:</span>
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replacement..."
                className="px-2 py-1 text-xs border border-amber-300 rounded focus:ring-1 focus:ring-amber-500 outline-none w-48"
              />
              <button
                onClick={handleReplaceSelected}
                disabled={selectedMatches.size === 0}
                className="ml-2 px-3 py-1 bg-amber-600 text-white text-xs font-bold rounded hover:bg-amber-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Replace Selected ({selectedMatches.size})
              </button>
              <div className="flex-1"></div>
              <button onClick={() => setShowFindReplace(false)} className="text-amber-500 hover:text-amber-700"><X size={14} /></button>
            </div>
          )}
        </div>

        {/* Flex Container for Sidebar + Editor */}
        <div className="flex-1 flex overflow-hidden">

          {/* Matches Sidebar */}
          {showFindReplace && foundMatches.length > 0 && (
            <div className="w-64 bg-amber-50 border-r border-amber-200 flex flex-col overflow-hidden animate-in slide-in-from-left-5 shrink-0">
              <div className="p-2 border-b border-amber-200 bg-amber-100 flex items-center justify-between shrink-0">
                <span className="text-xs font-bold text-amber-900 uppercase">Matches ({foundMatches.length})</span>
                <div className="flex items-center gap-1 cursor-pointer" onClick={() => {
                  if (selectedMatches.size === foundMatches.length) setSelectedMatches(new Set());
                  else setSelectedMatches(new Set(foundMatches.map(m => m.id)));
                }}>
                  <input
                    type="checkbox"
                    checked={selectedMatches.size > 0 && selectedMatches.size === foundMatches.length}
                    readOnly
                    className="w-3 h-3 text-amber-600 rounded focus:ring-amber-500 pointer-events-none"
                  />
                  <span className="text-[10px] text-amber-800 select-none">Select All</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {foundMatches.map(match => (
                  <div
                    key={match.id}
                    className={`p-2 rounded border text-xs cursor-pointer transition-colors ${selectedMatches.has(match.id) ? 'bg-white border-amber-300 shadow-sm' : 'bg-transparent border-transparent hover:bg-amber-100'}`}
                    onClick={() => {
                      // Scroll to line
                      lineRefs.current[match.lineIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedMatches.has(match.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          const newSet = new Set(selectedMatches);
                          if (e.target.checked) newSet.add(match.id);
                          else newSet.delete(match.id);
                          setSelectedMatches(newSet);
                        }}
                        className="mt-0.5 w-3 h-3 text-amber-600 rounded focus:ring-amber-500 flex-shrink-0 cursor-pointer"
                      />
                      <div className="break-words w-full">
                        <div className="text-amber-900 font-mono" dangerouslySetInnerHTML={{
                          __html: match.context.replace(match.text, `<span class="bg-amber-300 text-amber-900 font-bold px-0.5 rounded">${match.text}</span>`)
                        }} />
                        <div className="text-[10px] text-amber-500 mt-1">Line {match.lineIndex + 1}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Editor Canvas */}
          <div className="flex-1 overflow-auto p-8 font-mono text-sm bg-white" onClick={() => setShowFindReplace(false)}>
            <div className="max-w-4xl mx-auto space-y-1 min-h-[500px] shadow-sm bg-white p-8 border border-gray-100 rounded-lg">
              {editableLines.map((line, i) => (
                <div key={line.id} className="flex gap-4 group mb-1">
                  {/* Gutter / Line Number */}
                  <div className="w-8 shrink-0 text-right text-xs text-slate-300 select-none pt-2 group-hover:text-slate-500 transition-colors font-mono">
                    {i + 1}
                  </div>

                  {/* Content Cell */}
                  <div className="flex-1 min-w-0 relative">
                    <textarea
                      ref={el => lineRefs.current[i] = el}
                      value={line.content}
                      onChange={(e) => handleLineChange(i, e.target.value)}
                      onKeyDown={(e) => handleLineKeyDown(e, i)}
                      className="w-full bg-transparent border-b border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] resize-none outline-none py-1 px-1 text-[var(--text-main)] transition-colors leading-relaxed"
                      style={{
                        fontSize: `${settings.fontSize}px`,
                        minHeight: '1.8em',
                        height: 'auto'
                      }}
                      rows={1}
                    />
                    {/* Line Controls (Insert) */}
                    <button
                      className="absolute -right-6 top-1.5 opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-[var(--accent)] transition-all"
                      title="Insert line below (Enter)"
                      onClick={() => {
                        const newLines = [...editableLines];
                        newLines.splice(i + 1, 0, { id: crypto.randomUUID(), content: '' });
                        setEditableLines(newLines);
                      }}
                    >
                      <CornerDownLeft size={12} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Empty State / Add Line at end */}
              <div
                className="mt-4 flex gap-4 text-slate-300 hover:text-[var(--accent)] cursor-pointer group"
                onClick={() => {
                  setEditableLines([...editableLines, { id: crypto.randomUUID(), content: '' }]);
                }}
              >
                <div className="w-8"></div>
                <div className="flex items-center gap-2 text-sm italic border border-dashed border-slate-200 rounded px-4 py-2 w-full group-hover:border-[var(--accent)] transition-colors">
                  <Plus size={14} /> Add new line
                </div>
              </div>
            </div>
          </div>
        </div>
      </div >
    );
  }

  // --- Render Viewer Mode (Existing) ---
  return (
    <div className="h-full flex flex-col relative bg-[var(--bg-main)]">
      <div className="bg-[var(--bg-panel)] p-3 border-b border-[var(--border)] flex justify-between items-center shadow-sm z-10 shrink-0">
        <h2 className="font-bold text-[var(--text-main)]">{activeTranscript.name}</h2>
        <div className="flex items-center gap-4">
          <select
            value={codebookFilter}
            onChange={(e) => setCodebookFilter(e.target.value as any)}
            className="text-xs font-bold bg-[var(--bg-main)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-main)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          >
            <option value="all">All Codes</option>
            <option value="master">Master Only</option>
            <option value="personal">Personal Only</option>
          </select>
          {activeCode && (
            <div className="text-sm font-medium px-3 py-1 rounded bg-[var(--bg-main)] border border-[var(--border)] text-[var(--text-main)] flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: activeCode.color }} />
              Coding with: {activeCode.name}
            </div>
          )}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto relative print:overflow-visible p-8"
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onContextMenu={handleContextMenuEvent}
      >
        {/* Filter Banner */}
        {focusedCodeId && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-slate-800 text-white px-3 py-1 rounded-full text-xs shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
            <span>Filtering by: <strong>{codes.find(c => c.id === focusedCodeId)?.name}</strong></span>
            <button onClick={() => setFocusedCodeId(null)} className="hover:text-red-300"><X size={12} /></button>
          </div>
        )}

        <div
          ref={contentRef}
          onDoubleClick={handleTranscriptDoubleClick}
          className="transcript-content outline-none mx-auto bg-[var(--bg-paper)] text-[var(--text-main)] shadow-xl min-h-[11in] relative"
          style={{
            maxWidth: '850px',
            padding: '3rem 3rem 3rem 13rem',
            cursor: activeCode ? 'cell' : 'text'
          }}
        >
          {/* Sticky Notes Layer */}
          {stickyNotes
            .filter(n => n.transcriptId === activeTranscript.id)
            .filter(n => showTeamNotes || n.authorId === currentUserId)
            .map(note => (
              <div
                key={note.id}
                className={`absolute z-10 w-40 p-2 shadow-lg rounded text-[var(--text-main)] border border-amber-300/50 transition-all group ${readOnly ? '' : 'hover:z-50'}`}
                style={{
                  left: `${note.x}%`,
                  top: `${note.y}%`,
                  backgroundColor: note.color || '#fef3c7',
                  transform: 'translate(-50%, -50%)', // Centered on click
                  fontFamily: 'cursive',
                  fontSize: '0.85rem'
                }}
                onClick={(e) => e.stopPropagation()} // Prevent closing other things
                onDoubleClick={(e) => e.stopPropagation()} // Prevent creating new note
              >
                <textarea
                  className="w-full bg-transparent resize-none outline-none overflow-hidden"
                  value={note.content}
                  onChange={(e) => !readOnly && onUpdateStickyNote?.(note.id, { content: e.target.value })}
                  rows={Math.max(2, note.content.split('\n').length)}
                  placeholder="Note..."
                  style={{ minHeight: '40px' }}
                  readOnly={readOnly || note.authorId !== currentUserId}
                />
                <div className="flex justify-between items-center mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] text-slate-500 font-sans truncate max-w-[80px]">{note.authorName}</span>
                  <button
                    onClick={() => onDeleteStickyNote?.(note.id)}
                    className="text-slate-400 hover:text-red-600 p-0.5 rounded"
                    title="Delete Note"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Context Menu for Coded Segments */}
      {
        contextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setContextMenu(null); setShowAnnotationInput(false); }} />
            <div
              className="fixed bg-[var(--bg-panel)] shadow-xl border border-[var(--border)] rounded-lg z-50 p-1 min-w-[200px]"
              style={{ top: contextMenu.y + 5, left: contextMenu.x }}
            >
              {showAnnotationInput ? (
                <div className="p-2" onClick={e => e.stopPropagation()}>
                  <textarea
                    className="w-full text-xs p-2 border border-[var(--border)] rounded bg-[var(--bg-main)] text-[var(--text-main)] resize-none focus:ring-1 focus:ring-[var(--accent)]"
                    rows={3}
                    placeholder="Add a note about this segment..."
                    value={annotationInput}
                    onChange={e => setAnnotationInput(e.target.value)}
                    autoFocus
                  />
                  <div className="flex justify-end gap-1 mt-1">
                    <button onClick={() => setShowAnnotationInput(false)} className="px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-main)] rounded">
                      Cancel
                    </button>
                    <button onClick={handleAnnotationSave} className="px-2 py-1 text-xs bg-[var(--accent)] text-[var(--accent-text)] rounded font-bold">
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setShowAnnotationInput(true)}
                    className="flex items-center gap-2 px-3 py-2 text-[var(--text-main)] hover:bg-[var(--bg-main)] rounded text-sm w-full text-left"
                  >
                    <MessageSquare size={14} />
                    {selections.find(s => s.id === contextMenu.id)?.annotation ? 'Edit Annotation' : 'Annotate'}
                  </button>
                  <button onClick={removeHighlight} className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded text-sm w-full text-left">
                    <Trash2 size={14} /> Remove Highlight
                  </button>
                </>
              )}
            </div>
          </>
        )
      }

      {/* In-Vivo Coding Popup */}
      {
        inVivoSelection && (
          <>
            <div className="fixed inset-0 bg-black/20 z-50" onClick={() => setInVivoSelection(null)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--bg-panel)] rounded-xl shadow-2xl border border-[var(--border)] p-5 z-50 w-80">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-amber-500" />
                <h3 className="font-bold text-sm text-[var(--text-main)]">In-Vivo Code</h3>
              </div>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Create a new code from selected text:
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm font-medium text-amber-800 italic">
                "{inVivoSelection.text}"
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setInVivoSelection(null)}
                  className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-main)] rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onCreateInVivoCode?.(inVivoSelection.text, inVivoSelection.transcriptId);
                    setInVivoSelection(null);
                  }}
                  className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded font-bold hover:bg-amber-600"
                >
                  <Sparkles size={12} className="inline mr-1" /> Create Code
                </button>
              </div>
            </div>
          </>
        )
      }

      <style>{`
        .transcript-line {
            display: block;
            padding: 8px 16px;
            margin: 0;
            position: relative;
            line-height: 1.8;
        }

        .transcript-paragraph-break {
            display: block;
            height: 1em;
            user-select: none;
            pointer-events: none;
        }

        .transcript-page-break {
            display: block;
            height: 2px;
            margin: 1.5em 16px;
            border-top: 2px dashed var(--border, #ccc);
            user-select: none;
            pointer-events: none;
            position: relative;
        }

        .transcript-page-break::after {
            content: 'Page Break';
            position: absolute;
            top: -0.7em;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-paper, #fff);
            padding: 0 8px;
            font-size: 0.65em;
            color: var(--text-muted, #999);
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }
        
        .transcript-line::before {
            content: attr(data-line);
            position: absolute;
            left: -35px;
            width: 30px;
            text-align: right;
            color: var(--text-muted); /* Theme Color */
            font-size: 0.7em;
            user-select: none;
        }

        .line-codes-gutter {
            position: absolute;
            left: -190px;
            width: 150px;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            padding-right: 8px;
            pointer-events: auto; /* Enable clicks on gutter items */
            user-select: none;
        }

        .line-annotation-gutter {
            position: absolute;
            right: -220px;
            top: 0;
            width: 200px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            pointer-events: auto;
            user-select: none;
        }

        .annotation-bubble {
            background: var(--bg-panel, #f8fafc);
            border: 1px solid var(--border, #e2e8f0);
            border-left: 3px solid #999;
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 0.7rem;
            line-height: 1.3;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            max-width: 200px;
            word-wrap: break-word;
        }

        .annotation-code-label {
            display: block;
            font-weight: 700;
            font-size: 0.6rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 1px;
        }

        .annotation-text {
            display: block;
            color: var(--text-muted, #64748b);
            font-style: italic;
        }

        .gutter-marker {
            font-size: 0.75rem;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
            margin-bottom: 2px;
        }

        .coded-segment {
            cursor: pointer;
            border-radius: 0; /* Radius can sometimes cause issues with background rects, safer to remove or keep small */
            display: inline; 
            padding: 0;
            margin: 0;
            line-height: inherit;
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
        }

        .gutter-marker .bracket {
            font-size: 1.2em;
            line-height: 1;
        }

        /* Themed Zebra — use nth-of-type so paragraph-break divs are not counted */
        .zebra-active .transcript-line:nth-of-type(odd) {
            background-color: var(--zebra-odd); 
        }
        .zebra-active .transcript-line:nth-of-type(even) {
            background-color: transparent;
        }

        /* Filtering Logic - Color Based */
        .filtering-active {
            color: var(--text-muted) !important; /* Grey out everything by default */
        }
        
        .filtering-active .transcript-line {
            color: var(--text-muted);
        }

        .filtering-active .coded-segment {
            color: var(--text-muted); /* Inherit grey */
            text-decoration-color: transparent !important; /* Hide underline */
            background-color: transparent !important;
        }

        .filtering-active .focused-segment {
            color: var(--text-main) !important; /* Highlight focused */
            font-weight: 500;
            text-decoration-color: currentColor !important; /* Restore underline */
        }
        
        /* Ensure inline styles for border-color work on focused items */
        .filtering-active .focused-segment[style] {
             border-bottom-style: solid !important;
        }

        @media print {
            .h-full { height: auto; overflow: visible; }
            .bg-slate-200 { background: white; }
            .transcript-content { 
                box-shadow: none; 
                margin: 0; 
                padding: 0 !important; 
                max-width: 100%; 
            }
            .line-codes-gutter { display: none; } 
            .coded-segment { border-bottom: 2px solid #000 !important; color: #000 !important; }
        }
      `}</style>
    </div >
  );
});