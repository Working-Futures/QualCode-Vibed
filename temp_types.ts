import { Code } from './types.ts';

/**
 * Represents a single version entry for a code.
 */
export interface CodeHistoryEntry {
    id: string; // Document ID
    codeId: string;
    projectId: string;
    previousData: Partial<Code>;
    newData: Partial<Code>;
    changeType: 'create' | 'update' | 'delete' | 'merge';
    userId: string; // The user who made the change
    userName: string;
    timestamp: number;
    description?: string; // e.g. "Changed color from Red to Blue"
}
