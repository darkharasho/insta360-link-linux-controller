import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', minWorkers: 1, maxWorkers: 2, include: ['tests/**/*.test.ts', 'src/**/*.test.ts'] },
})
