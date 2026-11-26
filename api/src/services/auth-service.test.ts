import { describe, expect, it } from 'vitest'
import { AuthService, EmailTakenError, InvalidCredentialsError } from './auth-service'
import type { User } from '@prisma/client'
import { NewUser, UserRepository } from '../repositories/user-repository'

class FakeUserRepository implements UserRepository {
  users: User[] = []

  async findById(id: string) {
    return this.users.find((u) => u.id === id) || null
  }

  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email) || null
  }

  async create(data: NewUser): Promise<User> {
    const user: User = { id: `u${this.users.length + 1}`, role: 'customer', createdAt: new Date(), ...data }
    this.users.push(user)
    return user
  }
}

describe('AuthService', () => {
  it('cadastra cliente sem expor o hash', async () => {
    const service = new AuthService(new FakeUserRepository())
    const user = await service.register({ name: 'Maria', email: 'maria@x.com', password: '12345678' })
    expect(user).toEqual({ id: 'u1', name: 'Maria', email: 'maria@x.com', role: 'customer' })
  })

  it('recusa e-mail repetido', async () => {
    const service = new AuthService(new FakeUserRepository())
    await service.register({ name: 'Maria', email: 'maria@x.com', password: '12345678' })
    await expect(service.register({ name: 'Outra', email: 'maria@x.com', password: '12345678' })).rejects.toBeInstanceOf(
      EmailTakenError,
    )
  })

  it('faz login com a senha certa e recusa a errada', async () => {
    const service = new AuthService(new FakeUserRepository())
    await service.register({ name: 'Maria', email: 'maria@x.com', password: '12345678' })
    const user = await service.login({ email: 'maria@x.com', password: '12345678' })
    expect(user.email).toBe('maria@x.com')
    await expect(service.login({ email: 'maria@x.com', password: 'errada123' })).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    )
  })

  it('devolve o perfil do usuário sem o hash, ou null se ele não existe', async () => {
    // Arrange
    const service = new AuthService(new FakeUserRepository())
    const created = await service.register({ name: 'Maria', email: 'maria@x.com', password: '12345678' })

    // Act
    const profile = await service.getProfile(created.id)
    const missing = await service.getProfile('nao-existe')

    // Assert
    expect(profile).toEqual({ id: created.id, name: 'Maria', email: 'maria@x.com', role: 'customer' })
    expect(missing).toBeNull()
  })
})
