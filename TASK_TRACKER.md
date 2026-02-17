# QualCode Task Tracker

## 1. Sticky Notes Overhaul (Legacy - Completed)

### Scope / Privacy
- [x] Sticky notes are **personal** by default — only the author sees them
- [x] Toggle "Team Notes: ON/OFF" to view other people's notes
- [x] When viewing a collaborator's profile, their notes become visible
- [x] On-note privacy badge ("Private" / "Shared")

### Bug — Note Sticking / Drag
- [x] Fixed drag-and-drop: notes no longer follow the mouse infinitely
- [x] Drag uses document-level `mousemove`/`mouseup` for reliability
- [x] Note positions are **clamped** within the board bounds
- [x] Added explicit **Save** button on notes with unsaved changes
- [x] Auto-save on blur (when clicking away from a note)

### Placement
- [x] Notes display as a full-screen overlay (sticky board)
- [x] "Notes" button in header toggles the board
- [ ] Option to pin notes inline next to transcript lines — *future*

### Persistence
- [x] Notes are stored per-project in Firestore (`projects/{id}/stickyNotes`)
- [x] Notes are filtered by `activeTranscriptId` — each transcript has its own notes
- [x] Note color picker with 5 preset colors

---

## 2. Transcript & Coding UI

### Annotation Display
- [x] Annotations now appear as **comment bubbles** on the **right side** of the transcript line (opposite the code gutter on the left)
- [x] Each annotation bubble shows the code name (colored label) and the annotation text
- [x] Styled with subtle borders, shadows, and italic text

### Editing Flow
- [x] Inline line-by-line editing (Enter to split, Backspace to merge)
- [x] Find and Replace with fuzzy matching (Levenshtein distance)
- [x] Skip the initial "big text preview" and go straight to editable lines

### Fuzzy Matching
- [x] Levenshtein-based fuzzy matching for find-and-replace
- [x] Suggestions panel for mistranscription corrections
- [x] Threshold tuning for fuzzy match sensitivity (Slider added)

---

## 3. Collaboration & Communication

### Messaging System
- [x] Team chat with real-time updates via Firestore
- [x] Messages display sender name, timestamp, and alignment (own vs. others)
- [x] Auto-scroll to latest message
- [x] **Direct Messages (DM)**: Separate tab for private conversations
- [x] Unread DM notification badge on Team button

### @Mention
- [x] Type `@` in chat to trigger mention dropdown
- [x] Dropdown filters as you type the name
- [x] Clicking a name inserts `@Name` into the message
- [x] @mentions are **highlighted** in blue when rendered in messages
- [x] Mentioned names stored in message `mentions` field for future notification support

### Edit Messages
- [x] Own messages show **Edit** button on hover
- [x] Inline edit mode with Save/Cancel
- [x] Edited messages show "(edited)" indicator
- [x] Edits persist to Firestore via `updateChatMessage`

### Reply to Messages
- [x] Any message shows **Reply** button on hover
- [x] Reply preview bar appears above the chat input
- [x] Reply context (sender + content preview) displayed above the message bubble
- [x] Reply data stored in message `replyTo` field

### Collaboration Tab Fix
- [x] Expanded collaborator view now shows **code frequency** (color pills with count)
- [x] Shows **per-transcript breakdown** with selection counts and memo indicators
- [x] Replaced placeholder "Detailed stats view..." with real data
- [x] "View" button correctly loads collaborator data via `handleViewCollaborator`
- [x] **Message Button**: Added DM button next to "View" for each collaborator

---

## 4. Data & Management

### Analysis Bug (3 People Shown with 2 Members)
- [x] Fixed: Analysis now filters collaborator data against `cloudProject.members`
- [x] No more phantom 3rd user in comparison mode
- [x] "Me (Current)" entry uses latest local state, avoids duplication
- [x] `AnalysisView` now receives `cloudProject` prop for member validation

### Codebook Management ("Git-like" Code Types)
- [x] Three code types: `master`, `personal`, `suggested`
- [x] Visual indicators (icons + labels) for each type
- [x] Admin can promote `suggested` → `master`
- [x] Filter by code type in codebook view
- [x] Merge conflicts between personal and master codes (UI collision detection)
- [x] Code versioning / history (History Modal & Logging)

