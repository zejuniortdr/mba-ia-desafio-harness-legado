import { describe, expect, it } from 'vitest'
import { SuggestionService } from './suggestion-service'
import { TicketService } from './ticket-service'
import { CurrentUser, Ticket } from '../domain/ticket'
import { UserRepository } from '../repositories/user-repository'

const ticket = { id: 't1', title: 'Boleto', description: 'Não chegou', customerId: 'c1' } as Ticket
const agent: CurrentUser = { id: 'a1', role: 'agent' }
const customer: CurrentUser = { id: 'c1', role: 'customer' }
const tickets = { getById: async () => ticket } as unknown as TicketService

function users(name: string | null): UserRepository {
  return { findById: async () => (name ? { name } : null) } as unknown as UserRepository
}

describe('SuggestionService', () => {
  it('sugere a resposta fake com o nome do cliente', async () => {
    // Arrange
    const service = new SuggestionService(tickets, users('Carlos'))

    // Act
    const suggestion = await service.suggest(agent, 't1')

    // Assert
    expect(suggestion).toBe('Olá, Carlos! Recebemos o seu chamado "Boleto" e a nossa equipe já está analisando.')
  })

  it('usa "cliente" quando o cliente não existe mais', async () => {
    // Arrange
    const service = new SuggestionService(tickets, users(null))

    // Act
    const suggestion = await service.suggest(agent, 't1')

    // Assert
    expect(suggestion).toContain('Olá, cliente!')
  })

  it('recusa pedido de cliente com 403 forbidden', async () => {
    // Arrange
    const service = new SuggestionService(tickets, users('Carlos'))

    // Act
    const result = service.suggest(customer, 't1')

    // Assert
    await expect(result).rejects.toMatchObject({ status: 403, code: 'forbidden' })
  })
})
