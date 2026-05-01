import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { type Variables } from './middleware'
import authRoutes from './routes/auth'
import worldRoutes from './routes/worlds'
import pieceRoutes from './routes/pieces'

const app = new Hono<{ Variables: Variables }>()

app.route('/api', authRoutes)
app.route('/api/worlds', worldRoutes)
app.route('/api/pieces', pieceRoutes)

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('/*', serveStatic({ path: './dist/index.html' }))
}

const port = parseInt(process.env.PORT || '3001')
const generationRoutePattern = /^\/api\/worlds\/[^/]+\/generate\/?$/

export default {
  port,
  fetch(req, server) {
    if (generationRoutePattern.test(new URL(req.url).pathname)) {
      server.timeout(req, 0)
    }

    return app.fetch(req)
  },
} satisfies Bun.Serve.Options<undefined>
