<script setup lang="ts">
/**
 * Admin console. Auth-gated: every panel's data comes from `/api/admin/*`, each of
 * which enforces `requireAdmin` server-side, so this page is only ever a view over
 * data the server already decided the caller may see. The client gate below is
 * cosmetic (it just avoids flashing an empty console at non-admins); the real
 * security is on the routes.
 *
 * Tabs: Overview (metrics), Users (roles + bans), Games (visibility, feature, delete),
 * Decks (visibility, delete).
 */
import { computed, onMounted, ref, watch } from 'vue'

type Visibility = 'public' | 'unlisted' | 'private'

interface Stats {
  users: { total: number; withHandle: number; admins: number; banned: number; new7d: number; new30d: number }
  games: { total: number; public: number; unlisted: number; private: number; featured: number; plays: number; new7d: number }
  decks: { total: number; public: number; unlisted: number; private: number; new7d: number }
  bookmarks: number
  byType: Array<{ pluginId: string; count: number }>
  topPlayed: Array<{ id: string; title: string; plays: number; visibility: Visibility }>
}
interface AdminUser {
  id: string
  email: string | null
  name: string | null
  handle: string | null
  image: string | null
  role: string
  banned: boolean
  banReason: string | null
  createdAt: string | null
  gameCount: number
  publicGameCount: number
  deckCount: number
  totalPlays: number
}
interface AdminGame {
  id: string
  title: string
  pluginId: string
  visibility: Visibility
  featured: boolean
  plays: number
  lastPlayedAt: number | null
  createdAt: number
  ownerId: string | null
  ownerEmail: string | null
  ownerHandle: string | null
  ownerName: string | null
}
interface AdminDeck {
  id: string
  name: string
  kind: string
  game: string | null
  visibility: Visibility
  rowCount: number
  createdAt: number
  ownerId: string | null
  ownerEmail: string | null
  ownerHandle: string | null
}

const session = authClient.useSession()
const sessionUser = computed(() => session.value?.data?.user ?? null)

// ── Access gate ──────────────────────────────────────────────────────────────
const checking = ref(true)
const allowed = ref(false)
async function checkAccess() {
  try {
    const r = await $fetch<{ admin: boolean }>('/api/admin/me')
    allowed.value = !!r.admin
  } catch {
    allowed.value = false
  } finally {
    checking.value = false
  }
}

const tab = ref<'overview' | 'users' | 'games' | 'decks'>('overview')

// ── Data ─────────────────────────────────────────────────────────────────────
const stats = ref<Stats | null>(null)
const users = ref<AdminUser[]>([])
const games = ref<AdminGame[]>([])
const decks = ref<AdminDeck[]>([])
const userQuery = ref('')
const gameQuery = ref('')
const gameSort = ref<'plays' | 'recent'>('plays')
const gameVis = ref<'' | Visibility>('')
const deckQuery = ref('')
const busy = ref(false)
const note = ref('')

function flash(msg: string) {
  note.value = msg
  setTimeout(() => {
    if (note.value === msg) note.value = ''
  }, 3000)
}

async function loadStats() {
  stats.value = await $fetch<Stats>('/api/admin/stats')
}
async function loadUsers() {
  const r = await $fetch<{ users: AdminUser[] }>('/api/admin/users', { query: { q: userQuery.value || undefined } })
  users.value = r.users
}
async function loadGames() {
  const r = await $fetch<{ games: AdminGame[] }>('/api/admin/games', {
    query: { sort: gameSort.value, visibility: gameVis.value || undefined, q: gameQuery.value || undefined },
  })
  games.value = r.games
}
async function loadDecks() {
  const r = await $fetch<{ decks: AdminDeck[] }>('/api/admin/decks', { query: { q: deckQuery.value || undefined } })
  decks.value = r.decks
}

// Load each tab's data on first visit (and overview up front).
const loaded = ref<Record<string, boolean>>({})
async function ensureTab(t: typeof tab.value) {
  if (loaded.value[t]) return
  try {
    if (t === 'overview') await loadStats()
    if (t === 'users') await loadUsers()
    if (t === 'games') await loadGames()
    if (t === 'decks') await loadDecks()
    loaded.value[t] = true
  } catch (e) {
    flash((e as { statusMessage?: string })?.statusMessage ?? 'Could not load data.')
  }
}
watch(tab, (t) => ensureTab(t))

onMounted(async () => {
  await checkAccess()
  if (allowed.value) await ensureTab('overview')
})

