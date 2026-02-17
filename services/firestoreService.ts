import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    onSnapshot,
    writeBatch,
    arrayUnion,
    arrayRemove,
    serverTimestamp,
    orderBy,
    limit,
    Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    CloudProject,
    CloudTranscript,
    Code,
    Selection,
    UserProjectData,
    ProjectMember,
    Invitation,
    UserProfile,
    AppSettings,
    CollaboratorData,
    StickyNote,
    ChatMessage,
    DirectMessage,
    TranscriptChangeRequest,
    CodeHistoryEntry,
    CodebookChangeProposal,
    AppNotification,
    DocumentSnapshot,
    VersionControlEvent
} from '../types';

// ─── User Profile ───

export async function saveUserProfile(profile: UserProfile): Promise<void> {
    await setDoc(doc(db, 'users', profile.uid), profile, { merge: true });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function saveUserSettings(uid: string, settings: AppSettings): Promise<void> {
    await updateDoc(doc(db, 'users', uid), { settings });
}

// ─── Cloud Projects ───

export async function createCloudProject(
    name: string,
    ownerId: string,
    ownerEmail: string,
    ownerName: string
): Promise<string> {
    const projectRef = doc(collection(db, 'projects'));
    const now = Date.now();

    const member: ProjectMember = {
        userId: ownerId,
        role: 'admin',
        email: ownerEmail,
        displayName: ownerName,
        joinedAt: now,
    };

    const project: CloudProject = {
        id: projectRef.id,
        name,
        ownerId,
        ownerEmail,
        ownerName,
        created: now,
        lastModified: now,
        projectMemo: '',
        members: { [ownerId]: member },
        memberEmails: [ownerEmail.toLowerCase()],
    };

    await setDoc(projectRef, project);

    // Initialize the owner's userdata document
    await setDoc(doc(db, 'projects', projectRef.id, 'userdata', ownerId), {
        selections: [],
        transcriptMemos: {},
        personalMemo: '',
    });

    return projectRef.id;
}

export async function getUserProjects(userEmail: string): Promise<CloudProject[]> {
    const q = query(
        collection(db, 'projects'),
        where('memberEmails', 'array-contains', userEmail.toLowerCase())
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as CloudProject);
}

export async function getCloudProject(projectId: string): Promise<CloudProject | null> {
    const snap = await getDoc(doc(db, 'projects', projectId));
    return snap.exists() ? (snap.data() as CloudProject) : null;
}

export async function updateCloudProject(
    projectId: string,
    updates: Partial<CloudProject>
): Promise<void> {
    await updateDoc(doc(db, 'projects', projectId), {
        ...updates,
        lastModified: Date.now(),
    });
}

export async function deleteCloudProject(projectId: string): Promise<void> {
    // Delete subcollections first
    const transcripts = await getDocs(collection(db, 'projects', projectId, 'transcripts'));
    const codes = await getDocs(collection(db, 'projects', projectId, 'codes'));
    const userdata = await getDocs(collection(db, 'projects', projectId, 'userdata'));

    const batch = writeBatch(db);
    transcripts.docs.forEach((d) => batch.delete(d.ref));
    codes.docs.forEach((d) => batch.delete(d.ref));
    userdata.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'projects', projectId));
    await batch.commit();
}

// ─── Transcripts ───

export async function saveTranscript(
    projectId: string,
    transcript: CloudTranscript
): Promise<void> {
    await setDoc(
        doc(db, 'projects', projectId, 'transcripts', transcript.id),
        transcript
    );
}

export async function getTranscripts(projectId: string): Promise<CloudTranscript[]> {
    const snap = await getDocs(collection(db, 'projects', projectId, 'transcripts'));
    return snap.docs.map((d) => d.data() as CloudTranscript);
}

export async function deleteTranscript(
    projectId: string,
    transcriptId: string
): Promise<void> {
    await deleteDoc(doc(db, 'projects', projectId, 'transcripts', transcriptId));
}

