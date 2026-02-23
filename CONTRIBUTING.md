# Contributing

Thanks for your interest in contributing to openclaw-orchestrator!

## Development Setup

```bash
# Clone the repo
git clone https://github.com/zeynepyorulmaz/openclaw-orchestrator.git
cd openclaw-orchestrator

# Install dependencies
pnpm install

# Run tests
pnpm test

# Type-check without emitting
pnpm check

# Build
pnpm build

# Start the dashboard in dev mode
pnpm serve -g ws://your-gateway:port/ -t YOUR_TOKEN
```

### Prerequisites

- Node.js 22+
- pnpm (or npm/yarn)

## Project Structure

```
src/
  orchestrator.ts      # Core adaptive loop (think → execute → repeat)
  cli.ts               # CLI commands (run, plan, serve, agents, gateways)
  agents/              # Agent adapters (openclaw, http, function)
  gateway/             # WebSocket gateway client and registry
  planner/             # Task graph types and validation
  executor/            # Parallel task execution engine
  ui/                  # Dashboard server and HTML frontend
  utils/               # Logger, retry helper
test/                  # Vitest test suites
```

## Making Changes

1. Fork the repo and create a feature branch
2. Make your changes
3. Run `pnpm check && pnpm test` to verify
4. Submit a pull request

## Guidelines

- Keep dependencies minimal — the project intentionally has only 2 runtime deps
- Write tests for new functionality
- Follow existing code patterns and TypeScript conventions
- The dashboard is a single self-contained HTML file — no build step, no npm packages