// ── Actions ──────────────────────────────────────────────────────────────────
async function action<T>(fn: () => Promise<T>, ok: string): Promise<boolean> {
  busy.value = true
  try {
    await fn()
    flash(ok)
    return true
  } catch (e) {
    flash((e as { statusMessage?: string })?.statusMessage ?? 'Action failed.')
    return false
  } finally {
    busy.value = false
  }
}

async function setRole(u: AdminUser, role: 'admin' | 'user') {
  if (await action(() => $fetch(`/api/admin/users/${u.id}/role`, { method: 'POST', body: { role } }), 'Role updated.'))
    u.role = role
}
async function toggleBan(u: AdminUser) {
  const banned = !u.banned
  let reason: string | undefined
  if (banned) {
    const r = window.prompt(`Suspend ${u.email ?? u.id}? Optional reason shown to them:`, '')
    if (r === null) return // cancelled
    reason = r || undefined
  } else if (!window.confirm(`Lift the suspension on ${u.email ?? u.id}?`)) {
    return
  }
  if (
    await action(
      () => $fetch(`/api/admin/users/${u.id}/ban`, { method: 'POST', body: { banned, reason } }),
      banned ? 'User suspended.' : 'Suspension lifted.',
    )
  ) {
    u.banned = banned
    u.banReason = banned ? (reason ?? null) : null
  }
}

async function setGameVisibility(g: AdminGame, visibility: Visibility) {
  if (
    await action(
      () => $fetch(`/api/admin/games/${g.id}/moderate`, { method: 'POST', body: { visibility } }),
      'Visibility updated.',
    )
  )
    g.visibility = visibility
}
async function toggleFeatured(g: AdminGame) {
  const featured = !g.featured
  if (
    await action(
      () => $fetch(`/api/admin/games/${g.id}/moderate`, { method: 'POST', body: { featured } }),
      featured ? 'Featured.' : 'Unfeatured.',
    )
  )
    g.featured = featured
}
async function deleteGame(g: AdminGame) {
  if (!window.confirm(`Permanently delete "${g.title}"? This cannot be undone.`)) return
  if (await action(() => $fetch(`/api/admin/games/${g.id}`, { method: 'DELETE' }), 'Game deleted.'))
    games.value = games.value.filter((x) => x.id !== g.id)
}

async function setDeckVisibility(d: AdminDeck, visibility: Visibility) {
  if (
    await action(
      () => $fetch(`/api/admin/decks/${d.id}/moderate`, { method: 'POST', body: { visibility } }),
      'Visibility updated.',
    )
  )
    d.visibility = visibility
}
async function deleteDeck(d: AdminDeck) {
  if (!window.confirm(`Permanently delete deck "${d.name}"? This cannot be undone.`)) return
  if (await action(() => $fetch(`/api/admin/decks/${d.id}`, { method: 'DELETE' }), 'Deck deleted.'))
    decks.value = decks.value.filter((x) => x.id !== d.id)
}

function fmtDate(v: number | string | null): string {
  if (!v) return '—'
  const d = typeof v === 'number' ? new Date(v) : new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}
function ownerLabel(g: { ownerHandle: string | null; ownerEmail: string | null; ownerName: string | null }): string {
  if (g.ownerHandle) return `@${g.ownerHandle}`
  return g.ownerName || g.ownerEmail || 'unknown'
}

const overview = computed(() => stats.value)
</script>

