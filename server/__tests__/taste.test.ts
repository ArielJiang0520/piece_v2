import { describe, expect, test } from 'bun:test'
import { call, createWorld, savePiece, signupEmpty, tick } from './helpers'

// Taste is per-world and per-version. Distillation itself is a model call and is not exercised
// here — what these cover is the like store the distiller reads from, and the profile read path.

async function like(
  agent: Awaited<ReturnType<typeof signupEmpty>>,
  worldId: number,
  body: Record<string, unknown>,
) {
  return call<any>('POST', `/api/worlds/${worldId}/taste/likes`, { agent, body })
}

describe('POST /api/worlds/:id/taste/likes', () => {
  test('records a like against the checked-out version', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)

    const { status, body } = await like(agent, world.id, {
      snippet: '  The beam stopped at midnight.  ',
      context: 'Before. The beam stopped at midnight. After.',
      reasons: '  the flatness of it  ',
    })
    expect(status).toBe(200)
    expect(body.id).toBeGreaterThan(0)

    const list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent })
    expect(list.body).toHaveLength(1)
    expect(list.body[0]).toMatchObject({
      snippet: 'The beam stopped at midnight.',
      context: 'Before. The beam stopped at midnight. After.',
      reasons: 'the flatness of it',
      piece_id: null,
      active: 1,
    })
  })

  test('needs no saved piece, but attaches to one when given', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const saved = await savePiece(agent, world.id, 'A premise')

    const { body } = await like(agent, world.id, { snippet: 'A liked line.', pieceId: saved.pieceId })
    expect(body.id).toBeGreaterThan(0)

    const list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent })
    expect(list.body[0].piece_id).toBe(saved.pieceId)
  })

  test('drops a stale or foreign piece id rather than failing the like', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    const strangerWorld = await createWorld(stranger, 'Theirs')
    const strangerPiece = await savePiece(stranger, strangerWorld.id, 'Their premise')

    const { status } = await like(owner, world.id, { snippet: 'A liked line.', pieceId: strangerPiece.pieceId })
    expect(status).toBe(200)

    const list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent: owner })
    expect(list.body[0].piece_id).toBeNull()
  })

  test('falls back to the snippet when no context is sent', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    await like(agent, world.id, { snippet: 'A liked line.' })

    const list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent })
    expect(list.body[0].context).toBe('A liked line.')
  })

  test('rejects a blank snippet', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await like(agent, world.id, { snippet: '   ' })
    expect(status).toBe(400)
    expect(body.error).toBe('Snippet required')
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    expect((await like(stranger, world.id, { snippet: 'x' })).status).toBe(404)
  })

  test('401s without a session', async () => {
    const { status } = await call('POST', '/api/worlds/1/taste/likes', { body: { snippet: 'x' } })
    expect(status).toBe(401)
  })
})

describe('GET /api/worlds/:id/taste/likes', () => {
  test('lists the version\'s likes newest first', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    await like(agent, world.id, { snippet: 'First like.' })
    await tick()
    await like(agent, world.id, { snippet: 'Second like.' })

    const { status, body } = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent })
    expect(status).toBe(200)
    expect(body.map(entry => entry.snippet)).toEqual(['Second like.', 'First like.'])
  })

  test('shows only the checked-out version\'s likes', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    await like(agent, world.id, { snippet: 'A v1 like.' })
    await tick()
    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: {} })

    const onV2 = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent })
    expect(onV2.body).toEqual([])
  })

  test('narrows to one piece with ?pieceId', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const saved = await savePiece(agent, world.id, 'A premise')
    await like(agent, world.id, { snippet: 'Attached.', pieceId: saved.pieceId })
    await like(agent, world.id, { snippet: 'Loose.' })

    const { body } = await call<any[]>(
      'GET',
      `/api/worlds/${world.id}/taste/likes?pieceId=${saved.pieceId}`,
      { agent },
    )
    expect(body.map(entry => entry.snippet)).toEqual(['Attached.'])
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    expect((await call('GET', `/api/worlds/${world.id}/taste/likes`, { agent: stranger })).status).toBe(404)
  })
})

