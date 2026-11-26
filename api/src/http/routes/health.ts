import { Router } from 'express'
import { AppServices } from '../services'

export function healthRoutes({ health }: AppServices) {
  const router = Router()

  router.get('/', async (_req, res) => {
    try {
      await health.checkDatabase()
      res.json({ status: 'ok', db: 'ok' })
    } catch (err) {
      console.log('health: banco fora', err)
      res.status(503).json({ error: 'db_unavailable', message: 'Banco de dados não responde' })
    }
  })

  return router
}
