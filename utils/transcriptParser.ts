import * as mammoth from 'mammoth';

// ─── PDF.js Setup ───
// We use a dynamic import + worker setup for pdfjs-dist
let pdfjsLib: any = null;

async function getPdfJs() {
    if (pdfjsLib) return pdfjsLib;
    pdfjsLib = await import('pdfjs-dist');
    // Use the bundled worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    return pdfjsLib;
}

// ─── Helpers ───

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Wrap an array of line strings into transcript-line divs with sequential numbering.
 */
function wrapLines(lines: string[], startLine = 1): string {
    return lines.map((line, i) =>
        `<div class="transcript-line" data-line="${startLine + i}">${escapeHtml(line)}</div>`
    ).join('');
}

// ─── TXT Parsing ───
// Preserves verse/paragraph structure by respecting blank lines as paragraph breaks.
// Each non-empty line becomes its own transcript-line. Blank lines become paragraph spacers.

export function parsePlainText(rawText: string): string {
    const rawLines = rawText.split(/\r?\n/);
    const htmlParts: string[] = [];
    let lineNumber = 1;

    // Track whether we're in a run of blank lines to avoid double-spacing
    let lastWasBlank = false;

    for (const raw of rawLines) {
        const trimmed = raw.trim();

        if (trimmed.length === 0) {
            // Blank line → paragraph separator (only emit one spacer per group of blanks)
            if (!lastWasBlank && htmlParts.length > 0) {
                htmlParts.push('<div class="transcript-paragraph-break" aria-hidden="true"></div>');
            }
            lastWasBlank = true;
        } else {
            lastWasBlank = false;
            htmlParts.push(
                `<div class="transcript-line" data-line="${lineNumber}">${escapeHtml(trimmed)}</div>`
            );
            lineNumber++;
        }
    }

    return htmlParts.join('');
}

// ─── DOCX Parsing ───
// Uses mammoth.convertToHtml to preserve paragraph structure, then converts to
// transcript-lines while keeping paragraph grouping.

export async function parseDocx(arrayBuffer: ArrayBuffer): Promise<string> {
    // First get structured HTML from mammoth
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    const rawHtml = htmlResult.value;

    // Parse that HTML and convert each element into transcript lines
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const elements = doc.body.children;

    const htmlParts: string[] = [];
    let lineNumber = 1;

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const tagName = el.tagName.toLowerCase();
        const textContent = (el.textContent || '').trim();

        // Skip completely empty elements
        if (textContent.length === 0) {
            // Emit a paragraph break spacer
            if (htmlParts.length > 0) {
                htmlParts.push('<div class="transcript-paragraph-break" aria-hidden="true"></div>');
            }
            continue;
        }

        if (tagName === 'ul' || tagName === 'ol') {
            // Handle list items individually
            const items = el.querySelectorAll('li');
            items.forEach((li) => {
                const text = (li.textContent || '').trim();
                if (text) {
                    const bullet = tagName === 'ul' ? '• ' : `${lineNumber}. `;
                    // For ordered lists inside the document, use original numbering
                    const prefix = tagName === 'ul' ? '• ' : '';
                    htmlParts.push(
                        `<div class="transcript-line" data-line="${lineNumber}">${escapeHtml(prefix + text)}</div>`
                    );
                    lineNumber++;
                }
            });
        } else if (tagName === 'table') {
            // Flatten table rows into lines
            const rows = el.querySelectorAll('tr');
            rows.forEach((row) => {
                const cells = row.querySelectorAll('td, th');
                const cellTexts: string[] = [];
                cells.forEach((cell) => {
                    const t = (cell.textContent || '').trim();
                    if (t) cellTexts.push(t);
                });
                if (cellTexts.length > 0) {
                    htmlParts.push(
                        `<div class="transcript-line" data-line="${lineNumber}">${escapeHtml(cellTexts.join(' | '))}</div>`
                    );
                    lineNumber++;
                }
            });
        } else {
            // Standard paragraph / heading / blockquote etc.
            // Check if the inner HTML contains <br> tags — these indicate forced line breaks within
            // a single paragraph (common in interview transcripts).
            const innerHTML = el.innerHTML;

            if (innerHTML.includes('<br')) {
                // Split on <br> variants
                const subLines = innerHTML
                    .split(/<br\s*\/?>/gi)
                    .map(s => {
                        // Strip remaining HTML tags to get plain text
                        const temp = document.createElement('div');
                        temp.innerHTML = s;
                        return (temp.textContent || '').trim();
                    })
                    .filter(s => s.length > 0);

                for (const sub of subLines) {
                    htmlParts.push(
                        `<div class="transcript-line" data-line="${lineNumber}">${escapeHtml(sub)}</div>`
                    );
                    lineNumber++;
                }
            } else {
                // Single line from this element
                htmlParts.push(
                    `<div class="transcript-line" data-line="${lineNumber}">${escapeHtml(textContent)}</div>`
                );
                lineNumber++;
            }

            // Add paragraph break after each block element (paragraphs, headings)
            if (tagName === 'p' || tagName.match(/^h[1-6]$/)) {
                // Only add a break if the next element also has content
                const nextEl = elements[i + 1];
                if (nextEl && (nextEl.textContent || '').trim().length > 0) {
                    htmlParts.push('<div class="transcript-paragraph-break" aria-hidden="true"></div>');
                }
            }
        }
    }

    return htmlParts.join('');
}

