import { describe, expect, it } from 'vitest'
import {
  type Question,
  type Racer,
  advanceByAnswers,
  applyDarkness,
  applyDeaths,
  assignCast,
  atRiskAfterQuestion,
  chaliceSetup,
  diceSetup,
  diceSurvives,
  finaleOutcome,
  findSteal,
  leaderboard,
  makeRacers,
  nextDarkness,
  poisonCount,
  redactQuestionForPublish,
  resolveBloodMoney,
  resolveChalice,
  resolveSteal,
  rollResult,
  scoreQuestion,
  spinResult,
  WHEEL_SECTORS,
} from './quiz-or-die-logic'

const Q: Question = { cat: 'TEST', q: 'Pick A', a: ['A', 'B', 'C', 'D'], c: 0 }

describe('assignCast', () => {
  it('assigns a stable shape/sin/colour per seat and cycles past six', () => {
    const cast = assignCast(Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })))
    expect(cast[0]?.shape).toBe('blob')
    expect(cast[6]?.shape).toBe(cast[0]?.shape) // cycles
    expect(cast[1]?.sin).toBe('Wrath')
  })
})

describe('redactQuestionForPublish', () => {
  it('drops the correct index from the published question', () => {
    const pub = redactQuestionForPublish(Q, 2)
    expect(pub).toEqual({ qIndex: 2, cat: 'TEST', q: 'Pick A', a: ['A', 'B', 'C', 'D'] })
    expect('c' in pub).toBe(false)
  })
})

describe('scoreQuestion', () => {
  it('scores only the exact correct index', () => {
    expect(scoreQuestion(0, 0)).toBe(true)
    expect(scoreQuestion(1, 0)).toBe(false)
    expect(scoreQuestion(null, 0)).toBe(false)
    expect(scoreQuestion(undefined, 0)).toBe(false)
  })
})

describe('atRiskAfterQuestion', () => {
  it('sends the wrong AND the silent to the Cellar (no-answer is wrong)', () => {
    const answers = new Map<string, number | null>([
      ['a', 0], // correct
      ['b', 1], // wrong
      // c never answered
    ])
    expect(atRiskAfterQuestion(['a', 'b', 'c'], answers, 0).sort()).toEqual(['b', 'c'])
  })
  it('is empty when everyone is right', () => {
    const answers = new Map<string, number | null>([['a', 0], ['b', 0]])
    expect(atRiskAfterQuestion(['a', 'b'], answers, 0)).toEqual([])
  })
})

describe('poison chalice', () => {
  it('poisons about 45%: at least one, never all', () => {
    expect(poisonCount(4)).toBe(2)
    expect(poisonCount(6)).toBe(3)
    for (let cups = 4; cups <= 12; cups++) {
      expect(poisonCount(cups)).toBeGreaterThanOrEqual(1)
      expect(poisonCount(cups)).toBeLessThan(cups)
    }
  })
  it('lays out a deterministic, in-range poison set', () => {
    const a = chaliceSetup(3, 'ROOM')
    const b = chaliceSetup(3, 'ROOM')
    expect(a).toEqual(b) // seeded, reconnect-stable
    expect(a.cups).toBe(4)
    expect(a.poison.length).toBe(poisonCount(a.cups))
    for (const i of a.poison) expect(i).toBeGreaterThanOrEqual(0), expect(i).toBeLessThan(a.cups)
  })
  it('kills exactly the drinkers who chose a poisoned cup', () => {
    const dying = resolveChalice(new Map([['a', 0], ['b', 1], ['c', 2]]), [0, 2])
    expect(dying.sort()).toEqual(['a', 'c'])
  })
})

