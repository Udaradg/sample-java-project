---
name: 04c-dependency-upgrader
description: "Generate and verify a dependency version-bump diff for a human-Approved CWE-1104 fix plan. Use to implement an approved outdated-dependency fix or bump a vulnerable library version."
argument-hint: "[ISSUE-004]"
---

# Dependency Upgrader

Canonical instructions, schemas, and isolated-worktree scripts are in `.github/skills/04c-dependency-upgrader/`.

Read `.github/skills/04c-dependency-upgrader/SKILL.md` before acting. Work only on plans whose Status is exactly `Approved` and whose CWE is exactly `CWE-1104`; every other CWE belongs to `04b-fixer`. Verify both the declared version and the `mvn dependency:tree`-resolved version meet the plan's target, and never modify real application source or unapproved plan artifacts.

Generate every patch with `git diff` in a disposable worktree and validate it with `git apply --check` before writing a rationale, running the verifier, or publishing a rendered `.diff`. A patch that fails that check is malformed, not a failed fix.
