#!/bin/bash

# GitHub Artifacts Storage Analyzer - Example Usage Script
# This script demonstrates various ways to use the tool

echo "🚀 GitHub Artifacts Storage Analyzer - Example Usage"
echo "=================================================="
echo

# Check if GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ Error: GITHUB_TOKEN environment variable is not set"
    echo "Please set your GitHub Personal Access Token:"
    echo "export GITHUB_TOKEN='your_token_here'"
    echo
    echo "Or create a .env file with:"
    echo "GITHUB_TOKEN=your_token_here"
    exit 1
fi

echo "✅ GitHub token found"
echo

# Build the project
echo "🔨 Building the project..."
npm run build
echo

# Example 1: Basic analysis
echo "📊 Example 1: Basic analysis of all repositories"
echo "Command: github-artifacts analyze"
echo "================================================"
npm run start -- analyze
echo

# Example 2: Analyze specific user with more details
echo "📊 Example 2: Analyze specific user (shanselman) with top 5 repos"
echo "Command: github-artifacts analyze --username shanselman --top 5"
echo "=============================================================="
npm run start -- analyze --username shanselman --top 5
echo

# Example 3: Include expired artifacts
echo "📊 Example 3: Include expired artifacts in analysis"
echo "Command: github-artifacts analyze --include-expired --top 3"
echo "========================================================="
npm run start -- analyze --include-expired --top 3
echo

# Example 4: Export to JSON
echo "📊 Example 4: Export analysis to JSON file"
echo "Command: github-artifacts analyze --format json --output analysis.json"
echo "=================================================================="
npm run start -- analyze --format json --output analysis.json
echo "✅ Results saved to analysis.json"
echo

# Example 5: Export to CSV
echo "📊 Example 5: Export analysis to CSV file"
echo "Command: github-artifacts analyze --format csv --output analysis.csv"
echo "================================================================="
npm run start -- analyze --format csv --output analysis.csv
echo "✅ Results saved to analysis.csv"
echo

# Example 6: Analyze single repository (if hanselminutes-core exists)
echo "📊 Example 6: Analyze single repository"
echo "Command: github-artifacts repo shanselman hanselminutes-core"
echo "============================================================"
npm run start -- repo shanselman hanselminutes-core
echo

echo "🎉 Examples completed!"
echo
echo "💡 Tips:"
echo "- Use --include-expired to see all artifacts (including expired ones)"
echo "- Use --min-size to filter out small artifacts"
echo "- Use --format json or csv for programmatic processing"
echo "- Check analysis.json and analysis.csv files for exported data"
echo
echo "📚 For more information, see README.md or run:"
echo "npm run start -- --help"