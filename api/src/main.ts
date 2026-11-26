import { createApp } from './http/app'
import { buildServices } from './composition'
import { env } from './config/env'

createApp(buildServices()).listen(env.PORT, () => {
  console.log(`API rodando na porta ${env.PORT}`)
})
