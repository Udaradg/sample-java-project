---
name: graph-forge
description: 'Loads Code Cartographer artifacts.json into a Neo4j graph database, modeling Modules, Packages, Types, Methods, Endpoints and Maven dependencies with relationships (CONTAINS, EXTENDS, IMPLEMENTS, DEPENDS_ON, EXPOSES, USES, HAS_METHOD). Use when asked to build/update a knowledge graph, load the code graph into Neo4j, or visualize/query code connections in Neo4j.'
argument-hint: 'None — reads .architect/artifacts.json and connection details from .env'
---

# Graph Forge

Turns the static `artifacts.json` produced by [code-cartographer](../code-cartographer/SKILL.md) into a connected graph in Neo4j, so architecture questions can be answered with Cypher instead of re-reading source files.

## When to Use
- The user asks to "build a graph", "load the code into Neo4j", "map connections/dependencies", or "visualize the architecture"
- Requires `.architect/artifacts.json` to already exist — run Code Cartographer's scan first if it's missing or stale

## Graph Model
| Node | Key property | Notes |
|---|---|---|
| `Module` | `name` | One per Maven module (service) |
| `Package` | `name` | Java package |
| `Type` | `id` (FQN) | class/interface/enum/record |
| `Method` | `id` (`TypeId#name(paramTypes)`) | Disambiguates overloads |
| `Endpoint` | `id` (`METHOD path`) | Derived from `@GetMapping`/`@PostMapping`/etc. + class-level `@RequestMapping` base path |
| `MavenDependency` | `ga` (`groupId:artifactId`) | Third-party libraries |
| `ExternalType` | `name` | Base class/interface not defined in this repo (e.g. `MongoRepository`) |

| Relationship | Meaning |
|---|---|
| `Module -[:CONTAINS]-> Package/Type` | Structural containment |
| `Package -[:CONTAINS]-> Type` | Structural containment |
| `Module -[:DEPENDS_ON]-> MavenDependency` | pom.xml dependency |
| `Type -[:EXTENDS]-> Type/ExternalType` | Class superclass or interface extension |
| `Type -[:IMPLEMENTS]-> Type/ExternalType` | Class implementing an interface |
| `Type -[:HAS_METHOD]-> Method` | Method ownership |
| `Type -[:EXPOSES]-> Endpoint` | REST endpoint exposed by a controller |
| `Type -[:USES]-> Type` | Best-effort: a field's type references another known type (dependency signal) |

## Procedure
1. Ensure `.architect/artifacts.json` exists (run Code Cartographer first).
2. Set up connection details once: copy [.env.example](./.env.example) to `.env` in this folder and fill in your Neo4j instance (`NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`). Never commit the real `.env` — it's already gitignored.
3. Install dependencies: `cd .github/skills/graph-forge && npm install`
4. Run: `npm run graph` (or `node scripts/build-graph.js`)
5. The script creates uniqueness constraints and `MERGE`s nodes/relationships, so re-running after a fresh scan updates the graph instead of duplicating it.

See [build-graph.js](./scripts/build-graph.js) for implementation details.

## Useful follow-up Cypher
```cypher
// Which types does a service expose over REST?
MATCH (m:Module {name: 'employee-service'})-[:CONTAINS]->(t:Type)-[:EXPOSES]->(e:Endpoint)
RETURN t.name, e.method, e.path;

// Fan-in: most-depended-upon types
MATCH (t:Type)<-[:USES]-(other)
RETURN t.name, count(other) AS dependents ORDER BY dependents DESC;
```

## Notes
- Self-contained folder (own `package.json`, own `.env`) — can be moved independently
- Credentials live only in the local `.env`; never print the password back to the user or into generated docs
