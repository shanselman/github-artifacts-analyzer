import Table from 'cli-table3';
import chalk from 'chalk';
import { writeFileSync } from 'fs';
import * as readline from 'readline';

class ReportGenerator {
  async generateReport(analysis, options) {
    switch (options.format) {
      case 'json':
        this.generateJsonReport(analysis, options.outputFile);
        break;
      case 'csv':
        this.generateCsvReport(analysis, options.outputFile);
        break;
      case 'table':
      default:
        this.generateTableReport(analysis, options.topCount || 10);
        break;
    }
  }

  async generateRepositoryReport(analysis, options) {
    switch (options.format) {
      case 'json':
        console.log(JSON.stringify(analysis, null, 2));
        break;
      case 'csv':
        this.generateRepositoryCsvReport(analysis);
        break;
      case 'table':
      default:
        this.generateRepositoryTableReport(analysis);
        break;
    }
  }

  generateTableReport(analysis, topCount) {
    if (analysis.incomplete) {
      console.log(chalk.bold.red(
        '\n⚠ Incomplete analysis: some GitHub API requests failed. Totals below are partial.'
      ));
    }

    // Summary table
    console.log(chalk.bold.blue('\n🚀 GitHub Artifacts Storage Analysis Summary'));
    console.log(chalk.gray('='.repeat(60)));

    const summaryTable = new Table({
      head: ['Metric', 'Value'],
      style: { head: ['cyan'] }
    });

    summaryTable.push(
      ['Total Repositories', analysis.summary.totalRepositories.toLocaleString()],
      ['Repositories Skipped', (analysis.summary.repositoriesSkipped || 0).toLocaleString()],
      ['Repositories Incomplete', (analysis.summary.repositoriesIncomplete || 0).toLocaleString()],
      ['Repositories with Workflows', analysis.summary.repositoriesWithWorkflows.toLocaleString()],
      ['Repositories with Artifacts', analysis.summary.repositoriesWithArtifacts.toLocaleString()],
      ['Total Artifacts', analysis.summary.totalArtifacts.toLocaleString()],
      ['Total Storage Used', this.formatBytes(analysis.summary.totalSizeBytes)],
      ['Active Artifacts', `${analysis.summary.activeArtifacts.toLocaleString()} (${this.formatBytes(analysis.summary.activeSizeBytes)})`],
      ['Expired Artifacts', `${analysis.summary.expiredArtifacts.toLocaleString()} (${this.formatBytes(analysis.summary.expiredSizeBytes)})`]
    );

    console.log(summaryTable.toString());

    // Top repositories by storage
    if (analysis.repositories.length > 0) {
      console.log(chalk.bold.blue(`\n📊 Top ${topCount} Repositories by Storage Usage`));
      console.log(chalk.gray('='.repeat(80)));

      const topRepos = analysis.repositories
        .filter(r => r.totalSizeBytes > 0)
        .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes)
        .slice(0, topCount);

      if (topRepos.length === 0) {
        console.log(chalk.yellow('No repositories with artifacts found.'));
        return;
      }

      const repoTable = new Table({
        head: ['Repository', 'Workflows', 'Artifacts', 'Total Size', 'Active Size', 'Expired Size'],
        style: { head: ['cyan'] },
        colWidths: [30, 12, 12, 15, 15, 15]
      });

      for (const repo of topRepos) {
        const sizeColor = repo.totalSizeBytes > 100 * 1024 * 1024 ? 'red' : repo.totalSizeBytes > 10 * 1024 * 1024 ? 'yellow' : 'white';
        
        repoTable.push([
          repo.fullName,
          repo.workflows.length.toString(),
          repo.totalArtifacts.toString(),
          chalk[sizeColor](this.formatBytes(repo.totalSizeBytes)),
          this.formatBytes(repo.activeSizeBytes),
          repo.expiredSizeBytes > 0 ? chalk.gray(this.formatBytes(repo.expiredSizeBytes)) : '0 B'
        ]);
      }

      console.log(repoTable.toString());

      // Show detailed artifacts for top repository
      if (topRepos.length > 0 && topRepos[0].artifacts.length > 0) {
        console.log(chalk.bold.blue(`\n🔍 Detailed Artifacts for ${topRepos[0].fullName}`));
        console.log(chalk.gray('='.repeat(80)));

        this.showArtifactDetails(topRepos[0].artifacts.slice(0, 20)); // Show top 20 artifacts
      }

      // Storage recommendations
      this.generateRecommendations(analysis);
    }
  }

  generateRepositoryTableReport(analysis) {
    console.log(chalk.bold.blue(`\n📊 Repository Analysis: ${analysis.fullName}`));
    console.log(chalk.gray('='.repeat(60)));

    if (analysis.incomplete) {
      console.log(chalk.bold.red(
        `⚠ Incomplete analysis: ${analysis.warnings.length} GitHub API request(s) failed.`
      ));
    }

    if (!analysis.hasWorkflows) {
      console.log(chalk.yellow('No GitHub Actions workflows found in this repository.'));
      return;
    }

    if (analysis.totalArtifacts === 0) {
      console.log(chalk.yellow('No artifacts found in this repository.'));
      return;
    }

    // Repository summary
    const summaryTable = new Table({
      head: ['Metric', 'Value'],
      style: { head: ['cyan'] }
    });

    summaryTable.push(
      ['Workflows', analysis.workflows.length.toString()],
      ['Total Artifacts', analysis.totalArtifacts.toString()],
      ['Total Size', this.formatBytes(analysis.totalSizeBytes)],
      ['Active Artifacts', `${analysis.activeArtifacts} (${this.formatBytes(analysis.activeSizeBytes)})`],
      ['Expired Artifacts', `${analysis.expiredArtifacts} (${this.formatBytes(analysis.expiredSizeBytes)})`]
    );

    console.log(summaryTable.toString());

    // Artifacts details
    if (analysis.artifacts.length > 0) {
      console.log(chalk.bold.blue('\n🔍 Artifacts Details'));
      console.log(chalk.gray('='.repeat(80)));

      this.showArtifactDetails(analysis.artifacts);
    }
  }

  showArtifactDetails(artifacts) {
    const artifactTable = new Table({
      head: ['Name', 'Size', 'Workflow', 'Created', 'Expires', 'Status'],
      style: { head: ['cyan'] },
      colWidths: [25, 12, 20, 12, 12, 10]
    });

    const sortedArtifacts = artifacts
      .sort((a, b) => b.sizeInBytes - a.sizeInBytes);

    for (const artifact of sortedArtifacts) {
      const status = artifact.expired ? chalk.red('Expired') : chalk.green('Active');
      const size = artifact.sizeInBytes > 50 * 1024 * 1024 ? 
        chalk.red(this.formatBytes(artifact.sizeInBytes)) : 
        this.formatBytes(artifact.sizeInBytes);

      artifactTable.push([
        artifact.name.length > 24 ? artifact.name.substring(0, 21) + '...' : artifact.name,
        size,
        artifact.workflowName?.substring(0, 18) || 'Unknown',
        this.formatDate(artifact.createdAt),
        this.formatDate(artifact.expiresAt),
        status
      ]);
    }

    console.log(artifactTable.toString());
  }

  generateJsonReport(analysis, outputFile) {
    const jsonOutput = JSON.stringify(analysis, null, 2);
    
    if (outputFile) {
      writeFileSync(outputFile, jsonOutput);
      console.log(chalk.green(`✅ JSON report saved to: ${outputFile}`));
    } else {
      console.log(jsonOutput);
    }
  }

  generateCsvReport(analysis, outputFile) {
    const csvLines = ['Repository,Status,Error,Workflows,Total Artifacts,Total Size (Bytes),Active Artifacts,Active Size (Bytes),Expired Artifacts,Expired Size (Bytes)'];
    
    for (const repo of analysis.repositories) {
      csvLines.push([
        this.escapeCsv(repo.fullName),
        repo.incomplete ? 'incomplete' : 'complete',
        this.escapeCsv(repo.warnings?.join('; ') || ''),
        repo.workflows.length.toString(),
        repo.totalArtifacts.toString(),
        repo.totalSizeBytes.toString(),
        repo.activeArtifacts.toString(),
        repo.activeSizeBytes.toString(),
        repo.expiredArtifacts.toString(),
        repo.expiredSizeBytes.toString()
      ].join(','));
    }

    for (const skipped of analysis.skippedRepositories || []) {
      csvLines.push([
        this.escapeCsv(skipped.fullName),
        'skipped',
        this.escapeCsv(skipped.reason),
        '', '', '', '', '', '', ''
      ].join(','));
    }

    const csvOutput = csvLines.join('\n');

    if (outputFile) {
      writeFileSync(outputFile, csvOutput);
      console.log(chalk.green(`✅ CSV report saved to: ${outputFile}`));
    } else {
      console.log(csvOutput);
    }
  }

  generateRepositoryCsvReport(analysis) {
    const csvLines = ['Name,Size (Bytes),Workflow,Created,Expires,Expired'];
    
    for (const artifact of analysis.artifacts) {
      csvLines.push([
        artifact.name,
        artifact.sizeInBytes.toString(),
        artifact.workflowName || 'Unknown',
        artifact.createdAt.toISOString(),
        artifact.expiresAt.toISOString(),
        artifact.expired.toString()
      ].join(','));
    }

    console.log(csvLines.join('\n'));
  }

  escapeCsv(value) {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  generateRecommendations(analysis) {
    console.log(chalk.bold.blue('\n💡 Storage Optimization Recommendations'));
    console.log(chalk.gray('='.repeat(60)));

    const recommendations = [];

    // High storage repositories
    const highStorageRepos = analysis.repositories
      .filter(r => r.activeSizeBytes > 100 * 1024 * 1024) // > 100MB
      .sort((a, b) => b.activeSizeBytes - a.activeSizeBytes);

    if (highStorageRepos.length > 0) {
      recommendations.push(`🔍 Review high-storage repositories: ${highStorageRepos.slice(0, 3).map(r => r.fullName).join(', ')}`);
    }

    // Expired artifacts
    if (analysis.summary.expiredSizeBytes > 0) {
      recommendations.push(`🗑️  Clean up expired artifacts to save ${this.formatBytes(analysis.summary.expiredSizeBytes)}`);
    }

    // Old artifacts
    const oldArtifacts = analysis.repositories
      .flatMap(r => r.artifacts)
      .filter(a => !a.expired && this.daysSince(a.createdAt) > 30)
      .reduce((sum, a) => sum + a.sizeInBytes, 0);

    if (oldArtifacts > 0) {
      recommendations.push(`📅 Consider cleaning artifacts older than 30 days: ${this.formatBytes(oldArtifacts)} potential savings`);
    }

    // Large single artifacts
    const largeArtifacts = analysis.repositories
      .flatMap(r => r.artifacts)
      .filter(a => !a.expired && a.sizeInBytes > 50 * 1024 * 1024)
      .length;

    if (largeArtifacts > 0) {
      recommendations.push(`📦 ${largeArtifacts} artifacts are larger than 50MB - consider optimizing build outputs`);
    }

    if (recommendations.length === 0) {
      console.log(chalk.green('✅ Your artifact storage looks well optimized!'));
    } else {
      for (let i = 0; i < recommendations.length; i++) {
        console.log(chalk.yellow(`${i + 1}. ${recommendations[i]}`));
      }
    }

    // Quick cleanup commands
    if (analysis.summary.expiredSizeBytes > 0) {
      console.log(chalk.bold.blue('\n⚡ Quick Cleanup Commands'));
      console.log(chalk.gray('='.repeat(40)));
      console.log(chalk.gray('To delete expired artifacts, you can use the GitHub CLI:'));
      console.log(chalk.white('gh api -X DELETE /repos/OWNER/REPO/actions/artifacts/ARTIFACT_ID'));
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDate(date) {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: '2-digit',
      year: '2-digit'
    });
  }

  daysSince(date) {
    return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  }

  async runCleanupMode(analysis, analyzer) {
    console.log(chalk.bold.blue('\n🧹 Interactive Cleanup Mode'));
    console.log(chalk.gray('='.repeat(60)));
    
    // Find repositories with artifacts
    const reposWithArtifacts = analysis.repositories
      .filter(r => r.totalArtifacts > 0)
      .sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);

    if (reposWithArtifacts.length === 0) {
      console.log(chalk.green('✅ No repositories with artifacts found. Nothing to clean up!'));
      return;
    }

    console.log(`\nFound ${reposWithArtifacts.length} repositories with artifacts:\n`);

    for (const repo of reposWithArtifacts) {
      console.log(chalk.cyan(`📁 ${repo.fullName}`));
      console.log(`   Artifacts: ${repo.totalArtifacts} | Total Size: ${this.formatBytes(repo.totalSizeBytes)}`);
      console.log(`   Active: ${repo.activeArtifacts} (${this.formatBytes(repo.activeSizeBytes)}) | Expired: ${repo.expiredArtifacts} (${this.formatBytes(repo.expiredSizeBytes)})\n`);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    for (const repo of reposWithArtifacts) {
      await this.runRepositoryCleanup(repo, analyzer, rl);
    }

    rl.close();
    console.log(chalk.green('\n🎉 Cleanup complete!'));
  }

  async runRepositoryCleanup(repo, analyzer, rl = null) {
    const shouldCloseRL = !rl;
    if (!rl) {
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
    }

    console.log(chalk.bold.blue(`\n🧹 Cleanup for ${repo.fullName}`));
    console.log(chalk.gray('='.repeat(50)));

    if (repo.totalArtifacts === 0) {
      console.log(chalk.green('✅ No artifacts to clean up!'));
      if (shouldCloseRL) rl.close();
      return;
    }

    // Show current state
    const expiredArtifacts = repo.artifacts.filter(a => a.expired);
    const activeArtifacts = repo.artifacts.filter(a => !a.expired);
    const oldActiveArtifacts = activeArtifacts.filter(a => this.daysSince(a.createdAt) > 30);

    console.log(`\n📊 Current State:`);
    console.log(`   Total: ${repo.totalArtifacts} artifacts (${this.formatBytes(repo.totalSizeBytes)})`);
    console.log(`   Expired: ${expiredArtifacts.length} artifacts (${this.formatBytes(repo.expiredSizeBytes)})`);
    console.log(`   Old (>30 days): ${oldActiveArtifacts.length} artifacts (${this.formatBytes(oldActiveArtifacts.reduce((sum, a) => sum + a.sizeInBytes, 0))})`);

    // Cleanup expired artifacts
    if (expiredArtifacts.length > 0) {
      console.log(chalk.yellow(`\n🗑️  EXPIRED ARTIFACTS (${expiredArtifacts.length} artifacts)`));
      for (const artifact of expiredArtifacts.slice(0, 5)) {
        console.log(`   ${artifact.name} - ${this.formatBytes(artifact.sizeInBytes)} (${this.formatDate(artifact.createdAt)})`);
      }
      if (expiredArtifacts.length > 5) {
        console.log(`   ... and ${expiredArtifacts.length - 5} more`);
      }

      const deleteExpired: string = await this.askQuestion(rl, 
        `\n❓ Delete all ${expiredArtifacts.length} expired artifacts? (saves ${this.formatBytes(repo.expiredSizeBytes)}) [y/N]: `
      );

      if (deleteExpired.toLowerCase() === 'y' || deleteExpired.toLowerCase() === 'yes') {
        console.log('🗑️ Deleting expired artifacts...');
        let deleted = 0;
        for (const artifact of expiredArtifacts) {
          process.stdout.write(`   Deleting ${artifact.name} (${this.formatBytes(artifact.sizeInBytes)})... `);
          const success = await analyzer.deleteArtifact(repo.owner, repo.name, artifact.id);
          if (success) {
            console.log(chalk.green('✓'));
            deleted++;
          } else {
            console.log(chalk.red('✗'));
          }
          await analyzer.sleep(250); // Rate limit protection
        }
        console.log(chalk.green(`✅ Deleted ${deleted}/${expiredArtifacts.length} expired artifacts`));
      }
    }

    // Cleanup old active artifacts
    if (oldActiveArtifacts.length > 0) {
      console.log(chalk.yellow(`\n📅 OLD ACTIVE ARTIFACTS (${oldActiveArtifacts.length} artifacts)`));
      console.log('Consider deleting artifacts older than 30 days:');
      
      const sortedOld = oldActiveArtifacts
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, 10);
      
      for (const artifact of sortedOld) {
        console.log(`   ${artifact.name} - ${this.formatBytes(artifact.sizeInBytes)} (${this.formatDate(artifact.createdAt)}, ${this.daysSince(artifact.createdAt)} days ago)`);
      }
      if (oldActiveArtifacts.length > 10) {
        console.log(`   ... and ${oldActiveArtifacts.length - 10} more`);
      }

      const totalOldSize = oldActiveArtifacts.reduce((sum, a) => sum + a.sizeInBytes, 0);
      const deleteOld: string = await this.askQuestion(rl,
        `\n❓ Delete old active artifacts (>30 days)? (saves ${this.formatBytes(totalOldSize)}) [y/N]: `
      );

      if (deleteOld.toLowerCase() === 'y' || deleteOld.toLowerCase() === 'yes') {
        console.log('🗑️ Deleting old active artifacts...');
        let deleted = 0;
        for (const artifact of oldActiveArtifacts) {
          process.stdout.write(`   Deleting ${artifact.name} (${this.formatBytes(artifact.sizeInBytes)})... `);
          const success = await analyzer.deleteArtifact(repo.owner, repo.name, artifact.id);
          if (success) {
            console.log(chalk.green('✓'));
            deleted++;
          } else {
            console.log(chalk.red('✗'));
          }
          await analyzer.sleep(250); // Rate limit protection
        }
        console.log(chalk.green(`✅ Deleted ${deleted}/${oldActiveArtifacts.length} old artifacts`));
      }
    }

    // Show recommendations
    console.log(chalk.blue('\n💡 Future Prevention Tips:'));
    console.log('   • Set shorter retention in workflows: retention-days: 7');
    console.log('   • Only upload essential artifacts');
    console.log('   • Use artifact cleanup actions');
    console.log('   • Monitor storage regularly');

    if (shouldCloseRL) rl.close();
  }

  askQuestion(rl: readline.Interface, question: string): Promise<string> {
    return new Promise(resolve => {
      rl.question(question, answer => {
        resolve(answer.trim());
      });
    });
  }
}

export { ReportGenerator };