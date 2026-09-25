import { Octokit as OctokitRest } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import chalk from 'chalk';

const Octokit = OctokitRest.plugin(throttling);
const LOW_QUOTA_FRACTION = 0.1;
const MAX_RATE_LIMIT_RETRIES = 1;
const MAX_RATE_LIMIT_WAIT_SECONDS = 60;
const MAX_RATE_LIMIT_RECHECKS = 2;

class GitHubArtifactsAnalyzer {
  private octokit: InstanceType<typeof Octokit>;
  private remainingRequests: number | null = null;
  private requestLimit: number | null = null;

  constructor(token) {
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'github-artifacts-analyzer/1.0.0',
      throttle: {
        onRateLimit: (retryAfter, options, _octokit, retryCount) =>
          this.retryRateLimit('Rate limit', retryAfter, options, retryCount),
        onSecondaryRateLimit: (retryAfter, options, _octokit, retryCount) =>
          this.retryRateLimit('Secondary rate limit', retryAfter, options, retryCount)
      }
    });

    this.octokit.hook.after('request', (response) => {
      this.updateRateLimitState(response.headers);
    });
  }

  private retryRateLimit(kind, retryAfter, options, retryCount) {
    const shouldRetry =
      retryCount < MAX_RATE_LIMIT_RETRIES &&
      retryAfter <= MAX_RATE_LIMIT_WAIT_SECONDS;
    const action = shouldRetry
      ? `Waiting ${retryAfter}s before the final retry`
      : 'Retry limit reached; stopping analysis';

    console.log(chalk.yellow(
      `\n⏳ ${kind} for ${options.method} ${options.url}. ${action}.`
    ));
    return shouldRetry;
  }

  private updateRateLimitState(headers) {
    const remaining = Number(headers['x-ratelimit-remaining']);
    const limit = Number(headers['x-ratelimit-limit']);

    if (Number.isFinite(remaining)) {
      this.remainingRequests = remaining;
    }
    if (Number.isFinite(limit) && limit > 0) {
      this.requestLimit = limit;
    }
  }

  private quotaThreshold(limit) {
    return Math.max(1, Math.ceil(limit * LOW_QUOTA_FRACTION));
  }

  private async request<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureRateLimitAvailability();
    return operation();
  }

  private async ensureRateLimitAvailability() {
    if (
      this.remainingRequests === null ||
      this.requestLimit === null ||
      this.remainingRequests > this.quotaThreshold(this.requestLimit)
    ) {
      return;
    }

    for (let recheck = 0; recheck <= MAX_RATE_LIMIT_RECHECKS; recheck++) {
      const rate = await this.probeRateLimit();
      const threshold = this.quotaThreshold(rate.limit);

      if (rate.remaining > threshold) {
        return;
      }

      if (recheck === MAX_RATE_LIMIT_RECHECKS) {
        throw this.createRateLimitError(
          new Error(`Only ${rate.remaining} of ${rate.limit} requests remain after ${MAX_RATE_LIMIT_RECHECKS} rechecks`)
        );
      }

      const retryAfter = Math.max(1, rate.reset - Math.floor(Date.now() / 1000) + 1);
      if (retryAfter > MAX_RATE_LIMIT_WAIT_SECONDS) {
        throw this.createRateLimitError(
          new Error(`Quota reset is ${retryAfter}s away, beyond the ${MAX_RATE_LIMIT_WAIT_SECONDS}s wait limit`)
        );
      }

      console.log(chalk.yellow(
        `  ⏳ Only ${rate.remaining} of ${rate.limit} GitHub API requests remain. Waiting ${retryAfter}s before rechecking...`
      ));
      await this.sleep(retryAfter * 1000);
    }
  }

  private async probeRateLimit() {
    try {
      const { data } = await this.octokit.rateLimit.get();
      const rate = data.resources.core;
      this.remainingRequests = rate.remaining;
      this.requestLimit = rate.limit;
      return rate;
    } catch (error) {
      const probeError: any = new Error(
        `Unable to verify GitHub API quota: ${this.describeError(error)}`
      );
      probeError.code = 'RATE_LIMIT_CHECK_FAILED';
      probeError.cause = error;
      throw probeError;
    }
  }

  private isRateLimitError(error) {
    const headers = error?.response?.headers || {};
    const message = error?.message || '';

    return error?.code === 'RATE_LIMITED' ||
      error?.status === 429 ||
      (error?.status === 403 && (
        String(headers['x-ratelimit-remaining']) === '0' ||
        headers['retry-after'] !== undefined ||
        /rate limit|secondary rate/i.test(message)
      ));
  }

  private isProtectionError(error) {
    return error?.code === 'RATE_LIMIT_CHECK_FAILED' || this.isRateLimitError(error);
  }

  private createRateLimitError(error) {
    const rateLimitError: any = new Error(
      'GitHub API rate limit protection stopped the analysis to avoid reporting incomplete results'
    );
    rateLimitError.code = 'RATE_LIMITED';
    rateLimitError.cause = error;
    return rateLimitError;
  }

  private protectionError(error) {
    return error?.code === 'RATE_LIMITED' || error?.code === 'RATE_LIMIT_CHECK_FAILED'
      ? error
      : this.createRateLimitError(error);
  }

  private describeError(error) {
    return error?.message || 'Unknown error';
  }

  async analyzeAllRepositories(username, options = { includeExpired: false, minSize: 0 }) {
    // Get authenticated user if no username provided
    if (!username) {
      const { data: user } = await this.request(() => this.octokit.users.getAuthenticated());
      username = user.login;
    }

    console.log(chalk.blue(`\n📊 Analyzing repositories for user: ${username}\n`));

    // Get all repositories for the user - both public and private
    const repositories = [];
    const skippedRepositories = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        // Try authenticated user's repos first (includes private repos)
        const { data: repos } = await this.request(() => this.octokit.repos.listForAuthenticatedUser({
          visibility: 'all', // Gets both public and private repos
          per_page: 100,
          page,
          sort: 'updated'
        }));

        if (repos.length === 0) {
          hasMore = false;
        } else {
          // Filter to only repos owned by the target user (not organizations)
          const userRepos = repos.filter(repo => 
            repo.owner.login === username && !repo.fork
          );

          // Process repositories in batches to avoid rate limiting
          for (const repo of userRepos) {
            console.log(chalk.gray(`  Checking ${repo.full_name}${repo.private ? ' (private)' : ''}...`));
            try {
              const analysis = await this.analyzeRepository(repo.owner.login, repo.name, options);
              repositories.push(analysis);

              if (analysis.totalArtifacts > 0) {
                console.log(chalk.green(`    ✓ Found ${analysis.totalArtifacts} artifacts (${this.formatBytes(analysis.totalSizeBytes)})`));
              }
            } catch (error) {
              if (this.isProtectionError(error)) {
                throw this.protectionError(error);
              }

              const reason = this.describeError(error);
              skippedRepositories.push({ fullName: repo.full_name, reason });
              console.log(chalk.yellow(`    ⚠ Skipped (${reason})`));
            }

            // Small delay to be respectful to the API
            await this.sleep(100);
          }
          page++;
        }
      } catch (error) {
        if (this.isProtectionError(error)) {
          throw this.protectionError(error);
        }

        // Fallback to public repos if authenticated call fails
        if (error.status === 401 || error.status === 403) {
          console.log(chalk.yellow('⚠ Using public repositories only (authentication issue)'));
          return this.analyzePublicRepositories(username, options);
        }
        throw error;
      }
    }

    // Calculate summary statistics
    const summary = this.calculateSummary(repositories, skippedRepositories);
    const incompleteRepositories = repositories
      .filter(repo => repo.incomplete)
      .map(repo => ({ fullName: repo.fullName, warnings: repo.warnings }));

    return {
      repositories,
      summary,
      incomplete: skippedRepositories.length > 0 || incompleteRepositories.length > 0,
      skippedRepositories,
      incompleteRepositories
    };
  }

  async analyzePublicRepositories(username, options = { includeExpired: false, minSize: 0 }) {
    const repositories = [];
    const skippedRepositories = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { data: repos } = await this.request(() => this.octokit.repos.listForUser({
        username,
        per_page: 100,
        page,
        type: 'owner' // Only repositories owned by the user, not organizations
      }));

      if (repos.length === 0) {
        hasMore = false;
      } else {
        // Process repositories in batches to avoid rate limiting
        for (const repo of repos) {
          console.log(chalk.gray(`  Checking ${repo.full_name}...`));
          try {
            const analysis = await this.analyzeRepository(repo.owner.login, repo.name, options);
            repositories.push(analysis);

            if (analysis.totalArtifacts > 0) {
              console.log(chalk.green(`    ✓ Found ${analysis.totalArtifacts} artifacts (${this.formatBytes(analysis.totalSizeBytes)})`));
            }
          } catch (error) {
            if (this.isProtectionError(error)) {
              throw this.protectionError(error);
            }

            const reason = this.describeError(error);
            skippedRepositories.push({ fullName: repo.full_name, reason });
            console.log(chalk.yellow(`    ⚠ Skipped (${reason})`));
          }

          // Small delay to be respectful to the API
          await this.sleep(100);
        }
        page++;
      }
    }

    // Calculate summary statistics
    const summary = this.calculateSummary(repositories, skippedRepositories);
    const incompleteRepositories = repositories
      .filter(repo => repo.incomplete)
      .map(repo => ({ fullName: repo.fullName, warnings: repo.warnings }));

    return {
      repositories,
      summary,
      incomplete: skippedRepositories.length > 0 || incompleteRepositories.length > 0,
      skippedRepositories,
      incompleteRepositories
    };
  }

  async analyzeRepository(owner, repo, options = { includeExpired: false, minSize: 0 }) {
    const analysis = {
      owner,
      name: repo,
      fullName: `${owner}/${repo}`,
      hasWorkflows: false,
      workflows: [],
      artifacts: [],
      totalArtifacts: 0,
      totalSizeBytes: 0,
      activeArtifacts: 0,
      expiredArtifacts: 0,
      activeSizeBytes: 0,
      expiredSizeBytes: 0,
      incomplete: false,
      skippedWorkflowRuns: 0,
      skippedWorkflows: 0,
      warnings: []
    };

    try {
      // Get workflows for the repository
      const { data: workflowsData } = await this.request(() => this.octokit.actions.listRepoWorkflows({
        owner,
        repo
      }));

      if (workflowsData.total_count === 0) {
        return analysis; // No workflows, no artifacts possible
      }

      analysis.hasWorkflows = true;
      analysis.workflows = workflowsData.workflows.map(w => ({
        id: w.id,
        name: w.name,
        path: w.path,
        state: w.state
      }));

      // Get artifacts for each workflow
      for (const workflow of analysis.workflows) {
        try {
          // Get recent workflow runs
          const { data: runs } = await this.request(() => this.octokit.actions.listWorkflowRuns({
            owner,
            repo,
            workflow_id: workflow.id,
            per_page: 100 // Limit to recent runs
          }));

          for (const run of runs.workflow_runs) {
            try {
              // Get artifacts for this run
              const { data: artifactsData } = await this.request(() => this.octokit.actions.listWorkflowRunArtifacts({
                owner,
                repo,
                run_id: run.id
              }));

              for (const artifact of artifactsData.artifacts) {
                if (artifact.size_in_bytes >= options.minSize) {
                  const isExpired = artifact.expired || (artifact.expires_at ? new Date(artifact.expires_at) < new Date() : false);
                  
                  if (!isExpired || options.includeExpired) {
                    const artifactInfo = {
                      id: artifact.id,
                      name: artifact.name,
                      sizeInBytes: artifact.size_in_bytes,
                      createdAt: new Date(artifact.created_at || Date.now()),
                      updatedAt: new Date(artifact.updated_at || Date.now()),
                      expiresAt: new Date(artifact.expires_at || Date.now()),
                      expired: isExpired,
                      workflowRunId: run.id,
                      workflowName: workflow.name
                    };

                    analysis.artifacts.push(artifactInfo);
                  }
                }
              }
            } catch (error) {
              if (this.isProtectionError(error)) {
                throw this.protectionError(error);
              }

              analysis.incomplete = true;
              analysis.skippedWorkflowRuns++;
              analysis.warnings.push(
                `Workflow "${workflow.name}" run ${run.id}: ${this.describeError(error)}`
              );
              continue;
            }
          }
        } catch (error) {
          if (this.isProtectionError(error)) {
            throw this.protectionError(error);
          }

          analysis.incomplete = true;
          analysis.skippedWorkflows++;
          analysis.warnings.push(
            `Workflow "${workflow.name}": ${this.describeError(error)}`
          );
          continue;
        }
      }

      // Calculate statistics
      analysis.totalArtifacts = analysis.artifacts.length;
      analysis.totalSizeBytes = analysis.artifacts.reduce((sum, a) => sum + a.sizeInBytes, 0);
      analysis.activeArtifacts = analysis.artifacts.filter(a => !a.expired).length;
      analysis.expiredArtifacts = analysis.artifacts.filter(a => a.expired).length;
      analysis.activeSizeBytes = analysis.artifacts.filter(a => !a.expired).reduce((sum, a) => sum + a.sizeInBytes, 0);
      analysis.expiredSizeBytes = analysis.artifacts.filter(a => a.expired).reduce((sum, a) => sum + a.sizeInBytes, 0);

    } catch (error) {
      if (this.isProtectionError(error)) {
        throw this.protectionError(error);
      } else if (error?.status === 404) {
        throw new Error('Repository not found or no access');
      } else if (error?.status === 403) {
        throw new Error('Access forbidden - check token permissions');
      } else {
        throw error;
      }
    }

    return analysis;
  }

  calculateSummary(repositories, skippedRepositories = []) {
    return {
      totalRepositories: repositories.length,
      repositoriesSkipped: skippedRepositories.length,
      repositoriesIncomplete: repositories.filter(r => r.incomplete).length,
      repositoriesWithWorkflows: repositories.filter(r => r.hasWorkflows).length,
      repositoriesWithArtifacts: repositories.filter(r => r.totalArtifacts > 0).length,
      totalArtifacts: repositories.reduce((sum, r) => sum + r.totalArtifacts, 0),
      totalSizeBytes: repositories.reduce((sum, r) => sum + r.totalSizeBytes, 0),
      activeArtifacts: repositories.reduce((sum, r) => sum + r.activeArtifacts, 0),
      expiredArtifacts: repositories.reduce((sum, r) => sum + r.expiredArtifacts, 0),
      activeSizeBytes: repositories.reduce((sum, r) => sum + r.activeSizeBytes, 0),
      expiredSizeBytes: repositories.reduce((sum, r) => sum + r.expiredSizeBytes, 0)
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async deleteArtifact(owner, repo, artifactId) {
    try {
      await this.octokit.actions.deleteArtifact({
        owner,
        repo,
        artifact_id: artifactId
      });
      return true;
    } catch (error) {
      console.error(`Failed to delete artifact ${artifactId}:`, error.message);
      return false;
    }
  }
}

export { GitHubArtifactsAnalyzer };