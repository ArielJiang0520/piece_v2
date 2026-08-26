import { describe, expect, test } from 'bun:test'
import { call, createWorld, savePiece, signupEmpty, tick } from './helpers'

// Versions behave like git branches: one is checked out (worlds.current_version_id), editing
// changes it in place, "new version" is Save-As, and switching moves the pointer.

async function versionsOf(agent: Awaited<ReturnType<typeof signupEmpty>>, worldId: number) {
  const { body } = await call<any[]>('GET', `/api/worlds/${worldId}/versions`, { agent })
  return body
}

describe('GET /api/worlds/:id/versions', () => {
  test('lists versions newest first with stable numbers', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Branching', 'v1 body')
    await tick()
    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: { body: 'v2 body', version_name: 'Second' } })

    const versions = await versionsOf(agent, world.id)
    expect(versions).toHaveLength(2)
    expect(versions[0]).toMatchObject({ number: 2, name: 'Second' })
    expect(versions[1]).toMatchObject({ number: 1, name: null })
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    expect((await call('GET', `/api/worlds/${world.id}/versions`, { agent: stranger })).status).toBe(404)
  })

  test('401s without a session', async () => {
    expect((await call('GET', '/api/worlds/1/versions')).status).toBe(401)
  })
})

describe('POST /api/worlds/:id/versions', () => {
  test('creates a version, checks it out, and mirrors its body onto the world', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Save As', 'original')

    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/versions`, {
      agent,
      body: { body: 'a fork', version_name: 'Fork' },
    })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.version_id).toBeGreaterThan(0)

    const detail = await call<any>('GET', `/api/worlds/${world.id}`, { agent })
    expect(detail.body.current_version_id).toBe(body.version_id)
    expect(detail.body.current_version_name).toBe('Fork')
    expect(detail.body.body).toBe('a fork')
  })

  test('falls back to the world\'s current name and body, and treats a blank version name as none', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Keeper', 'kept body')

    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: { version_name: '   ' } })

    const detail = await call<any>('GET', `/api/worlds/${world.id}`, { agent })
    expect(detail.body.name).toBe('Keeper')
    expect(detail.body.body).toBe('kept body')
    expect(detail.body.current_version_name).toBeNull()
  })

  test('numbers stay stable when an older version is deleted', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Numbers')
    await tick()
    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: {} })
    await tick()
    const versions = await versionsOf(agent, world.id)
    const first = versions.find(version => version.number === 1)!

    await call('DELETE', `/api/worlds/${world.id}/versions/${first.id}`, { agent })
    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: {} })

    const after = await versionsOf(agent, world.id)
    expect(after.map(version => version.number).sort()).toEqual([2, 3])
  })

  test('rejects a blank name', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/versions`, {
      agent,
      body: { name: '   ' },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('Name required')
  })

  test('404s for another user\'s world', async () => {
    const owner = await signupEmpty()
    const world = await createWorld(owner)
    const stranger = await signupEmpty()
    expect((await call('POST', `/api/worlds/${world.id}/versions`, { agent: stranger, body: {} })).status).toBe(404)
  })
})

describe('POST /api/worlds/:id/versions/:versionId/switch', () => {
  test('moves HEAD and mirrors that version\'s body onto the world', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Switcher', 'v1 body')
    await tick()
    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: { body: 'v2 body' } })
    const versions = await versionsOf(agent, world.id)
    const first = versions.find(version => version.number === 1)!

    const { status, body } = await call<any>('POST', `/api/worlds/${world.id}/versions/${first.id}/switch`, { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, changed: true })

    const detail = await call<any>('GET', `/api/worlds/${world.id}`, { agent })
    expect(detail.body.current_version_id).toBe(first.id)
    expect(detail.body.body).toBe('v1 body')
    // Nothing was lost: both versions still exist.
    expect(await versionsOf(agent, world.id)).toHaveLength(2)
  })

  test('reports changed:false when that version is already checked out', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const detail = await call<any>('GET', `/api/worlds/${world.id}`, { agent })

    const { status, body } = await call<any>(
      'POST',
      `/api/worlds/${world.id}/versions/${detail.body.current_version_id}/switch`,
      { agent },
    )
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, changed: false })
  })

  test('404s for a version that belongs to another world', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const other = await createWorld(agent, 'Other')
    const otherDetail = await call<any>('GET', `/api/worlds/${other.id}`, { agent })

    const { status } = await call(
      'POST',
      `/api/worlds/${world.id}/versions/${otherDetail.body.current_version_id}/switch`,
      { agent },
    )
    expect(status).toBe(404)
  })
})

describe('DELETE /api/worlds/:id/versions/:versionId', () => {
  test('refuses to delete the only version', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    const versions = await versionsOf(agent, world.id)

    const { status, body } = await call<any>('DELETE', `/api/worlds/${world.id}/versions/${versions[0]!.id}`, { agent })
    expect(status).toBe(400)
    expect(body.error).toBe('Cannot delete the last version')
    expect(await versionsOf(agent, world.id)).toHaveLength(1)
  })

  test('deleting a non-checked-out version leaves HEAD alone', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Trim', 'v1 body')
    await tick()
    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: { body: 'v2 body' } })
    const before = await call<any>('GET', `/api/worlds/${world.id}`, { agent })
    const versions = await versionsOf(agent, world.id)
    const first = versions.find(version => version.number === 1)!

    const { status, body } = await call<any>('DELETE', `/api/worlds/${world.id}/versions/${first.id}`, { agent })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true })

    const after = await call<any>('GET', `/api/worlds/${world.id}`, { agent })
    expect(after.body.current_version_id).toBe(before.body.current_version_id)
    expect(after.body.body).toBe('v2 body')
  })

  test('deleting the checked-out version moves HEAD to the most recent remaining one', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Fallback', 'v1 body')
    await tick()
    const created = await call<any>('POST', `/api/worlds/${world.id}/versions`, { agent, body: { body: 'v2 body' } })
    const versions = await versionsOf(agent, world.id)
    const first = versions.find(version => version.number === 1)!

    await call('DELETE', `/api/worlds/${world.id}/versions/${created.body.version_id}`, { agent })

    const detail = await call<any>('GET', `/api/worlds/${world.id}`, { agent })
    expect(detail.body.current_version_id).toBe(first.id)
    expect(detail.body.body).toBe('v1 body')
  })

  test('takes everything the version owns with it', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent, 'Cascade', 'v1 body')
    const saved = await savePiece(agent, world.id, 'A premise on v1')
    await tick()
    // A second version starts empty — the v1 prompt does not follow it.
    await call('POST', `/api/worlds/${world.id}/versions`, { agent, body: { body: 'v2 body' } })
    const clusters = await call<any>('GET', `/api/worlds/${world.id}/clusters`, { agent })
    expect(clusters.body.items).toHaveLength(0)

    const versions = await versionsOf(agent, world.id)
    const first = versions.find(version => version.number === 1)!
    await call('DELETE', `/api/worlds/${world.id}/versions/${first.id}`, { agent })

    // Deleting v1 cascaded to its cluster, its prompt and that prompt's piece.
    expect((await call('GET', `/api/pieces/${saved.pieceId}`, { agent })).status).toBe(404)
    expect((await call('GET', `/api/worlds/${world.id}/clusters/${saved.clusterId}`, { agent })).status).toBe(404)
  })

  test('404s for an unknown version', async () => {
    const agent = await signupEmpty()
    const world = await createWorld(agent)
    expect((await call('DELETE', `/api/worlds/${world.id}/versions/999999`, { agent })).status).toBe(404)
  })
})
