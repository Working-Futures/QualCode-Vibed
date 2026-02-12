export interface Code {
  id: string;
  name: string;
  color: string;
  parentId?: string;
  description?: string;
  inclusionCriteria?: string;
  exclusionCriteria?: string;
  examples?: string;
  memo?: string;  // Code-level analytical memo
}

export interface Selection {
  id: string;
  codeId: string;
  transcriptId: string;
  text: string;
  startIndex: number;
  endIndex: number;
  timestamp: number;
  annotation?: string;  // Selection-level annotation/note
}

export interface Transcript {
  id: string;
  name: string;
  content: string;
  dateAdded: number;
  memo?: string;
}

// ─── Local Project (backward-compatible) ───
export interface Project {
  id: string;
  name: string;
  created: number;
  lastModified: number;
  codes: Code[];
  transcripts: Transcript[];
  selections: Selection[];
  projectMemo?: string;
  // Cloud linking
  isCloud?: boolean;
  cloudProjectId?: string;
}

export type AppTheme = 'default' | 'hobbit' | 'dark' | 'bluedark' | 'corporate';

export interface AppSettings {
  fontFamily: 'sans' | 'serif' | 'mono' | 'dyslexic';
  fontSize: number;
  lineHeight: number;
  zebraStriping: boolean;
  charSpacing: number;
  theme: AppTheme;
  sidebarWidth?: number;
}

// ─── Cloud / Collaboration Types ───

export interface ProjectMember {
  userId: string;
  role: 'admin' | 'collaborator';
  email: string;
  displayName: string;
  joinedAt: number;
}

export interface CloudProject {
  id: string;          // Firestore document ID
  name: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  created: number;
  lastModified: number;
  projectMemo: string;
  members: Record<string, ProjectMember>;
  memberEmails: string[];  // For Firestore query / security rules
}

export interface CloudTranscript {
  id: string;
  name: string;
  content: string;
  dateAdded: number;
  uploadedBy: string;
}

export interface UserProjectData {
  selections: Selection[];
  transcriptMemos: Record<string, string>;
  personalMemo: string;
}

export interface CollaboratorData {
  userId: string;
  displayName: string;
  email: string;
  selections: Selection[];
  transcriptMemos: Record<string, string>;
  personalMemo: string;
}

export interface Invitation {
  id: string;
  projectId: string;
  projectName: string;
  invitedEmail: string;
  invitedBy: string;
  invitedByName: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  settings?: AppSettings;
  createdAt: number;
}