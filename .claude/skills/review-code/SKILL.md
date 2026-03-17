---
name: review-code
description: Review code changes for quality, patterns consistency, and potential issues
allowed-tools: Bash, Read, Grep, Glob
---

Review the current code changes in the Protokoll-App:

1. Run `git diff` to see unstaged changes and `git diff --cached` for staged changes
2. Check for:
   - TypeScript type safety issues
   - Consistent use of PING corporate design colors (ping-blue, ping-gold, etc. — never raw blue-*, never hex #004899 inline)
   - Correct German UI text (no English labels in the UI)
   - Mobile-friendly patterns (touch targets >= 44px, responsive layout)
   - Offline compatibility (no assumptions about network availability)
   - Consistent naming: `VerantwortlicherFirma*` (not `Verantwortlicher*` without Firma)
   - IndexedDB usage patterns consistent with existing `db.ts`
3. Report findings grouped by severity (error / warning / suggestion)

If $ARGUMENTS is provided, review only those specific files.