// ─── PDF Parsing ───
// Extracts text from each page, preserving line structure using text item positions.

export async function parsePdf(arrayBuffer: ArrayBuffer): Promise<string> {
    const pdfjs = await getPdfJs();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

    const htmlParts: string[] = [];
    let lineNumber = 1;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Group text items by their Y position (line detection)
        // Items with similar Y positions belong to the same visual line
        const lineMap = new Map<number, string[]>();

        for (const item of textContent.items) {
            if (!('str' in item) || !item.str) continue;

            // Round Y to nearest 2px to group items on the same visual line
            const y = Math.round(item.transform[5] / 2) * 2;

            if (!lineMap.has(y)) {
                lineMap.set(y, []);
            }
            lineMap.get(y)!.push(item.str);
        }

        // Sort lines by Y position (top to bottom = descending Y in PDF coords)
        const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);

        let lastY: number | null = null;

        for (const y of sortedYs) {
            const lineText = lineMap.get(y)!.join('').trim();
            if (!lineText) continue;

            // Detect paragraph breaks by checking vertical gaps between lines
            if (lastY !== null) {
                const gap = Math.abs(lastY - y);
                // If the gap is significantly larger than a normal line gap, insert a break
                // Typical line spacing in PDFs is ~12-14 units; a paragraph break is usually ~20+
                if (gap > 20) {
                    htmlParts.push('<div class="transcript-paragraph-break" aria-hidden="true"></div>');
                }
            }

            htmlParts.push(
                `<div class="transcript-line" data-line="${lineNumber}">${escapeHtml(lineText)}</div>`
            );
            lineNumber++;
            lastY = y;
        }

        // Add a page separator between pages
        if (pageNum < pdf.numPages) {
            htmlParts.push(
                '<div class="transcript-page-break" aria-hidden="true"></div>'
            );
        }
    }

    return htmlParts.join('');
}

// ─── Master Parse Function ───

export async function parseTranscriptFile(file: File): Promise<{ name: string; content: string }> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    let content = '';

    switch (ext) {
        case 'docx': {
            const arrayBuffer = await file.arrayBuffer();
            content = await parseDocx(arrayBuffer);
            break;
        }
        case 'pdf': {
            const arrayBuffer = await file.arrayBuffer();
            content = await parsePdf(arrayBuffer);
            break;
        }
        case 'txt':
        case 'csv':
        case 'md':
        default: {
            const rawText = await file.text();
            content = parsePlainText(rawText);
            break;
        }
    }

    return { name: file.name, content };
}
