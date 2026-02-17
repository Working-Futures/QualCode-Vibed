import { CloudProject, UserProjectData, Code, StickyNote } from '../types';
import { saveCodes, saveUserProjectData, updateCloudProject, addStickyNote as firestoreAddStickyNote } from '../services/firestoreService';

export type QueueItem =
    | { type: 'save_codes'; projectId: string; codes: Code[] }
    | { type: 'save_user_data'; projectId: string; userId: string; data: UserProjectData }
    | { type: 'update_project'; projectId: string; updates: Partial<CloudProject> }
    | { type: 'save_sticky_note'; projectId: string; note: StickyNote };

const QUEUE_KEY = 'offline_changes_queue';

export const getQueue = (): QueueItem[] => {
    try {
        const s = localStorage.getItem(QUEUE_KEY);
        return s ? JSON.parse(s) : [];
    } catch { return []; }
};

export const addToQueue = (item: QueueItem) => {
    const queue = getQueue();
    // Simple dedupe strategy: if same type and target, replace with latest
    let newQueue = [...queue];

    if (item.type === 'save_codes') {
        newQueue = newQueue.filter(i => !(i.type === 'save_codes' && i.projectId === item.projectId));
    } else if (item.type === 'save_user_data') {
        newQueue = newQueue.filter(i => !(i.type === 'save_user_data' && i.projectId === item.projectId && i.userId === item.userId));
    } else if (item.type === 'update_project') {
        // For project updates, we might want to merge updates ideally, but replacing is safer for now if specific fields
        newQueue = newQueue.filter(i => !(i.type === 'update_project' && i.projectId === item.projectId));
    } else if (item.type === 'save_sticky_note') {
        newQueue = newQueue.filter(i => !(i.type === 'save_sticky_note' && i.projectId === item.projectId && i.note.id === item.note.id));
    }

    newQueue.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
};

export const clearQueue = () => {
    localStorage.removeItem(QUEUE_KEY);
};

export const processQueue = async (): Promise<boolean> => {
    const queue = getQueue();
    if (queue.length === 0) return true;

    if (!navigator.onLine) return false;



    // We process sequentially to ensure order correctness
    const failedItems: QueueItem[] = [];

    for (const item of queue) {
        try {
            if (item.type === 'save_codes') {
                await saveCodes(item.projectId, item.codes);
            } else if (item.type === 'save_user_data') {
                await saveUserProjectData(item.projectId, item.userId, item.data);
            } else if (item.type === 'update_project') {
                await updateCloudProject(item.projectId, item.updates);
            } else if (item.type === 'save_sticky_note') {
                await firestoreAddStickyNote(item.projectId, item.note);
            }
        } catch (e) {
            console.error("Failed to process queue item", item, e);
            failedItems.push(item);
        }
    }

    if (failedItems.length > 0) {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(failedItems));
        return false; // Not fully successful
    } else {
        clearQueue();
        return true;
    }
};
