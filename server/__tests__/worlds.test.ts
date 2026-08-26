import { describe, expect, test } from 'bun:test'
import { call, createWorld, savePiece, signup, signupEmpty, tick } from './helpers'

describe('GET /api/worlds', () => {
  test('lists the user\'s worlds with a body summary and piece count', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Harbour', 'line one\nline two\nline three\nline four')
    await savePiece(agent, world.id, 'A ship arrives')

    const { status, body } = await call<any[]>('GET', '/api/worlds', { agent })
    expect(status).toBe(200)
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({
      id: world.id,
      name: 'Harbour',
      is_example: false,
      piece_count: 1,
    })
    // Summary is the first three lines, and the full body is not sent.
    expect(body[0].body_summary).toBe('line one\nline two\nline three')
    expect(body[0].body).toBeUndefined()
  })

  test('orders by activity, newest first', async () => {
    const agent = await signupEmpty()
    const first = await createWorld(agent, 'First')
    await tick()
    const second = await createWorld(agent, 'Second')
    await tick()
    // Writing a piece is activity on a world, so it floats back to the top.
    await savePiece(agent, first.id, 'Something happens')

    const { body } = await call<any[]>('GET', '/api/worlds', { agent })
    expect(body.map(world => world.id)).toEqual([first.id, second.id])
  })

  test('returns an empty list when the user has no worlds', async () => {
    const agent = await signupEmpty()
    const { status, body } = await call<any[]>('GET', '/api/worlds', { agent })
    expect(status).toBe(200)
    expect(body).toEqual([])
  })

  test('never shows another user\'s worlds', async () => {
    const owner = await signupEmpty()
    await createWorld(owner, 'Private')
    const stranger = await signupEmpty()

    const { body } = await call<any[]>('GET', '/api/worlds', { agent: stranger })
    expect(body).toEqual([])
  })

  test('401s without a session', async () => {
    expect((await call('GET', '/api/worlds')).status).toBe(401)
  })
})

describe('GET /api/worlds/recent', () => {
  test('returns at most five worlds, most recent first', async () => {
    const agent = await signupEmpty()
    const created = []
    for (let i = 1; i <= 7; i += 1) {
      created.push(await createWorld(agent, `World ${i}`))
      await tick()
    }

    const { status, body } = await call<{ id: number; name: string }[]>('GET', '/api/worlds/recent', { agent })
    expect(status).toBe(200)
    expect(body).toHaveLength(5)
    expect(body.map(world => world.id)).toEqual(created.slice(-5).reverse().map(world => world.id))
    expect(Object.keys(body[0]!).sort()).toEqual(['id', 'name'])
  })

  test('401s without a session', async () => {
    expect((await call('GET', '/api/worlds/recent')).status).toBe(401)
  })
})

describe('POST /api/worlds', () => {
  test('creates a world with an initial version checked out', async () => {
    const agent = await signupEmpty()
    const { status, body } = await call<any>('POST', '/api/worlds', {
      agent,
      body: { name: '  Salt Flats  ', body: 'Dry and white.' },
    })

    expect(status).toBe(200)
    expect(body.name).toBe('Salt Flats')
    expect(body.is_example).toBe(false)
    expect(body.body).toBe('Dry and white.')

    const detail = await call<any>('GET', `/api/worlds/${body.id}`, { agent })
    expect(detail.body.current_version_id).toBeGreaterThan(0)
    const versions = await call<any[]>('GET', `/api/worlds/${body.id}/versions`, { agent })
    expect(versions.body).toHaveLength(1)
    expect(versions.body[0].number).toBe(1)
  })

  test('defaults the body to an empty string', async () => {
    const agent = await signupEmpty()
    const { body } = await call<any>('POST', '/api/worlds', { agent, body: { name: 'Bare' } })
    expect(body.body).toBe('')
  })

  test('rejects a blank name', async () => {
    const agent = await signupEmpty()
    const { status, body } = await call<any>('POST', '/api/worlds', { agent, body: { name: '   ' } })
    expect(status).toBe(400)
    expect(body.error).toBe('Name required')
  })

  test('401s without a session', async () => {
    expect((await call('POST', '/api/worlds', { body: { name: 'X' } })).status).toBe(401)
  })
})

