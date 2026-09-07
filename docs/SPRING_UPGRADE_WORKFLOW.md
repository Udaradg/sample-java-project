# Spring Framework Upgrade Workflow

This repository now includes a controlled upgrade harness at `.github/skills/08-spring-framework-upgrader/`.

## Required inputs

Before an upgrade, edit [.github/spring-upgrade/upgrade-manifest.json](../.github/spring-upgrade/upgrade-manifest.json) with:

- The target Spring Boot version
- The matching Spring Cloud release train
- The Java runtime version
- The pinned `rewrite-spring` artifact version
- The exact OpenRewrite recipe name

The harness intentionally refuses empty values. Spring Boot, Spring Cloud, and Java must be selected as a compatible release train, not independently guessed per service.

## Workflow

```powershell
cd .github/skills/08-spring-framework-upgrader
node scripts/inventory.js
node scripts/validate-target.js
node scripts/run-openrewrite.js --service employee-service
node scripts/verify-services.js --service employee-service
```

The rewrite and verification scripts use temporary Git worktrees. They do not modify the real checkout. Review the generated diff for API, configuration, security, persistence, and deployment behavior before applying it.

Use the same two commands for `department-service`, `report-service`, and the infrastructure services after the previous service has passed its gates. Reports are stored below `.github/.pipeline-context/spring-upgrade/<service>/`.

## What this automates

- Version and service inventory
- Target-release validation
- Pinned OpenRewrite execution
- Per-service Maven verification
- Machine-readable and Markdown reports

## What remains a human decision

- Selecting the target Boot/Cloud release pair
- Approving the OpenRewrite recipe
- Reviewing public API and runtime behavior changes
- Merging the resulting patch
