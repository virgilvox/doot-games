# Writing a Doot game in Markdown

You can build a whole Doot game from a markdown spec and import it in the editor:
open the editor (the **Custom** game type lets you mix any block), click
**Import from Markdown**, paste, and Import. This document is the format
reference. It is written so an LLM can generate a game in one shot.

## The format

```markdown
# Game Title
theme: cyber

## guess
prompt: Who painted the Mona Lisa?
timer: 20
- Leonardo da Vinci (correct)
- Michelangelo
- Raphael
- Donatello

## poll
prompt: Pineapple on pizza?
- Absolutely
- Never
- Only sometimes
```

Rules:

- `# Title` (one, at the top) sets the game title.
- **Header fields** (optional, above the first `## round`) set game-level metadata:
  - `theme: <id>` picks a theme. Ids: `doot`, `cutesie`, `cyber`, `professional`, `playful`.
  - `description: <text>` a one-liner shown on cards + the detail page (≤300 chars).
  - `visibility: <private|unlisted|public>` (default `private`). `public` lists it in
    discovery; `unlisted` is link-only. (`published: yes` also means public.)
  - `remixable: <yes|no>` (default no) lets others copy the game into their own editor.
  - `cover: <url>` a cover image URL. Upload one first (via the MCP `upload_image` or the
    editor) and paste the returned URL. Best as a **16:9 landscape** (e.g. 1200×675); cards
    center-crop it to a wide strip, the detail page shows the full image.
  - `tags: a, b, c` up to 8 short discovery tags.
- Each `## <block>` heading starts one **round** of that block kind. Use the
  block kinds below (`guess`, `answer`, `poll`, `rank`, `rate`, `draw`,
  `hivemind`, `categories`, `mostlikely`, `ballpark`, `buzzer`, the two-phase
  `quip` / `fill`, and the hidden-imposter `faker`). Repeat + mix in any order.
- Inside a round, `key: value` lines set fields and `- item` lines add options /
  items / categories.
- `timer:` is seconds, or `none` for no timer.
- `image:` is an optional image URL shown with the prompt.

## Blocks

### `guess`: multiple choice with a right answer
Fields: `subject` (optional label), `prompt`, `image`, `audio` (a clip URL, for
Name That Tune; the big screen plays it), `timer` (default 20). List the choices
as `- ` items; mark the right one with `(correct)`.

```markdown
## guess
subject: Round 1
prompt: Which planet is the largest?
timer: 15
- Jupiter (correct)
- Saturn
- Earth
```

### `answer`: type-the-answer trivia
No choices: every player types the answer on their phone. Fields: `subject`,
`prompt`, `image`, `audio` (a clip URL for Name That Tune), `timer` (default 30),
`answers:` (the accepted answer; add
synonyms separated by ` | `), and `fuzzy:` (default `yes`, which forgives small
typos and accents; set `no` for a strict match). The answer is hidden until
reveal, and only a correct answer scores.

```markdown
## answer
subject: Geography
prompt: What is the capital of Japan?
answers: Tokyo

## answer
prompt: What is the largest US city by population?
answers: New York City | NYC
fuzzy: yes
```

### `categories`: Scattergories
A letter plus a few categories; players type one answer for each, and an answer
scores only if it is valid (starts with the letter) AND unique (nobody else gave
it). Fields: `letter:` (one letter), `timer` (default 120). List the categories as
`- ` items.

```markdown
## categories
letter: B
- An animal
- A food
- A city
- A movie
```

### `poll`: opinion question, no right answer
Fields: `prompt`, `image`, `timer` (default none). Choices as `- ` items.

```markdown
## poll
prompt: Best pizza topping?
- Pepperoni
- Mushroom
- Pineapple
```

### `rank`: order items into a room-consensus ranking
Fields: `prompt`, `image`, `timer` (default none). The items to order as `- `.

```markdown
## rank
prompt: Rank these from best to worst
- Tacos
- Pizza
- Sushi
```

### `rate`: score subjects on a scale
Fields: `subject`, `prompt`, `image`, `timer` (default none),
`categories:` (comma-separated), and `scale:`. The scale is either a numeric
range like `1-10`, or comma-separated labels (a letter-grade / tier scale).

```markdown
## rate
prompt: Rate the latte
categories: Flavor, Crema, Presentation
scale: 1-5

## rate
prompt: Grade the movie
categories: Overall
scale: F, D, C, B, A
```

### `draw`: players sketch the prompt
Fields: `prompt`, `image`, `timer` (default 60), `aspect` (height/width, default 0.7).

```markdown
## draw
prompt: Draw your pet as a superhero
timer: 90
```

Add `vote: true` to make it draw-then-vote: everyone draws, then the room votes
on the anonymized gallery and the best drawing wins points and tops the results
leaderboard. With voting on, the live gallery is hidden during drawing so the
vote stays a surprise. Optional extra fields: `voteprompt` (the vote question)
and `votetimer` (seconds to vote, default 30).

```markdown
## draw
prompt: Draw your spirit animal
vote: true
votetimer: 30
```

### `hivemind`: match the crowd (read the room)
Fields: `prompt`, `timer` (default 30). Everyone answers in free text and scores
by giving the SAME answer as the most other players, so pick prompts with an
obvious popular answer. No `- ` items.

```markdown
## hivemind
prompt: Name a color of the rainbow
timer: 25
```

### `mostlikely`: the room votes a player
Fields: `prompt`, `timer` (default 20). The options ARE the lobby (each player can
be nominated), so there are no `- ` items. The most-nominated player is crowned.
The heading also accepts `## most likely`.

```markdown
## mostlikely
prompt: Most likely to start a band
```

