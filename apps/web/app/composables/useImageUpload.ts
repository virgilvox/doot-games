import type { ImageUploader } from '@doot-games/ui'

/**
 * An {@link ImageUploader}: presign a PUT, then upload the file straight to
 * object storage and return its public URL. The PUT uses native `fetch` (not
 * `$fetch`) so the exact signed headers are sent unmodified.
 */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5 MB

export function useImageUpload(): ImageUploader {
  return async (file: File): Promise<string> => {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Image is too large (max 5 MB).' })
    }
    const { uploadUrl, publicUrl, headers } = await $fetch<{
      uploadUrl: string
      publicUrl: string
      headers: Record<string, string>
    }>('/api/uploads/presign', { method: 'POST', body: { contentType: file.type } })

    const res = await fetch(uploadUrl, { method: 'PUT', headers, body: file })
    if (!res.ok) {
      throw createError({ statusCode: res.status, statusMessage: 'Upload to storage failed.' })
    }
    return publicUrl
  }
}
