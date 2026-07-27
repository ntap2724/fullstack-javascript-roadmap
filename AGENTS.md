# Repository instructions

## Product boundary

This repository is a self-study Fullstack JavaScript curriculum, not a learning-management system. Do not add accounts, cloud progress, an online IDE, remote execution, leaderboards, certificates, or an integrated AI tutor without an approved design change.

## Source of truth

Curriculum content and metadata live under `curriculum/`. Website pages and starter repositories are adapters or generated artifacts. Never maintain a second hand-edited curriculum copy.

## Required commands

Run the narrowest relevant test first, then `pnpm check`, then the relevant broader verifier, including `pnpm verify` when applicable. Never claim a command passed without recording its real exit result.

## Verification language

`implemented` means code was written. `verified` means the declared acceptance criteria were exercised and passed with evidence. Do not conflate them.

## Prohibited shortcuts

- Do not delete, skip, or weaken failing tests to obtain a green run
- Do not change acceptance criteria after implementation to fit the diff
- Do not convert validation errors into warnings without approval
- Do not hide failure with broad catch blocks or silent fallback
- Do not use `any` or unchecked assertions merely to silence TypeScript
- Do not edit generated artifacts by hand
- Do not publish from a dirty worktree
- Do not overwrite unrelated user changes

## Task boundary

Work only within the files and behavior allowed by the task contract. Stop and report a specification conflict rather than silently expanding scope.
