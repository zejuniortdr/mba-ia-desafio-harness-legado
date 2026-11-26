import { describe, expect, it } from 'vitest'
import { AttachmentService } from './attachment-service'
import { TicketService } from './ticket-service'
import { AppError } from '../domain/errors'
import { CurrentUser } from '../domain/ticket'
import { UploadedFile } from '../domain/upload'
import { AttachmentRepository } from '../repositories/attachment-repository'

const ticket = { id: 't1', customerId: 'c1' }
const owner: CurrentUser = { id: 'c1', role: 'customer' }
const stranger: CurrentUser = { id: 'c2', role: 'customer' }

function fakeTicketService() {
  return {
    getById: async (user: CurrentUser, id: string) => {
      if (id !== ticket.id || (user.role === 'customer' && user.id !== ticket.customerId)) {
        throw new AppError(404, 'not_found', 'Chamado não encontrado')
      }
      return ticket
    },
  } as unknown as TicketService
}

const fakeAttachments = {
  create: async (data: Parameters<AttachmentRepository['create']>[0]) => ({ id: 'att1', createdAt: new Date(), ...data }),
  findById: async () => null,
} as AttachmentRepository

function file(overrides: Partial<UploadedFile>): UploadedFile {
  return { size: 10, mimetype: 'text/plain', originalname: 'a.txt', buffer: Buffer.from(''), ...overrides }
}

describe('AttachmentService', () => {
  const service = new AttachmentService(fakeAttachments, fakeTicketService())

  it('exige arquivo', async () => {
    // Act
    const result = service.upload(owner, 't1', undefined)

    // Assert
    await expect(result).rejects.toMatchObject({ status: 422 })
  })

  it('recusa arquivo maior que 5 MB', async () => {
    // Act
    const result = service.upload(owner, 't1', file({ size: 5 * 1024 * 1024 + 1 }))

    // Assert
    await expect(result).rejects.toMatchObject({ status: 413, code: 'file_too_large' })
  })

  it('recusa tipo não suportado', async () => {
    // Act
    const result = service.upload(owner, 't1', file({ mimetype: 'image/gif', originalname: 'a.gif' }))

    // Assert
    await expect(result).rejects.toMatchObject({ status: 415, code: 'unsupported_type' })
  })

  it('não deixa outro cliente enviar', async () => {
    // Act
    const result = service.upload(stranger, 't1', file({}))

    // Assert
    await expect(result).rejects.toMatchObject({ status: 404 })
  })
})