describe('PATCH /api/worlds/:id/taste/likes/:likeId', () => {
  test('edits the note and switches the like off and on again', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const created = await like(agent, world.id, { snippet: 'A liked line.', reasons: 'first note' })

    await call('PATCH', `/api/worlds/${world.id}/taste/likes/${created.body.id}`, {
      agent,
      body: { reasons: '  second note  ' },
    })
    let list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent })
    expect(list.body[0]).toMatchObject({ reasons: 'second note', active: 1 })

    await call('PATCH', `/api/worlds/${world.id}/taste/likes/${created.body.id}`, {
      agent,
      body: { active: false },
    })
    list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent })
    // A switched-off like stays in the list — that is where it gets switched back on.
    expect(list.body[0]).toMatchObject({ reasons: 'second note', active: 0 })

    await call('PATCH', `/api/worlds/${world.id}/taste/likes/${created.body.id}`, {
      agent,
      body: { active: true },
    })
    list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent })
    expect(list.body[0].active).toBe(1)
  })

  test('an empty note clears it, and the snippet is never touched', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const created = await like(agent, world.id, { snippet: 'A liked line.', reasons: 'a note' })

    await call('PATCH', `/api/worlds/${world.id}/taste/likes/${created.body.id}`, {
      agent,
      body: { reasons: '   ', snippet: 'rewritten' },
    })

    const list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent })
    expect(list.body[0].reasons).toBeNull()
    expect(list.body[0].snippet).toBe('A liked line.')
  })

  test('an empty patch is a no-op', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const created = await like(agent, world.id, { snippet: 'A liked line.', reasons: 'a note' })

    const { status, body } = await call<any>('PATCH', `/api/worlds/${world.id}/taste/likes/${created.body.id}`, {
      agent,
      body: {},
    })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true })

    const list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent })
    expect(list.body[0]).toMatchObject({ reasons: 'a note', active: 1 })
  })

  test('cannot touch another user\'s like', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const created = await like(owner, world.id, { snippet: 'A liked line.', reasons: 'mine' })
    const stranger = await signupEmpty()

    await call('PATCH', `/api/worlds/${world.id}/taste/likes/${created.body.id}`, {
      agent: stranger,
      body: { reasons: 'theirs' },
    })

    const list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent: owner })
    expect(list.body[0].reasons).toBe('mine')
  })
})

describe('DELETE /api/worlds/:id/taste/likes/:likeId', () => {
  test('removes the like', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const created = await like(agent, world.id, { snippet: 'A liked line.' })

    const { status, body } = await call<any>('DELETE', `/api/worlds/${world.id}/taste/likes/${created.body.id}`, { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true })

    const list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent })
    expect(list.body).toEqual([])
  })

  test('cannot delete another user\'s like', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const created = await like(owner, world.id, { snippet: 'A liked line.' })
    const stranger = await signupEmpty()

    await call('DELETE', `/api/worlds/${world.id}/taste/likes/${created.body.id}`, { agent: stranger })

    const list = await call<any[]>('GET', `/api/worlds/${world.id}/taste/likes`, { agent: owner })
    expect(list.body).toHaveLength(1)
  })
})

describe('GET /api/worlds/:id/taste/profile', () => {
  test('is blank until something has been distilled', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)

    const { status, body } = await call<any>('GET', `/api/worlds/${world.id}/taste/profile`, { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ profile: '', likeCount: 0, updatedAt: 0, distilling: false })
  })

  test('counts the switched-on likes of the checked-out version', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const first = await like(agent, world.id, { snippet: 'First like.' })
    await like(agent, world.id, { snippet: 'Second like.' })

    let profile = await call<any>('GET', `/api/worlds/${world.id}/taste/profile`, { agent })
    expect(profile.body.likeCount).toBe(2)

    await call('PATCH', `/api/worlds/${world.id}/taste/likes/${first.body.id}`, { agent, body: { active: false } })
    profile = await call<any>('GET', `/api/worlds/${world.id}/taste/profile`, { agent })
    expect(profile.body.likeCount).toBe(1)
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    expect((await call('GET', `/api/worlds/${world.id}/taste/profile`, { agent: stranger })).status).toBe(404)
  })
})

describe('POST /api/worlds/:id/taste/profile/refresh', () => {
  test('accepts the request and returns immediately', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)

    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/taste/profile/refresh`, { agent })
    expect(status).toBe(202)
    expect(body).toEqual({ started: true })
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    expect((await call('POST', `/api/worlds/${world.id}/taste/profile/refresh`, { agent: stranger })).status).toBe(404)
  })
})
