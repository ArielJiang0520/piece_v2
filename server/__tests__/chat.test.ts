import { describe, expect, test } from 'bun:test'
import { call, createWorld, savePiece, signupEmpty, tick } from './helpers'

// Two threads, one handler set: the world thread and a per-cluster one. Posting a turn is a
// model call and is not covered here — these are the read and clear halves, plus the subject
// resolution that decides which rows a thread is allowed to see.

describe('GET /api/worlds/:id/chat', () => {
  test('starts empty', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)

    const { status, body } = await call<any[]>('GET', `/api/worlds/${world.id}/chat`, { agent })
    expect(status).toBe(200)
    expect(body).toEqual([])
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    expect((await call('GET', `/api/worlds/${world.id}/chat`, { agent: stranger })).status).toBe(404)
  })

  test('404s for a world that does not exist', async () => {
    const agent = await signupEmpty()
    expect((await call('GET', '/api/worlds/999999/chat', { agent })).status).toBe(404)
  })

  test('401s without a session', async () => {
    expect((await call('GET', '/api/worlds/1/chat')).status).toBe(401)
  })
})

describe('DELETE /api/worlds/:id/chat', () => {
  test('clears the world thread', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)

    const { status, body } = await call<any>('DELETE', `/api/worlds/${world.id}/chat`, { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ cleared: true })

    const thread = await call<any[]>('GET', `/api/worlds/${world.id}/chat`, { agent })
    expect(thread.body).toEqual([])
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    expect((await call('DELETE', `/api/worlds/${world.id}/chat`, { agent: stranger })).status).toBe(404)
  })
})

describe('GET /api/worlds/:id/chat/cluster/:clusterId', () => {
  test('starts empty for a cluster of the checked-out version', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const saved = await savePiece(agent, world.id, 'A premise')

    const { status, body } = await call<any[]>(
      'GET',
      `/api/worlds/${world.id}/chat/cluster/${saved.clusterId}`,
      { agent },
    )
    expect(status).toBe(200)
    expect(body).toEqual([])
  })

  test('404s for an unknown cluster', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    expect((await call('GET', `/api/worlds/${world.id}/chat/cluster/999999`, { agent })).status).toBe(404)
  })

  test('404s for a cluster of another world version', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Contained', 'v1')
    const saved = await savePiece(agent, world.id, 'A premise')
    await tick()
    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: { body: 'v2' } })

    const { status } = await call('GET', `/api/worlds/${world.id}/chat/cluster/${saved.clusterId}`, { agent })
    expect(status).toBe(404)
  })

  test('404s for another user\'s cluster', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const saved = await savePiece(owner, world.id, 'A premise')
    const stranger = await signupEmpty()

    const { status } = await call('GET', `/api/worlds/${world.id}/chat/cluster/${saved.clusterId}`, { agent: stranger })
    expect(status).toBe(404)
  })

  test('401s without a session', async () => {
    expect((await call('GET', '/api/worlds/1/chat/cluster/1')).status).toBe(401)
  })
})

describe('DELETE /api/worlds/:id/chat/cluster/:clusterId', () => {
  test('clears the cluster thread', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const saved = await savePiece(agent, world.id, 'A premise')

    const { status, body } = await call<any>(
      'DELETE',
      `/api/worlds/${world.id}/chat/cluster/${saved.clusterId}`,
      { agent },
    )
    expect(status).toBe(200)
    expect(body).toEqual({ cleared: true })
  })

  test('404s for an unknown cluster', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    expect((await call('DELETE', `/api/worlds/${world.id}/chat/cluster/999999`, { agent })).status).toBe(404)
  })
})
