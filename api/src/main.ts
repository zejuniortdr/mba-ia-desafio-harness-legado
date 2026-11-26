import { app } from './http/app'
import { env } from './config/env'

const port = env.PORT

app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`)
})
