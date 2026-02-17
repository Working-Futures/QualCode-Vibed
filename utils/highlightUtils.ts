import { Selection, Code } from '../types';

export const stripHighlights = (html: string): string => {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Remove UI artifacts (gutters)
  doc.querySelectorAll('.line-codes-gutter, .line-annotation-gutter').forEach(el => el.remove());

  // Unwrap highlights
  const spans = doc.querySelectorAll('.coded-segment');
  spans.forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    }
  });

  // Also remove any empty text nodes or cleanup if needed, but usually redundant
  return doc.body.innerHTML;
};

export const removeHighlightsForCode = (html: string, codeId: string): string => {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const spans = doc.querySelectorAll(`.coded-segment[data-code-id="${codeId}"]`);
  spans.forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    }
  });
  return doc.body.innerHTML;
};

/**
 * Re-applies highlighting spans to clean HTML content based on stored selections.
 * Used when loading cloud projects to restore the visual state of the editor.
 */
export const restoreHighlights = (contentHtml: string, selections: Selection[], codes: Code[]): string => {
  if (!selections || selections.length === 0) return contentHtml;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = contentHtml;

  // Use a map to track applied selections to avoid duplicates if ID logic fails? 
  // No, trust input.

  selections.forEach(sel => {
    const code = codes.find(c => c.id === sel.codeId);
    if (!code) return;

    const range = document.createRange();
    let charCount = 0;
    let startNode: Node | null = null;
    let startOffset = 0;
    let endNode: Node | null = null;
    let endOffset = 0;
    let foundStart = false;
    let foundEnd = false;

    const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node && !foundEnd) {
      const txt = node.textContent || '';
      const len = txt.length;
      const absStart = charCount;
      const absEnd = charCount + len;

      if (!foundStart && sel.startIndex >= absStart && sel.startIndex < absEnd) {
        startNode = node;
        startOffset = sel.startIndex - absStart;
        foundStart = true;
      }

      if (!foundEnd && sel.endIndex > absStart && sel.endIndex <= absEnd) {
        endNode = node;
        endOffset = sel.endIndex - absStart;
        foundEnd = true;
      }

      charCount += len;
      node = walker.nextNode();
    }

    if (foundStart && foundEnd && startNode && endNode) {
      try {
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);

        // Instead of extracting the whole range (which breaks block structure if multi-line),
        // we iterate over text nodes and wrap them individually.
        const walker = document.createTreeWalker(
          tempDiv,
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

        textNodes.forEach(node => {
          const isStart = node === startNode;
          const isEnd = node === endNode;

          let sOffset = 0;
          let eOffset = node.length;

          if (isStart) sOffset = startOffset;
          if (isEnd) eOffset = endOffset;

          if (sOffset === eOffset) return;

          let targetNode = node;
          // Split end first to keep offsets valid
          if (eOffset < node.length) targetNode.splitText(eOffset);
          if (sOffset > 0) targetNode = targetNode.splitText(sOffset);

          const span = document.createElement('span');
          span.className = "coded-segment cursor-pointer transition-colors";
          span.dataset.codeId = code.id;
          span.dataset.selectionId = sel.id;
          span.title = code.name;
          span.style.textDecoration = 'underline';
          span.style.textDecorationColor = code.color;
          span.style.backgroundColor = `${code.color}40`;

          const parent = targetNode.parentNode;
          if (parent) {
            parent.insertBefore(span, targetNode);
            span.appendChild(targetNode);
          }
        });

      } catch (e) {
        console.error("Error applying highlight:", e);
      }
    }
  });

  return tempDiv.innerHTML;
};