### Data Integrity
- [x] Auto-save to local storage every 5 seconds
- [x] Cloud sync on changes (debounced)
- [x] Undo/Redo with 30-state history
- [x] `viewingAsUser` mode prevents accidental overwrites
- [x] Offline queue for cloud saves during network issues
- [x] Conflict resolution for simultaneous edits (Basic UI warnings & Last-write-wins)

---

## Summary

| Category | Done | Remaining |
|----------|------|-----------|
| Sticky Notes | 14 | 0 |
| Transcript & Coding UI | 8 | 0 |
| Collaboration & Communication | 21 | 0 |
| Data & Management | 13 | 0 |
| **Total** | **56** | **0** |

> All Phase 1, 2, & 3 tasks are complete, including future enhancements (offline support, conflict resolution, code versioning).

---

## **Phase 3: Refinement & Bug Fixes (Current Sprint)**

### 🚨 Critical Bugs
- [x] **Sticky Notes**: Fixed dragging logic (notes follow mouse, can't place/save).
- [x] **Chat**: Messages disappear or don't show.
- [x] **Collaborator View**: When viewing another user, Editor is strictly **Read-Only**.
- [x] **Editor Layout**: Fixed fuzzy search and edit mode interactions.

### 🛠️ Codebook & Workflow
- [x] **Codebook Tabs**: Remove "All" tab; organize into Master, Personal, Suggested.
- [x] **Suggested Codes**: Implement logic for suggesting merges/removals and version control-like comparison.
- [x] **Codebook Filter**: Editor dropdown to choose visible codes (Master vs Personal).

### 🛡️ Admin & Permissions (New)
- [x] **Role-Based Editing**: Admins edit directly; Collaborators submit **Change Requests**.
- [x] **Change Request Workflow**: System to Submit, View (Admin only), Accept, or Reject transcript edits.
- [x] **Admin Promotion**: Admins can promote other members to Admin role via Collaboration Panel.
- [x] **Member Management Permissions**: Enforced strict rules for Invite (Admin only), Remove Member (Admin/Owner), and Remove Admin (Owner only).
- [x] **Fuzzy Search**: Fixed logic to find *all* fuzzy matches and allow bulk replacement.

### 📊 Analysis Enhancements
- [x] **Comparison View**: Show distribution graphs for each user.
- [x] **Tooltips**: Hovering over columns should show exact counts.
- [x] **Unsupported Views**: Add "Matrix View not fully optimized" and "View not supported" messages in comparison mode.
- [x] **Co-occurrence Matrix**: Implemented heatmap visualization for code overlaps.

---

## **Phase 4: View Functionality & Audit Logging (Current Sprint)**

### 🔍 View Collaborator Work
- [x] **Audit Logging**: Added structured `console.log` logging to all critical paths: `openCloudProject`, `handleViewCollaborator`, `handleExitViewMode`, `handleSaveProject`, `handleCloseProject`, `getUserProjectData`, `getAllCollaboratorData`, `loadCollaboratorData`.
- [x] **Fix View Highlights**: When viewing a collaborator's work, transcripts now show **their** highlight/coding markup (not the current user's stale highlights). Clean content is fetched from Firestore and highlights are rebuilt from the viewed user's selections.
- [x] **Fix Exit View Restore**: Exiting view mode now correctly restores the current user's own highlights by fetching clean content and re-applying their selections.
- [x] **View Memos**: Ensure collaborator's transcript memos and project memo are visible in view mode.
- [x] **View Sticky Notes**: Show the collaborator's shared sticky notes when in view mode.
- [x] **View Analytics**: Analytics view should reflect the viewed collaborator's data when in view mode.

---

## **Phase 5: Version Control System (Complete)**

### 📋 Data Structures & Types
- [x] **CodebookChangeProposal**: Type for codebook change proposals (add, edit, delete, merge, split)
- [x] **AppNotification**: Type for real-time notifications with read/response tracking
- [x] **DocumentSnapshot**: Type for document version snapshots
- [x] **VersionControlEvent**: Type for activity log entries

