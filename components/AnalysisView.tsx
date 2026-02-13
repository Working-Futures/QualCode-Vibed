import React, { useState, useMemo, useEffect } from 'react';
import { Project, CollaboratorData } from '../types';
import { X, Download, Filter, BarChart as IconChart, Users, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getAllCollaboratorData } from '../services/firestoreService';

interface Props {
    project: Project;
    onClose: () => void;
    onExport: () => void;
    cloudProjectId?: string;
    currentUserId?: string;
    cloudProject?: { members: Record<string, any> } | null;
}

export const AnalysisView: React.FC<Props> = ({ project, onClose, onExport, cloudProjectId, currentUserId, cloudProject }) => {
    const [viewMode, setViewMode] = useState<'chart' | 'table' | 'segments' | 'cooccurrence'>('chart');
    const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>([]);

    // Comparison State
    const [compareMode, setCompareMode] = useState(false);
    const [collaboratorData, setCollaboratorData] = useState<CollaboratorData[]>([]);
    const [loadingCollab, setLoadingCollab] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]); // Empty = All

    useEffect(() => {
        if (compareMode && cloudProjectId && collaboratorData.length === 0) {
            loadCollaboratorData();
        }
    }, [compareMode, cloudProjectId]);

    const loadCollaboratorData = async () => {
        if (!cloudProjectId || !currentUserId) return;
        setLoadingCollab(true);
        try {
            // Fetch ALL collaborator data (don't exclude self, we want everyone for comparison)
            const data = await getAllCollaboratorData(cloudProjectId, '__FETCH_ALL__');

            // Filter to only include actual current project members
            const memberIds = cloudProject ? new Set(Object.keys(cloudProject.members)) : null;
            const filteredData = memberIds
                ? data.filter(d => memberIds.has(d.userId))
                : data;

            setCollaboratorData(filteredData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingCollab(false);
        }
    };

    const { chartData, filteredCodes, allSelections, userKeys } = useMemo(() => {
        const allCodes = project.codes;
        let displayCodes = allCodes;

        if (selectedFamilyIds.length > 0) {
            displayCodes = allCodes.filter(c => {
                if (!c.parentId) return selectedFamilyIds.includes(c.id);
                return selectedFamilyIds.includes(c.parentId);
            });
        }

        // Prepare Data
        let data: any[] = [];
        let selections: any[] = [];
        let users: string[] = [];

        if (compareMode && cloudProjectId) {
            // Comparison Logic
            // We need a list of all users to display.
            // Include myself (project.selections) + collaboratorData

            // Combine all datasets
            // Check if my data already exists in collaboratorData
            const myDataExists = collaboratorData.some(c => c.userId === currentUserId);

            let allUsers: CollaboratorData[];
            if (myDataExists) {
                // My data is already in the fetched results; update it with my current local state
                allUsers = collaboratorData.map(c => {
                    if (c.userId === currentUserId) {
                        return {
                            ...c,
                            displayName: 'Me (Current)',
                            selections: project.selections,
                        };
                    }
                    return c;
                });
            } else {
                // Append my current state manually
                const myData: CollaboratorData = {
                    userId: currentUserId || 'me',
                    displayName: 'Me (Current)',
                    email: '',
                    selections: project.selections,
                    transcriptMemos: {},
                    personalMemo: ''
                };
                allUsers = [myData, ...collaboratorData.filter(c => c.userId !== currentUserId)];
            }

            // Filter by selectedUsers
            const activeUsers = selectedUsers.length > 0
                ? allUsers.filter(u => selectedUsers.includes(u.userId))
                : allUsers;

            users = activeUsers.map(u => u.displayName);

            // Build Chart Data
            // Structure: { name: 'Code A', 'User A': 10, 'User B': 5, ... }
            data = displayCodes.map(code => {
                const row: any = { name: code.name, id: code.id, fill: code.color };
                activeUsers.forEach(u => {
                    const count = u.selections.filter(s => s.codeId === code.id).length;
                    row[u.displayName] = count;
                });
                return row;
            }).filter(item => Object.keys(item).length > 3 && Object.values(item).some(v => typeof v === 'number' && v > 0));

            // Build Selections List
            activeUsers.forEach(u => {
                const userSelections = u.selections.map(s => ({ ...s, userName: u.displayName }));
                selections.push(...userSelections);
            });
            selections = selections.filter(s => displayCodes.some(c => c.id === s.codeId));

        } else {
            // Standard Single View
            data = displayCodes.map(code => {
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

            selections = project.selections.filter(s => displayCodes.some(c => c.id === s.codeId));
        }

        return { chartData: data, filteredCodes: displayCodes, allSelections: selections, userKeys: users };
    }, [project, selectedFamilyIds, compareMode, collaboratorData, selectedUsers]);

    const rootCodes = project.codes.filter(c => !c.parentId);

    const toggleFamily = (id: string) => {
        setSelectedFamilyIds(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    // Co-occurrence (simplified: relies on 'project' only for now, hard to matrix multiple users at once)
    const cooccurrenceMatrix = useMemo(() => {
        if (compareMode) return { matrix: {}, codes: [] }; // Not supported in compare yet

        const usedCodes = project.codes.filter(c => project.selections.some(s => s.codeId === c.id));
        const matrix: Record<string, Record<string, number>> = {};
        // ... (existing logic)
        usedCodes.forEach(a => { matrix[a.id] = {}; usedCodes.forEach(b => { matrix[a.id][b.id] = 0; }); });

        const byTranscript: Record<string, typeof project.selections> = {};
        project.selections.forEach(s => {
            if (!byTranscript[s.transcriptId]) byTranscript[s.transcriptId] = [];
            byTranscript[s.transcriptId].push(s);
        });

        Object.values(byTranscript).forEach(sels => {
            for (let i = 0; i < sels.length; i++) {
                for (let j = i + 1; j < sels.length; j++) {
                    const a = sels[i];
                    const b = sels[j];
                    if (a.codeId === b.codeId) continue;
                    if (Math.abs(a.startIndex - b.startIndex) < 200) {
                        matrix[a.codeId][b.codeId] = (matrix[a.codeId]?.[b.codeId] || 0) + 1;
                        matrix[b.codeId][a.codeId] = (matrix[b.codeId]?.[a.codeId] || 0) + 1;
                    }
                }
            }
        });
        return { matrix, codes: usedCodes };
    }, [project.codes, project.selections, compareMode]);

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
                        {/* Compare Toggle */}
                        {cloudProjectId && (
                            <button
                                onClick={() => setCompareMode(!compareMode)}
                                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-bold rounded-md transition-all border ${compareMode ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-[var(--bg-main)] text-[var(--text-muted)] border-transparent'}`}
                            >
                                <Users size={16} /> Compare
                            </button>
                        )}

                        <div className="flex bg-[var(--bg-main)] rounded-lg p-1">
                            {['chart', 'table', 'segments', 'cooccurrence'].map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setViewMode(mode as any)}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${viewMode === mode ? 'bg-[var(--bg-panel)] shadow text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                >
                                    {mode}
                                </button>
                            ))}
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
                        {/* Code Filters */}
                        <div className="space-y-1 mb-6">
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
                                            <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: rootCode.color }}></span>
                                            {rootCode.name}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* User Filters (Compare Mode) */}
                        {compareMode && collaboratorData.length > 0 && (
                            <div>
                                <div className="flex items-center mb-2 text-[var(--text-muted)] font-bold text-sm uppercase tracking-wider">
                                    <Users size={14} className="mr-2" /> Users
                                </div>
                                <div className="space-y-1">
                                    {[{ userId: currentUserId || 'me', displayName: 'Me (Current)' }, ...collaboratorData].map(u => (
                                        <label key={u.userId} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-panel)] rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedUsers.length === 0 || selectedUsers.includes(u.userId)}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setSelectedUsers(prev => {
                                                        const wasEmpty = prev.length === 0;
                                                        // If it was empty (all selected implicitly), and we uncheck one, we must explicitly select ONLY the others.
                                                        // This logic is tricky. Let's simplify:
                                                        // If currently empty, checking one means only that one is selected?
                                                        // Or start with empty = all.

                                                        // Let's go with: Empty list = All.
                                                        // If I verify the list is empty and I click one, I probably want to select JUST that one? No, checkboxes usually imply "add/remove".

                                                        // Simpler: Just toggle.
                                                        if (wasEmpty) {
                                                            // If all were shown, and we unclick one? No, let's explicitly select all others?
                                                            // Let's initialize selectedUsers with everyone when enter mode?
                                                            return [u.userId];
                                                        }

                                                        if (checked) return [...prev, u.userId];
                                                        return prev.filter(id => id !== u.userId);
                                                    });
                                                }}
                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm truncate">{u.displayName}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 p-6 overflow-hidden flex flex-col bg-[var(--bg-panel)]">
                        {loadingCollab ? (
                            <div className="flex-1 flex items-center justify-center">
                                <RefreshCw className="animate-spin text-[var(--accent)] mb-2" size={32} />
                                <span className="ml-2 text-sm text-[var(--text-muted)]">Loading comparison data...</span>
                            </div>
                        ) : viewMode === 'chart' ? (
                            <div className="w-full h-full min-h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} interval={0} angle={-45} textAnchor="end" height={80} />
                                        <YAxis tick={{ fill: 'var(--text-muted)' }} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-main)' }}
                                            cursor={{ fill: 'var(--bg-main)', opacity: 0.1 }}
                                            labelStyle={{ fontWeight: 'bold', marginBottom: '5px' }}
                                            formatter={(value: number) => [`${value} selections`, '']}
                                        />
                                        <Legend />
                                        {compareMode ? (
                                            userKeys.map((userName, i) => (
                                                <Bar key={userName} dataKey={userName} fill={`hsl(${i * 60 + 200}, 70%, 60%)`} radius={[4, 4, 0, 0]} name={userName} />
                                            ))
                                        ) : (
                                            <Bar dataKey="count" fill="var(--accent)" name="Frequency" radius={[4, 4, 0, 0]} />
                                        )}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : viewMode === 'table' ? (
                            <div className="flex-1 overflow-auto border border-[var(--border)] rounded-lg">
                                {/* Simplified table for now, needs overhaul for comparison */}
                                {compareMode ? (
                                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] p-8">
                                        <div className="text-lg font-semibold mb-2">Matrix View not fully optimized</div>
                                        <p className="text-sm opacity-70">Please switch to Chart view for comparison.</p>
                                    </div>
                                ) : (
                                    <table className="w-full border-collapse text-sm text-left">
                                        {/* ... Existing Single User Table ... */}
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
                                )}
                            </div>
                        ) : viewMode === 'segments' ? (
                            <div className="flex-1 overflow-auto border border-[var(--border)] rounded-lg">
                                <table className="w-full border-collapse text-sm text-left">
                                    <thead className="bg-[var(--bg-main)] text-[var(--text-main)] font-bold sticky top-0 shadow-sm z-10">
                                        <tr>
                                            {compareMode && <th className="p-3 border-b border-[var(--border)] w-32 bg-[var(--bg-main)]">User</th>}
                                            <th className="p-3 border-b border-[var(--border)] w-48 bg-[var(--bg-main)]">Code</th>
                                            <th className="p-3 border-b border-[var(--border)] w-48 bg-[var(--bg-main)]">Document</th>
                                            <th className="p-3 border-b border-[var(--border)] bg-[var(--bg-main)]">Segment Text</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allSelections.map((sel, i) => {
                                            const code = project.codes.find(c => c.id === sel.codeId);
                                            const transcript = project.transcripts.find(t => t.id === sel.transcriptId);
                                            return (
                                                <tr key={`${sel.id}-${i}`} className="hover:bg-[var(--bg-main)] border-b border-[var(--border)] last:border-0">
                                                    {compareMode && <td className="p-3 border-r border-[var(--border)] font-bold text-xs">{sel.userName}</td>}
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
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] p-8">
                                <div className="text-lg font-semibold mb-2">View not supported</div>
                                <p className="text-sm opacity-70">This view is currently unavailable in comparison mode.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};