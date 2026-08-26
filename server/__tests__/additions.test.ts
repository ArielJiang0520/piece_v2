import { describe, expect, test } from 'bun:test'
import { call, createAddition, createWorld, signupEmpty, tick } from './helpers'

// Additions belong to the checked-out world version, so every assertion here is really about
// (world, version) scoping as much as about the CRUD.

describe('GET /api/worlds/:id/additions', () => {
  test('starts empty and lists in creation order', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)

    const empty = await call<any[]>('GET', `/api/worlds/${world.id}/additions`, { agent })
    expect(empty.status).toBe(200)
    expect(empty.body).toEqual([])

    const first = await createAddition(agent, world.id, 'Winter', 'Snow on the roofs.')
    await tick()
    const second = await createAddition(agent, world.id, 'Plague', 'The docks are closed.')

    const { body } = await call<any[]>('GET', `/api/worlds/${world.id}/additions`, { agent })
    expect(body.map(addition => addition.id)).toEqual([first.id, second.id])
    expect(body[0]).toMatchObject({ name: 'Winter', body: 'Snow on the roofs.' })
  })

  test('a new world version starts with an empty shelf', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    await createAddition(agent, world.id, 'Winter')
    await tick()

    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: {} })

    const { body } = await call<any[]>('GET', `/api/worlds/${world.id}/additions`, { agent })
    expect(body).toEqual([])
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    expect((await call('GET', `/api/worlds/${world.id}/additions`, { agent: stranger })).status).toBe(404)
  })

  test('401s without a session', async () => {
    expect((await call('GET', '/api/worlds/1/additions')).status).toBe(401)
  })
})

describe('POST /api/worlds/:id/additions', () => {
  test('creates an addition on the checked-out version', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)

    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/additions`, {
      agent,
      body: { name: '  Famine  ', body: 'The granaries are empty.' },
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({ name: 'Famine', body: 'The granaries are empty.' })
    expect(body.id).toBeGreaterThan(0)
    expect(body.created_at).toBeGreaterThan(0)
  })

  test('defaults the body to an empty string', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { body } = await call<any>('POST', `/api/worlds/${world.id}/additions`, { agent, body: { name: 'Bare' } })
    expect(body.body).toBe('')
  })

  test('rejects a blank name', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/additions`, { agent, body: { name: ' ' } })
    expect(status).toBe(400)
    expect(body.error).toBe('Name required')
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    const { status } = await call('POST', `/api/worlds/${world.id}/additions`, { agent: stranger, body: { name: 'X' } })
    expect(status).toBe(404)
  })
})

describe('PATCH /api/worlds/:id/additions/:additionId', () => {
  test('updates name and body', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const addition = await createAddition(agent, world.id, 'Winter', 'Cold.')

    const { status, body } = await call<any>('PATCH', `/api/worlds/${world.id}/additions/${addition.id}`, {
      agent,
      body: { name: 'Deep Winter', body: 'Very cold.' },
    })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, changed: true })

    const list = await call<any[]>('GET', `/api/worlds/${world.id}/additions`, { agent })
    expect(list.body[0]).toMatchObject({ name: 'Deep Winter', body: 'Very cold.' })
  })

  test('reports changed:false when nothing differs', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const addition = await createAddition(agent, world.id, 'Winter', 'Cold.')

    const { body } = await call<any>('PATCH', `/api/worlds/${world.id}/additions/${addition.id}`, {
      agent,
      body: { name: 'Winter', body: 'Cold.' },
    })
    expect(body).toEqual({ ok: true, changed: false })
  })

  test('rejects a blank name', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const addition = await createAddition(agent, world.id)

    const { status, body } = await call<any>('PATCH', `/api/worlds/${world.id}/additions/${addition.id}`, {
      agent,
      body: { name: '  ' },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('Name required')
  })

  test('404s for an unknown addition', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status } = await call('PATCH', `/api/worlds/${world.id}/additions/999999`, { agent, body: { name: 'X' } })
    expect(status).toBe(404)
  })

  test('404s for another user\'s addition', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const addition = await createAddition(owner, world.id)
    const stranger = await signupEmpty()

    const { status } = await call('PATCH', `/api/worlds/${world.id}/additions/${addition.id}`, {
      agent: stranger,
      body: { name: 'Hijack' },
    })
    expect(status).toBe(404)
  })
})

describe('DELETE /api/worlds/:id/additions/:additionId', () => {
  test('removes the addition from the shelf', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const addition = await createAddition(agent, world.id)

    const { status, body } = await call<any>('DELETE', `/api/worlds/${world.id}/additions/${addition.id}`, { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true })

    const list = await call<any[]>('GET', `/api/worlds/${world.id}/additions`, { agent })
    expect(list.body).toEqual([])
  })

  test('404s for an unknown addition', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    expect((await call('DELETE', `/api/worlds/${world.id}/additions/999999`, { agent })).status).toBe(404)
  })

  test('404s for another user\'s addition, leaving it in place', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const addition = await createAddition(owner, world.id)
    const stranger = await signupEmpty()

    expect((await call('DELETE', `/api/worlds/${world.id}/additions/${addition.id}`, { agent: stranger })).status).toBe(404)
    const list = await call<any[]>('GET', `/api/worlds/${world.id}/additions`, { agent: owner })
    expect(list.body).toHaveLength(1)
  })
})
