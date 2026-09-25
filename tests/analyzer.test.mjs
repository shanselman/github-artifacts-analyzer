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

test('aborts when a rate limit is exhausted mid-repository instead of returning partial totals', async () => {
  let artifactRequest = 0;
  const analyzer = createAnalyzer({
    actions: {
      listRepoWorkflows: async () => ({ data: workflowFixture() }),
      listWorkflowRuns: async () => ({
        data: { workflow_runs: [{ id: 20 }, { id: 21 }] },
      }),
      listWorkflowRunArtifacts: async () => {
        if (artifactRequest++ === 0) {
          return {
            data: {
              artifacts: [{
                id: 30,
                name: 'partial-result',
                size_in_bytes: 1024,
                expired: false,
              }],
            },
          };
        }

        throw Object.assign(new Error('API rate limit exceeded'), {
          status: 403,
          response: { headers: { 'x-ratelimit-remaining': '0' } },
        });
      },
    },
  });

  await assert.rejects(
    () => analyzer.analyzeRepository('owner', 'repo'),
    error => error.code === 'RATE_LIMITED' && /stopped/.test(error.message)
  );
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

test('aborts an aggregate analysis when a secondary rate limit is exhausted', async () => {
  const analyzer = createAnalyzer({
    repos: {
      listForAuthenticatedUser: async () => ({
        data: [{ full_name: 'owner/repo', owner: { login: 'owner' }, name: 'repo', fork: false, private: true }],
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

  await assert.rejects(
    () => analyzer.analyzeAllRepositories('owner'),
    error => error.code === 'RATE_LIMITED'
  );
});

test('throttling plugin retries a primary rate limit and tracks the recovered quota', async () => {
  const analyzer = new GitHubArtifactsAnalyzer('test-token');
  let callCount = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
        status: 403,
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000)),
        },
      });
    }
    return new Response(JSON.stringify({ total_count: 0, workflows: [] }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
      },
    });
  };

  try {
    const { data } = await analyzer.octokit.actions.listRepoWorkflows({ owner: 'owner', repo: 'repo' });
    assert.equal(data.total_count, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(callCount, 2);
  assert.equal(analyzer.remainingRequests, 4999);
  assert.equal(analyzer.requestLimit, 5000);
});

test('derives the proactive threshold from the actual quota', async () => {
  let probeCount = 0;
  const analyzer = createAnalyzer({
    rateLimit: {
      get: async () => {
        probeCount++;
        throw new Error('probe should not run');
      },
    },
    actions: {
      listRepoWorkflows: async () => ({ data: { total_count: 0, workflows: [] } }),
    },
  });
  analyzer.remainingRequests = 50;
  analyzer.requestLimit = 100;

  const analysis = await analyzer.analyzeRepository('owner', 'repo');

  assert.equal(analysis.incomplete, false);
  assert.equal(probeCount, 0);
});

test('waits and rechecks a low quota before continuing mid-repository', async () => {
  let probeCount = 0;
  let workflowRequests = 0;
  const waits = [];
  const reset = Math.floor(Date.now() / 1000);
  const analyzer = createAnalyzer({
    rateLimit: {
      get: async () => ({
        data: {
          resources: {
            core: probeCount++ === 0
              ? { limit: 1000, remaining: 100, reset }
              : { limit: 1000, remaining: 101, reset },
          },
        },
      }),
    },
    actions: {
      listRepoWorkflows: async () => {
        workflowRequests++;
        return { data: { total_count: 0, workflows: [] } };
      },
    },
  });
  analyzer.remainingRequests = 50;
  analyzer.requestLimit = 1000;
  analyzer.sleep = async milliseconds => waits.push(milliseconds);

  await analyzer.analyzeRepository('owner', 'repo');

  assert.equal(probeCount, 2);
  assert.equal(workflowRequests, 1);
  assert.equal(waits.length, 1);
  assert.ok(waits[0] > 0 && waits[0] <= 60_000);
});

test('surfaces rate-limit probe failures instead of disabling protection', async () => {
  const analyzer = createAnalyzer({
    rateLimit: {
      get: async () => {
        throw new Error('rate-limit endpoint unavailable');
      },
    },
    actions: {
      listRepoWorkflows: async () => ({ data: { total_count: 0, workflows: [] } }),
    },
  });
  analyzer.remainingRequests = 5;
  analyzer.requestLimit = 100;

  await assert.rejects(
    () => analyzer.analyzeRepository('owner', 'repo'),
    error =>
      error.code === 'RATE_LIMIT_CHECK_FAILED' &&
      /rate-limit endpoint unavailable/.test(error.message)
  );
});

test('stops instead of waiting beyond the bounded quota window', async () => {
  let workflowRequests = 0;
  const analyzer = createAnalyzer({
    rateLimit: {
      get: async () => ({
        data: {
          resources: {
            core: {
              limit: 1000,
              remaining: 50,
              reset: Math.floor(Date.now() / 1000) + 120,
            },
          },
        },
      }),
    },
    actions: {
      listRepoWorkflows: async () => {
        workflowRequests++;
        return { data: { total_count: 0, workflows: [] } };
      },
    },
  });
  analyzer.remainingRequests = 50;
  analyzer.requestLimit = 1000;

  await assert.rejects(
    () => analyzer.analyzeRepository('owner', 'repo'),
    error => error.code === 'RATE_LIMITED'
  );
  assert.equal(workflowRequests, 0);
});

test('bounds primary and secondary rate-limit retries and waits', () => {
  const analyzer = new GitHubArtifactsAnalyzer('test-token');
  const options = { method: 'GET', url: '/repos/{owner}/{repo}' };
  const originalLog = console.log;
  console.log = () => {};

  try {
    assert.equal(analyzer.retryRateLimit('Rate limit', 60, options, 0), true);
    assert.equal(analyzer.retryRateLimit('Rate limit', 60, options, 1), false);
    assert.equal(analyzer.retryRateLimit('Secondary rate limit', 61, options, 0), false);
  } finally {
    console.log = originalLog;
  }
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
