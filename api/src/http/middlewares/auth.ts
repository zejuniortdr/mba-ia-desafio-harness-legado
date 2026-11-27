import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { CurrentUser, Role } from '../../domain/ticket'

const secret = env.JWT_SECRET

type AuthRequest = Request & { user: CurrentUser }

export function signToken(user: { id: string; role: string }) {
  return jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: '8h' })
}

// Usuário que o requireAuth colocou na requisição.
export function currentUser(req: Request): CurrentUser {
  return (req as AuthRequest).user
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Token ausente' })
  }
  try {
    const payload = jwt.verify(header.slice(7), secret) as { sub: string; role: Role }
    ;(req as AuthRequest).user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    return res.status(401).json({ error: 'unauthorized', message: 'Token inválido' })
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Partial<AuthRequest>).user
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: 'forbidden', message: 'Sem permissão' })
    }
    next()
  }
}
