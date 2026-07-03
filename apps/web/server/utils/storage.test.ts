import { describe, expect, it } from 'vitest'
import { EPHEMERAL_PREFIX, buildEphemeralLifecycleXml, ephemeralExt, ephemeralObjectKey } from './storage'

describe('buildEphemeralLifecycleXml (merge without clobbering)', () => {
  it('creates a fresh config when none exists', () => {
    const { xml, changed } = buildEphemeralLifecycleXml(null)
    expect(changed).toBe(true)
    expect(xml).toContain('<LifecycleConfiguration>')
    expect(xml).toContain('<Prefix>ephemeral/</Prefix>')
    expect(xml).toContain('<ID>doot-ephemeral-expiry</ID>')
    expect(xml).toContain('<Expiration><Days>1</Days></Expiration>')
  })

  it('is idempotent: no change when our rule is already present', () => {
    const first = buildEphemeralLifecycleXml(null).xml
    const { xml, changed } = buildEphemeralLifecycleXml(first)
    expect(changed).toBe(false)
    expect(xml).toBe(first)
  })

  it('MERGES into an existing config without dropping other rules', () => {
    const existing =
      '<LifecycleConfiguration><Rule><ID>backups-expiry</ID><Filter><Prefix>backups/</Prefix></Filter>' +
      '<Status>Enabled</Status><Expiration><Days>30</Days></Expiration></Rule></LifecycleConfiguration>'
    const { xml, changed } = buildEphemeralLifecycleXml(existing)
    expect(changed).toBe(true)
    expect(xml).toContain('<ID>backups-expiry</ID>') // preserved
    expect(xml).toContain('<ID>doot-ephemeral-expiry</ID>') // added
    expect(xml).toContain('backups/')
    expect(xml).toContain('ephemeral/')
    expect(xml.match(/<\/LifecycleConfiguration>/g)).toHaveLength(1)
  })

  it('treats a blank/garbage existing config as none', () => {
    expect(buildEphemeralLifecycleXml('   ').changed).toBe(true)
    expect(buildEphemeralLifecycleXml('<html></html>').changed).toBe(true)
  })
})

describe('ephemeralExt', () => {
  it('maps content types to extensions', () => {
    expect(ephemeralExt('application/json')).toBe('json')
    expect(ephemeralExt('image/png')).toBe('png')
    expect(ephemeralExt('image/jpeg')).toBe('jpg')
    expect(ephemeralExt('image/webp')).toBe('webp')
  })
})

describe('ephemeralObjectKey', () => {
  it('scopes the key to the room under the ephemeral prefix', () => {
    const key = ephemeralObjectKey('WXYZ', 'abc-123.json')
    expect(key).toBe(`${EPHEMERAL_PREFIX}WXYZ/abc-123.json`)
  })

  it('sanitizes a hostile room code and id (no traversal / injection)', () => {
    const key = ephemeralObjectKey('../../etc', '../../../secret?x=1')
    expect(key).not.toContain('..')
    expect(key).not.toContain('?')
    expect(key.startsWith(EPHEMERAL_PREFIX)).toBe(true)
    // Exactly two slashes: prefix, room segment, id.
    expect(key.match(/\//g)).toHaveLength(2)
  })
})
