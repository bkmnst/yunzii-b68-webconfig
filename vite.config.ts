import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/yunzii-b68-webconfig/',
  define: {
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
