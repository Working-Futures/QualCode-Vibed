
/**
 * Detects if content is a JSON-stringified array of lines.
 * This is our heuristic for "Optimized" transcript content.
 */
export function isOptimizedContent(content: string): boolean {
    return content.trim().startsWith('["') && content.trim().endsWith('"]');
}

/**
 * Compresses standard HTML transcript content into a JSON string of line contents.
 * Removes all `<div>` wrappers and attributes, storing only the inner text (which may contain HTML entities).
 * 
 * Input: `<div class="transcript-line" data-line="1">Hello</div><div class="transcript-line" data-line="2">World</div>`
 * Output: `["Hello","World"]`
 */
export function compressTranscriptContent(htmlContent: string): string {
    // If it's already optimized (or effectively empty/invalid), return as is to avoid double-compression
    if (isOptimizedContent(htmlContent)) return htmlContent;
    if (!htmlContent) return '[]';

    // Simple regex to extract content between div tags
    // Logic matches Editor.tsx generation: <div class="transcript-line" data-line="${i + 1}">${escape(line.content)}</div>
    const lineRegex = /<div[^>]*class=["']transcript-line["'][^>]*>(.*?)<\/div>/gs;

    const lines: string[] = [];
    let match;
    let found = false;

    while ((match = lineRegex.exec(htmlContent)) !== null) {
        found = true;
        lines.push(match[1]); // content inside div
    }

    if (!found) {
        // Fallback for plain text or unexpected format: split by newline
        // but treat as single blocks if not structured
        return JSON.stringify(htmlContent.split(/\r?\n/));
    }

    return JSON.stringify(lines);
}

/**
 * Reconstructs HTML transcript content from a compressed JSON string.
 * 
 * Input: `["Hello","World"]`
 * Output: `<div class="transcript-line" data-line="1">Hello</div><div class="transcript-line" data-line="2">World</div>`
 */
export function hydrateTranscriptContent(compressedContent: string): string {
    try {
        if (!isOptimizedContent(compressedContent)) {
            // Not compressed, return as is (backward compatibility)
            return compressedContent;
        }

        const lines = JSON.parse(compressedContent);
        if (!Array.isArray(lines)) return compressedContent;

        return lines.map((line: string, index: number) =>
            `<div class="transcript-line" data-line="${index + 1}">${line}</div>`
        ).join('');
    } catch (e) {
        console.error('Failed to hydrate transcript content', e);
        return compressedContent; // Fallback
    }
}
