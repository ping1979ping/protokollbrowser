---
name: build
description: Build the Protokoll-App and check for TypeScript and build errors
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
---

Build the Protokoll-App:

1. Change to the app directory: `cd C:/daten/python/protokollbrowser/app`
2. Run `npm run build` (which runs `tsc -b && vite build`)
3. If there are TypeScript errors, analyze and fix them
4. If the build succeeds, report the output directory and bundle sizes
