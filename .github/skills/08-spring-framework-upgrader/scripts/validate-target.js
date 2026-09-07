#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT, DATA_DIR, readManifest, ensureDataDir, compareVersions,
} = require('./lib/common');

const manifest = readManifest();
const errors = [];
const target = manifest.target || {};
const rewrite = manifest.openRewrite || {};

for (const [name, value] of Object.entries({
  'target.springBoot': target.springBoot,
  'target.springCloud': target.springCloud,
  'target.java': target.java,
  'openRewrite.recipeArtifact': rewrite.recipeArtifact,
  'openRewrite.recipeVersion': rewrite.recipeVersion,
  'openRewrite.recipe': rewrite.recipe,
})) {
  if (!value) errors.push(`${name} must be explicitly set in upgrade-manifest.json`);
}

if (target.java && Number.parseInt(target.java, 10) < 17) {
  errors.push('target.java must be 17 or newer for supported Spring Boot upgrade paths');
}
if (target.springBoot && manifest.current.springBoot && compareVersions(target.springBoot, manifest.current.springBoot) < 0) {
  errors.push(`target.springBoot ${target.springBoot} is older than current ${manifest.current.springBoot}`);
}
if (target.springCloud && manifest.current.springCloud && compareVersions(target.springCloud, manifest.current.springCloud) < 0) {
  errors.push(`target.springCloud ${target.springCloud} is older than current ${manifest.current.springCloud}`);
}
if (rewrite.pluginVersion && !/^\d+\.\d+\.\d+$/.test(rewrite.pluginVersion)) {
  errors.push('openRewrite.pluginVersion must be a pinned semantic version');
}

ensureDataDir();
const result = { valid: errors.length === 0, checkedAt: new Date().toISOString(), errors, target };
fs.writeFileSync(path.join(DATA_DIR, 'target-validation.json'), `${JSON.stringify(result, null, 2)}\n`);
if (errors.length) {
  console.error(`Upgrade target rejected with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Upgrade target accepted: Spring Boot ${target.springBoot}, Spring Cloud ${target.springCloud}, Java ${target.java}`);
}
