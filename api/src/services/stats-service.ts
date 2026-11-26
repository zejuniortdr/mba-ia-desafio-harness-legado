import { StatsRepository } from '../repositories/stats-repository'

type Counts = Record<string, number>

export class StatsService {
  constructor(private stats: StatsRepository) {}

  async getStats() {
    const [statusRows, categoryRows, priorityRows] = await Promise.all([
      this.stats.countTicketsBy('status'),
      this.stats.countTicketsBy('category'),
      this.stats.countTicketsBy('priority'),
    ])

    const byStatus: Counts = { open: 0, in_progress: 0, resolved: 0 }
    statusRows.forEach((row) => {
      byStatus[row.key as string] = row.count
    })

    const byCategory: Counts = { billing: 0, technical: 0, account: 0, other: 0, untriaged: 0 }
    categoryRows.forEach((row) => {
      byCategory[row.key || 'untriaged'] = row.count
    })

    const byPriority: Counts = { low: 0, medium: 0, high: 0, urgent: 0, untriaged: 0 }
    priorityRows.forEach((row) => {
      byPriority[row.key || 'untriaged'] = row.count
    })

    return { byStatus, byCategory, byPriority }
  }
}
