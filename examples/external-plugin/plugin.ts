/**
 * A sample external plugin: a tiny multiple-choice "trivia" block, rendered with
 * plain DOM so the bundle has no framework dependency (a plugin can use any
 * framework, or none). It runs inside the sandboxed iframe and talks to the host
 * only through the bridge, it never fetches, never touches cookies, never sees the
 * relay. The host feeds it redacted content (no correct answer) until reveal.
 *
 * Build this to a single ES module (`dist/plugin.js`) and point your plugin.json
 * `bundle` at it. Develop it with the dev harness (see README).
 */
import { connectToHost } from './bridge'

interface TriviaContent {
  prompt: string
  options: { label: string }[]
}

const root = document.getElementById('app') as HTMLElement
let content: TriviaContent | null = null
let myChoice: number | null = null
let phase = 'lobby'
let correct: number | null = null // only known after the host sends `answer` at reveal

const bridge = connectToHost({
  onInit: () => render(),
  onRound: (m) => {
    content = m.content as TriviaContent
    phase = m.phase
    correct = null
    myChoice = null
    render()
  },
  onState: (m) => {
    phase = m.phase
    myChoice = (m.myInput as { choice?: number } | null)?.choice ?? null
    render()
  },
  onAnswer: (m) => {
    correct = (m.key as { correct?: number } | undefined)?.correct ?? null
    render()
  },
})

function choose(i: number) {
  myChoice = i
  bridge.submit({ choice: i }) // the host re-validates this against the block schema
  render()
}

function render() {
  if (!content) {
    root.innerHTML = '<p>Waiting for the round…</p>'
    return
  }
  const revealed = correct != null
  root.innerHTML = `<h2>${escape(content.prompt)}</h2>`
  const list = document.createElement('div')
  content.options.forEach((o, i) => {
    const btn = document.createElement('button')
    btn.textContent = o.label
    btn.disabled = myChoice != null || revealed
    if (myChoice === i) btn.classList.add('sel')
    if (revealed && correct === i) btn.classList.add('correct')
    btn.onclick = () => choose(i)
    list.appendChild(btn)
  })
  root.appendChild(list)
  if (revealed) {
    const r = document.createElement('p')
    r.textContent = myChoice === correct ? 'Correct!' : `Answer: ${content.options[correct!]?.label ?? ''}`
    root.appendChild(r)
  }
  bridge.resize(document.body.scrollHeight)
}

function escape(s: string) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}
