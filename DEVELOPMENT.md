# GitHub Artifacts Storage Analyzer

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. **Build TypeScript**: `npm run build`
4. Set up your GitHub token:
   
   **Option A: Use GitHub CLI (Recommended)**
   ```bash
   export GITHUB_TOKEN=$(gh auth token)
   ```
   
   **Option B: Create `.env` file**
   ```
   GITHUB_TOKEN=your_github_personal_access_token_here
   ```

> **TypeScript Project**: Source code is in `src/` (TypeScript), compiled output in `dist/` (JavaScript)

## Quick Start

```bash
# Build TypeScript to JavaScript
npm run build

# Analyze your repositories  
npm run analyze

# Interactive cleanup mode  
npm run cleanup

# Run examples
npm run example

# Development mode (build + run)
npm run dev

# Analyze specific user
npm run analyze -- --username shanselman

# Get help
npm start -- --help
```

## TypeScript Development

```bash
# Build TypeScript source files
npm run build

# Watch mode (rebuild on file changes) 
npx tsc --watch

# Run directly after building
npm run dev
```

## Important Files

- **`.env`** - Your GitHub token (NEVER commit this!)
- **`src/`** - TypeScript source code  
- **`dist/`** - Compiled JavaScript output (ignored by git)
- **`tsconfig.json`** - TypeScript configuration
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

## TypeScript Development Workflow

### Making Changes
1. Edit TypeScript files in `src/`
2. Run `npm run build` to compile
3. Test with `npm run start -- --help`

### Development Commands
```bash
# One-time build
npm run build

# Watch mode (rebuild on file changes)
npx tsc --watch

# Build and run (development mode)
npm run dev

# Clean build (remove dist first)
rm -rf dist && npm run build
```

### Project Structure
```
src/           # TypeScript source files (.ts)
├── analyzer.ts    # Main analysis logic
├── index.ts       # CLI entry point  
├── reporter.ts    # Output formatting

dist/          # Compiled JavaScript (.js + .d.ts)
├── analyzer.js    # Compiled from analyzer.ts
├── index.js       # Compiled from index.ts
├── reporter.js    # Compiled from reporter.ts
└── *.d.ts         # TypeScript type definitions
```