import { AppError } from '../domain/errors'
import { CurrentUser } from '../domain/ticket'
import { suggestReply } from '../integrations/ai-client'
import { UserRepository } from '../repositories/user-repository'
import { TicketService } from './ticket-service'

export class SuggestionService {
  constructor(
    private tickets: TicketService,
    private users: UserRepository,
  ) {}

  async suggest(user: CurrentUser, ticketId: string) {
    if (user.role === 'customer') {
      throw new AppError(403, 'forbidden', 'Só atendentes e admins podem pedir sugestão')
    }
    const ticket = await this.tickets.getById(user, ticketId)
    const customer = await this.users.findById(ticket.customerId)
    const customerName = customer ? customer.name : 'cliente'
    return suggestReply({ customerName, title: ticket.title, description: ticket.description })
  }
}
