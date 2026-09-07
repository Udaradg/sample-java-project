---
name: 08-spring-framework-upgrader
description: 'Inventories the Spring Boot and Spring Cloud versions across every Maven service, validates an explicitly approved compatibility target, runs a pinned OpenRewrite recipe in an isolated worktree, and verifies every service independently.'
argument-hint: 'Optional: inventory, validate, rewrite, or verify'
---

# Spring Framework Upgrader

This skill is the controlled upgrade path for the six Spring Boot services in this repository. It is deliberately separate from vulnerability remediation: a framework upgrade can change source code, configuration, public API behavior, runtime requirements, and the dependency graph at the same time.

## Required checkpoint

Edit `.github/spring-upgrade/upgrade-manifest.json` with an approved target Spring Boot version, matching Spring Cloud release train, Java version, pinned OpenRewrite recipe artifact/version, and exact recipe name. Empty target or recipe fields are intentional and cause validation to fail rather than allowing the agent to guess.

## Procedure

1. Run `node scripts/inventory.js` to write `.github/.pipeline-context/spring-upgrade/inventory.json` and `.md`.
2. Run `node scripts/validate-target.js`; it checks that the target is explicit, the current versions match the manifest, Java is supported, and the target is not a silent downgrade.
3. Run `node scripts/run-openrewrite.js --service <service>` only after validation. It creates a temporary Git worktree, executes the pinned recipe through that service's Maven wrapper, captures a service-specific diff, and removes the worktree.
4. Run `node scripts/verify-services.js --service <service>` to verify one service, or omit `--service` to verify every service independently.
5. Review API/configuration/dependency changes and approve the generated patch separately. A successful compile is not a merge decision.

The skill never edits the real working tree during rewrite or verification. The manifest and generated reports are the only repository-level control points; target selection remains a human approval decision.
