// Raiz de composição: liga repositórios e integrações aos serviços.
// main.ts entrega o resultado ao createApp; o worker usa o mesmo ponto de montagem.
import { attachmentRepository } from './repositories/attachment-repository'
import { pingDatabase } from './repositories/prisma'
import { replyRepository } from './repositories/reply-repository'
import { statsRepository } from './repositories/stats-repository'
import { ticketRepository } from './repositories/ticket-repository'
import { userRepository } from './repositories/user-repository'
import { AttachmentService } from './services/attachment-service'
import { AuthService } from './services/auth-service'
import { StatsService } from './services/stats-service'
import { SuggestionService } from './services/suggestion-service'
import { TicketService } from './services/ticket-service'

export function buildServices() {
  const tickets = new TicketService(ticketRepository, replyRepository)
  return {
    auth: new AuthService(userRepository),
    tickets,
    attachments: new AttachmentService(attachmentRepository, tickets),
    stats: new StatsService(statsRepository),
    suggestions: new SuggestionService(tickets, userRepository),
    health: { checkDatabase: pingDatabase },
  }
}
