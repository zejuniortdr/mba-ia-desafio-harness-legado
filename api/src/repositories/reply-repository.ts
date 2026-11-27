import { prisma } from './prisma'
import { ReplyWithAuthor } from '../domain/ticket'

export interface ReplyRepository {
  create(data: { ticketId: string; authorId: string; body: string }): Promise<ReplyWithAuthor>
}

class PrismaReplyRepository implements ReplyRepository {
  create(data: { ticketId: string; authorId: string; body: string }) {
    return prisma.reply.create({
      data,
      include: { author: { select: { id: true, name: true, role: true } } },
    })
  }
}

export const replyRepository = new PrismaReplyRepository()
