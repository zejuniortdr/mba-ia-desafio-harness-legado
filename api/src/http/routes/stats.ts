import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth'
import { AppServices } from '../services'

export function statsRoutes({ stats }: AppServices) {
  const router = Router()

  router.get('/', requireAuth, requireRole('admin'), async (_req, res, next) => {
    try {
      res.json(await stats.getStats())
    } catch (err) {
      next(err)
    }
  })

  return router
}