export async function updateTranscript(
    projectId: string,
    transcriptId: string,
    updates: Partial<CloudTranscript>
): Promise<void> {
    await updateDoc(
        doc(db, 'projects', projectId, 'transcripts', transcriptId),
        updates
    );
}

// ─── Codes (Shared Codebook) ───

export async function saveCodes(projectId: string, codes: Code[]): Promise<void> {
    // Only save shared codes (master + suggested) to the shared collection
    // Personal codes are stored per-user in userdata
    const sharedCodes = codes.filter(c => c.type === 'master' || c.type === 'suggested');

    const batch = writeBatch(db);
    const codesRef = collection(db, 'projects', projectId, 'codes');

    // Fetch existing codes to diff
    const existing = await getDocs(codesRef);
    const existingIds = new Set(existing.docs.map(d => d.id));
    const newIds = new Set(sharedCodes.map(c => c.id));

    // Delete codes that no longer exist in the shared set
    existing.docs.forEach((d) => {
        if (!newIds.has(d.id)) {
            batch.delete(d.ref);
        }
    });

    // Create or update current shared codes
    sharedCodes.forEach((code) => {
        batch.set(
            doc(db, 'projects', projectId, 'codes', code.id),
            code,
            { merge: true }
        );
    });

    await batch.commit();
}

export async function getCodes(projectId: string): Promise<Code[]> {
    const snap = await getDocs(collection(db, 'projects', projectId, 'codes'));
    return snap.docs.map((d) => d.data() as Code);
}

export function subscribeToCodes(
    projectId: string,
    onCurrent: (codes: Code[]) => void
): () => void {
    const q = query(collection(db, 'projects', projectId, 'codes'));
    return onSnapshot(q, (snapshot) => {
        const codes = snapshot.docs.map((d) => d.data() as Code);
        onCurrent(codes);
    }, (error) => {
        console.error("Error subscribing to codes:", error);
    });
}

// ─── User Project Data (Per-user selections, memos) ───

export async function saveUserProjectData(
    projectId: string,
    userId: string,
    data: UserProjectData
): Promise<void> {
    await setDoc(
        doc(db, 'projects', projectId, 'userdata', userId),
        data,
        { merge: true }
    );
}

export async function getUserProjectData(
    projectId: string,
    userId: string
): Promise<UserProjectData> {
    console.log(`[firestoreService.getUserProjectData] Fetching data for user=${userId} in project=${projectId}`);
    try {
        const snap = await getDoc(doc(db, 'projects', projectId, 'userdata', userId));
        if (snap.exists()) {
            const data = snap.data() as UserProjectData;
            console.log(`[firestoreService.getUserProjectData] ✓ Found data: ${data.selections?.length || 0} selections, ${Object.keys(data.transcriptMemos || {}).length} transcript memos`);
            return data;
        }
        console.log(`[firestoreService.getUserProjectData] No userdata document found for user=${userId}, returning defaults`);
        return { selections: [], transcriptMemos: {}, personalMemo: '' };
    } catch (err) {
        console.error(`[firestoreService.getUserProjectData] ❌ Error fetching data for user=${userId}:`, err);
        throw err;
    }
}

export async function getAllCollaboratorData(
    projectId: string,
    excludeUserId?: string
): Promise<CollaboratorData[]> {
    console.log(`[firestoreService.getAllCollaboratorData] Fetching all collaborator data for project=${projectId}, excluding=${excludeUserId || 'none'}`);
    try {
        const snap = await getDocs(collection(db, 'projects', projectId, 'userdata'));
        const projectSnap = await getDoc(doc(db, 'projects', projectId));
        const project = projectSnap.data() as CloudProject;

        const result = snap.docs
            .filter((d) => d.id !== excludeUserId)
            .map((d) => {
                const data = d.data() as UserProjectData;
                const member = project.members[d.id];
                return {
                    userId: d.id,
                    displayName: member?.displayName || 'Unknown',
                    email: member?.email || '',
                    ...data,
                };
            });
        console.log(`[firestoreService.getAllCollaboratorData] ✓ Got ${result.length} collaborators with data`);
        return result;
    } catch (err) {
        console.error(`[firestoreService.getAllCollaboratorData] ❌ Error:`, err);
        throw err;
    }
}

