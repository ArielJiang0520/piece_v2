import { describe, expect, test } from 'bun:test'
import { TEST_MODEL, call, createAddition, createWorld, savePiece, signupEmpty, tick } from './helpers'

// Saving a piece is the only route that creates prompts and clusters, so most of what this
// file checks is really the prompt/cluster containment rules that hang off the save.

describe('POST /api/worlds/:id/pieces', () => {
  test('saves a piece, creating its prompt and its own cluster', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)

    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/pieces`, {
      agent,
      body: { prompt: '  A lighthouse goes dark  ', body: 'The beam stopped at midnight.', model: TEST_MODEL },
    })

    expect(status).toBe(200)
    expect(body.isNewPrompt).toBe(true)
    expect(body.pieceCount).toBe(1)
    expect(body.usedTaste).toBe(false)
    expect(body.promptId).toBeGreaterThan(0)
    expect(body.clusterId).toBeGreaterThan(0)

    const piece = await call<any>('GET', `/api/pieces/${body.pieceId}`, { agent })
    // The prompt is stored trimmed.
    expect(piece.body.prompt).toBe('A lighthouse goes dark')
    expect(piece.body.body).toBe('The beam stopped at midnight.')
    expect(piece.body.model).toBe(TEST_MODEL)
  })

  test('reuses the prompt row when the same text is saved again', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const first = await savePiece(agent, world.id, 'A lighthouse goes dark')
    const second = await savePiece(agent, world.id, 'A lighthouse goes dark', 'A second telling.')

    expect(second.isNewPrompt).toBe(false)
    expect(second.promptId).toBe(first.promptId)
    expect(second.clusterId).toBe(first.clusterId)
    expect(second.pieceCount).toBe(2)
    expect(second.pieceId).not.toBe(first.pieceId)
  })

  test('a rewritten prompt joins the source cluster as a second variation', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const first = await savePiece(agent, world.id, 'A lighthouse goes dark')
    await tick()

    const second = await savePiece(agent, world.id, 'A lighthouse goes dark at midnight', 'Another telling.', {
      versionSourcePromptId: first.promptId,
    })

    expect(second.isNewPrompt).toBe(true)
    expect(second.promptId).not.toBe(first.promptId)
    expect(second.clusterId).toBe(first.clusterId)

    const cluster = await call<any>('GET', `/api/worlds/${world.id}/clusters/${first.clusterId}`, { agent })
    expect(cluster.body.prompts).toHaveLength(2)
    // The representative is always the latest prompt.
    expect(cluster.body.cluster.latest_prompt_id).toBe(second.promptId)
    expect(cluster.body.cluster.title).toBe('A lighthouse goes dark at midnight')
  })

  test('the same premise on a different world version gets its own prompt and cluster', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Versioned', 'v1')
    const onV1 = await savePiece(agent, world.id, 'A lighthouse goes dark')
    await tick()
    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: { body: 'v2' } })

    const onV2 = await savePiece(agent, world.id, 'A lighthouse goes dark')
    expect(onV2.isNewPrompt).toBe(true)
    expect(onV2.promptId).not.toBe(onV1.promptId)
    expect(onV2.clusterId).not.toBe(onV1.clusterId)
  })

  test('rejects a version source prompt from another world version', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Contained', 'v1')
    const onV1 = await savePiece(agent, world.id, 'A lighthouse goes dark')
    await tick()
    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: { body: 'v2' } })

    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/pieces`, {
      agent,
      body: {
        prompt: 'A lighthouse goes dark at dawn',
        body: 'Text.',
        model: TEST_MODEL,
        versionSourcePromptId: onV1.promptId,
      },
    })
    expect(status).toBe(409)
    expect(body.error).toContain('different version')
  })

  test('404s on an unknown version source prompt', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/pieces`, {
      agent,
      body: { prompt: 'A premise', body: 'Text.', model: TEST_MODEL, versionSourcePromptId: 999999 },
    })
    expect(status).toBe(404)
    expect(body.error).toBe('Version source prompt not found')
  })

  test('rejects a malformed version source prompt id', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/pieces`, {
      agent,
      body: { prompt: 'A premise', body: 'Text.', model: TEST_MODEL, versionSourcePromptId: 0 },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('Invalid version source prompt id')
  })

  test('stores a valid structure and drops one that does not reconstruct the body', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const pieceBody = 'First part. Second part.'
    const structure = {
      v: 1,
      segments: [
        { action: 'fresh', direction: '', text: 'First part.' },
        { action: 'continue', direction: 'go on', text: ' Second part.' },
      ],
    }

    const good = await savePiece(agent, world.id, 'Structured', pieceBody, { structure })
    const stored = await call<any>('GET', `/api/pieces/${good.pieceId}`, { agent })
    expect(stored.body.structure.segments).toHaveLength(2)
    expect(stored.body.structure.segments[1].direction).toBe('go on')

    const bad = await savePiece(agent, world.id, 'Structured', pieceBody, {
      structure: { v: 1, segments: [{ action: 'fresh', direction: '', text: 'does not match' }] },
    })
    const badStored = await call<any>('GET', `/api/pieces/${bad.pieceId}`, { agent })
    expect(badStored.body.structure).toBeNull()
  })

  test('stamps the additions that were switched on, and drops ids that do not belong', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const addition = await createAddition(agent, world.id, 'Winter')

    const saved = await savePiece(agent, world.id, 'A cold premise', 'Snowbound.', {
      additionIds: [addition.id, 999999],
    })
    const piece = await call<any>('GET', `/api/pieces/${saved.pieceId}`, { agent })
    expect(piece.body.addition_ids).toEqual([addition.id])

    const bare = await savePiece(agent, world.id, 'A plain premise')
    const barePiece = await call<any>('GET', `/api/pieces/${bare.pieceId}`, { agent })
    expect(barePiece.body.addition_ids).toEqual([])
  })

  test('records usedTaste as false when there is no distilled profile', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    // The toggle being on is not enough — an empty profile injects nothing.
    const saved = await savePiece(agent, world.id, 'A premise', 'Text.', { useTaste: true })
    expect(saved.usedTaste).toBe(false)

    const piece = await call<any>('GET', `/api/pieces/${saved.pieceId}`, { agent })
    expect(piece.body.used_taste).toBe(false)
  })

  test('rejects a blank prompt', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/pieces`, {
      agent,
      body: { prompt: '   ', body: 'Text.', model: TEST_MODEL },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('Prompt required')
  })

  test('rejects a blank body', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/pieces`, {
      agent,
      body: { prompt: 'A premise', body: '   ', model: TEST_MODEL },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('Piece body required')
  })

  test('rejects an unknown model id', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/pieces`, {
      agent,
      body: { prompt: 'A premise', body: 'Text.', model: 'not/a-real-model' },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('Invalid model')
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    const { status } = await call('POST', `/api/worlds/${world.id}/pieces`, {
      agent: stranger,
      body: { prompt: 'A premise', body: 'Text.', model: TEST_MODEL },
    })
    expect(status).toBe(404)
  })

  test('401s without a session', async () => {
    const { status } = await call('POST', '/api/worlds/1/pieces', {
      body: { prompt: 'A premise', body: 'Text.', model: TEST_MODEL },
    })
    expect(status).toBe(401)
  })
})

describe('GET /api/pieces/:id', () => {
  test('returns the piece with its prompt text', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const saved = await savePiece(agent, world.id, 'A premise', 'The body of the piece.')

    const { status, body } = await call<any>('GET', `/api/pieces/${saved.pieceId}`, { agent })
    expect(status).toBe(200)
    expect(body).toMatchObject({
      id: saved.pieceId,
      world_id: world.id,
      prompt_id: saved.promptId,
      prompt: 'A premise',
      body: 'The body of the piece.',
      used_taste: false,
    })
    expect(body.created_at).toBeGreaterThan(0)
  })

  test('404s for another user\'s piece', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const saved = await savePiece(owner, world.id, 'A premise')
    const stranger = await signupEmpty()

    expect((await call('GET', `/api/pieces/${saved.pieceId}`, { agent: stranger })).status).toBe(404)
  })

  test('404s for an unknown piece', async () => {
    const agent = await signupEmpty()
    expect((await call('GET', '/api/pieces/999999', { agent })).status).toBe(404)
  })

  test('401s without a session', async () => {
    expect((await call('GET', '/api/pieces/1')).status).toBe(401)
  })
})

describe('PATCH /api/pieces/:id', () => {
  test('overwrites the body in place, keeping created_at', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const saved = await savePiece(agent, world.id, 'A premise', 'The first half.')
    const before = await call<any>('GET', `/api/pieces/${saved.pieceId}`, { agent })
    await tick()

    const { status, body } = await call<any>('PATCH', `/api/pieces/${saved.pieceId}`, {
      agent,
      body: { body: 'The first half. And the second.' },
    })
    expect(status).toBe(200)
    expect(body.body).toBe('The first half. And the second.')
    expect(body.created_at).toBe(before.body.created_at)
    expect(body.updated_at).toBeGreaterThan(before.body.updated_at)
  })

  test('moves the world\'s activity clock', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const saved = await savePiece(agent, world.id, 'A premise')
    const other = await createWorld(agent, 'Newer')
    await tick()

    await call('PATCH', `/api/pieces/${saved.pieceId}`, { agent, body: { body: 'Longer body now.' } })

    const list = await call<any[]>('GET', '/api/worlds', { agent })
    expect(list.body.map(entry => entry.id)).toEqual([world.id, other.id])
  })

  test('updates the model and clears a blank provider', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const saved = await savePiece(agent, world.id, 'A premise')

    const { body } = await call<any>('PATCH', `/api/pieces/${saved.pieceId}`, {
      agent,
      body: { body: 'Text.', model: TEST_MODEL, provider: '   ' },
    })
    expect(body.model).toBe(TEST_MODEL)
    expect(body.provider).toBeNull()
  })

  test('rejects a blank body', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const saved = await savePiece(agent, world.id, 'A premise')

    const { status, body } = await call<any>('PATCH', `/api/pieces/${saved.pieceId}`, { agent, body: { body: '  ' } })
    expect(status).toBe(400)
    expect(body.error).toBe('Piece body required')
  })

  test('rejects an unknown model id', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const saved = await savePiece(agent, world.id, 'A premise')

    const { status, body } = await call<any>('PATCH', `/api/pieces/${saved.pieceId}`, {
      agent,
      body: { body: 'Text.', model: 'not/a-real-model' },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('Invalid model')
  })

  test('404s for another user\'s piece', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const saved = await savePiece(owner, world.id, 'A premise', 'Untouched.')
    const stranger = await signupEmpty()

    const { status } = await call('PATCH', `/api/pieces/${saved.pieceId}`, { agent: stranger, body: { body: 'Hijack.' } })
    expect(status).toBe(404)

    const still = await call<any>('GET', `/api/pieces/${saved.pieceId}`, { agent: owner })
    expect(still.body.body).toBe('Untouched.')
  })

  test('404s for an unknown piece', async () => {
    const agent = await signupEmpty()
    const { status } = await call('PATCH', '/api/pieces/999999', { agent, body: { body: 'Text.' } })
    expect(status).toBe(404)
  })
})
