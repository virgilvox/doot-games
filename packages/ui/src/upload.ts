/**
 * Image-upload capability, injected by the app so `ImageField` can offer file
 * uploads without `@doot-games/ui` knowing anything about API routes or storage.
 * The app `provide()`s an {@link ImageUploadContext}; when absent or disabled,
 * image fields fall back to URL-paste, so the library stays self-contained and
 * dev works with no object storage configured.
 */
import type { InjectionKey, Ref } from 'vue'

/** Uploads a file and resolves to its public URL. */
export type ImageUploader = (file: File) => Promise<string>

export interface ImageUploadContext {
  /** Whether uploads are available right now (configured + permitted). */
  enabled: Ref<boolean>
  upload: ImageUploader
}

export const IMAGE_UPLOAD: InjectionKey<ImageUploadContext> = Symbol('doot-image-upload')
