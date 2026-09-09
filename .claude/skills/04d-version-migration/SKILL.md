---
name: 04d-version-migration
description: "Migrate a Java project to a new framework generation or language level, from a verified-green starting point through to the project itself running on the new version. Use to upgrade Spring Boot 3 to 4, move to a newer Java version, or produce a migration report."
argument-hint: "[\"Spring Boot 3 to 4\" | \"migrate to Java 21\"]"
---

# Version Migration

Canonical instructions, reference packs, schemas, and sandbox scripts are in `.github/skills/04d-version-migration/`.

Read `.github/skills/04d-version-migration/SKILL.md` and the reference pack it names before acting. A missing reference pack is a stop condition — never migrate a framework generation from memory.

Two gates bound the run, and both are enforced by the scripts:

- **It starts from green.** Round 0 — build with the tests, plus the baseline runtime probe — must pass on the JDK the project uses today, before any version is changed. A red round 0 ends the run: the project is made green first, as its own change. Never get past this by lowering the build goal, disabling a test, or trimming the probe list.
- **It ends in the project.** Rounds happen in the sandbox copy under `.github/.pipeline-context/version-migration/<slug>/workspace/`, and the final step (`apply-migration.js --to-project`) writes that result into the project and builds it there. A green sandbox with the project still on the old version is an unfinished migration. The write is backed up and `--revert` undoes it.

Change source only because a build round failed on it, complete the before/after probe comparison, apply, then re-render so the report records what actually landed in the project.
