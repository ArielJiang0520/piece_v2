import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { type Variables } from './middleware'
import authRoutes from './routes/auth'
import worldRoutes from './routes/worlds'
import pieceRoutes from './routes/pieces'

// Exported so the API tests can drive the real, fully-mounted app through `app.fetch`
// without opening a port.
export const app = new Hono<{ Variables: Variables }>()

app.route('/api', authRoutes)
app.route('/api/worlds', worldRoutes)
app.route('/api/pieces', pieceRoutes)

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('/*', serveStatic({ path: './dist/index.html' }))
}

const defaultPort = process.env.NODE_ENV === 'production' ? '3000' : '3001'
const port = parseInt(process.env.PORT || defaultPort, 10)
// Both of these hold an SSE stream open for as long as the model keeps writing — and a chat
// turn can additionally sit queued behind a story generation on the single OpenRouter slot.
const generationRoutePattern = /^\/api\/worlds\/[^/]+\/(generate|chat)\/?$/

export default {
  port,
  hostname: '0.0.0.0',
  fetch(req, server) {
    if (generationRoutePattern.test(new URL(req.url).pathname)) {
      server.timeout(req, 0)
    }

    return app.fetch(req)
  },
} satisfies Bun.Serve.Options<undefined>
