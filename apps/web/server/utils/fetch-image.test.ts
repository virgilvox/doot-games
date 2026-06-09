import { describe, expect, it } from 'vitest'
import { decodeImageData, sniffImageType } from './fetch-image'

/** A real 1x1 PNG (the smallest valid one), used as the happy-path fixture. */
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('sniffImageType', () => {
  it('identifies the four allowed formats by magic bytes', () => {
    expect(sniffImageType(new Uint8Array(Buffer.from(PNG_1PX, 'base64')))).toBe('image/png')
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image/jpeg')
    expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]))).toBe('image/gif')
    const webp = new Uint8Array(16)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    expect(sniffImageType(webp)).toBe('image/webp')
  })

  it('rejects non-image bytes (a mislabeled payload cannot smuggle through)', () => {
    expect(sniffImageType(new Uint8Array(Buffer.from('<svg onload=alert(1)>')))).toBeNull()
    expect(sniffImageType(new Uint8Array(Buffer.from('%PDF-1.4 not an image')))).toBeNull()
    expect(sniffImageType(new Uint8Array())).toBeNull()
  })
})

describe('decodeImageData', () => {
  it('decodes bare base64 and reads the type from the bytes', () => {
    const img = decodeImageData(PNG_1PX)
    expect(img.contentType).toBe('image/png')
    expect(img.bytes.length).toBeGreaterThan(20)
  })

  it('accepts a full data: URI (whatever mime it claims, the bytes decide)', () => {
    const img = decodeImageData(`data:image/jpeg;base64,${PNG_1PX}`)
    expect(img.contentType).toBe('image/png')
  })

  it('tolerates whitespace and base64url alphabet', () => {
    const wrapped = PNG_1PX.replace(/(.{40})/g, '$1\n').replace(/\+/g, '-').replace(/\//g, '_')
    expect(decodeImageData(wrapped).contentType).toBe('image/png')
  })

  it('rejects garbage, empty, and non-image payloads', () => {
    expect(() => decodeImageData('not base64 at all!!!')).toThrow(/base64/i)
    expect(() => decodeImageData('')).toThrow()
    expect(() => decodeImageData(Buffer.from('plain text').toString('base64'))).toThrow(/PNG, JPEG, GIF, or WebP/)
  })

  it('rejects payloads over the 5MB cap before decoding', () => {
    const big = 'A'.repeat(Math.ceil(5 * 1024 * 1024 * 1.4) + 8)
    expect(() => decodeImageData(big)).toThrow(/too large/i)
  })
})
