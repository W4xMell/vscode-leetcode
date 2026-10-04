#!/usr/bin/env node
// Keep CLI configuration, accounts and caches separate from the upstream extension.
const os = require('node:os');
const path = require('node:path');
const file = require('vsc-leetcode-cli/lib/file');
file.homeDir = () => path.join(os.homedir(), '.leetcode-study-plan');
require('./cli-compat').install(file, require('vsc-leetcode-cli/lib/core'));
require('vsc-leetcode-cli/lib/cli').run();
