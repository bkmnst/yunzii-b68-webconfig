import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/yunzii-b68-webconfig/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
