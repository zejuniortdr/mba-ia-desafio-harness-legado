import { describe, expect, it } from 'vitest'
import { StatsService } from './stats-service'
import { StatsRepository, TicketCountField } from '../repositories/stats-repository'

function fakeStats(rows: Record<TicketCountField, { key: string | null; count: number }[]>): StatsRepository {
  return { countTicketsBy: async (field) => rows[field] }
}

describe('StatsService', () => {
  it('soma por status, categoria e prioridade com zeros e untriaged', async () => {
    // Arrange
    const service = new StatsService(
      fakeStats({
        status: [{ key: 'open', count: 2 }, { key: 'resolved', count: 1 }],
        category: [{ key: 'billing', count: 1 }, { key: null, count: 2 }],
        priority: [{ key: 'urgent', count: 1 }, { key: null, count: 2 }],
      }),
    )

    // Act
    const stats = await service.getStats()

    // Assert
    expect(stats).toEqual({
      byStatus: { open: 2, in_progress: 0, resolved: 1 },
      byCategory: { billing: 1, technical: 0, account: 0, other: 0, untriaged: 2 },
      byPriority: { low: 0, medium: 0, high: 0, urgent: 1, untriaged: 2 },
    })
  })
})
