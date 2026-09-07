#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  REPO_ROOT, DATA_DIR, SERVICES, readManifest, ensureDataDir, extractTag,
} = require('./lib/common');

const manifest = readManifest();
ensureDataDir();
const services = SERVICES.map((service) => {
  const pomFile = path.join(REPO_ROOT, service, 'pom.xml');
  const pom = fs.readFileSync(pomFile, 'utf8');
  return {
    service,
    pom: `${service}/pom.xml`,
    springBoot: extractTag(pom, 'version'),
    springCloud: extractTag(pom, 'spring-cloud.version'),
    java: extractTag(pom, 'java.version'),
    packaging: extractTag(pom, 'packaging') || 'jar',
    hasWrapper: fs.existsSync(path.join(REPO_ROOT, service, 'mvnw.cmd')),
    hasTests: fs.existsSync(path.join(REPO_ROOT, service, 'src', 'test')),
  };
});

const inventory = {
  generatedAt: new Date().toISOString(),
  manifest: manifest.current,
  services,
};
fs.writeFileSync(path.join(DATA_DIR, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
const lines = [
  '# Spring Upgrade Inventory',
  '',
  `Generated: ${inventory.generatedAt}`,
  '',
  '| Service | Spring Boot | Spring Cloud | Java | Packaging | Wrapper | Tests |',
  '|---|---|---|---|---|---|---|',
  ...services.map((item) => `| ${item.service} | ${item.springBoot || 'unknown'} | ${item.springCloud || 'unknown'} | ${item.java || 'unknown'} | ${item.packaging} | ${item.hasWrapper ? 'yes' : 'no'} | ${item.hasTests ? 'yes' : 'no'} |`),
  '',
];
fs.writeFileSync(path.join(DATA_DIR, 'inventory.md'), lines.join('\n'));
console.log(`Inventoried ${services.length} service(s). Reports: ${path.relative(REPO_ROOT, DATA_DIR)}`);
