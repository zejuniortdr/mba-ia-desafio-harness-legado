import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

describe('parseEnv', () => {
  it('usa IA fake e os padrões de hoje quando só o banco é informado', () => {
    // Arrange
    const source = { DATABASE_URL: 'postgresql://x' }

    // Act
    const env = parseEnv(source)

    // Assert
    expect(env.AI_MODE).toBe('fake')
    expect(env.PORT).toBe(4000)
    expect(env.JWT_SECRET).toBe('dev-secret')
    expect(env.UPLOAD_DIR).toBe('/tmp/balcao/uploads')
    expect(env.WEB_ORIGIN).toBe('http://localhost:5173')
    expect(env.TRIAGE_INTERVAL_MS).toBe(2000)
  })

  it('converte porta e intervalo informados para número', () => {
    // Arrange
    const source = { DATABASE_URL: 'postgresql://x', PORT: '4100', TRIAGE_INTERVAL_MS: '500', AI_MODE: 'openai' }

    // Act
    const env = parseEnv(source)

    // Assert
    expect(env.PORT).toBe(4100)
    expect(env.TRIAGE_INTERVAL_MS).toBe(500)
    expect(env.AI_MODE).toBe('openai')
  })
})
