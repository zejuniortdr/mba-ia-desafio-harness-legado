import { prisma } from './prisma'

export type TicketCountField = 'status' | 'category' | 'priority'

export interface StatsRepository {
  countTicketsBy(field: TicketCountField): Promise<{ key: string | null; count: number }[]>
}

class PrismaStatsRepository implements StatsRepository {
  async countTicketsBy(field: TicketCountField) {
    const rows = await prisma.ticket.groupBy({ by: [field], _count: { _all: true } })
    return rows.map((row) => ({ key: row[field], count: row._count._all }))
  }
}

export const statsRepository = new PrismaStatsRepository()