<template>
  <main>
    <div class="wrap admin-wrap">
      <div v-if="checking" class="admin-boot">Checking access…</div>

      <div v-else-if="!allowed" class="panel denied">
        <span class="kicker">Restricted</span>
        <h1>Admins only</h1>
        <p>This area is for Doot administrators. If that's you, sign in with an admin account.</p>
        <div class="denied-actions">
          <NuxtLink v-if="!sessionUser" to="/login?redirect=/admin" class="btn btn-primary">Log in</NuxtLink>
          <NuxtLink to="/" class="btn btn-ghost">Back home</NuxtLink>
        </div>
      </div>

      <template v-else>
        <header class="admin-head">
          <div>
            <span class="kicker">Console</span>
            <h1>Admin</h1>
          </div>
          <p v-if="note" class="admin-note" role="status">{{ note }}</p>
        </header>

        <nav class="admin-tabs" role="tablist">
          <button :class="{ on: tab === 'overview' }" role="tab" @click="tab = 'overview'">Overview</button>
          <button :class="{ on: tab === 'users' }" role="tab" @click="tab = 'users'">Users</button>
          <button :class="{ on: tab === 'games' }" role="tab" @click="tab = 'games'">Games</button>
          <button :class="{ on: tab === 'decks' }" role="tab" @click="tab = 'decks'">Decks</button>
        </nav>

        <!-- OVERVIEW ------------------------------------------------------- -->
        <section v-show="tab === 'overview'" class="tabpanel">
          <div v-if="!overview" class="muted">Loading metrics…</div>
          <template v-else>
            <div class="cards">
              <div class="stat">
                <span class="stat-n">{{ overview.users.total }}</span>
                <span class="stat-l">Users</span>
                <span class="stat-sub">{{ overview.users.new7d }} new this week</span>
              </div>
              <div class="stat">
                <span class="stat-n">{{ overview.games.total }}</span>
                <span class="stat-l">Games</span>
                <span class="stat-sub">{{ overview.games.public }} published</span>
              </div>
              <div class="stat">
                <span class="stat-n">{{ overview.games.plays }}</span>
                <span class="stat-l">Total plays</span>
                <span class="stat-sub">{{ overview.games.new7d }} games made this week</span>
              </div>
              <div class="stat">
                <span class="stat-n">{{ overview.decks.total }}</span>
                <span class="stat-l">Decks</span>
                <span class="stat-sub">{{ overview.decks.public }} public</span>
              </div>
            </div>

            <div class="grid2">
              <div class="panel sub">
                <h2>Games by visibility</h2>
                <ul class="kv">
                  <li><span>Published (public)</span><b>{{ overview.games.public }}</b></li>
                  <li><span>Unlisted</span><b>{{ overview.games.unlisted }}</b></li>
                  <li><span>Private (unpublished)</span><b>{{ overview.games.private }}</b></li>
                  <li><span>Featured</span><b>{{ overview.games.featured }}</b></li>
                </ul>
                <h2 class="mt">Accounts</h2>
                <ul class="kv">
                  <li><span>With a public handle</span><b>{{ overview.users.withHandle }}</b></li>
                  <li><span>Admins</span><b>{{ overview.users.admins }}</b></li>
                  <li><span>Suspended</span><b :class="{ warn: overview.users.banned > 0 }">{{ overview.users.banned }}</b></li>
                  <li><span>New (30 days)</span><b>{{ overview.users.new30d }}</b></li>
                  <li><span>Saved bookmarks</span><b>{{ overview.bookmarks }}</b></li>
                </ul>
              </div>

              <div class="panel sub">
                <h2>Most played</h2>
                <ol v-if="overview.topPlayed.length" class="top">
                  <li v-for="g in overview.topPlayed" :key="g.id">
                    <NuxtLink :to="`/g/${g.id}`" class="top-title">{{ g.title || 'Untitled' }}</NuxtLink>
                    <span class="top-plays">{{ g.plays }} plays</span>
                  </li>
                </ol>
                <p v-else class="muted">No games have been hosted yet.</p>

                <h2 class="mt">By game type</h2>
                <ul class="kv">
                  <li v-for="t in overview.byType" :key="t.pluginId"><span>{{ t.pluginId }}</span><b>{{ t.count }}</b></li>
                </ul>
              </div>
            </div>
          </template>
        </section>

        <!-- USERS ---------------------------------------------------------- -->
        <section v-show="tab === 'users'" class="tabpanel">
          <div class="toolbar">
            <input
              v-model="userQuery"
              class="sf-input"
              type="search"
              placeholder="Search email, name, or @handle"
              @keyup.enter="loadUsers"
            />
            <button class="btn btn-ghost" :disabled="busy" @click="loadUsers">Search</button>
          </div>
          <div class="tablewrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>User</th><th>Role</th><th class="num">Games</th><th class="num">Plays</th>
                  <th class="num">Decks</th><th>Joined</th><th>Status</th><th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in users" :key="u.id" :class="{ banned: u.banned }">
                  <td>
                    <div class="who">
                      <span class="who-name">{{ u.name || u.handle || '—' }}</span>
                      <span class="who-sub">{{ u.email }}<template v-if="u.handle"> · @{{ u.handle }}</template></span>
                    </div>
                  </td>
                  <td><span class="pill" :class="u.role === 'admin' ? 'pill-admin' : ''">{{ u.role }}</span></td>
                  <td class="num">{{ u.gameCount }}<span class="dim"> ({{ u.publicGameCount }})</span></td>
                  <td class="num">{{ u.totalPlays }}</td>
                  <td class="num">{{ u.deckCount }}</td>
                  <td>{{ fmtDate(u.createdAt) }}</td>
                  <td>
                    <span v-if="u.banned" class="pill pill-ban" :title="u.banReason || ''">suspended</span>
                    <span v-else class="pill pill-ok">active</span>
                  </td>
                  <td class="actions-col">
                    <button v-if="u.role !== 'admin'" class="mini" :disabled="busy" @click="setRole(u, 'admin')">Make admin</button>
                    <button v-else class="mini" :disabled="busy" @click="setRole(u, 'user')">Remove admin</button>
                    <button class="mini" :class="u.banned ? '' : 'danger'" :disabled="busy" @click="toggleBan(u)">
                      {{ u.banned ? 'Unsuspend' : 'Suspend' }}
                    </button>
                  </td>
                </tr>
                <tr v-if="!users.length"><td colspan="8" class="muted center">No users found.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- GAMES ---------------------------------------------------------- -->
        <section v-show="tab === 'games'" class="tabpanel">
          <div class="toolbar">
            <input
              v-model="gameQuery"
              class="sf-input"
              type="search"
              placeholder="Search title or owner"
              @keyup.enter="loadGames"
            />
            <select v-model="gameSort" class="sf-input narrow" @change="loadGames">
              <option value="plays">Most played</option>
              <option value="recent">Newest</option>
            </select>
            <select v-model="gameVis" class="sf-input narrow" @change="loadGames">
              <option value="">All visibility</option>
              <option value="public">Published</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
            <button class="btn btn-ghost" :disabled="busy" @click="loadGames">Search</button>
          </div>
          <div class="tablewrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Game</th><th>Type</th><th>Owner</th><th class="num">Plays</th>
                  <th>Last played</th><th>Visibility</th><th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="g in games" :key="g.id">
                  <td>
                    <NuxtLink :to="`/g/${g.id}`" class="who-name link">{{ g.title || 'Untitled' }}</NuxtLink>
                    <span v-if="g.featured" class="pill pill-feat">featured</span>
                  </td>
                  <td class="dim">{{ g.pluginId }}</td>
                  <td class="dim">{{ ownerLabel(g) }}</td>
                  <td class="num">{{ g.plays }}</td>
                  <td>{{ fmtDate(g.lastPlayedAt) }}</td>
                  <td>
                    <select :value="g.visibility" class="sf-input narrow" :disabled="busy" @change="setGameVisibility(g, ($event.target as HTMLSelectElement).value as Visibility)">
                      <option value="public">Published</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="private">Private</option>
                    </select>
                  </td>
                  <td class="actions-col">
                    <button class="mini" :disabled="busy" @click="toggleFeatured(g)">{{ g.featured ? 'Unfeature' : 'Feature' }}</button>
                    <button class="mini danger" :disabled="busy" @click="deleteGame(g)">Delete</button>
                  </td>
                </tr>
                <tr v-if="!games.length"><td colspan="7" class="muted center">No games found.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- DECKS ---------------------------------------------------------- -->
        <section v-show="tab === 'decks'" class="tabpanel">
          <div class="toolbar">
            <input
              v-model="deckQuery"
              class="sf-input"
              type="search"
              placeholder="Search deck name or owner"
              @keyup.enter="loadDecks"
            />
            <button class="btn btn-ghost" :disabled="busy" @click="loadDecks">Search</button>
          </div>
          <div class="tablewrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Deck</th><th>For game</th><th>Owner</th><th class="num">Rows</th>
                  <th>Created</th><th>Visibility</th><th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in decks" :key="d.id">
                  <td>
                    <NuxtLink :to="`/decks/${d.id}`" class="who-name link">{{ d.name || 'Untitled' }}</NuxtLink>
                    <span class="who-sub">{{ d.kind }}</span>
                  </td>
                  <td class="dim">{{ d.game || '—' }}</td>
                  <td class="dim">{{ ownerLabel({ ownerHandle: d.ownerHandle, ownerEmail: d.ownerEmail, ownerName: null }) }}</td>
                  <td class="num">{{ d.rowCount }}</td>
                  <td>{{ fmtDate(d.createdAt) }}</td>
                  <td>
                    <select :value="d.visibility" class="sf-input narrow" :disabled="busy" @change="setDeckVisibility(d, ($event.target as HTMLSelectElement).value as Visibility)">
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="private">Private</option>
                    </select>
                  </td>
                  <td class="actions-col">
                    <button class="mini danger" :disabled="busy" @click="deleteDeck(d)">Delete</button>
                  </td>
                </tr>
                <tr v-if="!decks.length"><td colspan="7" class="muted center">No decks found.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.admin-wrap {
  max-width: 1100px;
  padding: 32px 0 64px;
}
.admin-boot {
  padding: 80px 0;
  text-align: center;
  color: var(--ink-soft);
}
.denied {
  max-width: 480px;
  margin: 48px auto;
  padding: 32px;
  text-align: center;
}
.denied h1 {
  font-size: 28px;
  font-weight: 800;
  margin: 6px 0 10px;
}
.denied p {
  color: var(--ink-soft);
}
.denied-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
}
.admin-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.admin-head h1 {
  font-size: clamp(26px, 5vw, 34px);
  font-weight: 800;
  margin-top: 4px;
}
.admin-note {
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  border: var(--bd) solid color-mix(in srgb, var(--primary) 30%, transparent);
  border-radius: 999px;
  padding: 7px 14px;
  font-weight: 700;
  font-size: 13px;
}
.admin-tabs {
  display: flex;
  gap: 6px;
  margin: 22px 0;
  border-bottom: var(--bd) solid var(--line-soft);
  flex-wrap: wrap;
}
.admin-tabs button {
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  padding: 10px 16px;
  font-weight: 700;
  font-size: 15px;
  color: var(--mute);
  cursor: pointer;
  font-family: inherit;
}
.admin-tabs button.on {
  color: var(--ink);
  border-bottom-color: var(--primary);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
}
.stat {
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  border-radius: 16px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
}
.stat-n {
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
}
.stat-l {
  margin-top: 6px;
  font-weight: 700;
}
.stat-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--mute);
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 16px;
}
.panel.sub {
  padding: 20px 22px;
}
.panel.sub h2 {
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--mute);
  margin: 0 0 10px;
}
.panel.sub h2.mt {
  margin-top: 22px;
}
.kv {
  list-style: none;
  margin: 0;
  padding: 0;
}
.kv li {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed var(--line-soft);
  font-size: 14px;
}
.kv li:last-child {
  border-bottom: none;
}
.kv b.warn {
  color: var(--danger, #c0392b);
}
.top {
  margin: 0;
  padding-left: 20px;
}
.top li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 0;
  font-size: 14px;
}
.top-title {
  font-weight: 600;
  text-decoration: none;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.top-plays {
  color: var(--mute);
  white-space: nowrap;
}
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.toolbar .sf-input {
  flex: 1;
  min-width: 180px;
}
.sf-input.narrow {
  flex: none;
  min-width: 140px;
  width: auto;
}
.tablewrap {
  overflow-x: auto;
  border: var(--bd) solid var(--line-soft);
  border-radius: 14px;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.tbl th,
.tbl td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
}
.tbl th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--mute);
  background: var(--surface-2, var(--surface));
}
.tbl tr:last-child td {
  border-bottom: none;
}
.tbl tr.banned {
  background: color-mix(in srgb, var(--danger, #c0392b) 7%, transparent);
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.center {
  text-align: center;
}
.dim {
  color: var(--mute);
}
.who {
  display: flex;
  flex-direction: column;
}
.who-name {
  font-weight: 700;
}
.who-name.link {
  color: var(--ink);
  text-decoration: none;
}
.who-name.link:hover {
  text-decoration: underline;
}
.who-sub {
  font-size: 12px;
  color: var(--mute);
}
.pill {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--surface-2, var(--surface));
  border: 1px solid var(--line-soft);
}
.pill-admin {
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  border-color: color-mix(in srgb, var(--primary) 40%, transparent);
  color: var(--primary-ink, var(--ink));
}
.pill-ok {
  color: var(--ok, #1a8f5a);
}
.pill-ban {
  background: color-mix(in srgb, var(--danger, #c0392b) 16%, transparent);
  color: var(--danger, #c0392b);
}
.pill-feat {
  margin-left: 8px;
  color: var(--primary);
}
.actions-col {
  white-space: nowrap;
}
.mini {
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  border-radius: 9px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  margin-right: 6px;
}
.mini:hover {
  border-color: var(--primary);
}
.mini.danger {
  color: var(--danger, #c0392b);
}
.mini.danger:hover {
  border-color: var(--danger, #c0392b);
}
.mini:disabled {
  opacity: 0.5;
  cursor: default;
}
.muted {
  color: var(--mute);
  padding: 16px 0;
}
@media (max-width: 720px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
}
</style>
