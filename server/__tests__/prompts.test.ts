import { describe, expect, test } from 'bun:test'
import { call, createWorld, savePiece, signupEmpty, tick } from './helpers'

describe('GET /api/worlds/:id/prompts/:promptId', () => {
  test('returns the prompt with its pieces, newest first', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const first = await savePiece(agent, world.id, 'A premise', 'First telling.')
    await tick()
    const second = await savePiece(agent, world.id, 'A premise', 'Second telling.')

    const { status, body } = await call<any>('GET', `/api/worlds/${world.id}/prompts/${first.promptId}`, { agent })
    expect(status).toBe(200)
    expect(body.prompt).toMatchObject({
      id: first.promptId,
      cluster_id: first.clusterId,
      text: 'A premise',
      piece_count: 2,
    })
    expect(body.pieces.map((piece: any) => piece.id)).toEqual([second.pieceId, first.pieceId])
    expect(body.pieces[0].preview).toBe('Second telling.')
    expect(body).toMatchObject({ page: 1, limit: 20, hasMore: false })
  })

  test('paginates the pieces', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    let promptId = 0
    for (let i = 1; i <= 3; i += 1) {
      const saved = await savePiece(agent, world.id, 'A premise', `Telling ${i}.`)
      promptId = saved.promptId
      await tick()
    }

    const page1 = await call<any>('GET', `/api/worlds/${world.id}/prompts/${promptId}?page=1&limit=2`, { agent })
    expect(page1.body.pieces).toHaveLength(2)
    expect(page1.body.hasMore).toBe(true)

    const page2 = await call<any>('GET', `/api/worlds/${world.id}/prompts/${promptId}?page=2&limit=2`, { agent })
    expect(page2.body.pieces).toHaveLength(1)
    expect(page2.body.hasMore).toBe(false)
  })

  test('404s for an unknown prompt', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await call<any>('GET', `/api/worlds/${world.id}/prompts/999999`, { agent })
    expect(status).toBe(404)
    expect(body.error).toBe('Prompt not found')
  })

  test('404s when the prompt belongs to another world', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const other = await createWorld(agent, 'Other')
    const saved = await savePiece(agent, world.id, 'A premise')

    expect((await call('GET', `/api/worlds/${other.id}/prompts/${saved.promptId}`, { agent })).status).toBe(404)
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const saved = await savePiece(owner, world.id, 'A premise')
    const stranger = await signupEmpty()

    expect((await call('GET', `/api/worlds/${world.id}/prompts/${saved.promptId}`, { agent: stranger })).status).toBe(404)
  })

  test('401s without a session', async () => {
    expect((await call('GET', '/api/worlds/1/prompts/1')).status).toBe(401)
  })
})

describe('DELETE /api/worlds/:id/prompts/:promptId', () => {
  test('deletes the prompt with its pieces, and the cluster it was alone in', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const first = await savePiece(agent, world.id, 'A premise', 'First telling.')
    await tick()
    await savePiece(agent, world.id, 'A premise', 'Second telling.')

    const { status, body } = await call<any>('DELETE', `/api/worlds/${world.id}/prompts/${first.promptId}`, { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, deletedPieces: 2, nextPromptId: null, clusterDeleted: true })

    expect((await call('GET', `/api/worlds/${world.id}/prompts/${first.promptId}`, { agent })).status).toBe(404)
    expect((await call('GET', `/api/pieces/${first.pieceId}`, { agent })).status).toBe(404)
    expect((await call('GET', `/api/worlds/${world.id}/clusters/${first.clusterId}`, { agent })).status).toBe(404)
  })

  test('a cluster with other variations survives, and points at the next prompt', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const first = await savePiece(agent, world.id, 'A premise')
    await tick()
    const second = await savePiece(agent, world.id, 'A rewritten premise', 'Text.', {
      versionSourcePromptId: first.promptId,
    })

    const { body } = await call<any>('DELETE', `/api/worlds/${world.id}/prompts/${second.promptId}`, { agent })
    expect(body.clusterDeleted).toBe(false)
    expect(body.nextPromptId).toBe(first.promptId)

    const cluster = await call<any>('GET', `/api/worlds/${world.id}/clusters/${first.clusterId}`, { agent })
    expect(cluster.status).toBe(200)
    expect(cluster.body.prompts).toHaveLength(1)
    expect(cluster.body.cluster.latest_prompt_id).toBe(first.promptId)
  })

  test('deleting the same prompt twice 404s the second time', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const first = await savePiece(agent, world.id, 'A premise')
    await tick()
    const second = await savePiece(agent, world.id, 'A rewritten premise', 'Text.', {
      versionSourcePromptId: first.promptId,
    })
    await call('DELETE', `/api/worlds/${world.id}/prompts/${second.promptId}`, { agent })

    const { status, body } = await call<any>('DELETE', `/api/worlds/${world.id}/prompts/${second.promptId}`, { agent })
    expect(status).toBe(404)
    expect(body.error).toBe('Prompt not found')
  })

  test('404s for an unknown prompt', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    expect((await call('DELETE', `/api/worlds/${world.id}/prompts/999999`, { agent })).status).toBe(404)
  })

  test('404s for another user\'s prompt, leaving it in place', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const saved = await savePiece(owner, world.id, 'A premise')
    const stranger = await signupEmpty()

    expect((await call('DELETE', `/api/worlds/${world.id}/prompts/${saved.promptId}`, { agent: stranger })).status).toBe(404)
    expect((await call('GET', `/api/worlds/${world.id}/prompts/${saved.promptId}`, { agent: owner })).status).toBe(200)
  })
})
