import React, { useState, useMemo } from 'react';
import { Project } from '../types';
import { X, Download, Filter, BarChart as IconChart, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Props {
    project: Project;
    onClose: () => void;
    onExport: () => void;
}

export const AnalysisView: React.FC<Props> = ({ project, onClose, onExport }) => {
    const [viewMode, setViewMode] = useState<'chart' | 'table' | 'segments' | 'cooccurrence'>('chart');
    const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>([]);

    const { chartData, filteredCodes, allSelections } = useMemo(() => {
        const allCodes = project.codes;
        let displayCodes = allCodes;

        if (selectedFamilyIds.length > 0) {
            displayCodes = allCodes.filter(c => {
                // If it's a root code, check if it is selected
                if (!c.parentId) return selectedFamilyIds.includes(c.id);
                // If it's a child code, check if its parent is selected
                return selectedFamilyIds.includes(c.parentId);
            });
        }

        const data = displayCodes.map(code => {
            const totalCount = project.selections.filter(s => s.codeId === code.id).length;
            return {
                name: code.name,
                count: totalCount,
                fill: code.color,
                id: code.id
            };
        })
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count);

        // Filter selections for the segment view
        const selections = project.selections.filter(s => displayCodes.some(c => c.id === s.codeId));

        return { chartData: data, filteredCodes: displayCodes, allSelections: selections };
    }, [project.codes, project.selections, selectedFamilyIds]);

    const rootCodes = project.codes.filter(c => !c.parentId);

    const toggleFamily = (id: string) => {
        setSelectedFamilyIds(prev =>
            prev.includes(id)
                ? prev.filter(p => p !== id)
                : [...prev, id]
        );
    };

    // Co-occurrence matrix data
    const cooccurrenceMatrix = useMemo(() => {
        const usedCodes = project.codes.filter(c => project.selections.some(s => s.codeId === c.id));
        const matrix: Record<string, Record<string, number>> = {};

        usedCodes.forEach(a => {
            matrix[a.id] = {};
            usedCodes.forEach(b => {
                matrix[a.id][b.id] = 0;
            });
        });

        // Group selections by transcript
        const byTranscript: Record<string, typeof project.selections> = {};
        project.selections.forEach(s => {
            if (!byTranscript[s.transcriptId]) byTranscript[s.transcriptId] = [];
            byTranscript[s.transcriptId].push(s);
        });

        // For each transcript, check overlapping/near selections
        Object.values(byTranscript).forEach(sels => {
            for (let i = 0; i < sels.length; i++) {
                for (let j = i + 1; j < sels.length; j++) {
                    const a = sels[i];
                    const b = sels[j];
                    if (a.codeId === b.codeId) continue;
                    // Co-occurrence: same paragraph proximity (within 200 chars)
                    const overlap = Math.abs(a.startIndex - b.startIndex) < 200;
                    if (overlap) {
                        matrix[a.codeId] = matrix[a.codeId] || {};
                        matrix[b.codeId] = matrix[b.codeId] || {};
                        matrix[a.codeId][b.codeId] = (matrix[a.codeId]?.[b.codeId] || 0) + 1;
                        matrix[b.codeId][a.codeId] = (matrix[b.codeId]?.[a.codeId] || 0) + 1;
                    }
                }
            }
        });

        return { matrix, codes: usedCodes };
    }, [project.codes, project.selections]);

    return (
        <div className="absolute inset-0 z-20 bg-[var(--bg-main)]/90 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[var(--bg-panel)] rounded-2xl shadow-2xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col overflow-hidden border border-[var(--border)]">

                <div className="p-5 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-panel)]">
                    <div>
                        <h2 className="text-xl font-bold text-[var(--text-main)] flex items-center">
                            <IconChart className="mr-2 text-[var(--accent)]" /> Analysis Dashboard
                        </h2>
                    </div>
                    <div className="flex items-center space-x-3">
                        <div className="flex bg-[var(--bg-main)] rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('chart')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'chart' ? 'bg-[var(--bg-panel)] shadow text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                            >
                                Chart
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'table' ? 'bg-[var(--bg-panel)] shadow text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                            >
                                Matrix
                            </button>
                            <button
                                onClick={() => setViewMode('segments')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'segments' ? 'bg-[var(--bg-panel)] shadow text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                            >
                                Segments
                            </button>
                            <button
                                onClick={() => setViewMode('cooccurrence')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${viewMode === 'cooccurrence' ? 'bg-[var(--bg-panel)] shadow text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                            >
                                Co-occurrence
                            </button>
                        </div>
                        <button
                            onClick={onExport}
                            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-bold transition-colors shadow-sm"
                        >
                            <Download size={16} />
                            <span>Export CSV</span>
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-[var(--bg-main)] rounded-full transition-colors">
                            <X size={24} className="text-[var(--text-muted)]" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">

                    <div className="w-64 bg-[var(--bg-main)] border-r border-[var(--border)] p-4 overflow-y-auto">
                        <div className="flex items-center mb-4 text-[var(--text-muted)] font-bold text-sm uppercase tracking-wider">
                            <Filter size={14} className="mr-2" /> Filter Codes
                        </div>
                        <div className="space-y-1">
                            <button
                                onClick={() => setSelectedFamilyIds([])}
                                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors border ${selectedFamilyIds.length === 0 ? 'bg-[var(--bg-panel)] border-[var(--accent)] text-[var(--accent)]' : 'border-transparent hover:bg-[var(--bg-panel)] text-[var(--text-muted)]'}`}
                            >
                                Show All Codes
                            </button>
                            <div className="my-2 h-px bg-[var(--border)]"></div>
                            {rootCodes.map(rootCode => {
                                const isSelected = selectedFamilyIds.includes(rootCode.id);
                                return (
                                    <button
                                        key={rootCode.id}
                                        onClick={() => toggleFamily(rootCode.id)}
                                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between border ${isSelected ? 'bg-[var(--bg-panel)] border-[var(--border)] text-[var(--text-main)] shadow-sm' : 'border-transparent hover:bg-[var(--bg-panel)] text-[var(--text-muted)]'}`}
                                    >
                                        <div className="flex items-center">
                                            <div className={`w-4 h-4 rounded border mr-3 flex items-center justify-center transition-colors ${isSelected ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--text-muted)]'}`}>
                                                {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                            </div>
                                            <span className="flex items-center">
                                                <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: rootCode.color }}></span>
                                                {rootCode.name}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex-1 p-6 overflow-hidden flex flex-col bg-[var(--bg-panel)]">
                        {viewMode === 'chart' && (
                            <div className="w-full h-full min-h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} interval={0} angle={-45} textAnchor="end" height={80} />
                                        <YAxis tick={{ fill: 'var(--text-muted)' }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-main)' }}
                                            cursor={{ fill: 'var(--bg-main)' }}
                                        />
                                        <Bar dataKey="count" fill="var(--accent)" name="Frequency" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {viewMode === 'table' && (
                            <div className="flex-1 overflow-auto border border-[var(--border)] rounded-lg">
                                <table className="w-full border-collapse text-sm text-left">
                                    <thead className="bg-[var(--bg-main)] text-[var(--text-main)] font-bold sticky top-0 shadow-sm z-10">
                                        <tr>
                                            <th className="p-3 border-b border-r border-[var(--border)] min-w-[200px] bg-[var(--bg-main)]">Document</th>
                                            {filteredCodes.map(code => (
                                                <th key={code.id} className="p-3 border-b border-[var(--border)] min-w-[100px] bg-[var(--bg-main)]">
                                                    <div className="flex items-center space-x-1">
                                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: code.color }}></span>
                                                        <span className="truncate max-w-[120px]" title={code.name}>{code.name}</span>
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="p-3 border-b border-[var(--border)] bg-[var(--bg-main)]">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {project.transcripts.map(t => {
                                            let docTotal = 0;
                                            return (
                                                <tr key={t.id} className="hover:bg-[var(--bg-main)] border-b border-[var(--border)] last:border-0">
                                                    <td className="p-3 border-r border-[var(--border)] font-medium text-[var(--text-main)] bg-[var(--bg-panel)] sticky left-0">{t.name}</td>
                                                    {filteredCodes.map(code => {
                                                        const count = project.selections.filter(s => s.transcriptId === t.id && s.codeId === code.id).length;
                                                        docTotal += count;
                                                        return (
                                                            <td key={code.id} className={`p-3 border-r border-[var(--border)] text-center transition-colors ${count > 0 ? 'font-bold text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                                                                {count > 0 ? count : '-'}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="p-3 font-bold text-[var(--text-main)] text-center bg-[var(--bg-panel)]">{docTotal}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {viewMode === 'segments' && (
                            <div className="flex-1 overflow-auto border border-[var(--border)] rounded-lg">
                                <table className="w-full border-collapse text-sm text-left">
                                    <thead className="bg-[var(--bg-main)] text-[var(--text-main)] font-bold sticky top-0 shadow-sm z-10">
                                        <tr>
                                            <th className="p-3 border-b border-[var(--border)] w-48 bg-[var(--bg-main)]">Code</th>
                                            <th className="p-3 border-b border-[var(--border)] w-48 bg-[var(--bg-main)]">Document</th>
                                            <th className="p-3 border-b border-[var(--border)] bg-[var(--bg-main)]">Segment Text</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allSelections.map(sel => {
                                            const code = project.codes.find(c => c.id === sel.codeId);
                                            const transcript = project.transcripts.find(t => t.id === sel.transcriptId);
                                            return (
                                                <tr key={sel.id} className="hover:bg-[var(--bg-main)] border-b border-[var(--border)] last:border-0">
                                                    <td className="p-3 border-r border-[var(--border)] font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: code?.color }}></span>
                                                            <span className="truncate">{code?.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 border-r border-[var(--border)] text-[var(--text-muted)] truncate max-w-xs">{transcript?.name}</td>
                                                    <td className="p-3 text-[var(--text-main)] italic">"{sel.text}"</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {viewMode === 'cooccurrence' && (
                            <div className="flex-1 overflow-auto border border-[var(--border)] rounded-lg">
                                {cooccurrenceMatrix.codes.length === 0 ? (
                                    <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                                        <p>No coded segments yet. Apply codes to transcripts to see co-occurrence patterns.</p>
                                    </div>
                                ) : (
                                    <table className="w-full border-collapse text-sm">
                                        <thead className="bg-[var(--bg-main)] sticky top-0 z-10">
                                            <tr>
                                                <th className="p-3 border-b border-r border-[var(--border)] min-w-[160px] bg-[var(--bg-main)] text-left text-[var(--text-muted)] text-xs font-bold uppercase">
                                                    Co-occurrence
                                                </th>
                                                {cooccurrenceMatrix.codes.map(code => (
                                                    <th key={code.id} className="p-2 border-b border-[var(--border)] bg-[var(--bg-main)] min-w-[80px]">
                                                        <div className="flex items-center gap-1 justify-center">
                                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: code.color }} />
                                                            <span className="text-xs truncate max-w-[70px]" title={code.name}>{code.name}</span>
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cooccurrenceMatrix.codes.map(rowCode => (
                                                <tr key={rowCode.id} className="border-b border-[var(--border)]">
                                                    <td className="p-3 border-r border-[var(--border)] font-medium text-[var(--text-main)] bg-[var(--bg-panel)] sticky left-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rowCode.color }} />
                                                            {rowCode.name}
                                                        </div>
                                                    </td>
                                                    {cooccurrenceMatrix.codes.map(colCode => {
                                                        const count = cooccurrenceMatrix.matrix[rowCode.id]?.[colCode.id] || 0;
                                                        const isDiagonal = rowCode.id === colCode.id;
                                                        const maxCount = Math.max(1, ...Object.values(cooccurrenceMatrix.matrix).flatMap(r => Object.values(r)));
                                                        const intensity = count / maxCount;
                                                        return (
                                                            <td
                                                                key={colCode.id}
                                                                className={`p-3 text-center border-r border-[var(--border)] transition-colors ${isDiagonal ? 'bg-[var(--bg-main)]' : ''}`}
                                                                style={!isDiagonal && count > 0 ? {
                                                                    backgroundColor: `rgba(99, 102, 241, ${0.1 + intensity * 0.5})`,
                                                                    color: intensity > 0.5 ? 'white' : 'var(--text-main)'
                                                                } : {}}
                                                            >
                                                                {isDiagonal ? '—' : count > 0 ? <strong>{count}</strong> : <span className="text-[var(--text-muted)]">0</span>}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};