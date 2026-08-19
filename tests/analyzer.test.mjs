import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GitHubArtifactsAnalyzer } from '../dist/analyzer.js';
import { ReportGenerator } from '../dist/reporter.js';

function createAnalyzer(octokit) {
  const analyzer = new GitHubArtifactsAnalyzer('test-token');
  analyzer.octokit = octokit;
  return analyzer;
}

function workflowFixture() {
  return {
    total_count: 1,
    workflows: [{ id: 10, name: 'Build', path: '.github/workflows/build.yml', state: 'active' }],
  };
}

test('marks a repository incomplete when a workflow query fails', async () => {
  const analyzer = createAnalyzer({
    actions: {
      listRepoWorkflows: async () => ({ data: workflowFixture() }),
      listWorkflowRuns: async () => {
        throw Object.assign(new Error('SSO authorization required'), { status: 403 });
      },
    },
  });

  const analysis = await analyzer.analyzeRepository('owner', 'repo');

  assert.equal(analysis.incomplete, true);
  assert.equal(analysis.skippedWorkflows, 1);
  assert.match(analysis.warnings[0], /SSO authorization required/);
});

test('tracks an unretried rate-limit error as a normal failure instead of aborting', async () => {
  // The @octokit/plugin-throttling transport layer retries real rate limits
  // before they ever reach application code, so anything that still throws
  // here is a genuine, non-recoverable failure and should just be tracked.
  const analyzer = createAnalyzer({
    actions: {
      listRepoWorkflows: async () => ({ data: workflowFixture() }),
      listWorkflowRuns: async () => ({
        data: { workflow_runs: [{ id: 20 }] },
      }),
      listWorkflowRunArtifacts: async () => {
        throw Object.assign(new Error('API rate limit exceeded'), {
          status: 403,
          response: { headers: { 'x-ratelimit-remaining': '0' } },
        });
      },
    },
  });

  const analysis = await analyzer.analyzeRepository('owner', 'repo');

  assert.equal(analysis.incomplete, true);
  assert.equal(analysis.skippedWorkflowRuns, 1);
  assert.match(analysis.warnings[0], /API rate limit exceeded/);
});

test('tracks repositories that could not be analyzed', async () => {
  let repositoryPage = 0;
  const analyzer = createAnalyzer({
    repos: {
      listForAuthenticatedUser: async () => ({
        data: repositoryPage++ === 0
          ? [{ full_name: 'owner/repo', owner: { login: 'owner' }, name: 'repo', fork: false, private: true }]
          : [],
      }),
    },
    actions: {
      listRepoWorkflows: async () => {
        throw Object.assign(new Error('Not found'), { status: 404 });
      },
    },
  });

  const analysis = await analyzer.analyzeAllRepositories('owner');

  assert.equal(analysis.incomplete, true);
  assert.equal(analysis.summary.repositoriesSkipped, 1);
  assert.deepEqual(analysis.skippedRepositories, [
    { fullName: 'owner/repo', reason: 'Repository not found or no access' },
  ]);
});

test('keeps scanning the rest of an org after one repository fails without retry', async () => {
  let repositoryPage = 0;
  const analyzer = createAnalyzer({
    repos: {
      listForAuthenticatedUser: async () => ({
        data: repositoryPage++ === 0
          ? [{ full_name: 'owner/repo', owner: { login: 'owner' }, name: 'repo', fork: false, private: true }]
          : [],
      }),
    },
    actions: {
      listRepoWorkflows: async () => ({ data: workflowFixture() }),
      listWorkflowRuns: async () => ({
        data: { workflow_runs: [{ id: 20 }] },
      }),
      listWorkflowRunArtifacts: async () => {
        throw Object.assign(new Error('Secondary rate limit'), {
          status: 403,
          response: { headers: { 'retry-after': '60' } },
        });
      },
    },
  });

  const analysis = await analyzer.analyzeAllRepositories('owner');

  assert.equal(analysis.incomplete, true);
  assert.equal(analysis.summary.repositoriesIncomplete, 1);
  assert.equal(analysis.repositories[0].skippedWorkflowRuns, 1);
});

test('CSV reports include incomplete and skipped status metadata', () => {
  const directory = mkdtempSync(join(tmpdir(), 'artifact-report-'));
  const outputFile = join(directory, 'report.csv');
  const reporter = new ReportGenerator();

  try {
    reporter.generateCsvReport({
      repositories: [{
        fullName: 'owner/partial',
        incomplete: true,
        warnings: ['run failed, retry later'],
        workflows: [],
        totalArtifacts: 0,
        totalSizeBytes: 0,
        activeArtifacts: 0,
        activeSizeBytes: 0,
        expiredArtifacts: 0,
        expiredSizeBytes: 0,
      }],
      skippedRepositories: [{ fullName: 'owner/skipped', reason: 'No access' }],
    }, outputFile);

    const csv = readFileSync(outputFile, 'utf8');
    assert.match(csv, /owner\/partial,incomplete,"run failed, retry later"/);
    assert.match(csv, /owner\/skipped,skipped,No access/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
