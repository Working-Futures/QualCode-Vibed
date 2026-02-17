import React, { useRef, useEffect, useCallback, memo, useState, useLayoutEffect } from 'react';
import { Transcript, Code, Selection, AppSettings, StickyNote } from '../types';
import { Trash2, MessageSquare, Sparkles, X, Save, Plus, CornerDownLeft, AlertTriangle, ArrowDown, ArrowUp, StickyNote as StickyNoteIcon } from 'lucide-react';


import { TranscriptNoteLayer, TranscriptNoteLayerHandle } from './TranscriptNoteLayer';
import { restoreHighlights, stripHighlights } from '../utils/highlightUtils';

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
  showStickyBoard?: boolean;
  onCloseStickyBoard?: () => void;
  currentUserId?: string;
  projectId?: string;
  codebookFilter?: 'all' | 'master' | 'personal';
  onAlert: (title: string, message: string) => void;
  onConfirm: (title: string, message: string, onConfirm: () => void) => void;
  hiddenCodeIds?: Set<string>;
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
  showStickyBoard = false,
  onCloseStickyBoard,
  currentUserId,
  readOnly = false,
  canEditDirectly = true, // Default to true for backward compatibility
  projectId,
  codebookFilter = 'all',
  onAlert,
  onConfirm,
  hiddenCodeIds
}) => {
  // Viewing Mode Refs


  const contentRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const noteLayerRef = useRef<TranscriptNoteLayerHandle>(null);

  // ... (rest of existing state)

  // Sticky Note Logic
  const handleTranscriptClick = (e: React.MouseEvent) => {
    if (isEditing || readOnly || !onAddStickyNote || !activeTranscript || !contentRef.current) return;

    // Only allow adding notes if holding Alt/Option key to avoid conflict with text selection
    // OR if double click (handled separately). Let's use Double Click for creation.
  };

  const handleTranscriptDoubleClick = (e: React.MouseEvent) => {
    // Note creation moved to distinct button to prevent accidental creation
    // Double click can be reserved for other actions if needed
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
  const [inVivoSelection, setInVivoSelection] = useState<{ text: string, transcriptId: string, range: Range } | null>(null);
  const [inVivoFilter, setInVivoFilter] = useState('');
  const [focusedCodeId, setFocusedCodeId] = useState<string | null>(null);
  const [focusedSelectionId, setFocusedSelectionId] = useState<string | null>(null);

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

  const visibleCodes = React.useMemo(() => {
    // We no longer filter out hidden codes here so that gutter markers persist.
    // Hiding highlights is handled in the rendering effect (applying .hidden-highlight class).

    if (codebookFilter === 'all') return codes;

    // Master view includes suggested codes
    if (codebookFilter === 'master') return codes.filter(c => (c.type === 'master' || c.type === 'suggested'));
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

      // START FIX: Clean artifacts before parsing text
      div.querySelectorAll('.line-codes-gutter, .line-annotation-gutter').forEach(el => el.remove());
      // END FIX


      const lines = Array.from(div.querySelectorAll('.transcript-line'));

      if (lines.length > 0) {
        setEditableLines(lines.map(l => {
          let content = l.textContent || '';
          // FIX: Remove gutter text artifacts if present (e.g. "{ New Code") which can occur if styles were missing or content was flattened
          content = content.replace(/^(\s*\{\s+[^{}]+\s*)+/g, '').trimStart();
          return {
            id: crypto.randomUUID(),
            content
          };
        }));
      } else {
        // Fallback for raw text without structure
        const rawLines = (div.textContent || '').split('\n').filter(l => l.trim());
        setEditableLines(rawLines.map(l => {
          let content = l;
          // FIX: Remove gutter text artifacts here too
          content = content.replace(/^(\s*\{\s+[^{}]+\s*)+/g, '').trimStart();
          return {
            id: crypto.randomUUID(),
            content
          };
        }));
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

  // Auto-resize all textareas when entering edit mode or when lines change
  useLayoutEffect(() => {
    if (isEditing) {
      lineRefs.current.forEach(el => {
        if (el) {
          el.style.height = 'auto';
          el.style.height = el.scrollHeight + 'px';
        }
      });
    }
  }, [isEditing, editableLines, settings]);

  // Handle Editing Actions
  const handleLineChange = (index: number, val: string) => {
    const newLines = [...editableLines];
    newLines[index].content = val;
    setEditableLines(newLines);

    // Auto-resize handled by useLayoutEffect now
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

  const applyZebraStriping = useCallback(() => {
    if (!contentRef.current) return;

    if (settings.zebraStriping) {
      contentRef.current.classList.add('zebra-active');
      const lines = contentRef.current.querySelectorAll('.transcript-line');
      lines.forEach((line, index) => {
        if (index % 2 === 0) line.classList.add('zebra-row-odd');
        else line.classList.remove('zebra-row-odd');
      });
    } else {
      contentRef.current.classList.remove('zebra-active');
      const lines = contentRef.current.querySelectorAll('.transcript-line');
      lines.forEach(line => line.classList.remove('zebra-row-odd'));
    }
  }, [settings.zebraStriping]);

  // --- Viewer Mode Effects ---
  useEffect(() => {
    if (!isEditing && contentRef.current && activeTranscript) {
      // Start with clean content, then re-apply highlights from selections
      let html = stripHighlights(activeTranscript.content);
      const transcriptSelections = (selections || []).filter(s => s.transcriptId === activeTranscript.id);
      if (transcriptSelections.length > 0) {
        html = restoreHighlights(html, transcriptSelections, visibleCodes);
      }
      contentRef.current.innerHTML = html;
      updateGutterMarkers();
      applyZebraStriping(); // Re-apply striping immediately after content update
    }
  }, [activeTranscript?.id, activeTranscript?.content, isEditing, selections, visibleCodes, settings.zebraStriping]);



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

      applyZebraStriping();

      // Apply Focus Filter & Visibility
      if (focusedCodeId || focusedSelectionId) {
        contentRef.current.classList.add('filtering-active');
        const allSegments = contentRef.current.querySelectorAll('.coded-segment');
        allSegments.forEach((el) => {
          const span = el as HTMLElement;
          const codeId = span.dataset.codeId;

          const isMatch = focusedCodeId
            ? codeId === focusedCodeId
            : span.dataset.selectionId === focusedSelectionId;

          // Remove any previous classes
          span.classList.remove('focused-segment', 'dimmed-segment', 'hidden-highlight');

          if (isMatch) {
            span.classList.add('focused-segment');
          } else {
            span.classList.add('dimmed-segment');
          }

          // Apply hidden state regardless of focus
          if (codeId && hiddenCodeIds?.has(codeId)) {
            span.classList.add('hidden-highlight');
          }
        });
      } else {
        contentRef.current.classList.remove('filtering-active');
        const allSegments = contentRef.current.querySelectorAll('.coded-segment');
        allSegments.forEach((el) => {
          const span = el as HTMLElement;
          const codeId = span.dataset.codeId;

          span.classList.remove('focused-segment', 'dimmed-segment', 'hidden-highlight');

          // Apply hidden state
          if (codeId && hiddenCodeIds?.has(codeId)) {
            span.classList.add('hidden-highlight');
          }
        });
      }
    }
  }, [settings, focusedCodeId, focusedSelectionId, activeTranscript?.id, activeTranscript?.content, isEditing, applyZebraStriping, hiddenCodeIds]);

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
    // Traverse all text nodes up to the start point, IGNORING gutter elements
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Check if node is inside a gutter
        let p = node.parentElement;
        while (p && p !== root) {
          if (p.classList.contains('line-codes-gutter') || p.classList.contains('line-annotation-gutter')) {
            return NodeFilter.FILTER_REJECT;
          }
          p = p.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let start = 0;
    let foundStart = false;
    let currentNode = walker.nextNode();

    while (currentNode) {
      if (currentNode === range.startContainer) {
        start += range.startOffset;
        foundStart = true;
        break;
      }
      start += (currentNode.textContent || '').length;
      currentNode = walker.nextNode();
    }

    // Now calculate the length of the selection itself
    let length = 0;
    if (foundStart) {
      // If start and end are in the same node
      if (range.startContainer === range.endContainer) {
        length = range.endOffset - range.startOffset;
      } else {
        // Start node part
        length += (range.startContainer.textContent || '').length - range.startOffset;

        // Intermediate nodes
        currentNode = walker.nextNode();
        while (currentNode) {
          if (currentNode === range.endContainer) {
            length += range.endOffset;
            break;
          }
          length += (currentNode.textContent || '').length;
          currentNode = walker.nextNode();
        }
      }
    }

    return { start, end: start + length };
  };

  const highlightSafe = (range: Range, code: Code, selId: string): boolean => {
    const root = contentRef.current;
    if (!root) return false;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Check if node is inside a gutter
          let p = node.parentElement;
          while (p && p !== root) {
            if (p.classList.contains('line-codes-gutter') || p.classList.contains('line-annotation-gutter')) {
              return NodeFilter.FILTER_REJECT;
            }
            p = p.parentElement;
          }
          return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
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
    // Track which annotations have already been displayed (to prevent duplicates on multi-line selections)
    const displayedAnnotationSelectionIds = new Set<string>();

    lines.forEach(line => {
      const existing = line.querySelector('.line-codes-gutter');
      if (existing) existing.remove();

      // Also remove existing annotation markers
      const existingAnnotations = line.querySelector('.line-annotation-gutter');
      if (existingAnnotations) existingAnnotations.remove();

      const codeSpans = line.querySelectorAll('.coded-segment');
      const uniqueSelIds = new Set<string>();
      const annotationsForLine: { codeName: string; codeColor: string; annotation: string }[] = [];

      codeSpans.forEach(span => {
        const el = span as HTMLElement;
        const selId = el.dataset.selectionId;
        if (selId) uniqueSelIds.add(selId);

        // Check if this selection has an annotation
        if (selId) {
          const sel = selections.find(s => s.id === selId);
          if (sel?.annotation &&
            !annotationsForLine.some(a => a.annotation === sel.annotation) && // Avoid duplicates on same line
            !displayedAnnotationSelectionIds.has(selId)) { // Avoid duplicates across lines (show only on first line)

            const codeId = el.dataset.codeId;
            const code = visibleCodes.find(c => c.id === codeId);
            if (code) {
              annotationsForLine.push({
                codeName: code.name,
                codeColor: code.color,
                annotation: sel.annotation
              });
              displayedAnnotationSelectionIds.add(selId);
            }
          }
        }
      });

      if (uniqueSelIds.size > 0) {
        const gutter = document.createElement('div');
        gutter.className = 'line-codes-gutter';
        gutter.setAttribute('contenteditable', 'false');
        gutter.style.userSelect = 'none';

        uniqueSelIds.forEach(selId => {
          const sel = selections.find(s => s.id === selId);
          if (!sel) return;
          const code = visibleCodes.find(c => c.id === sel.codeId);
          if (code) {
            const marker = document.createElement('div');
            marker.className = 'gutter-marker cursor-pointer hover:scale-105 transition-transform';
            marker.style.color = code.color;
            marker.innerHTML = `<span class="bracket">{</span> <span class="label">${code.name}</span>`;
            marker.onclick = (e) => {
              e.stopPropagation();
              setFocusedSelectionId(prev => prev === selId ? null : selId);
              setFocusedCodeId(null); // Clear code focus
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
        annotationGutter.setAttribute('contenteditable', 'false');
        annotationGutter.style.userSelect = 'none';

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
    if (isEditing || readOnly || !activeCode || !activeTranscript || !contentRef.current) return;
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

        // Create a cleaner version of HTML without gutters for storage
        const clone = contentRef.current.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('.line-codes-gutter, .line-annotation-gutter').forEach(el => el.remove());
        const updatedHtml = clone.innerHTML;
        onSelectionCreate(newSelection, updatedHtml);
        updateGutterMarkers();
      }

    } catch (e) {
      console.error(e);
    }
  }, [activeCode, activeTranscript, onSelectionCreate, isEditing, readOnly]);

  const handleClick = (e: React.MouseEvent) => {
    if (isEditing) return;
    // In read-only mode, don't show the context menu for coded segments
    if (readOnly) return;

    // If clicking outside a marker or code, clear focus
    const target = e.target as HTMLElement;
    const isMarker = target.closest('.gutter-marker');
    const isCode = target.closest('.coded-segment');

    if (!isMarker) {
      if (!isCode && (focusedCodeId || focusedSelectionId)) {
        setFocusedCodeId(null);
        setFocusedSelectionId(null);
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
    if (readOnly || !contextMenu || !contentRef.current) return;
    const spans = contentRef.current.querySelectorAll(`span[data-selection-id="${contextMenu.id}"]`);
    spans.forEach(span => {
      const text = document.createTextNode(span.textContent || '');
      span.parentNode?.replaceChild(text, span);
    });
    contentRef.current.normalize();
    const clone = contentRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.line-codes-gutter, .line-annotation-gutter').forEach(el => el.remove());
    onSelectionDelete(contextMenu.id, clone.innerHTML);
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
    if (!activeTranscript || isEditing || readOnly) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const text = selection.toString().trim();
    if (text && text.length > 0 && text.length < 80) {
      e.preventDefault();
      const range = selection.getRangeAt(0).cloneRange();
      setInVivoSelection({ text, transcriptId: activeTranscript.id, range });
      setInVivoFilter('');
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
                  ? "Editing Mode: Codes on edited lines will be reset."
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
        <div key="editor-content" className="flex-1 flex overflow-hidden">

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

          {/* Main Editor Canvas — mirrors viewer styling */}
          <div className="flex-1 overflow-auto p-8 bg-[var(--bg-main)]" onClick={() => setShowFindReplace(false)}>
            <div
              className="transcript-content-wrapper mx-auto relative"
              style={{ maxWidth: '850px' }}
            >
              <div
                className={`transcript-content outline-none bg-[var(--bg-paper)] text-[var(--text-main)] shadow-xl min-h-[11in] ${settings.zebraStriping ? 'zebra-active' : ''}`}
                style={{
                  padding: '3rem 3rem 3rem 4rem',
                  fontSize: `${settings.fontSize}px`,
                  lineHeight: `${settings.lineHeight}`,
                  letterSpacing: `${settings.charSpacing}px`,
                  fontFamily: settings.fontFamily === 'dyslexic' ? 'OpenDyslexic, sans-serif' : 'inherit',
                }}
              >
                {editableLines.map((line, i) => (
                  <div
                    key={line.id}
                    className={`transcript-line group ${settings.zebraStriping && i % 2 === 0 ? 'zebra-row-odd' : ''}`}
                    data-line={i + 1}
                    style={{ padding: '4px 16px', position: 'relative' }}
                  >
                    <textarea
                      ref={el => lineRefs.current[i] = el}
                      value={line.content}
                      onChange={(e) => handleLineChange(i, e.target.value)}
                      onKeyDown={(e) => handleLineKeyDown(e, i)}
                      className="w-full bg-transparent resize-none outline-none text-[var(--text-main)] transition-colors border-b border-transparent focus:border-[var(--accent)] overflow-hidden"
                      style={{
                        fontSize: 'inherit',
                        lineHeight: 'inherit',
                        letterSpacing: 'inherit',
                        fontFamily: 'inherit',
                        minHeight: '1.8em',
                        height: 'auto',
                        padding: '2px 0',
                      }}
                      rows={1}
                    />
                    {/* Line Controls (Insert) */}
                    <button
                      className="absolute -right-6 top-1.5 opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-[var(--accent)] transition-all"
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
                ))}

                {/* Add Line at end */}
                <div
                  className="mt-2 text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer group"
                  style={{ padding: '4px 16px', marginLeft: '0' }}
                  onClick={() => {
                    setEditableLines([...editableLines, { id: crypto.randomUUID(), content: '' }]);
                  }}
                >
                  <div className="flex items-center gap-2 text-sm italic border border-dashed border-[var(--border)] rounded px-4 py-2 group-hover:border-[var(--accent)] transition-colors">
                    <Plus size={14} /> Add new line
                  </div>
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
          <button
            onClick={() => noteLayerRef.current?.addNote()}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-amber-100 text-amber-900 rounded-full hover:bg-amber-200 transition-colors"
            title="Add Sticky Note"
          >
            <StickyNoteIcon size={14} /> Add Note
          </button>
          {activeCode && (
            <div className="text-sm font-medium px-3 py-1 rounded bg-[var(--bg-main)] border border-[var(--border)] text-[var(--text-main)] flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: activeCode.color }} />
              Coding with: {activeCode.name}
            </div>
          )}
        </div>
      </div>

      <div
        key="viewer-content"
        className="flex-1 overflow-y-auto relative print:overflow-visible p-8"
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onContextMenu={handleContextMenuEvent}
      >
        {/* Filter Banner */}
        {(focusedCodeId || focusedSelectionId) && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-slate-800 text-white px-3 py-1 rounded-full text-xs shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
            {focusedCodeId ? (
              <span>Filtering by: <strong>{codes.find(c => c.id === focusedCodeId)?.name}</strong></span>
            ) : (
              <span>Instance Selected</span>
            )}
            <button onClick={() => { setFocusedCodeId(null); setFocusedSelectionId(null); }} className="hover:text-red-300"><X size={12} /></button>
          </div>
        )}

        <div
          className="transcript-content-wrapper mx-auto relative"
          style={{ maxWidth: '850px' }}
          ref={wrapperRef}
        >
          {/* Transcript content - managed imperatively via innerHTML, NO React children allowed */}
          <div
            ref={contentRef}
            onDoubleClick={handleTranscriptDoubleClick}
            className="transcript-content outline-none bg-[var(--bg-paper)] text-[var(--text-main)] shadow-xl min-h-[11in]"
            style={{
              padding: '3rem 3rem 3rem 13rem',
              cursor: activeCode ? 'cell' : 'text'
            }}
          />

          {/* Sticky Notes Layer */}
          {projectId && (
            <TranscriptNoteLayer
              notes={stickyNotes}
              projectId={projectId || ''}
              currentUser={{ uid: currentUserId || '', displayName: currentUserId || 'User' }}
              activeTranscriptId={activeTranscript?.id}
              codebookFilter={codebookFilter}
              showTeamNotes={showTeamNotes}
              ref={noteLayerRef}
              containerRef={contentRef}
              readOnly={readOnly}
              onConfirm={onConfirm}
            />
          )}
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
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--bg-panel)] rounded-xl shadow-2xl border border-[var(--border)] p-0 z-50 w-96 overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-main)]">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-amber-500" />
                  <h3 className="font-bold text-sm text-[var(--text-main)]">Coding Actions</h3>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs font-medium text-amber-800 italic mb-3 truncate">
                  "{inVivoSelection.text}"
                </div>

                <button
                  onClick={() => {
                    onCreateInVivoCode?.(inVivoSelection.text, inVivoSelection.transcriptId);
                    setInVivoSelection(null);
                  }}
                  className="w-full py-2 text-xs bg-amber-500 text-white rounded font-bold hover:bg-amber-600 flex items-center justify-center gap-1 shadow-sm transition-all"
                >
                  <Sparkles size={12} /> Create New In-Vivo "{inVivoSelection.text}"
                </button>
              </div>

              <div className="p-4 bg-[var(--bg-panel)] flex-1 overflow-hidden flex flex-col">
                <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Or format with existing code</div>
                <input
                  type="text"
                  placeholder="Filter codes..."
                  value={inVivoFilter}
                  onChange={(e) => setInVivoFilter(e.target.value)}
                  className="w-full p-2 mb-2 text-xs border border-[var(--border)] rounded bg-[var(--bg-main)] focus:ring-1 focus:ring-[var(--accent)] outline-none"
                  autoFocus
                />
                <div className="overflow-y-auto flex-1 border border-[var(--border)] rounded bg-[var(--bg-main)] max-h-[200px]">
                  {visibleCodes
                    .filter(c => c.name.toLowerCase().includes(inVivoFilter.toLowerCase()))
                    .map(code => (
                      <button
                        key={code.id}
                        onClick={() => {
                          if (!contentRef.current) return;

                          // Apply highlight using the stored range
                          try {
                            const { start, end } = getGlobalOffsets(contentRef.current, inVivoSelection.range);
                            const selId = crypto.randomUUID();
                            const success = highlightSafe(inVivoSelection.range, code, selId);

                            if (success) {
                              const newSelection: Selection = {
                                id: selId,
                                codeId: code.id,
                                transcriptId: inVivoSelection.transcriptId,
                                text: inVivoSelection.text,
                                startIndex: start,
                                endIndex: end,
                                timestamp: Date.now()
                              };

                              // Generate updated HTML
                              const clone = contentRef.current.cloneNode(true) as HTMLElement;
                              clone.querySelectorAll('.line-codes-gutter, .line-annotation-gutter').forEach(el => el.remove());
                              onSelectionCreate(newSelection, clone.innerHTML);
                              updateGutterMarkers();
                              setInVivoSelection(null);
                            }
                          } catch (e) {
                            console.error(e);
                            onAlert("Error", "Failed to apply code. Please try selecting again.");
                          }
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-panel)] border-b border-[var(--border)] last:border-0 flex items-center justify-between group"
                      >
                        <span className="font-medium truncate flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: code.color }}></span>
                          {code.name}
                        </span>
                        {/* Show parent if exists for context */}
                        {code.parentId && <span className="text-[10px] text-[var(--text-muted)]">{codes.find(p => p.id === code.parentId)?.name}</span>}
                      </button>
                    ))}
                  {visibleCodes.filter(c => c.name.toLowerCase().includes(inVivoFilter.toLowerCase())).length === 0 && (
                    <div className="p-4 text-center text-xs text-[var(--text-muted)] italic">No matching codes found</div>
                  )}
                </div>
              </div>

              <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-panel)] flex justify-end">
                <button
                  onClick={() => setInVivoSelection(null)}
                  className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                >
                  Cancel
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
        /* Themed Zebra — use class based selector to avoid n-th-of-type issues with interleaved divs */
        .zebra-active .transcript-line.zebra-row-odd {
            background-color: var(--zebra-odd); 
        }
        .zebra-active .transcript-line:not(.zebra-row-odd) {
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