import { app } from '../index'
import { DEFAULT_MODEL_ID } from '../../src/preferences/generationModel'

// Every test drives the real app through `app.fetch`. There is no server, no port and no
// network: the in-memory database from setup.ts is the only state, and each test signs up its
// own user, so ownership scoping keeps the tests independent of each other.

export interface Agent {
  userId: number
  username: string
  password: string
  cookie: string
}

export const TEST_PASSWORD = 'password123'
export const TEST_MODEL = DEFAULT_MODEL_ID

let usernameCounter = 0

export function uniqueUsername(prefix = 'tester') {
  usernameCounter += 1
  return `${prefix}_${usernameCounter}_${Math.random().toString(36).slice(2, 8)}`
}

// Ordering in this API is by a millisecond clock (`updated_at`/`created_at`), so a test that
// asserts an order has to put the events it creates in different milliseconds.
export function tick(ms = 3): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface CallResult<T> {
  status: number
  body: T
  res: Response
}

export async function call<T = any>(
  method: string,
  path: string,
  opts: { agent?: Agent | null; body?: unknown; headers?: Record<string, string> } = {},
): Promise<CallResult<T>> {
  const headers: Record<string, string> = { ...opts.headers }
  if (opts.agent) headers.Cookie = opts.agent.cookie
  const init: RequestInit = { method, headers }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }
  const res = await app.fetch(new Request(`http://localhost${path}`, init))
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  return { status: res.status, body: body as T, res }
}

export function sidFrom(res: Response): string | null {
  const header = res.headers.get('set-cookie')
  const match = header ? /sid=([^;]*)/.exec(header) : null
  return match ? match[1]! : null
}

// A signed-up user with a live session. Signup also seeds the example worlds — see
// `signupEmpty` for the (usual) case where a test wants a blank slate.
export async function signup(username = uniqueUsername()): Promise<Agent> {
  const res = await app.fetch(new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: TEST_PASSWORD }),
  }))
  if (res.status !== 200) throw new Error(`signup failed: ${res.status} ${await res.text()}`)
  const body = await res.json() as { id: number }
  const sid = sidFrom(res)
  if (!sid) throw new Error('signup did not set a session cookie')
  return { userId: body.id, username, password: TEST_PASSWORD, cookie: `sid=${sid}` }
}

// The same, with the seeded example worlds deleted, so a test can count worlds/prompts
// without having to know what ships in examples/.
export async function signupEmpty(): Promise<Agent> {
  const agent = await signup()
  const { body: worlds } = await call<{ id: number }[]>('GET', '/api/worlds', { agent })
  for (const world of worlds) {
    await call('DELETE', `/api/worlds/${world.id}`, { agent })
  }
  return agent
}

export interface World {
  id: number
  name: string
  body: string
  updated_at: number
}

export async function createWorld(agent: Agent, name = 'Test World', body = 'A quiet town.'): Promise<World> {
  const { status, body: world } = await call<World>('POST', '/api/worlds', { agent, body: { name, body } })
  if (status !== 200) throw new Error(`createWorld failed: ${status}`)
  return world
}

export interface SavedPiece {
  promptId: number
  pieceId: number
  pieceCount: number
  clusterId: number
  isNewPrompt: boolean
  usedTaste: boolean
}

// Saving a piece is how prompts and clusters come into existence — there is no other route
// that creates them — so most fixtures below start here.
export async function savePiece(
  agent: Agent,
  worldId: number,
  prompt: string,
  pieceBody = 'Once upon a time, the rain stopped.',
  extra: Record<string, unknown> = {},
): Promise<SavedPiece> {
  const { status, body } = await call<SavedPiece>('POST', `/api/worlds/${worldId}/pieces`, {
    agent,
    body: { prompt, body: pieceBody, model: TEST_MODEL, ...extra },
  })
  if (status !== 200) throw new Error(`savePiece failed: ${status} ${JSON.stringify(body)}`)
  return body
}

export interface Addition {
  id: number
  name: string
  body: string
}

export async function createAddition(agent: Agent, worldId: number, name = 'Winter', body = 'It is winter.'): Promise<Addition> {
  const { status, body: addition } = await call<Addition>('POST', `/api/worlds/${worldId}/additions`, {
    agent,
    body: { name, body },
  })
  if (status !== 200) throw new Error(`createAddition failed: ${status}`)
  return addition
}
