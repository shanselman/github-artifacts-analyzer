import { Octokit as OctokitRest } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import chalk from 'chalk';

const Octokit = OctokitRest.plugin(throttling);

class GitHubArtifactsAnalyzer {
  private octokit: InstanceType<typeof Octokit>;
  private remainingRequests: number | null = null;

  constructor(token) {
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'github-artifacts-analyzer/1.0.0',
      throttle: {
        onRateLimit: (retryAfter, options) => {
          console.log(chalk.yellow(
            `\n⏳ Rate limit reached for ${options.method} ${options.url}. Waiting ${retryAfter}s...`
          ));
          return true;
        },
        onSecondaryRateLimit: (retryAfter, options) => {
          console.log(chalk.yellow(
            `\n⏳ Secondary rate limit reached for ${options.method} ${options.url}. Waiting ${retryAfter}s...`
          ));
          return true;
        }
      }
    });

    // Track remaining quota from response headers so we can warn the user
    // proactively, without spending a request on a dedicated rate-limit check.
    this.octokit.hook.after('request', (response) => {
      const remaining = response.headers['x-ratelimit-remaining'];
      if (remaining !== undefined) {
        this.remainingRequests = Number(remaining);
      }
    });
  }

  private warnIfQuotaLow(threshold = 100) {
    if (this.remainingRequests !== null && this.remainingRequests <= threshold) {
      console.log(chalk.yellow(
        `  ⚠ Only ${this.remainingRequests} GitHub API requests remaining this hour; expect throttling waits soon.`
      ));
    }
  }

  private describeError(error) {
    return error?.message || 'Unknown error';
  }

  async analyzeAllRepositories(username, options = { includeExpired: false, minSize: 0 }) {
    // Get authenticated user if no username provided
    if (!username) {
      const { data: user } = await this.octokit.users.getAuthenticated();
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
        const { data: repos } = await this.octokit.repos.listForAuthenticatedUser({
          visibility: 'all', // Gets both public and private repos
          per_page: 100,
          page,
          sort: 'updated'
        });

        if (repos.length === 0) {
          hasMore = false;
        } else {
          // Filter to only repos owned by the target user (not organizations)
          const userRepos = repos.filter(repo => 
            repo.owner.login === username && !repo.fork
          );

          // Process repositories in batches to avoid rate limiting
          for (const repo of userRepos) {
            this.warnIfQuotaLow();
            console.log(chalk.gray(`  Checking ${repo.full_name}${repo.private ? ' (private)' : ''}...`));
            try {
              const analysis = await this.analyzeRepository(repo.owner.login, repo.name, options);
              repositories.push(analysis);

              if (analysis.totalArtifacts > 0) {
                console.log(chalk.green(`    ✓ Found ${analysis.totalArtifacts} artifacts (${this.formatBytes(analysis.totalSizeBytes)})`));
              }
            } catch (error) {
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
      const { data: repos } = await this.octokit.repos.listForUser({
        username,
        per_page: 100,
        page,
        type: 'owner' // Only repositories owned by the user, not organizations
      });

      if (repos.length === 0) {
        hasMore = false;
      } else {
        // Process repositories in batches to avoid rate limiting
        for (const repo of repos) {
          this.warnIfQuotaLow();
          console.log(chalk.gray(`  Checking ${repo.full_name}...`));
          try {
            const analysis = await this.analyzeRepository(repo.owner.login, repo.name, options);
            repositories.push(analysis);

            if (analysis.totalArtifacts > 0) {
              console.log(chalk.green(`    ✓ Found ${analysis.totalArtifacts} artifacts (${this.formatBytes(analysis.totalSizeBytes)})`));
            }
          } catch (error) {
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
      const { data: workflowsData } = await this.octokit.actions.listRepoWorkflows({
        owner,
        repo
      });

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
          const { data: runs } = await this.octokit.actions.listWorkflowRuns({
            owner,
            repo,
            workflow_id: workflow.id,
            per_page: 100 // Limit to recent runs
          });

          for (const run of runs.workflow_runs) {
            try {
              // Get artifacts for this run
              const { data: artifactsData } = await this.octokit.actions.listWorkflowRunArtifacts({
                owner,
                repo,
                run_id: run.id
              });

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
              analysis.incomplete = true;
              analysis.skippedWorkflowRuns++;
              analysis.warnings.push(
                `Workflow "${workflow.name}" run ${run.id}: ${this.describeError(error)}`
              );
              continue;
            }
          }
        } catch (error) {
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
      if (error?.status === 404) {
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