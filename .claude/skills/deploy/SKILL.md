---
name: deploy
description: Build and deploy the Protokoll-App to GitHub Pages
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
---

Build and deploy the Protokoll-App to GitHub Pages:

1. Change to app directory: `cd C:/daten/python/protokollbrowser/app`
2. Run `npm run build` — abort if build fails
3. Change to repo root: `cd C:/daten/python/protokollbrowser`
4. Stage all changes: `git add -A`
5. Commit with message: "build: deploy update"
6. Push to remote: `git push`
7. Check GitHub Pages deployment status: `gh run list --limit 1`
8. Report the deployment URL: https://petterc.github.io/protokollbrowser/

If $ARGUMENTS contains "skip-commit", only build without committing or pushing.
