---
name: 04d-version-migration
description: "Migrate a Java project to a new framework generation or language level with recorded build rounds and before/after runtime probes. Use to upgrade Spring Boot 3 to 4, move to a newer Java version, or produce a migration report."
argument-hint: "[\"Spring Boot 3 to 4\" | \"migrate to Java 21\"]"
---

# Version Migration

Canonical instructions, reference packs, schemas, and sandbox scripts are in `.github/skills/04d-version-migration/`.

Read `.github/skills/04d-version-migration/SKILL.md` and the reference pack it names before acting. A missing reference pack is a stop condition — never migrate a framework generation from memory. Record the baseline build and runtime probe before changing anything, change source only because a build round failed on it, and complete the before/after probe comparison before calling a migration successful.

All work happens in the sandbox copy under `.github/.pipeline-context/version-migration/<slug>/workspace/`. Applying the result to the real project is a separate step that runs only when a human explicitly asks for it.
