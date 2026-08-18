import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function runCli(...args) {
  return spawnSync(process.execPath, ['dist/index.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, DOTENV_CONFIG_QUIET: 'true' },
  });
}

test('prints help when launched as an executable module', () => {
  const result = runCli('--help');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: github-artifacts/);
  assert.match(result.stdout, /analyze/);
  assert.match(result.stdout, /repo/);
});

test('prints the CLI version', () => {
  const result = runCli('--version');

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '1.0.0');
});
