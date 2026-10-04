#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const spawn = require('cross-spawn');

function main(argv = process.argv.slice(2), env = process.env) {
  const root = path.resolve(__dirname, '..');
  const manifest = require('../package.json');
  if (argv.includes('--help')) {
    console.log('Usage: npm run vs-publish -- [--azure-credential]\nPublishes the current-version VSIX without rebuilding. Set VSCE_PAT or use Azure authentication.');
    return 0;
  }
  if (argv.some(value => value !== '--azure-credential')) throw new Error('Only --azure-credential is supported.');
  const azure = argv.includes('--azure-credential');
  if (!azure && !env.VSCE_PAT) throw new Error('Set the VSCE_PAT publishing secret, or use --azure-credential.');
  if (azure && env.VSCE_PAT) throw new Error('Choose one publishing authentication method.');
  const vsix = path.join(root, `${manifest.name}-${manifest.version}.vsix`);
  if (!fs.existsSync(vsix)) throw new Error('Build or download the current-version VSIX before publishing.');
  const result = spawn.sync('npx', ['--yes', '@vscode/vsce@4.0.0', 'publish', '--packagePath', vsix, ...argv], {
    cwd: root, env, stdio: 'inherit', shell: false,
  });
  if (result.error) throw result.error;
  return result.status || (result.signal ? 1 : 0);
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { main };
