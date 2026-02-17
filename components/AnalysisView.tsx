import React, { useState, useMemo, useEffect } from 'react';
import { Project, CollaboratorData } from '../types';
import { X, Download, Filter, BarChart as IconChart, Users, RefreshCw, Info } from 'lucide-react';
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
    const [viewMode, setViewMode] = useState<'chart' | 'table' | 'segments' | 'cooccurrence' | 'reliability'>('chart');
    const [selectedFamilyIds, setSelectedFamilyIds] = useState<string[]>([]);

    // Comparison State
    const [compareMode, setCompareMode] = useState(false);
    const [collaboratorData, setCollaboratorData] = useState<CollaboratorData[]>([]);
    const [loadingCollab, setLoadingCollab] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]); // Empty = All
    const [cooccurrenceUser, setCooccurrenceUser] = useState<string>('me');

    // Reliability State

    const [reliabilityUserA, setReliabilityUserA] = useState<string>('me');
    const [reliabilityUserB, setReliabilityUserB] = useState<string>('');
    const [selectedTranscriptIds, setSelectedTranscriptIds] = useState<string[]>([]); // Empty = All

    const [codebookFilter, setCodebookFilter] = useState<'all' | 'master' | 'personal'>('master');
    const [showCalcInfo, setShowCalcInfo] = useState(false);

    useEffect(() => {
        if (compareMode) {
            if (cloudProjectId && collaboratorData.length === 0) {
                loadCollaboratorData();
            }
            setCodebookFilter('master');
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

    // Unified User Resolution (fixes duplicates)
    const allResolvedUsers = useMemo(() => {
        if (!compareMode || !cloudProjectId) return [];

        const myId = currentUserId || 'me';

        // Helper to check if a collaborator is actually "Me"
        const isMe = (c: CollaboratorData) => {
            // Check ID match
            if (c.userId === myId) return true;
            if (currentUserId && c.userId === currentUserId) return true;

            // Heuristic A: If display name is literally "Me" (unlikely from DB but possible)
            if (c.displayName === 'Me') return true;

            // Heuristic B: Check if selections are identical to mine (fingerprinting)
            // This handles cases where my ID in DB is different from local auth ID for some reason
            if (c.selections?.length === project.selections?.length && (project.selections?.length || 0) > 0) {
                // Check first and last selection IDs as a signature
                const s1 = c.selections?.[0];
                const ps1 = project.selections?.[0];
                const sl = c.selections?.[c.selections.length - 1];
                const psl = project.selections?.[project.selections.length - 1];
                if (s1?.id === ps1?.id && sl?.id === psl?.id) return true;
            }
            return false;
        };

        const others = collaboratorData.filter(c => !isMe(c));

        const myData: CollaboratorData = {
            userId: myId,
            displayName: 'Me',
            email: '',
            selections: project.selections,
            transcriptMemos: {},
            personalMemo: ''
        };

        return [myData, ...others];
    }, [compareMode, cloudProjectId, collaboratorData, currentUserId, project.selections]);

    const { chartData, filteredCodes, allSelections, userKeys } = useMemo(() => {
        const allCodes = project.codes;

        // 1. Filter by Codebook Type
        let typeFilteredCodes = allCodes;
        if (codebookFilter === 'master') {
            typeFilteredCodes = allCodes.filter(c => c.type === 'master' || c.type === 'suggested');
        } else if (codebookFilter === 'personal') {
            typeFilteredCodes = allCodes.filter(c => (c.type || 'personal') === 'personal');
        }

        // 2. Filter by Family Selection
        let displayCodes = typeFilteredCodes;
        if (selectedFamilyIds.length > 0) {
            displayCodes = typeFilteredCodes.filter(c => {
                if (!c.parentId) return selectedFamilyIds.includes(c.id);
                return selectedFamilyIds.includes(c.parentId);
            });
        }

        // Deduplicate codes to prevent double-counting in reliability
        const uniqueCodesMap = new Map();
        displayCodes.forEach(c => uniqueCodesMap.set(c.id, c));
        displayCodes = Array.from(uniqueCodesMap.values());

        // Prepare Data
        let data: any[] = [];
        let selections: any[] = [];
        let users: string[] = [];

        if (compareMode && cloudProjectId) {
            // Comparison Logic
            // Use the unified User List

            // Filter by selectedUsers
            const activeUsers = selectedUsers.length > 0
                ? allResolvedUsers.filter(u => selectedUsers.includes(u.userId))
                : allResolvedUsers;

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
    }, [project, selectedFamilyIds, compareMode, allResolvedUsers, selectedUsers, codebookFilter]);

    const rootCodes = project.codes.filter(c => !c.parentId);

    const toggleFamily = (id: string) => {
        setSelectedFamilyIds(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    // Co-occurrence (simplified: relies on 'project' only for now, hard to matrix multiple users at once)
    const cooccurrenceMatrix = useMemo(() => {
        // Determine which selections to use
        let targetSelections = project.selections;

        if (compareMode && cloudProjectId) {
            // Find the selected user's data
            if (cooccurrenceUser === currentUserId || cooccurrenceUser === 'me') {
                targetSelections = project.selections;
            } else {
                const user = collaboratorData.find(c => c.userId === cooccurrenceUser);
                targetSelections = user ? user.selections : [];
            }
        }

        // Use strictly the codes currently filtered/visible
        // Sort them alphabetically for a cleaner matrix
        const sortedCodes = [...filteredCodes].sort((a, b) => a.name.localeCompare(b.name));
        const relevantCodeIds = new Set(sortedCodes.map(c => c.id));

        // Filter selections to only those relevant to displayed codes
        const relevantSelections = targetSelections.filter(s => relevantCodeIds.has(s.codeId));

        const matrix: Record<string, Record<string, number>> = {};

        // Initialize matrix
        sortedCodes.forEach(a => {
            matrix[a.id] = {};
            sortedCodes.forEach(b => {
                matrix[a.id][b.id] = 0;
            });
        });

        const byTranscript: Record<string, typeof targetSelections> = {};
        relevantSelections.forEach(s => {
            if (!byTranscript[s.transcriptId]) byTranscript[s.transcriptId] = [];
            byTranscript[s.transcriptId].push(s);
        });

        let maxCount = 0;

        Object.values(byTranscript).forEach(sels => {
            for (let i = 0; i < sels.length; i++) {
                for (let j = i + 1; j < sels.length; j++) {
                    const a = sels[i];
                    const b = sels[j];
                    if (a.codeId === b.codeId) continue;

                    // Check for overlap: StartA < EndB && EndA > StartB
                    const isOverlapping = (a.startIndex < b.endIndex && a.endIndex > b.startIndex);

                    if (isOverlapping) {
                        if (matrix[a.codeId] && matrix[b.codeId]) {
                            matrix[a.codeId][b.codeId] = (matrix[a.codeId][b.codeId] || 0) + 1;
                            matrix[b.codeId][a.codeId] = (matrix[b.codeId][a.codeId] || 0) + 1;

                            maxCount = Math.max(maxCount, matrix[a.codeId][b.codeId]);
                        }
                    }
                }
            }
        });
        return { matrix, codes: sortedCodes, maxCount };
    }, [filteredCodes, project.selections, compareMode, cooccurrenceUser, collaboratorData, currentUserId]);

    // Helper: Calculate Jaccard for a specific set of selections (generic)
    const calculateJaccardScore = (selectionsA: any[], selectionsB: any[]) => {
        let intersectionLength = 0;
        let totalLenA = 0;
        let totalLenB = 0;

        // Group by Transcript
        const transcripts = new Set([...selectionsA.map(s => s.transcriptId), ...selectionsB.map(s => s.transcriptId)]);

        transcripts.forEach(tid => {
            const transcriptSelsA = selectionsA.filter(s => s.transcriptId === tid);
            const transcriptSelsB = selectionsB.filter(s => s.transcriptId === tid);

            // Merge Ranges
            const mergeRanges = (ranges: { start: number, end: number }[]) => {
                if (ranges.length === 0) return [];
                const sorted = [...ranges].sort((a, b) => a.start - b.start);
                const result = [sorted[0]];
                for (let i = 1; i < sorted.length; i++) {
                    const last = result[result.length - 1];
                    const curr = sorted[i];
                    if (curr.start <= last.end) {
                        last.end = Math.max(last.end, curr.end);
                    } else {
                        result.push(curr);
                    }
                }
                return result;
            };

            // Force numeric cast to avoid string math issues
            const rangesA = mergeRanges(transcriptSelsA.map(s => ({ start: Number(s.startIndex), end: Number(s.endIndex) })));
            const rangesB = mergeRanges(transcriptSelsB.map(s => ({ start: Number(s.startIndex), end: Number(s.endIndex) })));

            const getLength = (ranges: { start: number, end: number }[]) => ranges.reduce((acc, r) => acc + (r.end - r.start), 0);

            const lenA = getLength(rangesA);
            const lenB = getLength(rangesB);

            totalLenA += lenA;
            totalLenB += lenB;

            // Intersection
            let iLen = 0;
            rangesA.forEach(rA => {
                rangesB.forEach(rB => {
                    const start = Math.max(rA.start, rB.start);
                    const end = Math.min(rA.end, rB.end);
                    if (end > start) {
                        iLen += (end - start);
                    }
                });
            });
            intersectionLength += iLen;
        });

        const unionLength = totalLenA + totalLenB - intersectionLength;
        const jaccard = unionLength === 0 ? 0 : intersectionLength / unionLength;

        return { jaccard, intersectionLength, unionLength, totalLenA, totalLenB };
    };

    // Reliability Data: Matrix and Code Stats
    const { reliabilityMatrix, codeReliabilityStats } = useMemo(() => {
        if (!compareMode || viewMode !== 'reliability' || allResolvedUsers.length < 2) {
            return { reliabilityMatrix: [], codeReliabilityStats: [] };
        }

        // Helper filter
        const filterByTranscript = (s: any) => selectedTranscriptIds.length === 0 || selectedTranscriptIds.includes(s.transcriptId);

        // 1. User Matrix (Global Agreement across ALL codes)
        // We calculate weighted average or global intersection/union sum? 
        // Best practice: Sum of all intersections / Sum of all unions across all codes.

        const matrix: any[] = [];
        allResolvedUsers.forEach(userA => {
            const row: any = { user: userA.displayName, userId: userA.userId };
            allResolvedUsers.forEach(userB => {
                if (userA.userId === userB.userId) {
                    row[userB.userId] = 1; // Self is 100%
                    return;
                }

                // Calculate Global Jaccard
                // We must do it per code to avoid cross-code false positives
                let grandIntersection = 0;
                let grandUnion = 0;

                // Use filteredCodes to limit scope if filters active
                filteredCodes.forEach(code => {
                    const sA = userA.selections.filter(s => s.codeId === code.id && filterByTranscript(s));
                    const sB = userB.selections.filter(s => s.codeId === code.id && filterByTranscript(s));
                    if (sA.length === 0 && sB.length === 0) return;

                    const stats = calculateJaccardScore(sA, sB);
                    grandIntersection += stats.intersectionLength;
                    grandUnion += stats.unionLength;
                });

                row[userB.userId] = grandUnion === 0 ? 0 : grandIntersection / grandUnion;
            });
            matrix.push(row);
        });

        // 2. Code Reliability Stats
        // For each code, calculate average pairwise agreement among users who used it
        const codeStats = filteredCodes.map(code => {
            // Identify users who used this code (considering transcript filter)
            const usersWithCode = allResolvedUsers.filter(u => u.selections.some(s => s.codeId === code.id && filterByTranscript(s)));

            let totalJ = 0;
            let pairs = 0;

            // Calculate pairwise for all combinations
            for (let i = 0; i < usersWithCode.length; i++) {
                for (let j = i + 1; j < usersWithCode.length; j++) {
                    const uA = usersWithCode[i];
                    const uB = usersWithCode[j];

                    const sA = uA.selections.filter(s => s.codeId === code.id && filterByTranscript(s));
                    const sB = uB.selections.filter(s => s.codeId === code.id && filterByTranscript(s));

                    const { jaccard } = calculateJaccardScore(sA, sB);
                    totalJ += jaccard;
                    pairs++;
                }
            }

            const avgAgreement = pairs === 0 ? (usersWithCode.length > 0 ? 1 : 0) : totalJ / pairs;

            return {
                ...code,
                avgAgreement,
                userCount: usersWithCode.length
            };
        }).filter(c => c.userCount > 0).sort((a, b) => b.avgAgreement - a.avgAgreement);

        return { reliabilityMatrix: matrix, codeReliabilityStats: codeStats };

    }, [compareMode, viewMode, allResolvedUsers, filteredCodes, selectedTranscriptIds]);


    // Detailed Reliability Calculations (Selected Pair)
    const reliabilityMetrics = useMemo(() => {
        if (!compareMode || viewMode !== 'reliability' || !reliabilityUserA || !reliabilityUserB) {
            return [];
        }

        const getUserSelections = (uid: string) => {
            const user = allResolvedUsers.find(u => u.userId === uid);
            return user ? user.selections : [];
        };

        const allSelectionsA = getUserSelections(reliabilityUserA);
        const allSelectionsB = getUserSelections(reliabilityUserB);

        // Filter by Transcript if selected
        const filterByTranscript = (s: any) => selectedTranscriptIds.length === 0 || selectedTranscriptIds.includes(s.transcriptId);

        // Calculate for ALL displayed codes
        const metrics = filteredCodes.map(code => {
            const selsA = allSelectionsA.filter(s => s.codeId === code.id && filterByTranscript(s));
            const selsB = allSelectionsB.filter(s => s.codeId === code.id && filterByTranscript(s));

            if (selsA.length === 0 && selsB.length === 0) return null;

            const { jaccard, intersectionLength, unionLength, totalLenA, totalLenB } = calculateJaccardScore(selsA, selsB);

            return {
                codeId: code.id,
                codeName: code.name,
                color: code.color,
                percentAgreement: jaccard * 100,
                intersectionLength,
                unionLength,
                totalLenA,
                totalLenB
            };
        }).filter((m): m is NonNullable<typeof m> => m !== null);

        // Sort by potentially "interesting" metrics
        return metrics.sort((a, b) => (b.unionLength - a.unionLength));

    }, [compareMode, viewMode, reliabilityUserA, reliabilityUserB, allResolvedUsers, filteredCodes, selectedTranscriptIds]);

    // Smart Sizing Logic
    const { cellClass, headerHeight, textSize } = useMemo(() => {
        const count = cooccurrenceMatrix.codes.length;
        if (count <= 10) return { cellClass: 'w-20 h-20', headerHeight: 'h-48', textSize: 'text-sm' };
        if (count <= 25) return { cellClass: 'w-12 h-12', headerHeight: 'h-40', textSize: 'text-xs' };
        return { cellClass: 'w-8 h-8', headerHeight: 'h-32', textSize: 'text-[10px]' };
    }, [cooccurrenceMatrix.codes.length]);

    const cellWidthClass = cellClass.split(' ')[0]; // Extract w-X
    const cellHeightClass = cellClass.split(' ')[1]; // Extract h-X

    // Header text shift logic based on size
    const headerTranslate = cooccurrenceMatrix.codes.length <= 10 ? 'translate-x-4' : 'translate-x-2';


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
                            {compareMode && (
                                <button
                                    onClick={() => setViewMode('reliability')}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${viewMode === 'reliability' ? 'bg-[var(--bg-panel)] shadow text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                                >
                                    Reliability
                                </button>
                            )}
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

                        {/* Codebook Filter */}
                        <div className="mb-6">
                            <div className="flex items-center mb-2 text-[var(--text-muted)] font-bold text-sm uppercase tracking-wider">
                                <Filter size={14} className="mr-2" /> Codebook
                            </div>
                            <select
                                value={codebookFilter}
                                onChange={(e) => setCodebookFilter(e.target.value as any)}
                                className="w-full bg-[var(--bg-panel)] border border-[var(--border)] text-[var(--text-main)] text-sm rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--accent)] transition-all"
                            >
                                <option value="master">Master Codebook</option>
                                <option value="personal">Personal Codebook</option>
                            </select>
                        </div>

                        {/* Document Filter (Reliability Only) */}
                        {viewMode === 'reliability' && (
                            <div className="mb-6">
                                <div className="flex items-center mb-2 text-[var(--text-muted)] font-bold text-sm uppercase tracking-wider">
                                    <Filter size={14} className="mr-2" /> Documents
                                </div>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-panel)] rounded cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                                        <input
                                            type="checkbox"
                                            checked={selectedTranscriptIds.length === 0}
                                            onChange={() => setSelectedTranscriptIds([])}
                                            className="rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                                        />
                                        <span className={`text-sm font-medium ${selectedTranscriptIds.length === 0 ? 'text-[var(--text-main)] font-bold' : 'text-[var(--text-muted)]'}`}>
                                            All Documents
                                        </span>
                                    </label>

                                    <div className="my-2 h-px bg-[var(--border)]"></div>

                                    {project.transcripts.map(t => {
                                        const isSelected = selectedTranscriptIds.includes(t.id);
                                        return (
                                            <label key={t.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-panel)] rounded cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {
                                                        setSelectedTranscriptIds(prev =>
                                                            prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                                                        );
                                                    }}
                                                    className="rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                                                />
                                                <span className={`text-sm truncate ${isSelected ? 'text-[var(--text-main)] font-medium' : 'text-[var(--text-muted)]'}`}>
                                                    {t.name}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center mb-4 text-[var(--text-muted)] font-bold text-sm uppercase tracking-wider">
                            <Filter size={14} className="mr-2" /> Filter Families
                        </div>
                        {/* Code Filters */}
                        <div className="space-y-1 mb-6">
                            <label className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-panel)] rounded cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                                <input
                                    type="checkbox"
                                    checked={selectedFamilyIds.length === 0}
                                    onChange={() => setSelectedFamilyIds([])}
                                    className="rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                                />
                                <span className={`text-sm font-medium ${selectedFamilyIds.length === 0 ? 'text-[var(--text-main)] font-bold' : 'text-[var(--text-muted)]'}`}>
                                    Show All Codes
                                </span>
                            </label>

                            <div className="my-2 h-px bg-[var(--border)]"></div>

                            {rootCodes.map(rootCode => {
                                const isSelected = selectedFamilyIds.includes(rootCode.id);
                                return (
                                    <label key={rootCode.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-panel)] rounded cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleFamily(rootCode.id)}
                                            className="rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                                        />
                                        <div className="flex items-center flex-1 min-w-0">
                                            <span className="w-2 h-2 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: rootCode.color }}></span>
                                            <span className={`text-sm truncate ${isSelected ? 'text-[var(--text-main)] font-medium' : 'text-[var(--text-muted)]'}`}>
                                                {rootCode.name}
                                            </span>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>

                        {/* User Filters (Compare Mode) */}
                        {compareMode && allResolvedUsers.length > 1 && (
                            <div>
                                <div className="flex items-center mb-2 text-[var(--text-muted)] font-bold text-sm uppercase tracking-wider">
                                    <Users size={14} className="mr-2" /> Users
                                </div>
                                <div className="space-y-1">
                                    {allResolvedUsers.map(u => (
                                        <label key={u.userId} className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-panel)] rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedUsers.length === 0 || selectedUsers.includes(u.userId)}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setSelectedUsers(prev => {
                                                        const wasEmpty = prev.length === 0;
                                                        if (wasEmpty) return [u.userId];
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
                                    <table className="w-full border-collapse text-sm text-left">
                                        <thead className="bg-[var(--bg-main)] text-[var(--text-main)] font-bold sticky top-0 shadow-sm z-10">
                                            <tr>
                                                <th className="p-3 border-b border-r border-[var(--border)] min-w-[200px] bg-[var(--bg-main)]">Code</th>
                                                {userKeys.map((userName, i) => (
                                                    <th key={userName} className="p-3 border-b border-[var(--border)] min-w-[120px] bg-[var(--bg-main)] truncate" title={userName}>
                                                        {userName}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {chartData.map((row, i) => (
                                                <tr key={row.name} className="hover:bg-[var(--bg-main)] border-b border-[var(--border)] last:border-0">
                                                    <td className="p-3 border-r border-[var(--border)] font-medium text-[var(--text-main)] bg-[var(--bg-panel)] sticky left-0">
                                                        <div className="flex items-center space-x-1">
                                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.fill }}></span>
                                                            <span className="truncate max-w-[200px]" title={row.name}>{row.name}</span>
                                                        </div>
                                                    </td>
                                                    {userKeys.map(userName => {
                                                        const count = row[userName] || 0;
                                                        return (
                                                            <td key={userName} className={`p-3 border-r border-[var(--border)] text-center transition-colors ${count > 0 ? 'font-medium' : 'text-[var(--text-muted)] opacity-50'}`}>
                                                                {count}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
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
                        ) : viewMode === 'cooccurrence' ? (
                            <div className="flex-1 overflow-auto border border-[var(--border)] rounded-lg p-4 bg-[var(--bg-main)] flex flex-col">
                                {compareMode && (
                                    <div className="mb-4 flex items-center justify-between bg-[var(--bg-panel)] p-3 rounded-lg border border-[var(--border)] shadow-sm">
                                        <div className="text-sm font-bold text-[var(--text-main)] flex items-center">
                                            <Users size={16} className="mr-2 text-[var(--accent)]" />
                                            Viewing Co-occurrence for:
                                        </div>
                                        <select
                                            value={cooccurrenceUser}
                                            onChange={(e) => setCooccurrenceUser(e.target.value)}
                                            className="bg-[var(--bg-main)] border border-[var(--border)] text-[var(--text-main)] rounded px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                                        >
                                            <option value="me">Me (Current)</option>
                                            {collaboratorData.filter(c => c.userId !== currentUserId).map(c => (
                                                <option key={c.userId} value={c.userId}>{c.displayName}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="min-w-max pb-12 flex-1 relative">
                                    <table className="border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="p-2 sticky left-0 z-10 bg-[var(--bg-main)]"></th>
                                                {cooccurrenceMatrix.codes.map(c => (
                                                    <th key={c.id} className={`p-2 ${headerHeight} ${cellWidthClass} align-bottom ${textSize} font-medium text-[var(--text-muted)]`}>
                                                        <div className={`w-6 overflow-visible whitespace-nowrap origin-bottom-left -rotate-45 ${headerTranslate}`}>
                                                            {c.name}
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {cooccurrenceMatrix.codes.map(rowCode => (
                                                <tr key={rowCode.id}>
                                                    <td className="p-2 text-xs font-medium text-right text-[var(--text-main)] max-w-[150px] truncate sticky left-0 z-10 bg-[var(--bg-main)] border-r border-[var(--border)]" title={rowCode.name}>
                                                        {rowCode.name}
                                                    </td>
                                                    {cooccurrenceMatrix.codes.map(colCode => {
                                                        if (rowCode.id === colCode.id) {
                                                            return <td key={colCode.id} className={`bg-[var(--bg-panel)] border border-[var(--border)] ${cellClass}`}></td>;
                                                        }
                                                        const count = cooccurrenceMatrix.matrix[rowCode.id]?.[colCode.id] || 0;
                                                        // Normalize intensity
                                                        const intensity = cooccurrenceMatrix.maxCount > 0 ? count / cooccurrenceMatrix.maxCount : 0;

                                                        return (
                                                            <td
                                                                key={colCode.id}
                                                                className={`border border-[var(--border)] ${cellClass} p-0 text-center ${textSize} transition-colors hover:border-[var(--accent)] cursor-default relative`}
                                                                title={`${rowCode.name} + ${colCode.name}: ${count} overlaps`}
                                                            >
                                                                <div
                                                                    className="w-full h-full flex items-center justify-center absolute inset-0"
                                                                    style={{
                                                                        backgroundColor: count > 0 ? `var(--accent)` : 'transparent',
                                                                        opacity: count > 0 ? 0.1 + (intensity * 0.9) : 0,
                                                                    }}
                                                                />
                                                                <span className="relative z-10" style={{
                                                                    color: intensity > 0.6 ? '#fff' : 'var(--text-main)',
                                                                    fontWeight: count > 0 ? 'bold' : 'normal',
                                                                    textShadow: intensity > 0.6 ? '0 1px 2px rgba(0,0,0,0.3)' : 'none'
                                                                }}>
                                                                    {count > 0 ? count : ''}
                                                                </span>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : viewMode === 'reliability' ? (
                            <div className="flex-1 overflow-auto border border-[var(--border)] rounded-lg p-6 bg-[var(--bg-main)] flex flex-col">
                                {compareMode ? (
                                    <div className="flex flex-col h-full max-w-5xl mx-auto w-full space-y-6">

                                        {/* 1. Global Reliability Matrix */}
                                        <div className="bg-[var(--bg-panel)] p-6 rounded-xl border border-[var(--border)] shadow-sm">
                                            <h3 className="text-lg font-bold text-[var(--text-main)] mb-4 flex items-center">
                                                <Users className="mr-2 text-[var(--accent)]" size={20} />
                                                Global Reliability Matrix (All Codes)
                                            </h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm border-collapse">
                                                    <thead>
                                                        <tr>
                                                            <th className="p-2"></th>
                                                            {allResolvedUsers.map(u => (
                                                                <th key={u.userId} className="p-2 text-[var(--text-muted)] font-medium max-w-[100px] truncate" title={u.displayName}>
                                                                    {u.displayName}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {reliabilityMatrix.map(row => (
                                                            <tr key={row.userId}>
                                                                <td className="p-2 font-bold text-right text-[var(--text-main)] border-r border-[var(--border)] pr-4">{row.user}</td>
                                                                {allResolvedUsers.map(colUser => {
                                                                    const val = row[colUser.userId];
                                                                    const valDisplay = (val * 100).toFixed(0);
                                                                    const isSelf = row.userId === colUser.userId;
                                                                    return (
                                                                        <td key={colUser.userId} className="p-2 text-center border border-[var(--border)]">
                                                                            <div
                                                                                className={`w-full py-2 rounded ${isSelf ? 'bg-gray-100/50 text-gray-300' : val > 0.7 ? 'bg-green-100 text-green-800' : val > 0.4 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-50 text-red-800'}`}
                                                                                title={`${row.user} vs ${colUser.displayName}: ${(val * 100).toFixed(1)}% Agreement`}
                                                                            >
                                                                                {isSelf ? '-' : `${valDisplay}%`}
                                                                            </div>
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* 2. Code Breakdown */}
                                        <div className="h-96">
                                            <div className="bg-[var(--bg-panel)] p-6 rounded-xl border border-[var(--border)] shadow-sm flex flex-col h-full">
                                                <div className="flex justify-between items-center mb-4">
                                                    <h3 className="text-lg font-bold text-[var(--text-main)] flex items-center">
                                                        <IconChart className="mr-2 text-[var(--accent)]" size={20} />
                                                        Reliability by Code (Avg. Pairwise)
                                                    </h3>
                                                    <button
                                                        onClick={() => setShowCalcInfo(true)}
                                                        className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
                                                    >
                                                        <Info size={14} />
                                                        How is this calculated?
                                                    </button>
                                                </div>
                                                <div className="flex-1 overflow-auto">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="sticky top-0 bg-[var(--bg-panel)] z-10">
                                                            <tr className="border-b border-[var(--border)]">
                                                                <th className="p-2">Code</th>
                                                                <th className="p-2 text-center">Users w/ Code</th>
                                                                <th className="p-2 text-right">Avg Agreement</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {codeReliabilityStats.map(stat => (
                                                                <tr key={stat.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-main)]">
                                                                    <td className="p-2 font-medium">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stat.color }}></span>
                                                                            <span className="truncate max-w-[200px]" title={stat.name}>{stat.name}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-2 text-center text-[var(--text-muted)]">{stat.userCount}</td>
                                                                    <td className={`p-2 text-right font-bold ${stat.avgAgreement > 0.7 ? 'text-green-600' : stat.avgAgreement > 0.4 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                                        {(stat.avgAgreement * 100).toFixed(1)}%
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Calculation Info Modal */}
                                        {showCalcInfo && (
                                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-6 animate-in fade-in duration-200">
                                                <div className="bg-[var(--bg-panel)] p-8 rounded-2xl border border-[var(--border)] shadow-2xl max-w-lg w-full relative">
                                                    <button
                                                        onClick={() => setShowCalcInfo(false)}
                                                        className="absolute top-4 right-4 p-2 hover:bg-[var(--bg-main)] rounded-full transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                                    >
                                                        <X size={20} />
                                                    </button>

                                                    <h4 className="font-bold mb-4 flex items-center text-lg text-[var(--text-main)]">
                                                        <RefreshCw className="mr-2 text-[var(--accent)]" size={20} />
                                                        Calculation Method
                                                    </h4>

                                                    <div className="text-[var(--text-main)] text-sm space-y-4">
                                                        <p>
                                                            Agreement (Jaccard Index) is calculated based on the <strong>positional overlap</strong> of highlight ranges.
                                                        </p>
                                                        <div className="bg-[var(--bg-main)] p-4 rounded-lg font-mono text-xs border border-[var(--border)] text-center">
                                                            Agreement = (Length of Overlap) / (Total Combined Length)
                                                        </div>

                                                        <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                                                            <p className="font-bold text-xs uppercase tracking-wider text-blue-800 mb-2">Example Scenario:</p>
                                                            <ul className="list-disc list-inside space-y-2 text-xs text-blue-900">
                                                                <li>User A highlights <span className="font-mono bg-blue-100 px-1 rounded">Line 1 (half) + Line 2 (all)</span></li>
                                                                <li>User B highlights <span className="font-mono bg-blue-100 px-1 rounded">Line 2 (all) + Line 3 (half)</span></li>
                                                            </ul>
                                                            <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-blue-900">
                                                                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                                                                    <span className="font-bold">Intersection:</span>
                                                                    <span>Line 2 (all)</span>
                                                                    <span className="font-bold">Union:</span>
                                                                    <span>Half L1 + All L2 + Half L3</span>
                                                                </div>
                                                                <p className="mt-2 italic opacity-80">
                                                                    Only the length of Line 2 counts as agreement. The non-overlapping parts reduce the score.
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <p className="text-xs text-[var(--text-muted)] italic">
                                                            Note: This calculates spatial overlap. It does not analyze text content semantically, but assuming static text, spatial overlap implies content agreement.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* 3. Detailed Inspector */}
                                        <div className="bg-[var(--bg-panel)] p-6 rounded-xl border border-[var(--border)] shadow-sm">
                                            <h3 className="text-lg font-bold text-[var(--text-main)] mb-4 flex items-center">
                                                <Users className="mr-2 text-[var(--accent)]" size={20} />
                                                Detailed Pairwise Inspection
                                            </h3>

                                            <div className="grid grid-cols-2 gap-4 mb-6">
                                                <div>
                                                    <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">User A (Baseline)</label>
                                                    <select
                                                        value={reliabilityUserA}
                                                        onChange={(e) => setReliabilityUserA(e.target.value)}
                                                        className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none"
                                                    >
                                                        {allResolvedUsers.map(c => (
                                                            <option key={c.userId} value={c.userId}>{c.displayName}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">User B (Comparison)</label>
                                                    <select
                                                        value={reliabilityUserB}
                                                        onChange={(e) => setReliabilityUserB(e.target.value)}
                                                        className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none"
                                                    >
                                                        <option value="">Select User...</option>
                                                        {allResolvedUsers.map(c => (
                                                            <option key={c.userId} value={c.userId}>{c.displayName}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            {reliabilityMetrics && reliabilityMetrics.length > 0 ? (
                                                <div className="max-h-96 overflow-auto border border-[var(--border)] rounded-lg">
                                                    <table className="w-full border-collapse text-sm text-left">
                                                        <thead className="bg-[var(--bg-main)] text-[var(--text-main)] font-bold sticky top-0 shadow-sm z-10">
                                                            <tr>
                                                                <th className="p-3 border-b border-[var(--border)]">Code</th>
                                                                <th className="p-3 border-b border-[var(--border)] text-center">Agreement</th>
                                                                <th className="p-3 border-b border-[var(--border)] text-right">Intersection</th>
                                                                <th className="p-3 border-b border-[var(--border)] text-right">Union</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {reliabilityMetrics.map((metric) => (
                                                                <tr key={metric.codeId} className="hover:bg-[var(--bg-main)] border-b border-[var(--border)] last:border-0">
                                                                    <td className="p-3 border-r border-[var(--border)] font-medium">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: metric.color }}></span>
                                                                            <span>{metric.codeName}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-3 border-r border-[var(--border)] text-center">
                                                                        <div className={`font-bold ${metric.percentAgreement > 70 ? 'text-green-500' : metric.percentAgreement > 40 ? 'text-yellow-500' : 'text-red-500'}`}>
                                                                            {metric.percentAgreement.toFixed(1)}%
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-3 border-r border-[var(--border)] text-right font-mono text-[var(--text-muted)]">
                                                                        {metric.intersectionLength}
                                                                    </td>
                                                                    <td className="p-3 text-right font-mono text-[var(--text-muted)]">
                                                                        {metric.unionLength}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="text-center text-[var(--text-muted)] py-4 text-sm italic">
                                                    Select two Users above to inspect specific codes.
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                ) : (
                                    <div className="text-center text-[var(--text-muted)]">Reliability Analysis requires Comparison Mode.</div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div >
    );
};