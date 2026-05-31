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
  /** Why uploads are unavailable (e.g. "Sign in to upload images."), shown as a
   *  hint beside the URL field when `enabled` is false but storage exists. Empty
   *  string means uploads are available or there is nothing to explain. */
  reason?: Ref<string>
}

export const IMAGE_UPLOAD: InjectionKey<ImageUploadContext> = Symbol('doot-image-upload')
