import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { type Variables } from './middleware'
import authRoutes from './routes/auth'
import worldRoutes from './routes/worlds'
import pieceRoutes from './routes/pieces'
import registerRoutes from './routes/registers'

const app = new Hono<{ Variables: Variables }>()

app.route('/api', authRoutes)
app.route('/api/worlds', worldRoutes)
app.route('/api/pieces', pieceRoutes)
app.route('/api/registers', registerRoutes)

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('/*', serveStatic({ path: './dist/index.html' }))
}

const defaultPort = process.env.NODE_ENV === 'production' ? '3000' : '3001'
const port = parseInt(process.env.PORT || defaultPort, 10)
const generationRoutePattern = /^\/api\/worlds\/[^/]+\/generate\/?$/

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
