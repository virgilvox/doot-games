/**
 * Object storage for uploaded images, presigned PUT to an S3-compatible store
 * (DigitalOcean Spaces in prod, MinIO locally). Browsers upload directly to the
 * store via the presigned URL; the app only signs. Configured by env:
 *   SPACES_ENDPOINT, SPACES_REGION, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET,
 *   SPACES_PUBLIC_URL (optional; defaults to <endpoint>/<bucket>).
 * With none set, uploads are simply disabled and the editor falls back to URL.
 */
import { AwsClient } from 'aws4fetch'

interface StorageConfig {
  endpoint: string
  region: string
  bucket: string
  accessKey: string
  secretKey: string
  publicBase: string
}

function readConfig(): StorageConfig | null {
  const endpoint = process.env.SPACES_ENDPOINT?.replace(/\/$/, '')
  const bucket = process.env.SPACES_BUCKET
  const accessKey = process.env.SPACES_KEY
  const secretKey = process.env.SPACES_SECRET
  if (!endpoint || !bucket || !accessKey || !secretKey) return null
  const publicBase = (process.env.SPACES_PUBLIC_URL || `${endpoint}/${bucket}`).replace(/\/$/, '')
  return { endpoint, region: process.env.SPACES_REGION || 'us-east-1', bucket, accessKey, secretKey, publicBase }
}

export function isStorageConfigured(): boolean {
  return readConfig() !== null
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export function extensionFor(contentType: string): string | null {
  return EXT[contentType] ?? null
}

export interface PresignedUpload {
  /** The presigned URL the browser PUTs the file to. */
  uploadUrl: string
  /** The public URL the saved image will be readable at. */
  publicUrl: string
  /** Headers the browser must send on the PUT to match the signature. */
  headers: Record<string, string>
}

/** Presign a direct browser PUT for `objectKey`. */
export async function presignUpload(objectKey: string, contentType: string): Promise<PresignedUpload> {
  const cfg = readConfig()
  if (!cfg) throw createError({ statusCode: 501, statusMessage: 'Uploads are not configured.' })
  const client = new AwsClient({
    accessKeyId: cfg.accessKey,
    secretAccessKey: cfg.secretKey,
    region: cfg.region,
    service: 's3',
  })
  const objectUrl = `${cfg.endpoint}/${cfg.bucket}/${objectKey}`
  const headers = { 'content-type': contentType, 'x-amz-acl': 'public-read' }
  const signed = await client.sign(objectUrl, { method: 'PUT', headers, aws: { signQuery: true } })
  return { uploadUrl: signed.url, publicUrl: `${cfg.publicBase}/${objectKey}`, headers }
}