// ─── Invitations ───

export async function createInvitation(
    projectId: string,
    projectName: string,
    invitedEmail: string,
    invitedBy: string,
    invitedByName: string
): Promise<string> {
    const invRef = doc(collection(db, 'invitations'));
    const invitation: Invitation = {
        id: invRef.id,
        projectId,
        projectName,
        invitedEmail: invitedEmail.toLowerCase(),
        invitedBy,
        invitedByName,
        status: 'pending',
        createdAt: Date.now(),
    };
    await setDoc(invRef, invitation);
    return invRef.id;
}

export async function getMyInvitations(email: string): Promise<Invitation[]> {
    const q = query(
        collection(db, 'invitations'),
        where('invitedEmail', '==', email.toLowerCase()),
        where('status', '==', 'pending')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Invitation);
}

export async function acceptInvitation(
    invitation: Invitation,
    userId: string,
    userEmail: string,
    userName: string
): Promise<void> {
    // Update invitation status
    await updateDoc(doc(db, 'invitations', invitation.id), { status: 'accepted' });

    // Add user to project members
    const projectRef = doc(db, 'projects', invitation.projectId);
    const member: ProjectMember = {
        userId,
        role: 'collaborator',
        email: userEmail,
        displayName: userName,
        joinedAt: Date.now(),
    };

    await updateDoc(projectRef, {
        [`members.${userId}`]: member,
        memberEmails: arrayUnion(userEmail.toLowerCase()),
        lastInviteAccepted: invitation.id // Security token for rules
    });

    // Initialize user's project data
    await setDoc(
        doc(db, 'projects', invitation.projectId, 'userdata', userId),
        { selections: [], transcriptMemos: {}, personalMemo: '' }
    );
}

export async function declineInvitation(invitationId: string): Promise<void> {
    await updateDoc(doc(db, 'invitations', invitationId), { status: 'declined' });
}

export async function removeProjectMember(
    projectId: string,
    userId: string,
    userEmail: string
): Promise<void> {
    const projectRef = doc(db, 'projects', projectId);

    // Remove from members map — we need to delete the field
    const projectSnap = await getDoc(projectRef);
    if (projectSnap.exists()) {
        const data = projectSnap.data() as CloudProject;
        const updatedMembers = { ...data.members };
        delete updatedMembers[userId];

        await updateDoc(projectRef, {
            members: updatedMembers,
            memberEmails: arrayRemove(userEmail.toLowerCase()),
        });
    }

    // Remove user data
    await deleteDoc(doc(db, 'projects', projectId, 'userdata', userId));
}

// ─── Real-time Listeners ───

export function listenToProject(
    projectId: string,
    callback: (project: CloudProject) => void
): Unsubscribe {
    return onSnapshot(doc(db, 'projects', projectId), (snap) => {
        if (snap.exists()) {
            callback(snap.data() as CloudProject);
        }
    });
}

export function listenToCodes(
    projectId: string,
    callback: (codes: Code[]) => void
): Unsubscribe {
    return onSnapshot(collection(db, 'projects', projectId, 'codes'), (snap) => {
        callback(snap.docs.map((d) => d.data() as Code));
    });
}

export function listenToTranscripts(
    projectId: string,
    callback: (transcripts: CloudTranscript[]) => void
): Unsubscribe {
    return onSnapshot(
        collection(db, 'projects', projectId, 'transcripts'),
        (snap) => {
            callback(snap.docs.map((d) => d.data() as CloudTranscript));
        }
    );
}
// ─── Sticky Notes ───

