#!/usr/bin/env node
/* eslint-disable no-console */
import { execSync } from 'node:child_process';

try {
  const output = execSync("rg -n '^(<<<<<<<|=======|>>>>>>>)' -S --glob '!.git/**'", {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

  if (output) {
    console.error('❌ Merge conflict markers found:');
    console.error(output);
    process.exit(1);
  }

  console.log('✅ No merge conflict markers found.');
} catch (error) {
  const stdout = String(error && error.stdout ? error.stdout : '').trim();
  if (stdout) {
    console.error('❌ Merge conflict markers found:');
    console.error(stdout);
    process.exit(1);
  }

  console.log('✅ No merge conflict markers found.');
}
