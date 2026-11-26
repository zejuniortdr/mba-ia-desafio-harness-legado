import { Router } from 'express'
import { asyncHandler } from '../errors'
import { currentUser, requireAuth, signToken } from '../middlewares/auth'
import { AppServices } from '../services'
import { AppError } from '../../domain/errors'
import { EmailTakenError, InvalidCredentialsError, loginSchema, registerSchema } from '../../services/auth-service'

export function authRoutes({ auth }: AppServices) {
  const router = Router()

  router.post(
    '/register',
    asyncHandler(async (req, res) => {
      const parsed = registerSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new AppError(422, 'validation_error', parsed.error.issues[0].message)
      }
      try {
        const user = await auth.register(parsed.data)
        res.status(201).json(user)
      } catch (err) {
        if (err instanceof EmailTakenError) throw new AppError(409, 'email_taken', err.message)
        throw err
      }
    }),
  )

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new AppError(422, 'validation_error', parsed.error.issues[0].message)
      }
      try {
        const user = await auth.login(parsed.data)
        res.json({ token: signToken(user), user })
      } catch (err) {
        if (err instanceof InvalidCredentialsError) throw new AppError(401, 'invalid_credentials', err.message)
        throw err
      }
    }),
  )

  router.get(
    '/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = await auth.getProfile(currentUser(req).id)
      if (!user) throw new AppError(401, 'unauthorized', 'Usuário não encontrado')
      res.json(user)
    }),
  )

  return router
}
