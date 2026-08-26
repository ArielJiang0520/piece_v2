import { describe, expect, test } from 'bun:test'
import { call, createAddition, createWorld, savePiece, signupEmpty, tick } from './helpers'

// "Prompt" means cluster everywhere in this product: the list, the counts and the search all
// read clusters and show each one's latest prompt as its title.

describe('GET /api/worlds/:id/clusters', () => {
  test('lists the checked-out version\'s clusters with rollups', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const first = await savePiece(agent, world.id, 'A lighthouse goes dark')
    await tick()
    await savePiece(agent, world.id, 'A lighthouse goes dark at midnight', 'Text.', {
      versionSourcePromptId: first.promptId,
    })

    const { status, body } = await call<any>('GET', `/api/worlds/${world.id}/clusters`, { agent })
    expect(status).toBe(200)
    expect(body).toMatchObject({ page: 1, limit: 20, total: 1, hasMore: false })
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      id: first.clusterId,
      title: 'A lighthouse goes dark at midnight',
      prompt_count: 2,
      piece_count: 2,
      used_additions: false,
      version_number: 1,
      version_name: null,
    })
    expect(body.totalPieces).toBe(2)
  })

  test('is empty for a fresh account and for a fresh version', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)

    const empty = await call<any>('GET', `/api/worlds/${world.id}/clusters`, { agent })
    expect(empty.body).toMatchObject({ items: [], total: 0, totalPieces: 0 })

    await savePiece(agent, world.id, 'A premise')
    await tick()
    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: {} })

    const onNewVersion = await call<any>('GET', `/api/worlds/${world.id}/clusters`, { agent })
    expect(onNewVersion.body.items).toEqual([])
  })

  test('sorts', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const older = await savePiece(agent, world.id, 'Older premise')
    await tick()
    const newer = await savePiece(agent, world.id, 'Newer premise')
    await tick()
    // Give the older cluster a second piece so it wins on most_pieces.
    await savePiece(agent, world.id, 'Older premise', 'Another telling.')

    const latest = await call<any>('GET', `/api/worlds/${world.id}/clusters?sort=latest`, { agent })
    expect(latest.body.items[0].id).toBe(older.clusterId)

    const oldest = await call<any>('GET', `/api/worlds/${world.id}/clusters?sort=oldest`, { agent })
    expect(oldest.body.items[0].id).toBe(newer.clusterId)

    const mostPieces = await call<any>('GET', `/api/worlds/${world.id}/clusters?sort=most_pieces`, { agent })
    expect(mostPieces.body.items[0].id).toBe(older.clusterId)
    expect(mostPieces.body.items[0].piece_count).toBe(2)
  })

  test('paginates', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    for (let i = 1; i <= 3; i += 1) {
      await savePiece(agent, world.id, `Premise ${i}`)
      await tick()
    }

    const page1 = await call<any>('GET', `/api/worlds/${world.id}/clusters?page=1&limit=2`, { agent })
    expect(page1.body.items).toHaveLength(2)
    expect(page1.body).toMatchObject({ total: 3, hasMore: true })

    const page2 = await call<any>('GET', `/api/worlds/${world.id}/clusters?page=2&limit=2`, { agent })
    expect(page2.body.items).toHaveLength(1)
    expect(page2.body.hasMore).toBe(false)
  })

  test('narrows to a shelf of additions, and `none` is the complement', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const addition = await createAddition(agent, world.id, 'Winter')
    const withAddition = await savePiece(agent, world.id, 'A cold premise', 'Snowbound.', {
      additionIds: [addition.id],
    })
    await tick()
    const bare = await savePiece(agent, world.id, 'A plain premise')

    const all = await call<any>('GET', `/api/worlds/${world.id}/clusters`, { agent })
    expect(all.body.items).toHaveLength(2)

    const shelf = await call<any>('GET', `/api/worlds/${world.id}/clusters?additions=${addition.id}`, { agent })
    expect(shelf.body.items.map((item: any) => item.id)).toEqual([withAddition.clusterId])
    expect(shelf.body.items[0].used_additions).toBe(true)

    const plain = await call<any>('GET', `/api/worlds/${world.id}/clusters?additions=none`, { agent })
    expect(plain.body.items.map((item: any) => item.id)).toEqual([bare.clusterId])
    expect(plain.body.items[0].used_additions).toBe(false)
  })

  test('an addition nothing was written under yields an empty list, not an unfiltered one', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const unused = await createAddition(agent, world.id, 'Unused')
    await savePiece(agent, world.id, 'A plain premise')

    const { body } = await call<any>('GET', `/api/worlds/${world.id}/clusters?additions=${unused.id}`, { agent })
    expect(body).toMatchObject({ items: [], total: 0, totalPieces: 0 })
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    expect((await call('GET', `/api/worlds/${world.id}/clusters`, { agent: stranger })).status).toBe(404)
  })

  test('401s without a session', async () => {
    expect((await call('GET', '/api/worlds/1/clusters')).status).toBe(401)
  })
})

