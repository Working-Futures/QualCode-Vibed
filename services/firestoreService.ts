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
    const batch = writeBatch(db);
    const codesRef = collection(db, 'projects', projectId, 'codes');

    // Fetch existing codes to diff
    const existing = await getDocs(codesRef);
    const existingIds = new Set(existing.docs.map(d => d.id));
    const newIds = new Set(codes.map(c => c.id));

    // Delete codes that no longer exist
    existing.docs.forEach((d) => {
        if (!newIds.has(d.id)) {
            batch.delete(d.ref);
        }
    });

    // Create or update current codes
    codes.forEach((code) => {
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
    const snap = await getDoc(doc(db, 'projects', projectId, 'userdata', userId));
    if (snap.exists()) {
        return snap.data() as UserProjectData;
    }
    return { selections: [], transcriptMemos: {}, personalMemo: '' };
}

export async function getAllCollaboratorData(
    projectId: string,
    excludeUserId?: string
): Promise<CollaboratorData[]> {
    const snap = await getDocs(collection(db, 'projects', projectId, 'userdata'));
    const projectSnap = await getDoc(doc(db, 'projects', projectId));
    const project = projectSnap.data() as CloudProject;

    return snap.docs
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
