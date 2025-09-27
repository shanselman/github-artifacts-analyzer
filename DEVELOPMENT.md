# GitHub Artifacts Storage Analyzer

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env` file with your GitHub token:
   ```
   GITHUB_TOKEN=your_github_personal_access_token_here
   ```

## Quick Start

```bash
# Analyze your repositories
npm run analyze

# Interactive cleanup mode  
npm run cleanup

# Run examples
npm run example

# Analyze specific user
npm run analyze -- --username shanselman

# Get help
npm start -- --help
```

## Important Files

- **`.env`** - Your GitHub token (NEVER commit this!)
- **`src/`** - Source code (JavaScript)
- **`dist/`** - Build output (ignored by git)
- **`node_modules/`** - Dependencies (ignored by git)

## Git Safety

The `.gitignore` file protects:
- Environment variables (`.env*`)
- Dependencies (`node_modules/`)  
- Build artifacts (`dist/`, `build/`)
- Analysis outputs (`*.json`, `*.csv`)
- Temporary files

## Security Notes

- Never commit your `.env` file
- Never commit GitHub tokens
- The tool only reads repositories, it doesn't modify code
- Cleanup mode only deletes artifacts, never code or repos