describe("reaper's wheel", () => {
  it('is five-in-six against you', () => {
    expect(WHEEL_SECTORS.filter((s) => s === 'D').length).toBe(10)
    expect(WHEEL_SECTORS.filter((s) => s === 'L').length).toBe(2)
  })
  it('produces a deterministic in-range landing', () => {
    const r = spinResult('seed:p1')
    expect(spinResult('seed:p1')).toEqual(r)
    expect(r.index).toBeGreaterThanOrEqual(0)
    expect(r.index).toBeLessThan(WHEEL_SECTORS.length)
    expect(r.death).toBe(WHEEL_SECTORS[r.index] === 'D')
  })
})

describe('bone dice', () => {
  it('rolls three deterministic in-range dice', () => {
    const { roll, sum } = rollResult('seed:p1')
    expect(rollResult('seed:p1').sum).toBe(sum)
    expect(roll.length).toBe(3)
    for (const d of roll) expect(d).toBeGreaterThanOrEqual(1), expect(d).toBeLessThanOrEqual(6)
    expect(sum).toBe(roll[0] + roll[1] + roll[2])
  })
  it('builds a house target in [3,18]', () => {
    const { target } = diceSetup('seed')
    expect(target).toBeGreaterThanOrEqual(3)
    expect(target).toBeLessThanOrEqual(18)
  })
  it('survives by strictly beating / undercutting the target', () => {
    expect(diceSurvives(11, 10, true)).toBe(true)
    expect(diceSurvives(10, 10, true)).toBe(false) // a tie is death
    expect(diceSurvives(9, 10, false)).toBe(true)
    expect(diceSurvives(10, 10, false)).toBe(false)
  })
})

describe('blood money', () => {
  it('lets everyone live when nobody grabs', () => {
    expect(resolveBloodMoney(new Map(), ['a', 'b']).dying).toEqual([])
  })
  it('kills everyone when all grab', () => {
    const r = resolveBloodMoney(new Map([['a', true], ['b', true]]), ['a', 'b'])
    expect(r.dying.sort()).toEqual(['a', 'b'])
  })
  it('kills the walkers and pays the takers when it is mixed', () => {
    const r = resolveBloodMoney(new Map([['a', true], ['b', false]]), ['a', 'b'])
    expect(r.dying).toEqual(['b'])
    expect(r.payouts.get('a')).toBe(2000)
  })
  it('treats a missing choice as walking away', () => {
    const r = resolveBloodMoney(new Map([['a', true]]), ['a', 'b'])
    expect(r.dying).toEqual(['b'])
  })
})

describe('applyDeaths', () => {
  it('moves casualties from alive to dead and is idempotent', () => {
    const a = applyDeaths(['a', 'b', 'c'], [], ['b'])
    expect([...a.alive].sort()).toEqual(['a', 'c'])
    expect([...a.dead]).toEqual(['b'])
    // re-applying an already-dead casualty changes nothing
    const b = applyDeaths(a.alive, a.dead, ['b'])
    expect([...b.alive].sort()).toEqual(['a', 'c'])
    expect([...b.dead]).toEqual(['b'])
  })
})

