import { describe, expect, it } from 'vitest'
import { TriageService } from './triage-service'
import { PendingTicket, TriageRepository } from '../repositories/triage-repository'
import { Classification } from '../integrations/ai-client'

class FakeTriageRepository implements TriageRepository {
  done: Record<string, Classification> = {}
  failed: string[] = []

  constructor(private pending: PendingTicket[]) {}

  async findPending() {
    return this.pending
  }

  async markDone(id: string, result: Classification) {
    this.done[id] = result
  }

  async markFailed(id: string) {
    this.failed.push(id)
  }
}

describe('TriageService', () => {
  it('classifica os pendentes pelo modo fake e marca falha quando a IA falha', async () => {
    // Arrange
    const repo = new FakeTriageRepository([
      { id: 't1', title: 'Fatura com valor errado', description: 'Cobrança urgente' },
      { id: 't2', title: '[falha-ia] teste', description: 'qualquer coisa' },
    ])
    const service = new TriageService(repo)

    // Act
    await service.runOnce()

    // Assert
    expect(repo.done).toEqual({ t1: { category: 'billing', priority: 'urgent' } })
    expect(repo.failed).toEqual(['t2'])
  })
})
