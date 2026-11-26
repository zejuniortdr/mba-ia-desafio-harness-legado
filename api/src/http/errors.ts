import { NextFunction, Request, Response } from 'express'
import { AppError } from '../domain/errors'

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'not_found', message: 'Rota não encontrada' })
}

type ErrorLike = { name?: string; type?: string; message?: string }

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message })
  }
  const e = (err ?? {}) as ErrorLike
  if (e.name === 'MulterError') {
    return res.status(422).json({ error: 'validation_error', message: e.message })
  }
  if (e.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'bad_request', message: 'JSON inválido' })
  }
  console.log('erro inesperado', err)
  res.status(500).json({ error: 'internal_error', message: 'Erro interno' })
}
