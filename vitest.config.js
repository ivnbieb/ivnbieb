import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    env: {
      BASEROW_TOKEN: 'test-token',
      BASEROW_TOKEN_READONLY: 'test-token-readonly',
      BASEROW_TABLE_BOEKEN: '111',
      BASEROW_TABLE_UITLENINGEN: '222',
    },
  },
})
