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
- `theme: <id>` (optional, before the first round) picks a theme. Ids: `doot`,
  `cutesie`, `cyber`, `professional`, `playful`.
- Each `## <block>` heading starts one **round** of that block kind. Use the
  block kinds below. You can repeat and mix them in any order.
- Inside a round, `key: value` lines set fields and `- item` lines add options /
  items / categories.
- `timer:` is seconds, or `none` for no timer.
- `image:` is an optional image URL shown with the prompt.

## Blocks

### `guess` — multiple choice with a right answer
Fields: `subject` (optional label), `prompt`, `image`, `timer` (default 20).
List the choices as `- ` items; mark the right one with `(correct)`.

```markdown
## guess
subject: Round 1
prompt: Which planet is the largest?
timer: 15
- Jupiter (correct)
- Saturn
- Earth
```

### `poll` — opinion question, no right answer
Fields: `prompt`, `image`, `timer` (default none). Choices as `- ` items.

```markdown
## poll
prompt: Best pizza topping?
- Pepperoni
- Mushroom
- Pineapple
```

### `rank` — order items into a room-consensus ranking
Fields: `prompt`, `image`, `timer` (default none). The items to order as `- `.

```markdown
## rank
prompt: Rank these from best to worst
- Tacos
- Pizza
- Sushi
```

### `rate` — score subjects on a scale
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

### `draw` — players sketch the prompt
Fields: `prompt`, `image`, `timer` (default 60), `aspect` (height/width, default 0.7).

```markdown
## draw
prompt: Draw your pet as a superhero
timer: 90
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