describe('finale race', () => {
  const cast = [
    { id: 'liv', name: 'Liv' },
    { id: 'gho', name: 'Gho' },
  ]
  const baseRacers = () => makeRacers(cast, new Set(['liv']))

  it('seeds living ahead of ghosts', () => {
    const r = baseRacers()
    expect(r.find((x) => x.pid === 'liv')?.x).toBeGreaterThan(r.find((x) => x.pid === 'gho')?.x ?? 1)
  })

  it('advances a racer by its correct answers and clamps at the exit', () => {
    const r = baseRacers()
    const out = advanceByAnswers(r, new Map([['liv', 2]]), 0.16)
    const liv = out.find((x) => x.pid === 'liv')!
    expect(liv.x).toBeCloseTo(0.44, 5) // 0.12 start + 2 * 0.16
    // a flood of correct answers still can't pass the exit
    const maxed = advanceByAnswers(r, new Map([['liv', 99]]), 0.16)
    expect(maxed.find((x) => x.pid === 'liv')!.x).toBe(1)
  })

  it('darkness creeps and consumes a lagging racer', () => {
    const racers: Racer[] = [
      { pid: 'slow', name: 'Slow', x: 0.05, alive: true, ghost: false, out: false, carrying: null },
      { pid: 'fast', name: 'Fast', x: 0.5, alive: true, ghost: false, out: false, carrying: null },
    ]
    const dark = nextDarkness(0.04, 0.02)
    expect(dark).toBeCloseTo(0.06, 5)
    const out = applyDarkness(racers, dark)
    expect(out.consumed).toEqual(['slow'])
    expect(out.racers.find((r) => r.pid === 'slow')?.out).toBe(true)
    expect(out.racers.find((r) => r.pid === 'fast')?.out).toBe(false)
  })

  it('finds a steal when a ghost has caught a living body', () => {
    const racers: Racer[] = [
      { pid: 'liv', name: 'Liv', x: 0.5, alive: true, ghost: false, out: false, carrying: null },
      { pid: 'gho', name: 'Gho', x: 0.49, alive: false, ghost: true, out: false, carrying: null },
    ]
    expect(findSteal(racers)).toEqual(['gho', 'liv'])
    // a ghost far behind catches nobody
    racers[1]!.x = 0.1
    expect(findSteal(racers)).toBeNull()
  })

  it('a ghost in range can steal a living body; both swap roles', () => {
    const racers: Racer[] = [
      { pid: 'liv', name: 'Liv', x: 0.5, alive: true, ghost: false, out: false, carrying: null },
      { pid: 'gho', name: 'Gho', x: 0.48, alive: false, ghost: true, out: false, carrying: null },
    ]
    const after = resolveSteal(racers, 'gho', 'liv')
    expect(after).not.toBeNull()
    const g = after!.find((r) => r.pid === 'gho')!
    const l = after!.find((r) => r.pid === 'liv')!
    expect(g.alive).toBe(true)
    expect(g.carrying).toBe('liv')
    expect(l.ghost).toBe(true)
  })

  it('rejects an out-of-range steal, a ghost target, and self', () => {
    const racers: Racer[] = [
      { pid: 'liv', name: 'Liv', x: 0.9, alive: true, ghost: false, out: false, carrying: null },
      { pid: 'gho', name: 'Gho', x: 0.2, alive: false, ghost: true, out: false, carrying: null },
      { pid: 'g2', name: 'G2', x: 0.2, alive: false, ghost: true, out: false, carrying: null },
    ]
    expect(resolveSteal(racers, 'gho', 'liv')).toBeNull() // too far behind
    expect(resolveSteal(racers, 'gho', 'g2')).toBeNull() // target is a ghost
    expect(resolveSteal(racers, 'gho', 'gho')).toBeNull() // self
  })

  it('reads escape and wipe outcomes', () => {
    const won: Racer[] = [{ pid: 'a', name: 'A', x: 1, alive: true, ghost: false, out: false, carrying: null }]
    expect(finaleOutcome(won)).toEqual({ result: 'won', survivors: ['a'] })
    const wiped: Racer[] = [{ pid: 'a', name: 'A', x: 0.3, alive: true, ghost: false, out: true, carrying: null }]
    expect(finaleOutcome(wiped)).toEqual({ result: 'wiped', survivors: [] })
  })
})

describe('leaderboard', () => {
  it('ranks escapees first, then by money', () => {
    const board = leaderboard([
      { id: 'a', name: 'A', money: 1000, escaped: false, alive: false },
      { id: 'b', name: 'B', money: 500, escaped: true, alive: true },
      { id: 'c', name: 'C', money: 3000, escaped: false, alive: true },
    ])
    expect(board.map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(board[0]?.detail).toBe('Escaped')
    expect(board[1]?.detail).toBe('Survived')
    expect(board[2]?.detail).toBe('A ghost')
    expect(board[0]?.score).toBe(500)
  })
})