export async function addStickyNote(projectId: string, note: StickyNote): Promise<void> {
    console.log('[StickyNote] addStickyNote called', { projectId, noteId: note.id, note });
    const ref = doc(db, 'projects', projectId, 'notes', note.id);
    // Strip undefined fields to avoid any Firestore issues
    const cleanNote: Record<string, any> = {};
    for (const [key, value] of Object.entries(note)) {
        if (value !== undefined) {
            cleanNote[key] = value;
        }
    }
    try {
        await setDoc(ref, cleanNote);
        console.log('[StickyNote] addStickyNote SUCCESS', note.id);
    } catch (err) {
        console.error('[StickyNote] addStickyNote FAILED', note.id, err);
        throw err;
    }
}

export async function updateStickyNote(projectId: string, noteId: string, updates: Partial<StickyNote>): Promise<void> {
    console.log('[StickyNote] updateStickyNote called', { projectId, noteId, updates });
    const ref = doc(db, 'projects', projectId, 'notes', noteId);
    // Strip undefined fields
    const cleanUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
            cleanUpdates[key] = value;
        }
    }
    try {
        await setDoc(ref, cleanUpdates, { merge: true });
        console.log('[StickyNote] updateStickyNote SUCCESS', noteId);
    } catch (err) {
        console.error('[StickyNote] updateStickyNote FAILED', noteId, err);
        throw err;
    }
}

export async function deleteStickyNote(projectId: string, noteId: string): Promise<void> {
    await deleteDoc(doc(db, 'projects', projectId, 'notes', noteId));
}

export function subscribeToStickyNotes(projectId: string, callback: (notes: StickyNote[]) => void): Unsubscribe {
    console.log('[StickyNote] Subscribing to notes for project', projectId);
    const q = query(collection(db, 'projects', projectId, 'notes'));
    return onSnapshot(q, (snapshot) => {
        const notes = snapshot.docs.map(d => d.data() as StickyNote);
        console.log('[StickyNote] onSnapshot fired, notes count:', notes.length, 'fromCache:', snapshot.metadata.fromCache, 'hasPendingWrites:', snapshot.metadata.hasPendingWrites);
        if (notes.length > 0) {
            console.log('[StickyNote] Note IDs:', notes.map(n => n.id));
        }
        callback(notes);
    }, (error) => {
        console.error('[StickyNote] Subscription ERROR:', error);
    });
}

// ─── Chat System ───

// ─── Chat System ───

export async function sendChatMessage(projectId: string, message: ChatMessage): Promise<void> {
    const ref = doc(db, 'projects', projectId, 'chat', message.id);
    await setDoc(ref, message);
}

export async function updateChatMessage(projectId: string, messageId: string, updates: Partial<ChatMessage>, previousContent?: string): Promise<void> {
    const ref = doc(db, 'projects', projectId, 'chat', messageId);
    if (previousContent) {
        // Push to history
        await updateDoc(ref, {
            ...updates,
            editHistory: arrayUnion({ content: previousContent, timestamp: Date.now() })
        });
    } else {
        await updateDoc(ref, updates);
    }
}

export function subscribeToChatMessages(projectId: string, callback: (messages: ChatMessage[]) => void): Unsubscribe {
    const q = query(
        collection(db, 'projects', projectId, 'chat'),
        orderBy('timestamp', 'asc'),
        limit(100)
    );
    return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(d => d.data() as ChatMessage);
        callback(messages);
    }, (error) => {
        console.error("Error subscribing to chat messages:", error);
    });
}

/**
 * Deletes a chat message.
 * If userId is provided, it performs a "local delete" (hides it for that user).
 * If no userId is provided, it performs a "global delete" (unsend).
 */
export async function deleteChatMessage(projectId: string, messageId: string, userId?: string): Promise<void> {
    const ref = doc(db, 'projects', projectId, 'chat', messageId);
    if (userId) {
        // Local delete: Add user to deletedFor array
        await updateDoc(ref, {
            deletedFor: arrayUnion(userId)
        });
    } else {
        // Global delete (Unsend)
        await deleteDoc(ref);
    }
}

