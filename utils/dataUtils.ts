import { Project, Code, Transcript } from '../types';
import * as XLSX from 'xlsx';

// --- Helper: Generate ID ---
export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// --- Helper: Save Blob with Name ---
const saveBlob = (blob: Blob, defaultName: string) => {
  const filename = prompt("Save file as:", defaultName);
  if (!filename) return; // User cancelled

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// --- Memo Export Logic ---
export const exportMemos = (project: Project) => {
  const lines: string[] = [];

  lines.push('--- PROJECT MEMO ---');
  lines.push(project.projectMemo || '(No content)');
  lines.push('\n');

  project.transcripts.forEach(t => {
    lines.push(`--- MEMO FOR: ${t.name} ---`);
    lines.push(t.memo || '(No content)');
    lines.push('\n');
  });

  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });

  const safeName = (project.name || 'Project').replace(/[^a-z0-9]/gi, '_');
  saveBlob(blob, `${safeName}_Memos.txt`);
};

// --- PDF / Print Logic ---
export const printTranscript = (transcript: Transcript, project: Project, onError?: (msg: string) => void) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    if (onError) onError("Please allow popups to print.");
    else alert("Please allow popups to print.");
    return;
  }

  const codesHtml = project.codes.map(c =>
    `<div style="display:flex; align-items:center; margin-bottom:4px;">
            <span style="width:12px; height:12px; background-color:${c.color}; margin-right:8px; display:inline-block;"></span>
            <strong>${c.name}</strong>
         </div>`
  ).join('');

  printWindow.document.write(`
        <html>
        <head>
            <title>${transcript.name} - QualCode Vibed</title>
            <style>
                body { font-family: sans-serif; line-height: 1.6; color: #333; padding: 40px; }
                h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
                .meta { color: #666; font-size: 0.9em; margin-bottom: 30px; }
                .content { font-size: 14px; }
                .coded-segment { border-bottom: 2px solid #ccc; font-weight: bold; }
                .legend { margin-top: 50px; padding: 20px; background: #f9f9f9; page-break-inside: avoid; }
                @media print {
                    .coded-segment { -webkit-print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <h1>${transcript.name}</h1>
            <div class="meta">Project: ${project.name} | Date: ${new Date().toLocaleDateString()}</div>
            <div class="content">${transcript.content}</div>
            <div class="legend"><h3>Code Legend</h3>${codesHtml}</div>
            <script>
                document.querySelectorAll('.transcript-line').forEach(l => {
                    l.style.display = 'block';
                    l.style.marginBottom = '10px';
                });
                window.print();
            </script>
        </body>
        </html>
    `);
  printWindow.document.close();
};

// --- Export Logic (CSV) ---
export const exportProjectData = (project: Project) => {
  const headers = ['Code Name', 'Transcript Name', 'Coded Text', 'Code Description', 'Start Index', 'End Index'];

  const rows = project.selections.map(sel => {
    const code = project.codes.find(c => c.id === sel.codeId);
    const transcript = project.transcripts.find(t => t.id === sel.transcriptId);

    return [
      code?.name || 'Unknown Code',
      transcript?.name || 'Unknown Transcript',
      `"${(sel.text || '').replace(/"/g, '""')}"`,
      `"${(code?.description || '').replace(/"/g, '""')}"`,
      sel.startIndex,
      sel.endIndex
    ];
  });

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveBlob(blob, `${project.name.replace(/\s+/g, '_')}_Analytics.csv`);
};

