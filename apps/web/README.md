# @doot-games/web

The Nuxt 4 shell: discovery, the editor, host/play, auth, persistence, uploads.

- **Pages**: `/` (home), `/explore`, `/create`, `/editor/<type>` + `/editor/g/<id>`
  (schema-driven editor with markdown import), `/host/<type>` + `/host/g/<id>`,
  `/play/<CODE>`, `/g/<id>` (shareable detail), `/login`. Host/play are client-only
  (they open the relay).
- **Server (`/api`)**: `games` CRUD (create/list/get/put/patch/delete, owner-scoped,
  visibility-enforced), `auth/[...all]` (better-auth), `uploads/{presign,config}`.
- **Stores**: Drizzle over libSQL/SQLite (`server/utils/db.ts`); better-auth owns its
  own tables; nothing about a live room is ever written here.
- **Deploy**: git push → GitHub Actions → GHCR → droplet (see `HANDOFF.md` and
  `docker/`). Live at https://doot.games.

`pnpm dev` runs it against the public relay with a zero-config local SQLite file.
