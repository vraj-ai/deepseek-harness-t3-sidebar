import { defineConfig } from 'vitest/config'

// `tests/` holds the node:test suites (host fold, shell adapter); vitest owns `test/`.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
})
