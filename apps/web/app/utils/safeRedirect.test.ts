import { describe, expect, it } from 'vitest'
import { isSafeRedirect } from './safeRedirect'

describe('isSafeRedirect', () => {
  it('allows real OAuth callbacks', () => {
    expect(isSafeRedirect('https://claude.ai/api/mcp/auth_callback?code=x&state=y')).toBe(true)
    expect(isSafeRedirect('http://localhost:53682/callback?code=x')).toBe(true)
    expect(isSafeRedirect('http://127.0.0.1:8080/cb')).toBe(true)
    expect(isSafeRedirect('vscode://some.ext/auth?code=x')).toBe(true)
  })

  it('blocks script-running and local schemes, however they are written', () => {
    for (const t of [
      'javascript:alert(document.cookie)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'blob:https://doot.games/uuid',
      'file:///etc/passwd',
    ]) {
      expect(isSafeRedirect(t), t).toBe(false)
    }
  })

  it('rejects things that are not absolute URLs', () => {
    expect(isSafeRedirect('')).toBe(false)
    expect(isSafeRedirect('/relative/path')).toBe(false)
    expect(isSafeRedirect('not a url')).toBe(false)
  })
})
