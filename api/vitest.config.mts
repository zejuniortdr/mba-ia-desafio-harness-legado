import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Testes unitários não usam banco, mas importar config exige DATABASE_URL.
    env: { DATABASE_URL: 'postgresql://sem-banco-nos-testes-unitarios' },
  },
})
