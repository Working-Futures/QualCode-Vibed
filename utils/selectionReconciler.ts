import { Selection } from '../types';
import { stripHighlights } from './highlightUtils';

/**
 * Compare old and new transcript content line-by-line, and preserve
 * selections that belong to unchanged lines while adjusting their
 * character offsets.  Selections touching a modified line are removed.
 *
 * If the number of lines changed (lines were inserted / deleted),
 * we fall back to removing all selections for that transcript because
 * every subsequent offset is invalidated.
 */
export function reconcileSelectionsAfterEdit(
    oldContent: string,
    newContent: string,
    allSelections: Selection[],
    transcriptId: string
): Selection[] {
    const otherSelections = allSelections.filter(s => s.transcriptId !== transcriptId);
    const mySelections = allSelections.filter(s => s.transcriptId === transcriptId);

    if (mySelections.length === 0) return allSelections;

    // ── helpers ──
    function getTextLines(html: string): string[] {
        const div = document.createElement('div');
        div.innerHTML = stripHighlights(html);            // remove coded-segment spans
        div.querySelectorAll('.line-codes-gutter, .line-annotation-gutter').forEach(el => el.remove());
        div.normalize();
        const lines = div.querySelectorAll('.transcript-line');
        return Array.from(lines).map(l => l.textContent || '');
    }

    const oldLines = getTextLines(oldContent);
    const newLines = getTextLines(newContent);

    // If line count changed → can't safely remap, remove all
    if (oldLines.length !== newLines.length) {
        return otherSelections;
    }

    // If every single line is unchanged, keep everything as-is
    const allSame = oldLines.every((l, i) => l === newLines[i]);
    if (allSame) return allSelections;

    // ── build per-line metadata ──
    interface LineMeta { start: number; end: number; changed: boolean; }
    const lineMeta: LineMeta[] = [];
    let offset = 0;
    for (let i = 0; i < oldLines.length; i++) {
        const len = oldLines[i].length;
        lineMeta.push({ start: offset, end: offset + len, changed: oldLines[i] !== newLines[i] });
        offset += len;
    }

    // Cumulative offset delta *before* each line (index 0 → delta accumulated from lines 0..−1 = 0)
    const deltas: number[] = [0];
    for (let i = 0; i < oldLines.length; i++) {
        deltas.push(deltas[i] + (newLines[i].length - oldLines[i].length));
    }

    // ── filter & adjust ──
    const preserved = mySelections
        .filter(sel => {
            // Drop selections that overlap any changed line
            for (const lm of lineMeta) {
                if (sel.startIndex < lm.end && sel.endIndex > lm.start && lm.changed) {
                    return false;
                }
            }
            return true;
        })
        .map(sel => {
            // Find the line index the selection starts in
            let lineIdx = 0;
            for (let i = 0; i < lineMeta.length; i++) {
                if (sel.startIndex >= lineMeta[i].start) lineIdx = i;
                else break;
            }
            const delta = deltas[lineIdx];
            if (delta === 0) return sel;           // no shift needed
            return { ...sel, startIndex: sel.startIndex + delta, endIndex: sel.endIndex + delta };
        });

    return [...otherSelections, ...preserved];
}