describe('GET /api/worlds/:id', () => {
  test('returns the full world with its checked-out version', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Tidewater', 'The sea is close.')

    const { status, body } = await call<any>('GET', `/api/worlds/${world.id}`, { agent })
    expect(status).toBe(200)
    expect(body).toMatchObject({
      id: world.id,
      name: 'Tidewater',
      body: 'The sea is close.',
      is_example: false,
      current_version_name: null,
    })
    expect(body.current_version_id).toBeGreaterThan(0)
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()

    const { status } = await call('GET', `/api/worlds/${world.id}`, { agent: stranger })
    expect(status).toBe(404)
  })

  test('404s for a world that does not exist', async () => {
    const agent = await signupEmpty()
    expect((await call('GET', '/api/worlds/999999', { agent })).status).toBe(404)
  })
})

describe('PATCH /api/worlds/:id', () => {
  test('renames the world', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Old Name')

    const { status, body } = await call<any>('PATCH', `/api/worlds/${world.id}`, { agent, body: { name: 'New Name' } })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, changed: true })

    const detail = await call<any>('GET', `/api/worlds/${world.id}`, { agent })
    expect(detail.body.name).toBe('New Name')
  })

  test('edits the checked-out version in place rather than making a new one', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Editable', 'first draft')
    const before = await call<any[]>('GET', `/api/worlds/${world.id}/versions`, { agent })

    await call('PATCH', `/api/worlds/${world.id}`, { agent, body: { body: 'second draft' } })

    const after = await call<any[]>('GET', `/api/worlds/${world.id}/versions`, { agent })
    expect(after.body).toHaveLength(before.body.length)
    expect(after.body[0].id).toBe(before.body[0]!.id)
    const detail = await call<any>('GET', `/api/worlds/${world.id}`, { agent })
    expect(detail.body.body).toBe('second draft')
  })

  test('names the checked-out version, and an empty string clears it', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)

    await call('PATCH', `/api/worlds/${world.id}`, { agent, body: { version_name: '  Draft  ' } })
    let detail = await call<any>('GET', `/api/worlds/${world.id}`, { agent })
    expect(detail.body.current_version_name).toBe('Draft')

    await call('PATCH', `/api/worlds/${world.id}`, { agent, body: { version_name: '' } })
    detail = await call<any>('GET', `/api/worlds/${world.id}`, { agent })
    expect(detail.body.current_version_name).toBeNull()
  })

  test('reports changed:false when nothing actually differs', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Same', 'Same body')

    const { status, body } = await call<any>('PATCH', `/api/worlds/${world.id}`, {
      agent,
      body: { name: 'Same', body: 'Same body' },
    })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, changed: false })
  })

  test('rejects a blank name', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await call<any>('PATCH', `/api/worlds/${world.id}`, { agent, body: { name: '  ' } })
    expect(status).toBe(400)
    expect(body.error).toBe('Name required')
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    const { status } = await call('PATCH', `/api/worlds/${world.id}`, { agent: stranger, body: { name: 'Hijack' } })
    expect(status).toBe(404)
  })
})

describe('DELETE /api/worlds/:id', () => {
  test('deletes the world and everything under it', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const saved = await savePiece(agent, world.id, 'A premise')

    const { status, body } = await call<any>('DELETE', `/api/worlds/${world.id}`, { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true })

    expect((await call('GET', `/api/worlds/${world.id}`, { agent })).status).toBe(404)
    expect((await call('GET', `/api/pieces/${saved.pieceId}`, { agent })).status).toBe(404)
    expect((await call<any[]>('GET', '/api/worlds', { agent })).body).toEqual([])
  })

  test('404s for another user\'s world, leaving it intact', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()

    expect((await call('DELETE', `/api/worlds/${world.id}`, { agent: stranger })).status).toBe(404)
    expect((await call('GET', `/api/worlds/${world.id}`, { agent: owner })).status).toBe(200)
  })
})

describe('example worlds', () => {
  test('a new account starts with example worlds flagged as such', async () => {
    const agent = await signup()
    const { body } = await call<any[]>('GET', '/api/worlds', { agent })
    expect(body.length).toBeGreaterThan(0)
    expect(body.every(world => world.is_example === true)).toBe(true)
  })
})
