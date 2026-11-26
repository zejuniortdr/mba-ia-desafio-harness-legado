import { buildTriageService } from '../composition'
import { env } from '../config/env'

const triage = buildTriageService()
const interval = env.TRIAGE_INTERVAL_MS

async function loop() {
  try {
    await triage.runOnce()
  } catch (err) {
    console.log('erro no worker', err)
  }
  setTimeout(loop, interval)
}

console.log(`worker de triagem rodando a cada ${interval}ms`)
loop()
