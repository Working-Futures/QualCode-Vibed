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
  reason?: string; // Reason for suggestion (if type is suggested)
  status?: 'draft' | 'proposed'; // Draft = private to user, Proposed = shared with admins
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
  personalCodes?: Code[];
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
  width?: number; // Pixels
  height?: number; // Pixels
  timestamp: number;
  shared?: boolean; // If true, visible to all team members; default is private
  codebookType?: 'master' | 'personal'; // Which codebook view this note belongs to
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
  editHistory?: { content: string; timestamp: number }[];
  mentions?: string[]; // Array of mentioned user display names
  deletedFor?: string[]; // Array of user IDs who have deleted this message (local delete)
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
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
  };
  editedAt?: number;
  editHistory?: { content: string; timestamp: number }[];
  /** Conversation key: sorted pair of user IDs joined by '_' */
  conversationKey: string;
  deletedFor?: string[]; // Array of user IDs
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
  changeType: 'edit' | 'delete' | 'rename'; // Added type
  content?: string; // Content is optional now (not needed for delete)
  newName?: string; // For rename
  originalContent?: string; // Original content before edit
  timestamp: number;
  status: 'pending' | 'accepted' | 'rejected';
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
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

// ─── Version Control: Codebook Change Proposals ───

export type ProposalAction = 'add' | 'edit' | 'delete' | 'merge' | 'split';

export interface CodebookChangeProposal {
  id: string;
  projectId: string;
  proposerId: string;
  proposerName: string;
  action: ProposalAction;
  timestamp: number;
  status: 'pending' | 'accepted' | 'rejected';
  reason: string; // Why this change is proposed
  rejectionReason?: string; // Feedback from admin on rejection
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  // For 'add': the new code to be added
  newCode?: Partial<Code>;
  // For 'edit': which code and what changes
  targetCodeId?: string;
  targetCodeName?: string;
  previousData?: Partial<Code>;
  proposedData?: Partial<Code>;
  // For 'delete': which code to delete
  deleteCodeId?: string;
  deleteCodeName?: string;
  // For 'merge': source => target
  mergeSourceId?: string;
  mergeSourceName?: string;
  mergeTargetId?: string;
  mergeTargetName?: string;
  // For 'split': source code => two new codes
  splitSourceId?: string;
  splitSourceName?: string;
  splitNewCodes?: Partial<Code>[];
}

// ─── Version Control: Notifications ───

export type NotificationType =
  | 'document_change'       // A document was changed globally
  | 'codebook_change'       // A master codebook code was changed/added/removed
  | 'proposal_submitted'    // Someone submitted a proposal
  | 'proposal_accepted'     // Your proposal was accepted
  | 'proposal_rejected'     // Your proposal was rejected
  | 'change_request_submitted' // Non-admin submitted a document change
  | 'change_request_accepted'  // Admin accepted your change request
  | 'change_request_rejected'; // Admin rejected your change request

export interface AppNotification {
  id: string;
  projectId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  // Who triggered the notification
  fromUserId: string;
  fromUserName: string;
  // Who should see it (empty = everyone)
  targetUserIds: string[];
  // Link to related entity
  relatedEntityId?: string;
  relatedEntityType?: 'proposal' | 'changeRequest' | 'code' | 'transcript';
  // Status tracking
  readBy: string[];
  // User response (for accept/reject notifications sent to everyone)
  responses?: Record<string, 'accepted' | 'rejected'>;
  rejectionReason?: string;
}

// ─── Version Control: Document Snapshots ───

export interface DocumentSnapshot {
  id: string;
  projectId: string;
  transcriptId: string;
  transcriptName: string;
  content?: string; // Optional if storing diff
  diff?: string;    // Patch text
  isFullSnapshot?: boolean; // explicit flag
  baseSnapshotId?: string; // ID of the snapshot this diff applies to
  savedBy: string;
  savedByName: string;
  timestamp: number;
  description?: string; // e.g. "Before major edit by Admin"
  version: number;
}

// ─── Version Control: Activity Log ───

export interface VersionControlEvent {
  id: string;
  projectId: string;
  eventType: 'document_edit' | 'code_create' | 'code_edit' | 'code_delete' | 'code_merge' | 'code_split' | 'proposal' | 'change_request' | 'member_promoted' | 'codebook_import';
  userId: string;
  userName: string;
  timestamp: number;
  description: string;
  metadata?: Record<string, any>;
}