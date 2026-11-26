import { prisma } from './prisma'
import { TicketCategory, TicketPriority } from '../domain/ticket'

export type PendingTicket = { id: string; title: string; description: string }

export interface TriageRepository {
  findPending(limit: number): Promise<PendingTicket[]>
  markDone(id: string, result: { category: TicketCategory; priority: TicketPriority }): Promise<void>
  markFailed(id: string): Promise<void>
}

class PrismaTriageRepository implements TriageRepository {
  findPending(limit: number) {
    return prisma.ticket.findMany({
      where: { triageStatus: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
  }

  async markDone(id: string, result: { category: TicketCategory; priority: TicketPriority }) {
    await prisma.ticket.update({
      where: { id },
      data: { category: result.category, priority: result.priority, triageStatus: 'done' },
    })
  }

  async markFailed(id: string) {
    await prisma.ticket.update({ where: { id }, data: { triageStatus: 'failed' } })
  }
}

export const triageRepository = new PrismaTriageRepository()
