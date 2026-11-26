import { AttachmentService } from '../services/attachment-service'
import { AuthService } from '../services/auth-service'
import { StatsService } from '../services/stats-service'
import { SuggestionService } from '../services/suggestion-service'
import { TicketService } from '../services/ticket-service'

// O que as rotas precisam. Quem monta (com os repositórios) é api/src/composition.ts.
export type AppServices = {
  auth: AuthService
  tickets: TicketService
  attachments: AttachmentService
  stats: StatsService
  suggestions: SuggestionService
  health: { checkDatabase(): Promise<unknown> }
}
