# GitHub Artifacts Storage Analyzer

[![GitHub](https://img.shields.io/github/license/shanselman/github-artifacts-analyzer)](https://github.com/shanselman/github-artifacts-analyzer/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/shanselman/github-artifacts-analyzer)](https://github.com/shanselman/github-artifacts-analyzer/issues)
[![GitHub stars](https://img.shields.io/github/stars/shanselman/github-artifacts-analyzer)](https://github.com/shanselman/github-artifacts-analyzer/stargazers)

A command-line tool to analyze GitHub repository artifacts and identify what's consuming your GitHub Actions storage quota.

## 🚀 Features

- **Complete Repository Analysis**: Scans ALL your repositories (public AND private) for GitHub Actions workflows and artifacts
- **Storage Usage Breakdown**: Shows exactly how much storage each repository is using
- **Artifact Details**: Lists individual artifacts with sizes, creation dates, and expiration status
- **Smart Recommendations**: Provides actionable advice for optimizing storage usage
- **Multiple Output Formats**: Supports table, JSON, and CSV output formats
- **Expired Artifact Detection**: Identifies artifacts that can be safely removed
- **Interactive Cleanup Mode**: Built-in artifact deletion with safety prompts
- **Rate Limit Friendly**: Respects GitHub API rate limits with intelligent throttling

## 📦 Installation

### Global Installation (Recommended)
```bash
npm install -g github-artifacts-analyzer
```

### Local Development
```bash
git clone https://github.com/shanselman/github-artifacts-analyzer.git
cd github-artifacts-analyzer
npm install
npm run build
```

> **📝 TypeScript Project**: Source files are in `src/` (TypeScript), compiled output in `dist/` (JavaScript). Always run `npm run build` after changes.

## 🔧 Setup

### 1. Create a GitHub Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select these scopes:
   - `repo` (Full control of private repositories)
   - `read:user` (Read access to user profile data)
   - `actions:read` (Read access to actions and workflows)
   - `read:org` (Read organization membership - required for organization analysis)

### 2. Set Environment Variable (Recommended)

#### Option A: Use GitHub CLI (Easiest)
```bash
export GITHUB_TOKEN=$(gh auth token)
```

#### Option B: Manual Token
```bash
export GITHUB_TOKEN="your_token_here"
```

Or create a `.env` file:
```
GITHUB_TOKEN=your_token_here
```

## 💻 Usage

### Analyze All Repositories
```bash
# Build first (required for TypeScript)
npm run build

# Basic analysis (includes both public and private repos)
github-artifacts analyze

# Or use npm scripts (includes build step)
npm run analyze

# Analyze specific user
npm run analyze -- --username shanselman

# Include expired artifacts
github-artifacts analyze --include-expired

# Show top 20 repositories
github-artifacts analyze --top 20

# Export to JSON
github-artifacts analyze --format json --output results.json

# Export to CSV
github-artifacts analyze --format csv --output results.csv

# Interactive cleanup mode - DELETE artifacts to save space
github-artifacts analyze --cleanup
```

### Analyze Organization
```bash
# Analyze all repositories in an organization
github-artifacts analyze-org my-company-org

# Show top 20 repositories
github-artifacts analyze-org my-org --top 20

# Export to JSON
github-artifacts analyze-org my-org --format json --output org-results.json

# Interactive cleanup mode for organization
github-artifacts analyze-org my-org --cleanup
```

### Analyze Specific Repository
```bash
# Analyze a single repository
github-artifacts repo shanselman hanselminutes-core

# Include expired artifacts
github-artifacts repo shanselman hanselminutes-core --include-expired

# JSON output
github-artifacts repo shanselman hanselminutes-core --format json

# Interactive cleanup mode for this repository
github-artifacts repo shanselman hanselminutes-core --cleanup
```

### Command Line Options

#### Global Options
- `-t, --token <token>`: GitHub Personal Access Token (or set GITHUB_TOKEN env var)

#### Analyze Command Options
- `-u, --username <username>`: GitHub username (defaults to authenticated user)
- `-f, --format <format>`: Output format (table|json|csv) [default: table]
- `-o, --output <file>`: Output file path
- `--include-expired`: Include expired artifacts in analysis [default: false]
- `--min-size <bytes>`: Minimum artifact size to include in bytes [default: 0]
- `--top <count>`: Show top N repositories by storage usage [default: 10]
- `--cleanup`: Interactive cleanup mode - delete artifacts to save space [default: false]

#### Analyze Organization Command Options
- `-f, --format <format>`: Output format (table|json|csv) [default: table]
- `-o, --output <file>`: Output file path
- `--include-expired`: Include expired artifacts in analysis [default: false]
- `--min-size <bytes>`: Minimum artifact size to include in bytes [default: 0]
- `--top <count>`: Show top N repositories by storage usage [default: 10]
- `--cleanup`: Interactive cleanup mode - delete artifacts to save space [default: false]

#### Repository Command Options
- `-f, --format <format>`: Output format (table|json|csv) [default: table]
- `--include-expired`: Include expired artifacts in analysis [default: false]
- `--cleanup`: Interactive cleanup mode for this repository [default: false]

## 📊 Sample Output

```
🚀 GitHub Artifacts Storage Analysis Summary
============================================================
┌─────────────────────────────┬──────────┐
│ Metric                      │ Value    │
├─────────────────────────────┼──────────┤
│ Total Repositories          │ 121      │
│ Repositories with Workflows │ 15       │
│ Repositories with Artifacts │ 8        │
│ Total Artifacts             │ 234      │
│ Total Storage Used          │ 1.87 GB  │
│ Active Artifacts            │ 156 (1.2 GB) │
│ Expired Artifacts           │ 78 (670 MB)  │
└─────────────────────────────┴──────────┘

📊 Top 10 Repositories by Storage Usage
================================================================================
┌────────────────────────────┬──────────┬──────────┬─────────────┬─────────────┬─────────────┐
│ Repository                 │ Workflows│ Artifacts│ Total Size  │ Active Size │ Expired Size│
├────────────────────────────┼──────────┼──────────┼─────────────┼─────────────┼─────────────┤
│ shanselman/hanselminutes-core │ 3      │ 45       │ 678.5 MB    │ 456.2 MB    │ 222.3 MB    │
│ shanselman/TinyOS          │ 1        │ 23       │ 234.1 MB    │ 156.7 MB    │ 77.4 MB     │
│ shanselman/babysmash       │ 2        │ 12       │ 123.4 MB    │ 89.2 MB     │ 34.2 MB     │
└────────────────────────────┴──────────┴──────────┴─────────────┴─────────────┴─────────────┘
```

## 🎯 Understanding the Output

### Repository Analysis
- **Workflows**: Number of GitHub Actions workflows in the repository
- **Artifacts**: Total number of artifacts across all workflow runs
- **Total Size**: Combined size of all artifacts (active + expired)
- **Active Size**: Size of artifacts that haven't expired yet
- **Expired Size**: Size of artifacts that have expired and can be deleted

### Artifact Details
- **Name**: Artifact name as specified in the workflow
- **Size**: Storage space consumed by the artifact
- **Workflow**: Name of the workflow that created the artifact
- **Created**: When the artifact was created
- **Expires**: When the artifact will expire
- **Status**: Whether the artifact is active or expired

## 🧹 Interactive Cleanup Mode

The tool includes a powerful interactive cleanup feature that safely deletes artifacts:

```bash
# Analyze and cleanup all repositories
github-artifacts analyze --cleanup

# Cleanup specific repository  
github-artifacts repo shanselman hanselminutes-core --cleanup
```

### What Cleanup Mode Does:
1. **Identifies Safe Deletions**: Finds expired artifacts and old active artifacts
2. **Shows Potential Savings**: Calculates how much space you'll free up
3. **Interactive Prompts**: Asks for confirmation before deleting anything
4. **Rate Limited**: Respects GitHub API limits during deletion
5. **Progress Feedback**: Shows real-time deletion progress

### Cleanup Categories:
- **Expired Artifacts**: Always safe to delete, frees up space immediately
- **Old Active Artifacts**: Artifacts older than 30 days that might not be needed
- **Large Artifacts**: Highlights unusually large artifacts for review

The tool will NEVER delete anything without your explicit confirmation.

### 2. Optimize Workflow Artifacts
- Compress files before uploading as artifacts
- Use selective file inclusion patterns
- Set shorter retention periods for temporary artifacts
- Clean up build artifacts between jobs when possible

### 3. Review Large Artifacts
The tool highlights artifacts larger than 50MB. Consider:
- Breaking large artifacts into smaller pieces
- Using external storage for large files
- Optimizing build outputs

### 4. Implement Cleanup Workflows
Create workflows that automatically clean up old artifacts:
```yaml
name: Cleanup Artifacts
on:
  schedule:
    - cron: '0 0 * * 0' # Weekly
jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Delete old artifacts
        uses: c-hive/gha-remove-artifacts@v1
        with:
          age: '30 days'
```

## 🛠️ Development

### Prerequisites
- Node.js 18+ 
- TypeScript
- GitHub Personal Access Token

### Setup
```bash
git clone <repository>
cd github-artifacts-analyzer
npm install
```

### Development Commands
```bash
npm run dev          # Run in development mode
npm run build        # Build TypeScript
npm run start        # Run built version
npm run clean        # Clean build directory
```

### Testing
```bash
# Test with your own repositories
npm run dev -- analyze --username YOUR_USERNAME

# Test single repository
npm run dev -- repo YOUR_USERNAME YOUR_REPO
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details.

## 🐛 Troubleshooting

### Common Issues

**"API rate limit exceeded"**
- The tool includes built-in rate limiting, but with many repositories, you might hit limits
- Wait and try again, or run the analysis in smaller batches

**"Repository not found or no access"**
- Ensure your token has the correct permissions
- Check that the repository exists and you have access

**"Access forbidden - check token permissions"**
- Verify your token has `repo`, `read:user`, and `actions:read` scopes
- For organization repositories, you also need the `read:org` scope
- Some organizations require SSO authorization for tokens - you may need to authorize your token

**"No artifacts found"**
- Repository might not have any GitHub Actions workflows
- Workflows might not generate artifacts
- Artifacts might have all expired

### Getting Help

1. Check the GitHub API status: https://www.githubstatus.com/
2. Verify your token permissions
3. Try analyzing a single repository first
4. Open an issue with detailed error messages

## 📈 Roadmap

- [x] Organization-wide analysis
- [ ] Bulk artifact deletion functionality
- [ ] Integration with GitHub CLI
- [ ] Webhook support for real-time monitoring
- [ ] Dashboard web interface
- [ ] Artifact content analysis
- [ ] Cost estimation features

---

Made with ❤️ for the set of all developers who are Scott Hanselman
