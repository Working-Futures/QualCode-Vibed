import { Selection, Code } from '../types';

export const stripHighlights = (html: string): string => {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const spans = doc.querySelectorAll('.coded-segment');
  spans.forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    }
  });
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

        const span = document.createElement('span');
        span.className = "coded-segment cursor-pointer transition-colors";
        span.dataset.codeId = code.id;
        span.dataset.selectionId = sel.id;
        span.title = code.name;

        span.style.textDecoration = 'underline';
        span.style.textDecorationColor = code.color;
        span.style.backgroundColor = `${code.color}40`;

        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
      } catch (e) {
        // Overlap or complex structure
      }
    }
  });

  return tempDiv.innerHTML;
};