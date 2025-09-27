# GitHub Artifacts Storage Analyzer

[![GitHub](https://img.shields.io/github/license/shanselman/github-artifacts-analyzer)](https://github.com/shanselman/github-artifacts-analyzer/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/shanselman/github-artifacts-analyzer)](https://github.com/shanselman/github-artifacts-analyzer/issues)
[![GitHub stars](https://img.shields.io/github/stars/shanselman/github-artifacts-analyzer)](https://github.com/shanselman/github-artifacts-analyzer/stargazers)

> 🧹 **Analyze and cleanup GitHub Actions artifacts storage usage across all your repositories.**

Find what's consuming your 2GB GitHub storage quota with detailed reporting and interactive cleanup.

## 🎯 Problem Solved

GitHub gives you 2GB of free storage for Actions artifacts, but it's easy to lose track of what's using that space across all your repositories. This tool:

- 🔍 **Finds ALL artifacts** across public AND private repositories
- 📊 **Shows detailed storage breakdown** by repository and artifact
- 🧹 **Provides safe interactive cleanup** with confirmation prompts
- 💡 **Gives actionable recommendations** for preventing future bloat

## ⚡ Quick Start

```bash
# Install dependencies
npm install

# Create .env file with your GitHub token
echo "GITHUB_TOKEN=your_github_personal_access_token_here" > .env

# Analyze your storage usage
npm run analyze

# Interactive cleanup mode (SAFE - asks before deleting)
npm run cleanup
```

## 📸 Example Output

```
🚀 GitHub Artifacts Storage Analysis Summary
============================================================
┌─────────────────────────────┬──────────────┐
│ Metric                      │ Value        │
├─────────────────────────────┼──────────────┤
│ Total Storage Used          │ 3.04 GB      │
│ Repositories with Artifacts │ 4            │
│ Total Artifacts             │ 25           │
│ Expired Artifacts           │ 5 (853 MB)   │
└─────────────────────────────┴──────────────┘

📊 Top Repositories by Storage Usage
┌──────────────────────────────┬───────────────┐
│ Repository                   │ Total Size    │
├──────────────────────────────┼───────────────┤
│ yourname/big-project         │ 2.8 GB        │
│ yourname/other-project       │ 240 MB        │
└──────────────────────────────┴───────────────┘

💡 Storage Optimization Recommendations
1. 🗑️ Clean up expired artifacts to save 853 MB
2. 📅 Consider cleaning artifacts older than 30 days
```

---

*Created by [@shanselman](https://github.com/shanselman) to solve the mystery of disappearing GitHub storage quota.*