export async function clearChatHistory(projectId: string): Promise<void> {
    const q = query(collection(db, 'projects', projectId, 'chat'));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => {
        batch.delete(d.ref);
    });
    await batch.commit();
}

// ─── Direct Messages ───

export function getConversationKey(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join('_');
}

export async function sendDirectMessage(projectId: string, message: DirectMessage): Promise<void> {
    const ref = doc(db, 'projects', projectId, 'directMessages', message.id);
    await setDoc(ref, message);
}

export async function updateDirectMessage(projectId: string, messageId: string, updates: Partial<DirectMessage>, previousContent?: string): Promise<void> {
    const ref = doc(db, 'projects', projectId, 'directMessages', messageId);
    if (previousContent) {
        await updateDoc(ref, {
            ...updates,
            editHistory: arrayUnion({ content: previousContent, timestamp: Date.now() })
        });
    } else {
        await updateDoc(ref, updates);
    }
}

export async function deleteDirectMessage(projectId: string, messageId: string, userId?: string): Promise<void> {
    const ref = doc(db, 'projects', projectId, 'directMessages', messageId);
    if (userId) {
        await updateDoc(ref, {
            deletedFor: arrayUnion(userId)
        });
    } else {
        await deleteDoc(ref);
    }
}

export function subscribeToDirectMessages(
    projectId: string,
    conversationKey: string,
    callback: (messages: DirectMessage[]) => void
): Unsubscribe {
    const q = query(
        collection(db, 'projects', projectId, 'directMessages'),
        where('conversationKey', '==', conversationKey),
        orderBy('timestamp', 'asc'),
        limit(100)
    );
    return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(d => d.data() as DirectMessage);
        callback(messages);
    }, (error) => {
        console.error("Error subscribing to direct messages:", error);
    });
}

export function subscribeToAllDirectMessages(
    projectId: string,
    currentUserId: string,
    callback: (messages: DirectMessage[]) => void
): Unsubscribe {
    // Subscribe to all DMs where current user is either sender or receiver
    // We use conversationKey which contains the userId, so we listen to all DMs
    // and filter client-side (Firestore doesn't support OR on different fields easily)
    const q = query(
        collection(db, 'projects', projectId, 'directMessages'),
        orderBy('timestamp', 'desc'),
        limit(200)
    );
    return onSnapshot(q, (snapshot) => {
        const allMessages = snapshot.docs.map(d => d.data() as DirectMessage);
        // Filter to only messages involving this user
        const myMessages = allMessages.filter(m => m.fromId === currentUserId || m.toId === currentUserId);
        callback(myMessages);
    }, (error) => {
        console.error("Error subscribing to all direct messages:", error);
    });
}

export async function markDirectMessagesRead(
    projectId: string,
    conversationKey: string,
    currentUserId: string
): Promise<void> {
    const q = query(
        collection(db, 'projects', projectId, 'directMessages'),
        where('conversationKey', '==', conversationKey)
    );
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach(d => {
        const msg = d.data() as DirectMessage;
        // Check if message is not read and user is NOT the sender (usually you read your own messages implicitly, but standard param is 'readBy')
        if (!msg.readBy.includes(currentUserId) && msg.fromId !== currentUserId) {
            batch.update(d.ref, { readBy: arrayUnion(currentUserId) });
        }
    });
    await batch.commit();
}

// ─── Document Change Requests ───

export async function submitChangeRequest(projectId: string, request: TranscriptChangeRequest): Promise<void> {
    await setDoc(doc(db, 'projects', projectId, 'changeRequests', request.id), request);
}