### 🔧 Firestore Services
- [x] **Proposal System**: `submitProposal`, `subscribeToProposals`, `reviewProposal` functions
- [x] **Notification System**: `sendNotification`, `subscribeToNotifications`, `markNotificationRead`, `respondToNotification`
- [x] **Document Snapshots**: `saveDocumentSnapshot`, `getDocumentSnapshots`, `getAllDocumentSnapshots`
- [x] **Activity Log**: `logVersionControlEvent`, `getActivityLog`, `subscribeToActivityLog`
- [x] **Enhanced Change Requests**: `handleChangeRequestWithFeedback` with rejection reasons

### 🖥️ Version Control Panel (Admin Dashboard)
- [x] **Notifications Tab**: View/respond to notifications with read/unread tracking
- [x] **Proposals Tab**: Review, accept, or reject codebook change proposals
- [x] **Document Requests Tab**: Review transcript edit requests with accept/reject + reasons
- [x] **Activity Log Tab**: Chronological history of all version control events
- [x] **Document Version History Modal**: View and restore previous document snapshots

### 🔗 App Integration
- [x] **VC Button in Header**: GitPullRequest icon with unread notification badge
- [x] **Real-time Notification Subscription**: Live notification updates via Firestore
- [x] **Proposal Application Logic**: Handles add/edit/delete/merge proposals on the master codebook
- [x] **Document Snapshot on Admin Edit**: Auto-saves old content before admin edits
- [x] **Non-Admin Proposal UI in Codebook**: Members can suggest changes to master codes
- [x] **Notification on Change Requests**: Admins notified when non-admins submit edit requests
- [x] **Code Creation Logging**: All code creations logged to history & activity

---

## 6. Sticky Notes 2.0 (Remake) - New Plan (Completed)

### 🏗️ Data & Core Components
- [x] **Schema Update**: Update `StickyNote` interface to include `codebookType` ('master' | 'personal') to link notes to specific codebook versions.
- [x] **Refactor Component**: Create `TranscriptNoteLayer.tsx` to replace `StickyNoteBoard`.
    - Must be positoned absolute *inside* the Editor's scroll container (not fixed to viewport).
    - Must accept parent dimensions to clamp/position notes correctly relative to document content.
- [x] **Z-Index Layering**:
    - **Layer 1**: Transcript Text/Background
    - **Layer 10**: Sticky Notes (Interactive, `pointer-events: auto`)
    - **Layer 50**: Sidebars/Header/Modals

### 🎨 Rendering & Interaction
- [x] **Note Placement**:
    - Notes scroll with the page (are attached to the document coordinates).
    - Can be placed on the "paper" or in the grey background area.
    - Clamped to the scrollable area bounds.
- [x] **Creation UX**:
    - **Remove** double-click creation handler from Editor.
    - Add specific "Add Sticky Note" button (floating action button or toolbar icon).
    - Default new note position: Center of current visible scroll area.
- [x] **Context Awareness**:
    - **Codebook Filter**: Notes obey the Master/Personal toggle in the Editor. Switching to Master hides Personal notes (unless shared/promoted - TBD) and shows Master notes.
    - **Team View**: "Show Team Notes" toggle works seamlessly with the new layer.

### 🧹 Cleanup
- [x] **Remove Legacy Overlay**: Delete/Deprecate the old fixed-position `StickyNoteBoard` overlay mode.
- [x] **Verify Persistence**: Ensure auto-save, resize, and drag-save continue to work with the new coordinate system.

---

## 7. Sticky Notes 3.0 (Refinement) - Current Request

### 🛠️ Functionality & UX
- [x] **Resizing**: Notes are resizable (added resize handle and logic).
- [x] **Placement**: Can be placed on the page or in the grey background (unbounded dragging).
- [x] **Movement**: Draggable by mouse, stays relative to page (not fixed to window).
- [x] **Persistence**: Auto-save on edit/drag/resize.
- [x] **Interaction**: Double-click creation disabled.
    - [x] **ReadOnly**: Notes authored by others are not draggable or resizable.
- [x] **Visibility**: Only visible in Editor tab (component scoped).
- [x] **View Mode**: Ensure visibility when viewing collaborators (dependent on parent prop `showTeamNotes`).

### 🎨 Visuals
- [x] **Layering**: Correct z-index (10/20) to sit above page but below headers.
- [x] **Styling**: Added grip/lock icons and cleaner look.
