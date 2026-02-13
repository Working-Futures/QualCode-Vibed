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
  type?: 'master' | 'personal' | 'suggested';
  createdBy?: string;
  suggestedBy?: string; // ID of user who suggested it
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

export interface StickyNote {
  id: string;
  transcriptId?: string;
  content: string;
  authorId: string;
  authorName: string;
  color: string;
  x: number; // Percentage (0-100) or pixels
  y: number; // Percentage (0-100) or pixels
  timestamp: number;
  shared?: boolean; // If true, visible to all team members; default is private
}

export interface ChatMessage {
  id: string;
  projectId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  readBy: string[];
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
  };
  editedAt?: number;
  mentions?: string[]; // Array of mentioned user display names
}

export interface DirectMessage {
  id: string;
  projectId: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  content: string;
  timestamp: number;
  readBy: string[];
  /** Conversation key: sorted pair of user IDs joined by '_' */
  conversationKey: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  settings?: AppSettings;
  createdAt: number;
}

export interface TranscriptChangeRequest {
  id: string;
  projectId: string;
  transcriptId: string;
  transcriptName: string;
  userId: string;
  userName: string;
  content: string;
  originalContent: string;
  timestamp: number;
  status: 'pending' | 'accepted' | 'rejected';
}

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