export function subscribeToChangeRequests(projectId: string, callback: (requests: TranscriptChangeRequest[]) => void): Unsubscribe {
    const q = query(
        collection(db, 'projects', projectId, 'changeRequests'),
        orderBy('timestamp', 'desc'),
        limit(100)
    );
    return onSnapshot(q, (snapshot) => {
        const requests = snapshot.docs.map(d => d.data() as TranscriptChangeRequest);
        callback(requests);
    }, (error) => {
        console.error("Error subscribing to change requests:", error);
    });
}

export async function handleRequestAction(
    projectId: string,
    requestId: string,
    status: 'accepted' | 'rejected',
    transcriptId?: string,
    newContent?: string
): Promise<void> {
    const batch = writeBatch(db);
    const requestRef = doc(db, 'projects', projectId, 'changeRequests', requestId);
    batch.update(requestRef, { status });

    if (status === 'accepted' && transcriptId && newContent) {
        const transcriptRef = doc(db, 'projects', projectId, 'transcripts', transcriptId);
        batch.update(transcriptRef, { content: newContent });
    }
    await batch.commit();
}

// ─── Admin Management ───

export async function updateProjectMemberRole(projectId: string, userId: string, role: 'admin' | 'collaborator'): Promise<void> {
    const projectRef = doc(db, 'projects', projectId);
    await updateDoc(projectRef, {
        [`members.${userId}.role`]: role
    });
}

// ─── Code History ───

export async function logCodeHistory(projectId: string, entry: CodeHistoryEntry): Promise<void> {
    const ref = doc(db, 'projects', projectId, 'codeHistory', entry.id);
    await setDoc(ref, entry);
}

export async function getCodeHistory(projectId: string, codeId: string): Promise<CodeHistoryEntry[]> {
    const q = query(
        collection(db, 'projects', projectId, 'codeHistory'),
        where('codeId', '==', codeId),
        orderBy('timestamp', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as CodeHistoryEntry);
}

// ─── Codebook Change Proposals ───

export async function submitProposal(projectId: string, proposal: CodebookChangeProposal): Promise<void> {
    await setDoc(doc(db, 'projects', projectId, 'proposals', proposal.id), proposal);
}

export function subscribeToProposals(projectId: string, callback: (proposals: CodebookChangeProposal[]) => void): Unsubscribe {
    const q = query(
        collection(db, 'projects', projectId, 'proposals'),
        orderBy('timestamp', 'desc'),
        limit(200)
    );
    return onSnapshot(q, (snapshot) => {
        const proposals = snapshot.docs.map(d => d.data() as CodebookChangeProposal);
        callback(proposals);
    }, (error) => {
        console.error("Error subscribing to proposals:", error);
    });
}

export async function reviewProposal(
    projectId: string,
    proposalId: string,
    status: 'accepted' | 'rejected',
    reviewerId: string,
    reviewerName: string,
    rejectionReason?: string
): Promise<void> {
    const ref = doc(db, 'projects', projectId, 'proposals', proposalId);
    const updates: Record<string, any> = {
        status,
        reviewedBy: reviewerId,
        reviewedByName: reviewerName,
        reviewedAt: Date.now()
    };
    if (rejectionReason) updates.rejectionReason = rejectionReason;
    await updateDoc(ref, updates);
}

// ─── Notifications ───

export async function sendNotification(projectId: string, notification: AppNotification): Promise<void> {
    await setDoc(doc(db, 'projects', projectId, 'notifications', notification.id), notification);
}

export function subscribeToNotifications(
    projectId: string,
    currentUserId: string,
    callback: (notifications: AppNotification[]) => void
): Unsubscribe {
    const q = query(
        collection(db, 'projects', projectId, 'notifications'),
        orderBy('timestamp', 'desc'),
        limit(100)
    );
    return onSnapshot(q, (snapshot) => {
        const allNotifs = snapshot.docs.map(d => d.data() as AppNotification);
        // Filter: show if targetUserIds is empty (everyone) or includes current user
        const myNotifs = allNotifs.filter(n =>
            n.targetUserIds.length === 0 || n.targetUserIds.includes(currentUserId)
        );
        callback(myNotifs);
    }, (error) => {
        console.error("Error subscribing to notifications:", error);
    });
}

export async function markNotificationRead(projectId: string, notificationId: string, userId: string): Promise<void> {
    const ref = doc(db, 'projects', projectId, 'notifications', notificationId);
    await updateDoc(ref, { readBy: arrayUnion(userId) });
}

export async function respondToNotification(
    projectId: string,
    notificationId: string,
    userId: string,
    response: 'accepted' | 'rejected',
    rejectionReason?: string
): Promise<void> {
    const ref = doc(db, 'projects', projectId, 'notifications', notificationId);
    const updates: Record<string, any> = {
        [`responses.${userId}`]: response,
        readBy: arrayUnion(userId)
    };
    if (rejectionReason) updates.rejectionReason = rejectionReason;
    await updateDoc(ref, updates);
}

// ─── Document Snapshots (Version History) ───

export async function saveDocumentSnapshot(projectId: string, snapshot: DocumentSnapshot): Promise<void> {
    await setDoc(doc(db, 'projects', projectId, 'documentSnapshots', snapshot.id), snapshot);
}

export async function getDocumentSnapshots(projectId: string, transcriptId: string): Promise<DocumentSnapshot[]> {
    // Note: To avoid requiring a composite index (transcriptId + timestamp),
    // we query by equality first, then sort in memory. 
    // Snapshots per transcript are usually few enough (<100) for this to be efficient.
    const q = query(
        collection(db, 'projects', projectId, 'documentSnapshots'),
        where('transcriptId', '==', transcriptId)
    );
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => d.data() as DocumentSnapshot);
    // Sort descending by timestamp
    return docs.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
}

