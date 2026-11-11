import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetMigrationStatus,
  isBenignMigrationError,
  markMigrationDone,
  readiness,
  runAdditive,
} from './migration-status'

beforeEach(() => {
  _resetMigrationStatus()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('isBenignMigrationError', () => {
  it('accepts the "already applied" outcomes of additive DDL', () => {
    for (const m of [
      'SQLITE_ERROR: duplicate column name: owner_id',
      'table games already exists',
      'index games_owner_idx already exists',
      'Cannot add a UNIQUE column',
    ]) {
      expect(isBenignMigrationError(new Error(m))).toBe(true)
    }
  })

  it('rejects real failures', () => {
    for (const m of [
      'SQLITE_FULL: database or disk is full',
      'SQLITE_BUSY: database is locked',
      'no such table: decks',
      'near "ADDD": syntax error',
      'SQLITE_READONLY: attempt to write a readonly database',
    ]) {
      expect(isBenignMigrationError(new Error(m))).toBe(false)
    }
  })
})

describe('readiness', () => {
  it('is "starting" until both steps finish, then ready', () => {
    expect(readiness()).toEqual({ ready: false, reason: 'starting', pending: ['app-schema', 'auth-schema'] })
    markMigrationDone('app-schema')
    expect(readiness()).toEqual({ ready: false, reason: 'starting', pending: ['auth-schema'] })
    markMigrationDone('auth-schema')
    expect(readiness()).toEqual({ ready: true })
  })

  it('a real failure makes it not-ready even after both steps report done', async () => {
    const ok = await runAdditive('app-schema', async () => {
      throw new Error('SQLITE_FULL: database or disk is full')
    }, 'ALTER TABLE games ADD COLUMN x TEXT')
    expect(ok).toBe(false)
    markMigrationDone('app-schema')
    markMigrationDone('auth-schema')
    const r = readiness()
    expect(r.ready).toBe(false)
    expect(r).toMatchObject({ reason: 'migration-failed', failures: [{ step: 'app-schema' }] })
  })

  it('benign errors are swallowed and do not affect readiness', async () => {
    const ok = await runAdditive('auth-schema', async () => {
      throw new Error('duplicate column name: bio')
    }, 'ALTER TABLE user ADD COLUMN bio TEXT')
    expect(ok).toBe(true)
    markMigrationDone('app-schema')
    markMigrationDone('auth-schema')
    expect(readiness()).toEqual({ ready: true })
  })
})
