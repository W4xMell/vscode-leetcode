#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const spawn = require('cross-spawn');

const help = `Usage: npm run install:extension -- [options]

Build the extension and install the current repository VSIX into VS Code.

Options:
  --code <executable>         VS Code CLI name or absolute path (default: code)
  --profile <name>            Install into a named VS Code profile
  --extensions-dir <path>     Use a separate extension directory
  --user-data-dir <path>      Use a separate VS Code user data directory
  --no-force                 Do not pass --force to VS Code
  -v, --version              Print extension version
  -h, --help                 Show this help

Examples:
  npm run install:extension
  npm run install:extension -- --code code-insiders
  npm run install:extension -- --code "/path with spaces/bin/code"

VSCODE_EXECUTABLE can also specify the VS Code CLI.
`;

function parseArgs(argv, env) {
  const options = { code: env.VSCODE_EXECUTABLE || 'code', force: true, values: [] };
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === '--help' || argument === '-h') { options.help = true; continue; }
    if (argument === '--version' || argument === '-v') { options.version = true; continue; }
    if (argument === '--force') { options.force = true; continue; }
    if (argument === '--no-force') { options.force = false; continue; }
    if (['--code', '--profile', '--extensions-dir', '--user-data-dir'].includes(argument)) {
      const value = argv[++i];
      if (!value || !value.trim() || value.startsWith('-') || value.includes('\0')) throw new Error(`${argument} requires a value.`);
      if (argument === '--code') options.code = value;
      else options.values.push(argument, value);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}. Run with --help for usage.`);
  }
  return options;
}

function repositoryVsix(directory, manifest) {
  const filename = `${manifest.name}-${manifest.version}.vsix`;
  const vsix = path.join(directory, filename);
  if (!fs.existsSync(vsix)) throw new Error('The repository VSIX is missing. Run npm run install:extension to build and install it.');
  return vsix;
}

function main(argv = process.argv.slice(2), runtime = {}) {
  const output = runtime.output || console;
  const directory = runtime.directory || path.resolve(__dirname, '..');
  const run = runtime.spawnSync || spawn.sync;
  try {
    const options = parseArgs(argv, runtime.env || process.env);
    if (options.help) { output.log(help); return 0; }
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    if (options.version) { output.log(manifest.version); return 0; }
    const vsix = repositoryVsix(directory, manifest);
    const args = ['--install-extension', vsix, ...(options.force ? ['--force'] : []), ...options.values];
    output.log(`Installing LeetCode Study Plan ${manifest.version} with ${options.code}...`);
    const result = run(options.code, args, { stdio: 'inherit', shell: false });
    if (result.error) {
      if (result.error.code === 'ENOENT') throw new Error(`Cannot find the VS Code CLI: ${options.code}. Add it to PATH or use --code with its full path. On macOS, run "Shell Command: Install 'code' command in PATH" in VS Code.`);
      throw result.error;
    }
    if (result.signal) throw new Error(`VS Code CLI was interrupted by ${result.signal}.`);
    if (result.status !== 0) { output.error(`VS Code CLI failed (exit code ${result.status}).`); return result.status || 1; }
    output.log('Installation complete. Run Developer: Reload Window in VS Code to load the extension.');
    return 0;
  } catch (error) {
    output.error(`LeetCode Study Plan: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main();
module.exports = { main, parseArgs };
