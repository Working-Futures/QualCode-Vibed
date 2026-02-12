import React, { useRef, useEffect, useCallback, memo, useState } from 'react';
import { Transcript, Code, Selection, AppSettings } from '../types';
import { Trash2, MessageSquare, Sparkles, X } from 'lucide-react';

interface EditorProps {
  activeTranscript: Transcript | null;
  activeCode: Code | null;
  onSelectionCreate: (selection: Selection, updatedHtml: string) => void;
  onSelectionDelete: (selectionId: string, updatedHtml: string) => void;
  onCreateInVivoCode?: (selectedText: string, transcriptId: string) => void;
  onAnnotateSelection?: (selectionId: string, annotation: string) => void;
  onSaveProject?: () => void;
  settings: AppSettings;
  codes: Code[];
  selections?: Selection[];
}

export const Editor = memo<EditorProps>(({
  activeTranscript,
  activeCode,
  onSelectionCreate,
  onSelectionDelete,
  onCreateInVivoCode,
  onAnnotateSelection,
  onSaveProject,
  settings,
  codes,
  selections = []
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string, text?: string } | null>(null);
  const [annotationInput, setAnnotationInput] = useState<string>('');
  const [showAnnotationInput, setShowAnnotationInput] = useState(false);
  const [inVivoSelection, setInVivoSelection] = useState<{ text: string, transcriptId: string } | null>(null);

  // New State: Focused Code ID for filtering view
  const [focusedCodeId, setFocusedCodeId] = useState<string | null>(null);

  // Load content
  useEffect(() => {
    if (contentRef.current && activeTranscript) {
      contentRef.current.innerHTML = activeTranscript.content;
      updateGutterMarkers();
    }
  }, [activeTranscript?.id, activeTranscript?.content]);

  // Apply Styles & Focused Code Logic
  useEffect(() => {
    if (contentRef.current) {
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

        // We need to ensure the focused code pops out
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
        // Reset
        const allSegments = contentRef.current.querySelectorAll('.coded-segment');
        allSegments.forEach((el) => {
          const span = el as HTMLElement;
          span.classList.remove('focused-segment', 'dimmed-segment');
        });
      }
    }
  }, [settings, focusedCodeId, activeTranscript?.id]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S = Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSaveProject?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSaveProject]);

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

  // --- Gutter Marker Logic with Click Handler ---
  const updateGutterMarkers = () => {
    if (!contentRef.current) return;

    const lines = contentRef.current.querySelectorAll('.transcript-line');

    lines.forEach(line => {
      const existing = line.querySelector('.line-codes-gutter');
      if (existing) existing.remove();

      const codeSpans = line.querySelectorAll('.coded-segment');
      const uniqueCodes = new Set<string>();
      codeSpans.forEach(span => {
        const id = (span as HTMLElement).dataset.codeId;
        if (id) uniqueCodes.add(id);
      });

      if (uniqueCodes.size > 0) {
        const gutter = document.createElement('div');
        gutter.className = 'line-codes-gutter';

        uniqueCodes.forEach(codeId => {
          const code = codes.find(c => c.id === codeId);
          if (code) {
            const marker = document.createElement('div');
            marker.className = 'gutter-marker cursor-pointer hover:scale-105 transition-transform';
            marker.style.color = code.color;
            marker.innerHTML = `<span class="bracket">{</span> <span class="label">${code.name}</span>`;

            // Add Click Listener for Filtering
            marker.onclick = (e) => {
              e.stopPropagation(); // Prevent editor click
              // Toggle Focus
              setFocusedCodeId(prev => prev === codeId ? null : codeId);
            };

            gutter.appendChild(marker);
          }
        });
        line.insertBefore(gutter, line.firstChild);
      }
    });
  };

  const handleMouseUp = useCallback(() => {
    if (!activeCode || !activeTranscript || !contentRef.current) return;
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
  }, [activeCode, activeTranscript, onSelectionCreate]);

  const handleClick = (e: React.MouseEvent) => {
    // If clicking outside a marker or code, clear focus
    const target = e.target as HTMLElement;
    const isMarker = target.closest('.gutter-marker');
    const isCode = target.closest('.coded-segment');

    if (!isMarker) {
      // If clicking empty space, clear filter
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

  // Handle right-click for in-vivo coding (create code from selection)
  const handleContextMenuEvent = (e: React.MouseEvent) => {
    if (!activeTranscript) return;
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

  return (
    <div className="h-full flex flex-col relative bg-[var(--bg-main)]">
      <div className="bg-[var(--bg-panel)] p-3 border-b border-[var(--border)] flex justify-between items-center shadow-sm z-10 shrink-0">
        <h2 className="font-bold text-[var(--text-main)]">{activeTranscript.name}</h2>
        {activeCode && (
          <div className="text-sm font-medium px-3 py-1 rounded bg-[var(--bg-main)] border border-[var(--border)] text-[var(--text-main)] flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: activeCode.color }} />
            Coding with: {activeCode.name}
          </div>
        )}
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
          className="transcript-content outline-none mx-auto bg-[var(--bg-paper)] text-[var(--text-main)] shadow-xl min-h-[11in] relative"
          style={{
            maxWidth: '850px',
            padding: '3rem 3rem 3rem 13rem',
            cursor: activeCode ? 'cell' : 'text'
          }}
        />
      </div>

      {/* Context Menu for Coded Segments */}
      {contextMenu && (
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
      )}

      {/* In-Vivo Coding Popup */}
      {inVivoSelection && (
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
      )}

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
    </div>
  );
});