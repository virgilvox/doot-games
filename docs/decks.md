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
  **withheld from non-owners** exactly like a normal answer key — the withholding
  invariant holds for deck-sourced answers too.

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
