---
name: 04b-fixer
description: "Generate and verify the smallest remediation diff for a human-Approved fix plan. Use to implement an Approved plan or create a verified patch artifact."
argument-hint: "[ISSUE-001]"
---

# Fixer

Canonical instructions, schemas, and isolated-worktree scripts are in `.github/skills/04b-fixer/`.

Read `.github/skills/04b-fixer/SKILL.md` before acting. Work only on plans whose Status is exactly `Approved`; never modify real application source or unapproved plan artifacts.

Generate every patch with `git diff` in a disposable worktree and validate it with `git apply --check` before writing a rationale, running the verifier, or publishing a rendered `.diff`. A patch that fails that check is malformed, not a failed fix.