import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { type Variables } from './middleware'
import authRoutes from './routes/auth'
import worldRoutes from './routes/worlds'
import storyRoutes from './routes/stories'
import tagRoutes from './routes/tags'
import userRoutes from './routes/users'

const app = new Hono<{ Variables: Variables }>()

app.route('/api', authRoutes)
app.route('/api/worlds', worldRoutes)
app.route('/api/stories', storyRoutes)
app.route('/api/tags', tagRoutes)
app.route('/api/users', userRoutes)

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('/*', serveStatic({ path: './dist/index.html' }))
}

const defaultPort = process.env.NODE_ENV === 'production' ? '3000' : '3001'
const port = parseInt(process.env.PORT || defaultPort, 10)
// Holds an SSE stream open for as long as the model keeps writing.
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