// --- Export Codebook ---
export const exportCodebook = (codes: Code[]) => {
  const headers = ['Name', 'Description', 'Color', 'ParentID', 'InclusionCriteria', 'ExclusionCriteria', 'Examples'];
  const rows = codes.map(c => [
    `"${c.name.replace(/"/g, '""')}"`,
    `"${(c.description || '').replace(/"/g, '""')}"`,
    c.color,
    c.parentId || '',
    `"${(c.inclusionCriteria || '').replace(/"/g, '""')}"`,
    `"${(c.exclusionCriteria || '').replace(/"/g, '""')}"`,
    `"${(c.examples || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveBlob(blob, `Codebook_Export.csv`);
};

// --- Save Project File (.qlab) ---
export const saveProjectFile = (project: Project) => {
  const jsonContent = JSON.stringify(project, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const safeName = (project.name || 'project').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  saveBlob(blob, `${safeName}_${new Date().toISOString().slice(0, 10)}.qlab`);
};

// --- Import Logic (CSV & XLSX) ---
export const parseCodebookFile = async (file: File): Promise<Code[]> => {
  if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
    return parseCodebookExcel(file);
  } else {
    // Works for .csv and .tsv — delimiter auto-detection handles both
    const text = await file.text();
    return parseCodebookCSV(text);
  }
};

const parseCodebookExcel = async (file: File): Promise<Code[]> => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

  // Build a flexible key lookup: try multiple possible column names
  const findValue = (row: any, ...keys: string[]): string => {
    for (const key of keys) {
      // Try exact match first, then case-insensitive
      if (row[key] !== undefined && row[key] !== null) return row[key].toString().trim();
      const found = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (found && row[found] !== undefined && row[found] !== null) return row[found].toString().trim();
    }
    return '';
  };

  return jsonData
    .map((row): Code | null => {
      const name = findValue(row, 'Name', 'Code', 'Label', 'Code Name', 'Theme', 'Category');
      if (!name) return null;

      const rawColor = findValue(row, 'Color', 'Colour', 'Hex', 'HexColor');
      const isValidColor = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(rawColor);

      return {
        id: generateId(),
        name,
        description: findValue(row, 'Description', 'Definition', 'Desc', 'Meaning', 'Details', 'Memo'),
        color: isValidColor ? rawColor : `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
        parentId: findValue(row, 'ParentID', 'Parent', 'ParentCode', 'ParentName', 'Group', 'Hierarchy') || undefined,
        inclusionCriteria: findValue(row, 'InclusionCriteria', 'Inclusion', 'Include', 'When to Use') || undefined,
        exclusionCriteria: findValue(row, 'ExclusionCriteria', 'Exclusion', 'Exclude', 'When Not to Use') || undefined,
        examples: findValue(row, 'Examples', 'Example', 'Sample', 'Samples', 'Example Quotes') || undefined,
      };
    })
    .filter((c): c is Code => c !== null);
};

// ─── Robust CSV / TSV Parsing ───

/**
 * Detect the most likely delimiter by counting occurrences in the first few lines.
 */
function detectDelimiter(text: string): string {
  const sampleLines = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts: Record<string, number> = { ',': 0, '\t': 0, ';': 0 };
  // Only count delimiters outside of quoted fields
  let inQuotes = false;
  for (const ch of sampleLines) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (!inQuotes && (ch in counts)) counts[ch]++;
  }
  // Return the delimiter with the highest count, defaulting to comma
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

/**
 * RFC 4180-compliant CSV line parser that handles quoted fields.
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Parse full CSV/TSV text into an array of row arrays, handling multi-line quoted fields.
 */
function parseCSVText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentLine = '';
  let inQuotes = false;

  for (const ch of text) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      currentLine += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (currentLine.trim().length > 0) {
        rows.push(parseCSVLine(currentLine, delimiter));
      }
      currentLine = '';
    } else {
      currentLine += ch;
    }
  }

  // Don't forget the last line
  if (currentLine.trim().length > 0) {
    rows.push(parseCSVLine(currentLine, delimiter));
  }

  return rows;
}

/**
 * Generate a random color with good saturation and brightness using HSL.
 */
function randomCodeColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const sat = 55 + Math.floor(Math.random() * 30); // 55-85%
  const light = 45 + Math.floor(Math.random() * 15); // 45-60%
  // Convert HSL to hex
  const h = hue / 360;
  const s = sat / 100;
  const l = light / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Fuzzy match a header against known aliases for each field.
 */
