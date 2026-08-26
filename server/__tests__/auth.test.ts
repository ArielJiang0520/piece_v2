import { describe, expect, test } from 'bun:test'
import { TEST_PASSWORD, call, signup, sidFrom, uniqueUsername } from './helpers'

describe('POST /api/auth/signup', () => {
  test('creates the user, opens a session and seeds the example worlds', async () => {
    const username = uniqueUsername()
    const { status, body, res } = await call<{ id: number; username: string }>('POST', '/api/auth/signup', {
      body: { username, password: TEST_PASSWORD },
    })

    expect(status).toBe(200)
    expect(body.username).toBe(username)
    expect(body.id).toBeGreaterThan(0)

    const sid = sidFrom(res)
    expect(sid).toBeTruthy()
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')

    const cookie = `sid=${sid}`
    const worlds = await call<unknown[]>('GET', '/api/worlds', { agent: { cookie } as any })
    expect(worlds.status).toBe(200)
    expect(worlds.body.length).toBeGreaterThan(0)
  })

  test('rejects missing fields', async () => {
    const { status, body } = await call('POST', '/api/auth/signup', { body: { username: uniqueUsername() } })
    expect(status).toBe(400)
    expect(body.error).toBe('Missing fields')
  })

  test('rejects a password under 8 characters', async () => {
    const { status, body } = await call('POST', '/api/auth/signup', {
      body: { username: uniqueUsername(), password: 'short' },
    })
    expect(status).toBe(400)
    expect(body.error).toContain('8 characters')
  })

  test('rejects a username already taken', async () => {
    const existing = await signup()
    const { status, body } = await call('POST', '/api/auth/signup', {
      body: { username: existing.username, password: TEST_PASSWORD },
    })
    expect(status).toBe(409)
    expect(body.error).toBe('Username already taken')
  })
})

describe('POST /api/auth/login', () => {
  test('returns the user and a fresh session cookie', async () => {
    const agent = await signup()
    const { status, body, res } = await call<{ id: number; username: string }>('POST', '/api/auth/login', {
      body: { username: agent.username, password: agent.password },
    })

    expect(status).toBe(200)
    expect(body.id).toBe(agent.userId)
    const sid = sidFrom(res)
    expect(sid).toBeTruthy()
    expect(sid).not.toBe(agent.cookie.replace('sid=', ''))
  })

  test('rejects a wrong password', async () => {
    const agent = await signup()
    const { status, body } = await call('POST', '/api/auth/login', {
      body: { username: agent.username, password: 'wrong-password' },
    })
    expect(status).toBe(401)
    expect(body.error).toBe('Invalid credentials')
  })

  test('rejects an unknown username', async () => {
    const { status } = await call('POST', '/api/auth/login', {
      body: { username: uniqueUsername('ghost'), password: TEST_PASSWORD },
    })
    expect(status).toBe(401)
  })

  test('rejects missing fields', async () => {
    const { status } = await call('POST', '/api/auth/login', { body: { username: 'someone' } })
    expect(status).toBe(400)
  })
})

describe('POST /api/auth/logout', () => {
  test('invalidates the session', async () => {
    const agent = await signup()
    const { status } = await call('POST', '/api/auth/logout', { agent })
    expect(status).toBe(204)

    const after = await call('GET', '/api/me', { agent })
    expect(after.status).toBe(401)
  })

  test('succeeds without a session', async () => {
    const { status } = await call('POST', '/api/auth/logout')
    expect(status).toBe(204)
  })
})

describe('GET /api/me', () => {
  test('returns the signed-in user', async () => {
    const agent = await signup()
    const { status, body } = await call<{ id: number; username: string }>('GET', '/api/me', { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ id: agent.userId, username: agent.username })
  })

  test('401s without a session cookie', async () => {
    const { status } = await call('GET', '/api/me')
    expect(status).toBe(401)
  })

  test('401s on an unknown session id', async () => {
    const { status } = await call('GET', '/api/me', { agent: { cookie: 'sid=not-a-real-session' } as any })
    expect(status).toBe(401)
  })
})

describe('DELETE /api/auth/account', () => {
  test('deletes the account and everything under it', async () => {
    const agent = await signup()
    const { status } = await call('DELETE', '/api/auth/account', { agent })
    expect(status).toBe(204)

    expect((await call('GET', '/api/me', { agent })).status).toBe(401)
    const relogin = await call('POST', '/api/auth/login', {
      body: { username: agent.username, password: agent.password },
    })
    expect(relogin.status).toBe(401)
  })

  test('401s without a session', async () => {
    const { status } = await call('DELETE', '/api/auth/account')
    expect(status).toBe(401)
  })
})
