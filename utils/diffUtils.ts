
import DiffMatchPatch from 'diff-match-patch';

const dmp = new DiffMatchPatch();

export type DiffType = 'equal' | 'insert' | 'delete';

export interface DiffChunk {
    type: DiffType;
    lines: string[];
    originalIndex?: number; // Starting line index in original
    modifiedIndex?: number; // Starting line index in modified
}

/**
 * A simple line-based diff utility using LCS (Longest Common Subsequence).
 * Effective for document comparisons where lines are the unit of change.
 */
export function computeLineDiff(original: string, modified: string): DiffChunk[] {
    const oldLines = original.split(/\r?\n/);
    const newLines = modified.split(/\r?\n/);
    const N = oldLines.length;
    const M = newLines.length;

    // DP Matrix for LCS length
    // C[i][j] = length of LCS of oldLines[0..i-1] and newLines[0..j-1]
    const MAX_LINES = 2000;
    if (N > MAX_LINES || M > MAX_LINES) {
        // Fallback for very large files to avoid O(N*M) memory issues
        return [{ type: 'delete', lines: oldLines }, { type: 'insert', lines: newLines }];
    }

    const C: number[][] = Array(N + 1).fill(0).map(() => Array(M + 1).fill(0));

    for (let i = 1; i <= N; i++) {
        for (let j = 1; j <= M; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                C[i][j] = C[i - 1][j - 1] + 1;
            } else {
                C[i][j] = Math.max(C[i][j - 1], C[i - 1][j]);
            }
        }
    }

    // Backtrack to generate diff
    const diffs: DiffChunk[] = [];
    let i = N;
    let j = M;
    let currentChunk: DiffChunk | null = null;

    // Simple helper to push to chunk or create new
    const addToChunk = (type: DiffType, line: string) => {
        if (currentChunk && currentChunk.type === type) {
            currentChunk.lines.unshift(line);
        } else {
            if (currentChunk) diffs.unshift(currentChunk);
            currentChunk = { type, lines: [line] };
        }
    };

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            addToChunk('equal', oldLines[i - 1]);
            i--;
            j--;
        } else if (j > 0 && (i === 0 || C[i][j - 1] >= C[i - 1][j])) {
            addToChunk('insert', newLines[j - 1]);
            j--;
        } else if (i > 0 && (j === 0 || C[i][j - 1] < C[i - 1][j])) {
            addToChunk('delete', oldLines[i - 1]);
            i--;
        }
    }

    if (currentChunk) diffs.unshift(currentChunk);

    // Group adjacent delete+insert into "mod" (manually handled by viewer, 
    // but strictly speaking they are separate chunks here)
    return diffs;
}

/**
 * Reconstructs the document content based on selected changes.
 * 
 * @param diffs The diff chunks
 * @param acceptedChanges Set of chunk indices (or logic) to accept. 
 *                        For 'equal', always keep.
 *                        For 'delete', if accepted, remove (exclude from output). If rejected, keep (include).
 *                        Wait, standard logic:
 *                        Base = Original.
 *                        Accept 'insert' -> Include. Default (Reject) -> Exclude.
 *                        Accept 'delete' -> Exclude. Default (Reject) -> Include.
 *                        Wait, simpler mental model for user:
 *                        "Accept Edit" implies moving TO the New Version.
 *                        So:
 *                        - Insert: Accept = Include. Reject = Exclude.
 *                        - Delete: Accept = Exclude (perform deletion). Reject = Include (keep original).
 *                        - Equal: Always Include.
 */
export function mergeDiff(diffs: DiffChunk[], acceptedIndices: Set<number>): string {
    let resultLines: string[] = [];

    diffs.forEach((chunk, index) => {
        const isAccepted = acceptedIndices.has(index);

        if (chunk.type === 'equal') {
            resultLines.push(...chunk.lines);
        } else if (chunk.type === 'insert') {
            if (isAccepted) {
                resultLines.push(...chunk.lines);
            }
        } else if (chunk.type === 'delete') {
            if (!isAccepted) {
                // If NOT accepted (i.e. rejected the deletion), we KEEP the lines
                resultLines.push(...chunk.lines);
            }
            // If accepted, we drop the lines (perform deletion)
        }
    });

    return resultLines.join('\n');
}

// ─── diff-match-patch Utilities ───

/**
 * Creates a patch string representing the difference between original and modified text.
 * Uses diff-match-patch for efficient text-based keying.
 */
export function createTextPatch(original: string, modified: string): string {
    const patches = dmp.patch_make(original, modified);
    return dmp.patch_toText(patches);
}

/**
 * Applies a patch string to the original text to reproduce the modified text.
 * @returns The modified text.
 */
export function applyTextPatch(original: string, patchText: string): string {
    const patches = dmp.patch_fromText(patchText);
    const [result] = dmp.patch_apply(patches, original);
    return result;
}

