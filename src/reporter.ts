import Table from 'cli-table3';
import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { OverallAnalysis, RepositoryAnalysis, ArtifactInfo } from './analyzer';

export interface ReportOptions {
  format: 'table' | 'json' | 'csv';
  outputFile?: string;
  topCount?: number;
}

export interface RepositoryReportOptions {
  format: 'table' | 'json' | 'csv';
}

export class ReportGenerator {
  async generateReport(analysis: OverallAnalysis, options: ReportOptions): Promise<void> {
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

  async generateRepositoryReport(analysis: RepositoryAnalysis, options: RepositoryReportOptions): Promise<void> {
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

  private generateTableReport(analysis: OverallAnalysis, topCount: number): void {
    // Summary table
    console.log(chalk.bold.blue('\n🚀 GitHub Artifacts Storage Analysis Summary'));
    console.log(chalk.gray('=' .repeat(60)));

    const summaryTable = new Table({
      head: ['Metric', 'Value'],
      style: { head: ['cyan'] }
    });

    summaryTable.push(
      ['Total Repositories', analysis.summary.totalRepositories.toLocaleString()],
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
      console.log(chalk.gray('=' .repeat(80)));

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
        console.log(chalk.gray('=' .repeat(80)));

        this.showArtifactDetails(topRepos[0].artifacts.slice(0, 20)); // Show top 20 artifacts
      }

      // Storage recommendations
      this.generateRecommendations(analysis);
    }
  }

  private generateRepositoryTableReport(analysis: RepositoryAnalysis): void {
    console.log(chalk.bold.blue(`\n📊 Repository Analysis: ${analysis.fullName}`));
    console.log(chalk.gray('=' .repeat(60)));

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
      console.log(chalk.gray('=' .repeat(80)));

      this.showArtifactDetails(analysis.artifacts);
    }
  }

  private showArtifactDetails(artifacts: ArtifactInfo[]): void {
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

  private generateJsonReport(analysis: OverallAnalysis, outputFile?: string): void {
    const jsonOutput = JSON.stringify(analysis, null, 2);
    
    if (outputFile) {
      writeFileSync(outputFile, jsonOutput);
      console.log(chalk.green(`✅ JSON report saved to: ${outputFile}`));
    } else {
      console.log(jsonOutput);
    }
  }

  private generateCsvReport(analysis: OverallAnalysis, outputFile?: string): void {
    const csvLines = ['Repository,Workflows,Total Artifacts,Total Size (Bytes),Active Artifacts,Active Size (Bytes),Expired Artifacts,Expired Size (Bytes)'];
    
    for (const repo of analysis.repositories.filter(r => r.totalSizeBytes > 0)) {
      csvLines.push([
        repo.fullName,
        repo.workflows.length.toString(),
        repo.totalArtifacts.toString(),
        repo.totalSizeBytes.toString(),
        repo.activeArtifacts.toString(),
        repo.activeSizeBytes.toString(),
        repo.expiredArtifacts.toString(),
        repo.expiredSizeBytes.toString()
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

  private generateRepositoryCsvReport(analysis: RepositoryAnalysis): void {
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

  private generateRecommendations(analysis: OverallAnalysis): void {
    console.log(chalk.bold.blue('\n💡 Storage Optimization Recommendations'));
    console.log(chalk.gray('=' .repeat(60)));

    const recommendations: string[] = [];

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
      console.log(chalk.gray('=' .repeat(40)));
      console.log(chalk.gray('To delete expired artifacts, you can use the GitHub CLI:'));
      console.log(chalk.white('gh api -X DELETE /repos/OWNER/REPO/actions/artifacts/ARTIFACT_ID'));
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: '2-digit',
      year: '2-digit'
    });
  }

  private daysSince(date: Date): number {
    return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  }
}