export async function getAllDocumentSnapshots(projectId: string): Promise<DocumentSnapshot[]> {
    const q = query(
        collection(db, 'projects', projectId, 'documentSnapshots'),
        orderBy('timestamp', 'desc'),
        limit(200)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as DocumentSnapshot);
}

// ─── Activity Log ───

export async function logVersionControlEvent(projectId: string, event: VersionControlEvent): Promise<void> {
    await setDoc(doc(db, 'projects', projectId, 'activityLog', event.id), event);
}

export async function getActivityLog(projectId: string, limitNum = 100): Promise<VersionControlEvent[]> {
    const q = query(
        collection(db, 'projects', projectId, 'activityLog'),
        orderBy('timestamp', 'desc'),
        limit(limitNum)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as VersionControlEvent);
}

export function subscribeToActivityLog(projectId: string, callback: (events: VersionControlEvent[]) => void): Unsubscribe {
    const q = query(
        collection(db, 'projects', projectId, 'activityLog'),
        orderBy('timestamp', 'desc'),
        limit(100)
    );
    return onSnapshot(q, (snapshot) => {
        const events = snapshot.docs.map(d => d.data() as VersionControlEvent);
        callback(events);
    }, (error) => {
        console.error("Error subscribing to activity log:", error);
    });
}

// ─── Enhanced Change Request (with rejection reason) ───

export async function handleChangeRequestWithFeedback(
    projectId: string,
    requestId: string,
    status: 'accepted' | 'rejected',
    transcriptId?: string,
    newContent?: string,
    rejectionReason?: string,
    reviewerId?: string,
    reviewerName?: string
): Promise<void> {
    const batch = writeBatch(db);
    const requestRef = doc(db, 'projects', projectId, 'changeRequests', requestId);
    const updates: Record<string, any> = { status };
    if (rejectionReason) updates.rejectionReason = rejectionReason;
    if (reviewerId) updates.reviewedBy = reviewerId;
    if (reviewerName) updates.reviewedByName = reviewerName;

    batch.update(requestRef, updates);

    if (status === 'accepted' && transcriptId && newContent) {
        const transcriptRef = doc(db, 'projects', projectId, 'transcripts', transcriptId);
        batch.update(transcriptRef, { content: newContent });
    }
    await batch.commit();
}