function matchHeader(header: string): string | null {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mapping: [string[], string][] = [
    [['name', 'code', 'codename', 'label', 'theme', 'category'], 'name'],
    [['description', 'definition', 'desc', 'meaning', 'detail', 'details', 'memo'], 'description'],
    [['color', 'colour', 'hex', 'hexcolor'], 'color'],
    [['parent', 'parentid', 'parentcode', 'parentname', 'group', 'hierarchy', 'folder'], 'parentId'],
    [['inclusion', 'inclusioncriteria', 'include', 'whentouse', 'inclusionrule', 'inclusionrules'], 'inclusionCriteria'],
    [['exclusion', 'exclusioncriteria', 'exclude', 'whennotetouse', 'exclusionrule', 'exclusionrules'], 'exclusionCriteria'],
    [['example', 'examples', 'sample', 'samples', 'examplequote', 'examplequotes', 'quotes'], 'examples'],
  ];

  for (const [aliases, field] of mapping) {
    if (aliases.some(alias => h === alias || h.includes(alias))) {
      return field;
    }
  }
  return null;
}

export const parseCodebookCSV = (csvText: string): Code[] => {
  const delimiter = detectDelimiter(csvText);
  const allRows = parseCSVText(csvText, delimiter);
  if (allRows.length < 2) return [];

  const headerRow = allRows[0];
  const dataRows = allRows.slice(1);

  // Map headers → field names
  const columnMap: Record<number, string> = {};
  let hasNameColumn = false;
  headerRow.forEach((header, idx) => {
    const field = matchHeader(header);
    if (field) {
      columnMap[idx] = field;
      if (field === 'name') hasNameColumn = true;
    }
  });

  // Fallback: if no recognizable 'name' column, assume first column is name,
  // second is description (common simple format)
  if (!hasNameColumn) {
    if (headerRow.length >= 1) columnMap[0] = 'name';
    if (headerRow.length >= 2) columnMap[1] = 'description';
    if (headerRow.length >= 3) columnMap[2] = 'color';
  }

  const newCodes: Code[] = [];
  for (const row of dataRows) {
    const fields: Record<string, string> = {};
    for (const [idxStr, fieldName] of Object.entries(columnMap)) {
      const idx = parseInt(idxStr, 10);
      if (idx < row.length) {
        fields[fieldName] = row[idx];
      }
    }

    const name = (fields['name'] || '').trim();
    if (!name) continue;

    const color = (fields['color'] || '').trim();
    const isValidColor = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);

    newCodes.push({
      id: generateId(),
      name,
      description: (fields['description'] || '').trim(),
      color: isValidColor ? color : randomCodeColor(),
      parentId: (fields['parentId'] || '').trim() || undefined,
      inclusionCriteria: (fields['inclusionCriteria'] || '').trim() || undefined,
      exclusionCriteria: (fields['exclusionCriteria'] || '').trim() || undefined,
      examples: (fields['examples'] || '').trim() || undefined,
    });
  }
  return newCodes;
};

export const mergeCodesInProject = (project: Project, sourceCodeId: string, targetCodeId: string): Project => {
  if (sourceCodeId === targetCodeId) return project;

  // 1. Reassign selections
  const updatedSelections = project.selections.map(sel =>
    sel.codeId === sourceCodeId ? { ...sel, codeId: targetCodeId } : sel
  );

  // 2. Reparent children (codes that had sourceCodeId as parent)
  //    They will now point to targetCodeId.
  const updatedCodes = project.codes
    .filter(c => c.id !== sourceCodeId) // Remove the source code
    .map(c => c.parentId === sourceCodeId ? { ...c, parentId: targetCodeId } : c);

  return {
    ...project,
    selections: updatedSelections,
    codes: updatedCodes
  };
};