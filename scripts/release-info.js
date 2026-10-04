#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function releaseInfo(root, tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Release tag must be v<major>.<minor>.<patch>.');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const version = tag.slice(1);
  if ([manifest.version, lock.version, lock.packages?.['']?.version].some(value => value !== version)) {
    throw new Error('Tag, package.json and package-lock.json versions must match.');
  }
  if (manifest.publisher !== 'Mafty43211' || manifest.name !== 'vscode-leetcode-study-plan') {
    throw new Error('Unexpected Marketplace extension identity.');
  }
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const heading = `## [${version}]`;
  const lines = changelog.split('\n');
  const start = lines.findIndex(line => line === heading || line.startsWith(heading + ' - '));
  if (start < 0) throw new Error('CHANGELOG.md must include this release version.');
  let end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  if (end < 0) end = lines.length;
  const notes = lines.slice(start + 1, end).join('\n').trim();
  if (!notes) throw new Error('Release notes cannot be empty.');
  return { tag, version, publisher: manifest.publisher, name: manifest.name,
    vsix: `${manifest.name}-${version}.vsix`, notes };
}

function writeReleaseFiles(root, info) {
  const sha = process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('GITHUB_SHA must identify the release source commit.');
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, info.vsix))).digest('hex');
  fs.writeFileSync(path.join(root, 'SHA256SUMS'), `${checksum}  ${info.vsix}\n`);
  fs.writeFileSync(path.join(root, 'release-metadata.json'), JSON.stringify({
    tag: info.tag, version: info.version, extension: `${info.publisher}.${info.name}`, source: sha,
    vsix: info.vsix, sha256: checksum,
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'release-notes.md'), `${info.notes}\n\nSource: ${sha}\n\nVSIX SHA-256: ${checksum}\n`);
}

if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '..');
    const info = releaseInfo(root, process.argv[2] || '');
    if (process.argv[3] === '--files') writeReleaseFiles(root, info);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=${info.tag}\nversion=${info.version}\nvsix=${info.vsix}\n`);
    console.log(`Validated ${info.publisher}.${info.name} ${info.tag}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { releaseInfo, writeReleaseFiles };
