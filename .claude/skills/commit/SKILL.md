---
name: commit
description: Stage and commit current changes with a descriptive message
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
---

Commit the current changes:

1. Run `git status` and `git diff` to understand what changed
2. Run `git log --oneline -5` to match existing commit message style
3. Stage relevant files (prefer specific files over `git add -A`)
4. Do NOT stage `.env`, credentials, or large binary files
5. Create a commit with a concise German or English message matching prior style
6. End the commit message with: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

If $ARGUMENTS is provided, use it as the commit message.