### `ballpark`: closest numeric guess wins
Fields: `subject` (optional), `prompt`, `image`, `answer:` (the true **number**,
hidden from players until the reveal), `unit:` (optional, e.g. `km`, `%`, `years`),
`timer` (default 30). No `- ` items. Use facts nobody knows exactly; the closest
guess scores the most and the reveal animates a needle to the answer.

```markdown
## ballpark
prompt: How far is the Moon from Earth?
unit: km
answer: 384400
```

### `buzzer`: first-correct trivia
The fastest right answer scores the most, and the stakes rise each round. Fields:
`subject` (optional), `prompt`, `image`, `timer` (default 20), `points:` (what the
question is worth, default 100). List 2+ `- choice`; mark the right one `(correct)`.

```markdown
## buzzer
prompt: Which planet is closest to the Sun?
points: 200
- Mercury (correct)
- Venus
- Mars
```

## Two-phase rounds (write, then vote)

These collect a written answer from everyone, then build the next round's vote from
those answers automatically. One heading expands to **two** rounds: a **make** round
(everyone submits privately) and a **judge** round whose options are built **at run time**
from those submissions, anonymized and shuffled, for the room to vote on. You never write
the judge options yourself, they *are* the players' answers, and a player can't vote for
their own. (Mad Libs works this way: players fill the blanks blind, then the completed
stories become the gallery the room votes on.)

### `quip`: everyone writes, then the room votes
Write & Vote (Quiplash). Fields: `prompt`, `timer` (default 60), `maxlength`,
`voteprompt:` and `votetimer:` (default 30). Add `image: <a URL>` to make it
**Caption This**: the image shows on the big screen and every phone, players write
a caption for it, then the room votes the funniest. Add `truth: <the real answer>`
to turn it into **Lie Detector** (Fibbage): players write a believable lie to your
trivia question (the `prompt`), then hunt the one true answer. Optional
`safety: a | b | c` (pipe-separated): canned answers handed to anyone who runs out
of time, so there is no dead air and no zero (scored at half, so they never
out-win a real answer).

```markdown
## quip
prompt: The worst possible name for a boat
voteprompt: Which name wins?

## quip
prompt: Write a caption for this image.
image: https://example.com/funny.jpg
voteprompt: Funniest caption wins?

## quip
prompt: How tall is the Eiffel Tower?
truth: 330 metres
```

### `fill`: fill in the blanks, then vote
Mad Libs. Write the sentence in `template:` with `{placeholders}`; the blanks are
taken from the placeholders automatically. Add `- id: hint` lines to label them.
Fields: `prompt`, `template:`, `timer` (default 75), `maxlength`, `voteprompt:` /
`votetimer:`. Add `split: true` for **Would You & Split**: players complete a visible
dilemma, then the room votes yes/no on each. Optional `safety: a | b | c`
(pipe-separated): canned full-sentence answers for anyone who runs out of time.

```markdown
## fill
template: The {animal} learned to {verb} just to impress a {noun}.
- animal: an animal
- verb: a verb
- noun: a person
```

### `faker`: hidden imposter (social deduction)
Hidden Faker (`faker` → `accuse`). Everyone is shown a `category:` and a secret `word:`
except one random player (the faker), who is told only the category. Everyone gives a
one-word clue, then the room accuses who the faker is. The secret word is withheld from
the big screen, the faker, and the public config. Fields: `category:`, `word:` (the
secret), `prompt` (the clue instruction), `timer` (default 45), `voteprompt:` (the
accusation question), `votetimer:`. Pick a word every non-faker can hint at.

```markdown
## faker
category: In the kitchen
word: Toaster
```

> Truth or Share, Circuit Cypher, Open Mic, Quiz or Die, and "What, You Didn't Know
> That?" have custom flows that markdown does not author. Open one from the Create page
> and remix it instead.

## Content decks (data-driven rounds)

A **deck** is a named-column table of rows you can draw from, so one block plays many
rounds from a spreadsheet of content. Define one with `## deck <id>` followed by raw
**CSV or TSV** lines (the first line is the header; column keys are the lowercased
headers, e.g. `Capital City` → `capital_city`). Then on a round:

- `draw: N` plays **N** rounds, a distinct row each (reuses the host "how many" picker).
- `bind: <field> = <deckId>.<column>` fills a field from a column. Bind several; fields
  bound to the **same deck** share one drawn row, so an image + prompt + answer stay
  correlated. An `image`-typed column (auto-detected from URLs) can fill an `image:` field.

Deck-backed rounds are **single-block** for now (not the two-phase blocks). Answer columns
(bound to a `guess` `correct`, `ballpark` `answer`, …) are withheld from non-owners just
like any answer.

```markdown
## deck capitals
country, capital, flag
France, Paris, https://img.example/fr.png
Japan, Tokyo, https://img.example/jp.png

## guess
prompt: What is the capital?
draw: 2
bind: prompt = capitals.country
bind: image = capitals.flag
- Paris (correct)
- Tokyo
- Berlin
```

## A full example (mixed blocks)

```markdown
# Trivia & Vibes Night
theme: playful

## guess
prompt: What year did the first iPhone launch?
- 2007 (correct)
- 2005
- 2010

## rate
prompt: Rate tonight's playlist
categories: Energy, Variety
scale: 1-10

## poll
prompt: Where to next?
- The bar down the street
- Stay here
- Call it a night

## draw
prompt: Draw the host
timer: 60
```

## Notes

- Anything the parser does not recognise is ignored, and unknown `## <block>`
  headings are skipped with a warning shown after import.
- Each round is validated against its block's schema in the editor, so fix any
  rounds flagged "needs attention" (for example, a `guess` round needs at least
  two options; `rate` needs at least one category).
- Importing replaces the rounds currently in the editor. The title and (valid)
  theme are applied too.
