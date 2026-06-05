# Decks — reusable content for data-driven games

A **deck** is a named-column table of rows ("cards") — trivia questions, prompts,
images, anything — that a game pulls from instead of you authoring every value by
hand. Build one big deck, then play it as many rounds, reuse it across games, and edit
it in one place.

This is the user-facing guide. For the engine internals see
[`content-decks-plan.md`](./content-decks-plan.md); for the roadmap see
[`decks-roadmap.md`](./decks-roadmap.md).

## Two ways a game uses a deck

1. **Snapshot (inline):** a frozen copy embedded in the game. Edit the original later
   and the game does **not** change. Good for a one-off.
2. **Reference (linked):** the game points at a deck in your **library** (`/decks`).
   At play time the game loads the deck's **current** rows, so editing the deck updates
   every game that links it. Good for a deck you reuse and keep fresh.

Either way, the game plays plain rounds: a deck **resolves** to ordinary rounds before
play, so a deck-backed game behaves exactly like a hand-authored one (and the engine
never has to know about decks).

**Reference for your own reuse; snapshot for sharing.** A reference is ideal when you
own the deck and want one source of truth across your games. When someone **forks** your
game, any deck they can read is **snapshotted into their copy** automatically, so the
fork is self-contained (a reference to a deck they can't read just drops out). If you
publish a game for others to fork, a snapshot (or a public deck) keeps it working for
them; and see the answer-deck note below before linking a deck that holds answers.

## Remix a flagship with your own content

Most "Games From Doot" play a built-in content pool, and you can swap in your own. On the
game's page click **"Remix with your..."**. What you see depends on the game:

- **Prompt and story games** open a small **starter editor** pre-filled with a few of the
  official lines. Tweak them, add your own, remove any, name it, and hit **Create and host**.
  You start from the official set rather than a blank page, so the format is obvious and you
  only customize what you want.
- **Truth or Share** takes a prompt deck with optional `kind` (`truth` or `share`) and `tier`
  (`mild` or `spicy`) columns; one deck feeds all four of its pools (the game partitions the
  rows). A plain prompt deck still works (every row defaults to a mild truth), and any pool
  you leave empty falls back to the built-in prompts.
- **Quiz and card games** open a **deck picker** (your decks plus official Doot decks, which
  are badged), since those rows have several columns. Build a multi-column deck in `/decks`,
  then pick it here.

Either way it saves a host-ready game that plays YOUR content instead of the built-in pool.
The host still shuffles it and picks how many to play each round. Empty or unusable decks
fall back to the built-in pool, so a remix never breaks. The built-in pool is itself the
game's "official deck": it plays by default, with zero setup, when you do not remix.

There are two shapes of remixable game:

- **Prompt games** (Quip Clash, Open Mic, Backronym, Most Likely To, Hivemind,
  Sketch & Spot, Split the Room) take a **Prompt Deck**: one text column of prompts (for
  Split the Room, include an `{x}` blank the player completes). Over MCP, `remix_game`
  builds one in a single step (pass the lines as `csv`).
- **Typed games** take a **multi-column deck** matched to the game:
  - **Fib Finder** — a **Quiz Deck**: `question`, `truth` columns.
  - **Ballpark** — a **Quiz Deck**: `prompt`, `answer` (a number), optional `unit`.
  - **What, You Didn't Know That?** — a **Quiz Deck**: `prompt`, `options` (a list, separated
    by `|`), `correct` (the answer's position, 1 = first).
  - **Quiz or Die** — a **Quiz Deck**: `question`, `options` (a `|`-separated list),
    `correct` (1 = first), plus an optional lurid `category` banner. The same deck may also
    customize the Cellar finale: add rows with a `category`, `options`, and a `belong` column
    (a `|`-separated list of the options that belong); any pool you leave out falls back to the
    built-in one.
  - **Faker** — a **Card Deck**: `category` (public) + `word` (the secret).
  - **Mad Libs** — a deck with a `template` column using `{token}` blanks (the blanks are
    read from the tokens).

  Over MCP, save the deck first with `save_deck`, then `remix_game` with its `deckId` (the
  single-column `csv` path can't carry the extra columns).

> **Answer columns stay hidden, so keep a typed remix deck private.** The columns that hold
> answers (`truth`, `answer`, `correct`, `word`) are withheld from anyone who isn't the
> owner when the game is served, exactly like a normal answer key. But a deck that is
> `unlisted` or `public` can be read directly at `/api/decks/<id>`. So a deck whose answers
> feed a typed remix should stay **private**: the game references your private deck, and
> only the resolved game (with answers withheld) is shared.

## The library (`/decks`)

- **Browse** your decks and public decks; **build** a new one (`/decks/new`).
- A deck has a **kind** — a hint, not a rule:
  - **Generic** — arbitrary columns; bind any field to any column.
  - **Quiz** — question + answer (+ image) columns, for `guess` / `buzzer` rounds.
  - **Prompt** — a column of prompts/dares, for writing and spotlight games.
  - **Card** — freeform cards (for the upcoming card-game system).
- **Visibility**: private (only you), unlisted (anyone with the link), or public
  (listed in the library). **Remixable** lets others copy a deck into their own library.
- **Build it** by pasting CSV / a copy from Google Sheets or Excel (first row = headers),
  or by editing the row grid directly. **Image columns** upload images to Doot and store
  the URL; a text/number column is just typed in.

## Using a deck in a round (two binding modes)

In the game editor, open **Decks** in the side rail to add an inline deck or **link a
library deck**, then on a round use **Pull from a deck**:

- **Draw N**: play N rounds, a distinct row each (great for a 50-question set).
- **Bind a field ← column**: fill a round's field from a column. Bind several — fields
  bound to the **same deck** in one draw share **one row**, so an image + prompt +
  answer stay correlated (they come from the same row).
- An **answer column** (bound to a `guess` `correct`, `ballpark` `answer`, etc.) is
  **withheld from non-owners** exactly like a normal answer key (the withholding
  invariant holds for deck-sourced answers too).

> **Keep answer decks private.** Redaction in the game serve path nulls an answer
> column for non-owners, but a deck that is `unlisted` or `public` can be read
> directly at `/api/decks/<id>`, which would reveal those answers. If a game binds a
> deck's columns to answers, leave that deck **private** (a game can still reference
> your own private deck; only the resolved game is shared, with answers withheld).

## Authoring with markdown / MCP

A `## deck <name>` block defines a deck. Inline it with CSV, or **link** a library deck:

```
## deck capitals
country, capital, flag
France, Paris, https://img.example/fr.png
Japan, Tokyo, https://img.example/jp.png

## guess
prompt: What is the capital?
image: x
draw: 2
bind: prompt = capitals.country
bind: image = capitals.flag
```

To link a saved library deck instead of inlining rows:

```
## deck trivia
link: lib_ab12cd34ef56

## guess
prompt: Question?
draw: 5
bind: prompt = trivia.question
bind: correct = trivia.answer
```

Over **MCP**, `save_deck` (from CSV) creates a library deck and returns its `lib_…` id;
`list_my_decks` lists them; `update_deck` replaces a deck's rows. Reference one from a
game spec with the `link:` line above.