describe('GET /api/worlds/:id/clusters/search', () => {
  test('returns nothing for an empty query without touching the embedder', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    await savePiece(agent, world.id, 'A premise')

    const { status, body } = await call<any>('GET', `/api/worlds/${world.id}/clusters/search?q=%20%20`, { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ items: [], total: 0, query: '', hasMore: false })
  })

  test('503s when the query cannot be embedded', async () => {
    // Search is the one read path that needs an embedding. With no OPENROUTER_API_KEY (see
    // setup.ts) embedPrompt returns null without opening a socket, which is this response.
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await call<any>('GET', `/api/worlds/${world.id}/clusters/search?q=lighthouse`, { agent })
    expect(status).toBe(503)
    expect(body.error).toBe('Embedding failed')
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    expect((await call('GET', `/api/worlds/${world.id}/clusters/search?q=x`, { agent: stranger })).status).toBe(404)
  })
})

describe('GET /api/worlds/:id/clusters/:clusterId', () => {
  test('returns the cluster with its prompt variations, oldest first', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const first = await savePiece(agent, world.id, 'A lighthouse goes dark')
    await tick()
    const second = await savePiece(agent, world.id, 'A lighthouse goes dark at midnight', 'Text.', {
      versionSourcePromptId: first.promptId,
    })

    const { status, body } = await call<any>('GET', `/api/worlds/${world.id}/clusters/${first.clusterId}`, { agent })
    expect(status).toBe(200)
    expect(body.cluster).toMatchObject({
      id: first.clusterId,
      prompt_count: 2,
      piece_count: 2,
      latest_prompt_id: second.promptId,
      title: 'A lighthouse goes dark at midnight',
      version_number: 1,
    })
    expect(body.prompts.map((prompt: any) => prompt.id)).toEqual([first.promptId, second.promptId])
  })

  test('404s for an unknown cluster', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await call<any>('GET', `/api/worlds/${world.id}/clusters/999999`, { agent })
    expect(status).toBe(404)
    expect(body.error).toBe('Cluster not found')
  })

  test('404s when the cluster belongs to another world', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const other = await createWorld(agent, 'Other')
    const saved = await savePiece(agent, world.id, 'A premise')

    expect((await call('GET', `/api/worlds/${other.id}/clusters/${saved.clusterId}`, { agent })).status).toBe(404)
  })
})

describe('DELETE /api/worlds/:id/clusters/:clusterId', () => {
  test('deletes every variation in the cluster and every piece under them', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const first = await savePiece(agent, world.id, 'A lighthouse goes dark')
    await tick()
    const second = await savePiece(agent, world.id, 'A lighthouse goes dark at midnight', 'Text.', {
      versionSourcePromptId: first.promptId,
    })

    const { status, body } = await call<any>('DELETE', `/api/worlds/${world.id}/clusters/${first.clusterId}`, { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, deletedPrompts: 2, deletedPieces: 2 })

    expect((await call('GET', `/api/worlds/${world.id}/clusters/${first.clusterId}`, { agent })).status).toBe(404)
    expect((await call('GET', `/api/pieces/${first.pieceId}`, { agent })).status).toBe(404)
    expect((await call('GET', `/api/pieces/${second.pieceId}`, { agent })).status).toBe(404)
    const list = await call<any>('GET', `/api/worlds/${world.id}/clusters`, { agent })
    expect(list.body.items).toEqual([])
  })

  test('404s for an unknown cluster', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    expect((await call('DELETE', `/api/worlds/${world.id}/clusters/999999`, { agent })).status).toBe(404)
  })

  test('404s for another user\'s cluster, leaving it in place', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const saved = await savePiece(owner, world.id, 'A premise')
    const stranger = await signupEmpty()

    expect((await call('DELETE', `/api/worlds/${world.id}/clusters/${saved.clusterId}`, { agent: stranger })).status).toBe(404)
    expect((await call('GET', `/api/worlds/${world.id}/clusters/${saved.clusterId}`, { agent: owner })).status).toBe(200)
  })
})
