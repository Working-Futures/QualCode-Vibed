# 🤝 Collaboration Guide for QualCode Vibed

## 1. Team Setup
*   **Inviting Members**: Admins can invite team members via email using the **Collaboration Panel** (Sidebar > Users Icon).
*   **Roles**:
    *   **Admin**: Can invite/remove members and edit project metadata.
    *   **Collaborator**: Can code transcripts, create codes, and view others' work.

## 2. How Saving Works 💾
*   **Auto-Save**: The app automatically saves your work to the cloud **every 5 seconds**.
*   **Status Indicators**: Look at the badge in the top-right corner:
    *   **Saved**: All changes are synced.
    *   **Saving...**: Sync in progress.
    *   **Error**: Something went wrong (check your connection).
*   **Exiting**: When you close the tab, the app attempts one final save. To be safe, wait for the "Saved" badge before closing.
*   **⚠️ IMPORTANT**: Ensure you enter the project via the **Cloud Projects** tab. If you open a "Recent File", it is a local copy and will NOT sync.

## 3. The Coding Workflow ⚡
QualCode Vibed uses an **"Individual-First"** collaboration model to ensure reliability:

1.  **Shared Codebook**: The list of Codes (names, colors, definitions) is shared live. If a team member adds a code, refresh your page to see it.
2.  **Individual Coding**:
    *   When you highlight text, that coding is **yours**.
    *   Your teammates will *not* see your highlights on their screen immediately (this prevents bias).
    *   You will *not* see their highlights on your screen.
3.  **Review & Compare**:
    *   Open the **Collaboration Panel**.
    *   Click on a team member to see their statistics, memos, and a list of their coded segments.
    *   Use this to discuss discrepancies or merge ideas manually.

## 4. Memos 📝
*   **Project Memo**: Shared with the team.
*   **Code Memos**: Shared definitions (in Codebook).
*   **Transcript Memos**: Private/Individual notes (viewable by others in Collab Panel).
*   **Personal/Research Memo**: private analysis notes.

## 5. Deployment 🚀
*   **Update Site**: Run `npm run build && npm run deploy`.
*   **Hosting**: GitHub Pages (Branch: `gh-pages`).
