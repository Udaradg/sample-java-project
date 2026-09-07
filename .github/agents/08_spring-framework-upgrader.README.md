# Spring Framework Upgrader Agent

The `08_spring-framework-upgrader` agent handles coordinated Spring Boot and Spring Cloud framework upgrades. It is separate from the vulnerability-remediation agents `01` through `07` because a framework migration can change dependencies, source code, configuration, tests, public APIs, and runtime requirements even when no vulnerability is being fixed.

## What It Does

The agent processes one Maven service at a time:

```text
Inventory
  -> Validate target
  -> Run OpenRewrite in a temporary worktree
  -> Capture the generated patch
  -> Apply the patch in another temporary worktree
  -> Run Maven verification
  -> Write deterministic reports
```

The real working tree is not modified by OpenRewrite or verification.

## Configuration

Edit [upgrade-manifest.json](../spring-upgrade/upgrade-manifest.json) before running a migration. It contains:

- Current Spring Boot, Spring Cloud, and Java versions
- Approved target versions
- OpenRewrite Maven plugin version
- OpenRewrite recipe artifact and version
- Exact OpenRewrite recipe name
- Services in the current upgrade scope

The agent refuses to run when target or recipe fields are empty.

The Spring Boot and Spring Cloud versions must be a compatible release train. Do not select them independently.

## Commands

From the repository root:

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
$env:Path = "$env:JAVA_HOME\bin;C:\Program Files\nodejs;C:\Program Files\Git\cmd;$env:Path"

cd .github/skills/08-spring-framework-upgrader
node scripts/inventory.js
node scripts/validate-target.js
node scripts/run-openrewrite.js --service employee-service
node scripts/verify-services.js --service employee-service
```

Use the same `--service` argument for another service. Omitting it from `verify-services.js` verifies all configured services; keep it set when doing a staged migration.

## Output

Service-specific reports are written below:

```text
.github/.pipeline-context/spring-upgrade/<service>/
```

Important outputs include:

- `openrewrite-result.json`
- `openrewrite.patch.diff`
- `verification.json`
- `verification.md`

The patch is a review artifact. It is not automatically applied to the real checkout or merged.

## Verification Rules

A successful OpenRewrite run means only that the recipe completed and produced a patch. It does not mean the service is compatible or ready to ship.

The verification gate must:

- Apply the generated patch in an isolated worktree
- Run that service's Maven Wrapper
- Record the raw exit status and logs
- Preserve failures without interpretation
- Remove the temporary worktree

Tests that need MongoDB, Config Server, Eureka, or other external services may fail unless those dependencies are available. Such failures remain failures and must be investigated or explicitly handled by a later test-environment change.

## Important Limitation

Some OpenRewrite Spring recipes upgrade to the latest version in their release line instead of honoring an exact patch version from the manifest. The generated patch must therefore be checked after the rewrite to confirm that the resolved Spring Boot and Spring Cloud versions match the approved target. A future hard gate should fail when they differ.

## Relationship To Vulnerability Agents

This agent does not replace the vulnerability workflow:

```text
01-07 vulnerability remediation
    issue -> root cause -> blast radius -> fix -> tests -> ship decision

08 framework upgrade
    compatibility target -> OpenRewrite migration -> per-service verification
```

The Architect, behavior checks, QA/build gates, and final audit concepts can be reused or adapted, but a framework upgrade should not be forced through a CWE-based remediation plan.

## Preconditions

- Node.js LTS is installed
- Java 17 is available and `JAVA_HOME` is configured
- Each service has a working Maven Wrapper
- Git is available on `PATH` or supplied in the terminal environment
- The target Spring Boot and Spring Cloud release pair is approved
- The OpenRewrite recipe is pinned and accessible from the configured Maven repositories
