# Repository Guidelines

## Project Structure & Module Organization
- `src/`: Core library code (graph nodes, edges, schedulers, adapters).
- `tests/` or `src/**/__tests__/`: Unit/integration tests co-located or centralized.
- `examples/`: Small runnable demos showcasing API usage.
- `assets/`: Sample audio files, presets, fixtures (keep small; prefer links or LFS).
- `docs/`: Design notes and public docs.
- `scripts/`: Dev/build/maintenance scripts.
- `dist/`: Build output (generated; do not edit).

## Build, Test, and Development Commands
Initialize the project with your package manager, then use these conventional scripts (add them to `package.json`):
- `npm install` / `pnpm install`: Install dependencies.
- `npm run dev`: Start local playground or example server.
- `npm run build`: Type-check and compile to `dist/`.
- `npm test`: Run unit tests; prefer coverage via `--coverage`.
- `npm run lint` / `npm run format`: Lint and auto-format the codebase.

Example `package.json` snippet:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run --coverage",
    "lint": "eslint .",
    "format": "prettier -w ."
  }
}
```

## Coding Style & Naming Conventions
- Language: TypeScript preferred; enable `strict` in `tsconfig.json`.
- Indentation: 2 spaces; max line length 100–120.
- Files: kebab-case (`audio-graph-node.ts`); tests `*.test.ts`.
- Symbols: `camelCase` for vars/functions, `PascalCase` for classes/types, `SCREAMING_SNAKE_CASE` for immutable constants.
- Tooling: ESLint (typescript-eslint), Prettier; run before commit.

## Testing Guidelines
- Framework: Vitest or Jest; target >=80% line coverage for `src/`.
- Structure: Mirror `src/` in `tests/` or co-locate under `__tests__/`.
- Naming: `foo-bar.test.ts` tests `foo-bar.ts`.
- Mocks: Prefer lightweight fakes; avoid global state. Include edge cases and timing/scheduling behaviors.

## Commit & Pull Request Guidelines
- Commits: Use Conventional Commits (e.g., `feat: add DelayNode` / `fix(graph): handle cycle detection`).
- PRs: Small, focused; include description, linked issues, and before/after notes or screenshots for examples.
- Checklist: Lint passes, tests/coverage updated, docs/examples updated, no snapshot churn.

## Security & Configuration Tips
- Do not commit secrets; use `.env.local` (gitignored). Validate inputs on public APIs.
- Large media: Prefer remote URLs or Git LFS; keep repository lean.
- Node version: record via `.nvmrc` and `engines` in `package.json`.

## Architecture Overview (Intended)
- Core graph engine (immutable descriptors + runtime graph), adapters (Web Audio API), and utilities. Keep modules small, pure, and well-typed.

If anything is missing, open an issue proposing scripts or structure before implementing.
