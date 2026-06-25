/**
 * The QUIZ OR DIE "director": the whole show orchestration in one composable, kept
 * out of the markup. It owns the relay-driven sequencer, the host-authoritative game
 * state, the audio, and the per-phase render state, and returns just what the stage
 * needs to draw. Separation of concerns: `logic.ts` = pure rules, this = the show,
 * `Host.vue` = the stage (lobby + render).
 */
import type { RelayValue } from "@doot-games/engine";
import { injectDootRoom } from "@doot-games/engine/vue";
import type { GameComposition, StandardResults } from "@doot-games/sdk";
import { announce, cancelSpeech, canSpeak, hasVoices, primeSpeech, warmUpSpeech } from "@doot-games/ui";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CellarContent } from "../../blocks/cellar/block";
import { type HorrorAudio, createHorrorAudio } from "./audio";
import {
  type Contestant,
  WHEEL_SECTORS,
  advanceByAnswers,
  applyDarkness,
  applyDeaths,
  assignCast,
  atRiskAfterQuestion,
  chaliceSetup,
  type DollShape,
  diceSetup,
  diceSurvives,
  finaleOutcome,
  findSteal,
  leaderboard,
  makeRacers,
  makeRng,
  nextDarkness,
  type Racer,
  randInt,
  redactQuestionForPublish,
  resolveBloodMoney,
  resolveChalice,
  resolveSteal,
  rollResult,
  spinResult,
} from "./logic";
import type { CastView, CellarGame, ShowState } from "./show";

export function useQuizShow() {
  const room = injectDootRoom();
  const config = computed<GameComposition | null>(
    () => (room.config.value as unknown as GameComposition) ?? null,
  );
  const content = computed<CellarContent | null>(
    () => (config.value?.rounds[0]?.content as CellarContent) ?? null,
  );
  // ── Audio ─────────────────────────────────────────────────────────────────────
  let audio: HorrorAudio | null = null;
  const muted = ref(false);
  // Default to real OS speech for the villain's voice (with a synth fallback in
  // `speak`); the host can switch to the always-audible synth or mute from the bar.
  const voiceMode = ref<"synth" | "speech" | "off">("speech");
  function cycleVoice() {
    voiceMode.value =
      voiceMode.value === "synth" ? "speech" : voiceMode.value === "speech" ? "off" : "synth";
    cancelSpeech();
  }
  function toggleMute() {
    muted.value = !muted.value;
    audio?.setMuted(muted.value);
  }

  // ── Host-authoritative game state ─────────────────────────────────────────────
  const seed = computed(() => room.code.value || "qod");
  let cast: Contestant[] = [];
  const castMap = new Map<string, Contestant>();
  let alive = new Set<string>();
  let dead = new Set<string>();
  const money = new Map<string, number>();
  let asked = 0;
  let qIdx = 0;
  let floor = 0; // cellar visit counter (keys per-visit intents)

  // the master show state (drives both the relay and the host's own visuals)
  const show = ref<ShowState | null>(null);
  const caption = ref<{ who: string; text: string } | null>(null);
  const talking = ref(false);
  const menacing = ref(false);
  const villainOn = ref(false);
  const villainCenter = ref(false);
  const confetti = ref(false);
  const flashKind = ref<"" | "white" | "blood">("");
  const shakeOn = ref(false);
  const nowMs = ref(typeof Date !== "undefined" ? Date.now() : 0);

  // collectors for the current phase's intents
  const answers = new Map<string, number | null>();
  const cups = new Map<string, number>();
  const spins = new Set<string>();
  const takes = new Map<string, boolean>();
  const finalePicks = new Map<string, number[]>();
  // Bumped whenever a player intent arrives, so the live "ANSWER NOW!" count
  // re-renders off the (non-reactive) collector maps above.
  const statusTick = ref(0);
  let wheelTotal = 0; // accumulated wheel rotation so each spin continues from the last
  // Per-card crookedness + the coloured number-chip palette, from the mockup.
  const ROT = [-1.5, 1, -1, 1.5];
  const KEYC = ["#3a6fb0", "#5a5a62", "#9a9a9a", "#c9a227"];

  // a "gate" the sequencer awaits; intent handlers poke it
  let gate: { check: () => boolean; resolve: () => void } | null = null;
  const pendingWaits = new Set<() => void>();
  let timers: Array<ReturnType<typeof setTimeout>> = [];

  function wait(ms: number): Promise<void> {
    return new Promise((res) => {
      const f = () => {
        pendingWaits.delete(f);
        res();
      };
      pendingWaits.add(f);
      timers.push(setTimeout(f, ms));
    });
  }
  function flushWaits() {
    for (const f of [...pendingWaits]) f();
  }
  function awaitInputs(check: () => boolean, timeoutMs: number): Promise<void> {
    return new Promise((res) => {
      if (check()) return res();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        gate = null;
        res();
      };
      gate = { check, resolve: finish };
      timers.push(setTimeout(finish, timeoutMs));
    });
  }
  function pokeGate() {
    if (gate?.check()) gate.resolve();
  }
  function skip() {
    cancelSpeech();
    talking.value = false;
    flushWaits();
    gate?.resolve();
  }

  // ── Show publishing ───────────────────────────────────────────────────────────
  const aliveContestants = () => cast.filter((c) => alive.has(c.id));

  function castView(atRisk: Set<string> = new Set()): CastView[] {
    return cast.map((c) => ({
      pid: c.id,
      name: c.name,
      shape: c.shape,
      color: c.color,
      alive: alive.has(c.id),
      atRisk: atRisk.has(c.id),
      money: money.get(c.id) ?? 0,
    }));
  }

  function publishShow(
    state: Partial<ShowState> & { phase: ShowState["phase"] },
    atRisk: Set<string> = new Set(),
  ) {
    const next: ShowState = {
      cast: castView(atRisk),
      question: null,
      reveal: null,
      cellar: null,
      death: null,
      finale: null,
      ending: null,
      ...state,
    };
    show.value = next;
    room.publishExtra("show", next as unknown as RelayValue);
  }

  // ── Narration ─────────────────────────────────────────────────────────────────
  // OS-speech reliability. The hard bug this avoids: a COLD START (the first line or
  // two fire before Chrome has loaded its voices) used to trip a permanent latch and
  // drop the WHOLE show to the synth voice, so the villain only ever blipped, never
  // spoke. Now we NEVER latch: every line tries OS speech; a line that silently
  // fails to start uses the cast-safe synth voice just for that line; and even after
  // a couple of real misses we keep retrying OS speech (every 4th line), so the
  // moment voices load, real speech takes back over. Misses only count once voices
  // actually exist (a voiceless cold start is not a failure).
  let speechMisses = 0;
  let lineNo = 0;
  function speak(text: string, ms: number) {
    talking.value = true;
    timers.push(setTimeout(() => (talking.value = false), ms));
    if (muted.value || voiceMode.value === "off") return;
    // The synth voice is also the cast-safe path: Web Audio travels with a tab cast
    // / screen share, while OS speech is rendered outside the tab and never reaches
    // the TV. It serves on an explicit 'synth' choice or with no speech API at all.
    if (voiceMode.value === "synth" || !canSpeak()) {
      audio?.voice(text, ms);
      return;
    }
    // Speech mode: try real OS speech, but recover automatically. After a couple of
    // misses we lead with the synth voice yet still probe OS speech periodically.
    const tryOs = speechMisses < 2 || ++lineNo % 4 === 0;
    if (!tryOs) {
      audio?.voice(text, ms);
      return;
    }
    let started = false;
    announce(text, {
      rate: 0.84,
      pitch: 0.42,
      onStart: () => {
        started = true;
        speechMisses = 0;
      },
    });
    timers.push(
      setTimeout(() => {
        if (started) return;
        // A no-start only counts as a real miss once voices exist; a voiceless cold
        // start is just "still loading", not broken.
        if (hasVoices()) speechMisses++;
        // Kill the dead OS queue BEFORE the synth takes over, or a slow voice can
        // start late and talk over the blips.
        cancelSpeech();
        audio?.voice(text, Math.max(700, ms - 480));
      }, 480),
    );
  }
  async function narrate(text: string, who = "YOUR HOST", extra = 0) {
    caption.value = { who, text };
    const words = text
      .replace(/<[^>]+>/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    const est = Math.min(8500, Math.max(1500, words * 320 + 520));
    speak(text, est);
    await wait(est + extra);
  }
  function menace() {
    menacing.value = false;
    timers.push(setTimeout(() => (menacing.value = true), 16));
    timers.push(setTimeout(() => (menacing.value = false), 700));
  }
  function flash(blood = false) {
    flashKind.value = blood ? "blood" : "white";
    timers.push(setTimeout(() => (flashKind.value = ""), 520));
  }
  function shake() {
    shakeOn.value = false;
    timers.push(setTimeout(() => (shakeOn.value = true), 16));
    timers.push(setTimeout(() => (shakeOn.value = false), 520));
  }

  const intros = [
    "Try to look intelligent. The cameras add ten pounds and zero IQ.",
    "Eyes front, lambs. Get this one wrong and we'll get to know each other so much better.",
    "I do adore this part. The lovely little moment before someone ruins everything.",
    "Answer quickly. I've a schedule, a reputation, and a very full appointment book downstairs.",
    "Clock's running, darlings. So is the meter on your existence.",
    "Statistically, one of you is about to disappoint me. Do place your bets.",
  ];
  const causes = [
    "an unfortunate beverage",
    "a wheel that did not love them",
    "arithmetic, of all things",
    "naked greed",
    "a friend with a grudge",
    "the house, peckish",
    "bad luck and worse timing",
  ];
  const rand = <T>(a: T[], rng = Math.random): T => a[Math.floor(rng() * a.length)] as T;

  // ── The sequencer ─────────────────────────────────────────────────────────────
  const ANSWER_MS = computed(() => (content.value?.answerTime ?? 12) * 1000);

  async function runShow() {
    villainOn.value = true;
    villainCenter.value = true; // the host strides on, centre stage, to open the show
    audio?.setMode("lobby");
    publishShow({ phase: "intro" });
    await wait(700);
    await narrate(
      "Goooood evening, and welcome to the only game show with a body count. I'm your host, though by the end, you may have other names for me.",
      "YOUR HOST",
      150,
    );
    await narrate(
      "The premise is simple, my darlings: I ask, you answer. Answer well and you keep your seat. Answer poorly, and you'll see what I keep in the cellar.",
      "THE RULES",
      150,
    );
    menace();
    await narrate(
      "Lose down there and you spend the rest of the night as a ghost, quietly hoping your friends come join you. Now then. Let us play Quiz, or Die.",
      "THE RULES",
      150,
    );
    audio?.setMode("play");
    villainCenter.value = false;
    caption.value = null;

    const bank = content.value?.questions ?? [];
    const qPer = content.value?.qPerGame ?? 7;

    while (bank.length) {
      const atRisk = await question(bank);
      if (atRisk.length) await cellar(atRisk);
      asked++;
      if (alive.size === 0) break;
      if (alive.size <= 1 && asked >= 3) break;
      if (asked >= qPer) break;
      qIdx++;
      await wait(500);
    }
    await finale();
  }

  async function question(bank: CellarContent["questions"]): Promise<string[]> {
    const Q = bank[qIdx % bank.length];
    if (!Q) return [];
    answers.clear();
    const deadline = nowMs.value + ANSWER_MS.value;
    // redactQuestionForPublish strips the correct index: the answer never rides the relay
    // before the reveal (the host scores from its local full config).
    publishShow({
      phase: "question",
      question: { ...redactQuestionForPublish(Q, qIdx), deadline },
    });
    audio?.sfx.whoosh();
    villainOn.value = false;
    // a host quip during the answer window (overlaps the clock, never blocks)
    const introLine = rand(intros);
    caption.value = { who: "YOUR HOST", text: introLine };
    speak(introLine, 2600);
    await wait(450);
    // collect answers from the living until all in or the clock runs out
    await awaitInputs(
      () => aliveContestants().every((c) => answers.has(c.id)),
      ANSWER_MS.value + 600,
    );
    caption.value = null;
    audio?.sfx.reveal();
    // reveal
    const atRisk = atRiskAfterQuestion(alive, answers, Q.c);
    for (const c of cast) {
      if (alive.has(c.id) && answers.get(c.id) === Q.c)
        money.set(c.id, (money.get(c.id) ?? 0) + 1000);
    }
    publishShow(
      {
        phase: "reveal",
        question: { ...redactQuestionForPublish(Q, qIdx), deadline },
        reveal: { correct: Q.c, atRisk },
      },
      new Set(atRisk),
    );
    audio?.sfx.sting();
    flash();
    villainOn.value = true;
    await wait(900);
    if (atRisk.length === 0) {
      await narrate(
        rand([
          "All correct. How thoroughly unsatisfying. The cellar gets so lonely.",
          "Not a single casualty. My therapist will hear about this.",
          "Flawless. Disgusting. I will allow it, for now.",
        ]),
        "YOUR HOST",
        100,
      );
      caption.value = null;
      return [];
    }
    audio?.sfx.wrong();
    const names = atRisk.map((p) => castMap.get(p)?.name ?? "someone").join(", ");
    await narrate(
      `Wrong. The answer was "${Q.a[Q.c]}." ${names}, to the cellar. Chop chop. Chop being the operative word.`,
      "YOUR HOST",
      120,
    );
    caption.value = null;
    return atRisk;
  }

  const cellarGames: CellarGame[] = ["chalice", "wheel", "dice", "money"];
  let lastCellar: CellarGame | null = null;

  async function cellar(atRisk: string[]) {
    floor++;
    audio?.setMode("tension");
    // A neutral "entering the Cellar" beat before a minigame is chosen, so at-risk
    // phones don't flash a half-built game (e.g. an empty chalice) during the intro.
    publishShow(
      { phase: "cellar", cellar: { game: "chalice", floor, atRisk, step: "intro" } },
      new Set(atRisk),
    );
    villainOn.value = true;
    await narrate(
      rand([
        "Welcome to the cellar, where the decor is mood lighting and regret.",
        "Down we go. Mind the stains; some are paint. I will not say which.",
        "Time for a little game. Do try not to bleed on the good rug.",
      ]),
      "THE CELLAR",
      100,
    );
    villainOn.value = false;
    // pick a minigame (not the same as last time, when possible)
    let pool = cellarGames.slice();
    if (atRisk.length < 2) pool = pool.filter((g) => g !== "money"); // blood money wants a crowd
    const rng = makeRng(`${seed.value}:floor:${floor}`);
    let game = pool[randInt(rng, 0, pool.length - 1)] as CellarGame;
    if (game === lastCellar && pool.length > 1)
      game = pool.filter((g) => g !== lastCellar)[0] as CellarGame;
    lastCellar = game;

    let dying: string[] = [];
    if (game === "chalice") dying = await kfChalice(atRisk);
    else if (game === "wheel") dying = await kfWheel(atRisk);
    else if (game === "dice") dying = await kfDice(atRisk);
    else dying = await kfMoney(atRisk);

    if (dying.length === 0) {
      audio?.sfx.reveal();
      await narrate(
        "Survived. All of you. The cellar is terribly disappointed. So am I.",
        "YOUR HOST",
        100,
      );
    } else {
      for (const pid of dying) await kill(pid);
    }
    audio?.setMode("play");
    caption.value = null;
    await wait(350);
  }

  // ── Poison Chalice ──
  async function kfChalice(atRisk: string[]): Promise<string[]> {
    const { cups: nCups, poison } = chaliceSetup(atRisk.length, `${seed.value}:f${floor}`);
    cups.clear();
    const deadline = nowMs.value + 9000;
    publishShow(
      {
        phase: "cellar",
        cellar: { game: "chalice", floor, atRisk, step: "choose", cups: nCups, deadline },
      },
      new Set(atRisk),
    );
    await narrate(
      "A little aperitif. One of these cups says goodnight. Bottoms up, and possibly bottoms down.",
      "THE CELLAR",
      80,
    );
    await awaitInputs(() => atRisk.every((p) => cups.has(p)), 9600);
    // auto-pick for anyone who stalled
    const r = makeRng(`${seed.value}:f${floor}:autocup`);
    for (const p of atRisk) if (!cups.has(p)) cups.set(p, randInt(r, 0, nCups - 1));
    audio?.sfx.whoosh();
    publishShow(
      {
        phase: "cellar",
        cellar: { game: "chalice", floor, atRisk, step: "reveal", cups: nCups, poison },
      },
      new Set(atRisk),
    );
    await wait(900);
    const dying = resolveChalice(cups, poison);
    for (const _ of dying) audio?.sfx.gulp();
    await wait(700);
    return dying;
  }

  // ── Reaper's Wheel (sequential) ──
  async function kfWheel(atRisk: string[]): Promise<string[]> {
    const dying: string[] = [];
    for (const pid of atRisk) {
      spins.clear();
      const deadline = nowMs.value + 8000;
      publishShow(
        {
          phase: "cellar",
          cellar: {
            game: "wheel",
            floor,
            atRisk,
            step: "choose",
            queue: atRisk,
            activePid: pid,
            deadline,
          },
        },
        new Set(atRisk),
      );
      await narrate(
        `${castMap.get(pid)?.name ?? "You"}, give the wheel a spin. Five-to-one against you, which I think is terribly sporting of me.`,
        "THE CELLAR",
        40,
      );
      await awaitInputs(() => spins.has(pid), 8600);
      audio?.sfx.spin();
      const { index, death } = spinResult(`${seed.value}:f${floor}:${pid}`);
      // Spin the wheel so the pointer (top) lands on the computed sector: several full
      // turns plus the delta to align sector `index`'s centre to 12 o'clock.
      const step = 360 / WHEEL_SECTORS.length;
      const want = 360 - (index * step + step / 2);
      const delta = (want - (wheelTotal % 360) + 360) % 360;
      wheelTotal += 360 * randInt(makeRng(`${seed.value}:f${floor}:${pid}:spins`), 4, 6) + delta;
      publishShow(
        {
          phase: "cellar",
          cellar: {
            game: "wheel",
            floor,
            atRisk,
            step: "choose",
            queue: atRisk,
            activePid: pid,
            wheelDeg: wheelTotal,
          },
        },
        new Set(atRisk),
      );
      await wait(5200);
      if (death) {
        dying.push(pid);
        audio?.sfx.wrong();
      } else audio?.sfx.correct();
      await wait(700);
    }
    return dying;
  }

  // ── Bone Dice (sequential) ──
  async function kfDice(atRisk: string[]): Promise<string[]> {
    const setup = diceSetup(`${seed.value}:f${floor}`);
    const dying: string[] = [];
    audio?.sfx.diceroll();
    await narrate(
      `The bones show ${setup.target}. Roll ${setup.higher ? "higher" : "lower"}, or stay down here with the others.`,
      "THE CELLAR",
      60,
    );
    for (const pid of atRisk) {
      spins.clear();
      const deadline = nowMs.value + 7500;
      publishShow(
        {
          phase: "cellar",
          cellar: {
            game: "dice",
            floor,
            atRisk,
            step: "choose",
            queue: atRisk,
            activePid: pid,
            house: setup.house,
            target: setup.target,
            higher: setup.higher,
            deadline,
          },
        },
        new Set(atRisk),
      );
      await awaitInputs(() => spins.has(pid), 8000);
      audio?.sfx.diceroll();
      const { sum } = rollResult(`${seed.value}:f${floor}:${pid}`);
      await wait(900);
      if (!diceSurvives(sum, setup.target, setup.higher)) {
        dying.push(pid);
        audio?.sfx.wrong();
      } else audio?.sfx.correct();
      await wait(450);
    }
    return dying;
  }

  // ── Blood Money ──
  async function kfMoney(atRisk: string[]): Promise<string[]> {
    takes.clear();
    const deadline = nowMs.value + 9000;
    publishShow(
      { phase: "cellar", cellar: { game: "money", floor, atRisk, step: "choose", deadline } },
      new Set(atRisk),
    );
    await narrate(
      "Cash on the floor and a catch in the air. Take it, but if even one of you grabs, everyone who walked pays. And if you all grab? Then it is a party.",
      "THE CELLAR",
      80,
    );
    await awaitInputs(() => atRisk.every((p) => takes.has(p)), 9600);
    const { dying, payouts } = resolveBloodMoney(takes, atRisk);
    for (const [pid, amt] of payouts) money.set(pid, (money.get(pid) ?? 0) + amt);
    audio?.sfx.reveal();
    publishShow(
      { phase: "cellar", cellar: { game: "money", floor, atRisk, step: "reveal" } },
      new Set(atRisk),
    );
    await wait(900);
    if (dying.length === 0)
      await narrate(
        "Nobody touched it? How disciplined. How dull. You all live, this once.",
        "YOUR HOST",
        60,
      );
    else if (dying.length === atRisk.length)
      await narrate(
        "Every last hand in the pot. Greedy little things. Everyone settles up.",
        "YOUR HOST",
        60,
      );
    else
      await narrate(
        "Someone could not resist. So everyone who could pays the difference.",
        "YOUR HOST",
        60,
      );
    return dying;
  }

  async function kill(pid: string) {
    const c = castMap.get(pid);
    const cause = rand(causes);
    publishShow({ phase: "death", death: { pid, name: c?.name ?? "Someone", you: cause } });
    await wait(450);
    audio?.sfx.death();
    const mode = randInt(makeRng(`${seed.value}:death:${pid}:${floor}`), 0, 2);
    if (mode === 0) {
      audio?.sfx.explode();
      flash(true);
      shake();
    } else if (mode === 1) {
      audio?.sfx.slice();
      flash();
      shake();
    } else flash();
    const next = applyDeaths(alive, dead, [pid]);
    alive = next.alive;
    dead = next.dead;
    await wait(800);
    audio?.ghostWail(0.6);
    villainOn.value = true;
    await narrate(
      rand([
        `And ${c?.name ?? "they"} take their final bow. No encore, I checked.`,
        `Goodnight, ${c?.name ?? "friend"}. You were a delight to cancel.`,
        "One down. The leaderboard of the living grows pleasingly short.",
      ]),
      "YOUR HOST",
      80,
    );
    caption.value = null;
  }

  // ── The Escape (finale) ──
  async function finale() {
    audio?.setMode("final");
    // revive the richest corpse if the house is empty, for one last run (the mockup move)
    if (alive.size === 0 && dead.size > 0) {
      const richest = [...dead].sort(
        (a, b) => (money.get(b) ?? 0) - (money.get(a) ?? 0),
      )[0] as string;
      villainOn.value = true;
      await narrate(
        "All dead already? I cannot run a finale to an empty house. The richest corpse gets one more heartbeat. Do not waste it.",
        "YOUR HOST",
        120,
      );
      const back = applyDeaths(dead, alive, [richest]); // move richest out of dead...
      dead = back.alive;
      alive = new Set([richest, ...alive]);
    }
    if (alive.size === 0) {
      await gameOver();
      return;
    }

    const finalCats = content.value?.finalCats ?? [];
    let racers = makeRacers(cast, alive).map((r) => withArt(r));
    let darkness = 0;
    villainOn.value = false;
    publishShow({
      phase: "finale",
      finale: { racers, darkness, round: 0, cat: "", opts: [], deadline: 0 },
    });
    await narrate(
      "And now, the finale: the long walk to the exit. Answer to advance. Ghosts, if you fancy a living body, do help yourselves.",
      "THE ESCAPE",
      150,
    );

    let winner = false;
    for (let round = 1; round <= 6 && !winner; round++) {
      const fc = finalCats[(round - 1) % Math.max(1, finalCats.length)];
      if (!fc) break;
      const oks = fc.opts.filter((o) => o.ok);
      const nos = fc.opts.filter((o) => !o.ok);
      const r = makeRng(`${seed.value}:fin:${round}`);
      const chosen = [rand(oks, r), ...(nos.length ? [rand(nos, r)] : [])];
      const restPool = fc.opts.filter((o) => !chosen.includes(o));
      while (chosen.length < 3 && restPool.length)
        chosen.push(
          restPool.splice(randInt(r, 0, restPool.length - 1), 1)[0] as (typeof restPool)[number],
        );
      const opts = chosen.sort(() => r() - 0.5);
      const okFlags = opts.map((o) => o.ok);

      finalePicks.clear();
      const deadline = nowMs.value + 8000;
      const racing = racers.filter((x) => !x.out).map((x) => x.pid);
      publishShow({
        phase: "finale",
        finale: {
          racers,
          darkness,
          round,
          cat: fc.cat,
          opts: opts.map((o) => ({ t: o.t })),
          deadline,
        },
      });
      audio?.sfx.whoosh();
      await awaitInputs(() => racing.every((p) => finalePicks.has(p)), 8400);
      // reveal
      publishShow({
        phase: "finale",
        finale: {
          racers,
          darkness,
          round,
          cat: fc.cat,
          opts: opts.map((o) => ({ t: o.t })),
          reveal: true,
          ok: okFlags,
          deadline,
        },
      });
      audio?.sfx.reveal();
      await wait(800);
      // score: a racer earns one step per option they judged correctly
      const correctBy = new Map<string, number>();
      for (const pid of racing) {
        const picks = new Set(finalePicks.get(pid) ?? []);
        let correct = 0;
        okFlags.forEach((ok, i) => {
          if (picks.has(i) === ok) correct++;
        });
        correctBy.set(pid, correct);
        money.set(pid, (money.get(pid) ?? 0) + correct * (alive.has(pid) ? 500 : 300));
      }
      racers = advanceByAnswers(racers, correctBy).map((x) => withArt(x));
      publishShow({
        phase: "finale",
        finale: {
          racers,
          darkness,
          round,
          cat: fc.cat,
          opts: opts.map((o) => ({ t: o.t })),
          reveal: true,
          ok: okFlags,
          deadline,
        },
      });
      audio?.sfx.whoosh();
      await wait(900);

      // body steal: at most ONE per round (a ghost that caught a living body takes
      // it). One-per-round is deliberate, resolving every catch would let the swapped
      // pair, now level, steal back and forth forever.
      const steal = findSteal(racers);
      if (steal) {
        const [gPid, tPid] = steal;
        const after = resolveSteal(racers, gPid, tPid);
        if (after) {
          racers = after.map((x) => withArt(x));
          // sync the alive/dead sets to the swap
          alive.delete(tPid);
          alive.add(gPid);
          dead.add(tPid);
          dead.delete(gPid);
          audio?.sfx.bodysteal();
          flash(true);
          publishShow({
            phase: "finale",
            finale: { racers, darkness, round, cat: fc.cat, opts: [], deadline },
          });
          await narrate(
            `${castMap.get(gPid)?.name ?? "A ghost"} just helped themselves to ${castMap.get(tPid)?.name ?? "a"} body! The dead do not knock, darling.`,
            "THE ESCAPE",
            100,
          );
        }
      }

      // darkness after round 3
      if (round >= 3) {
        darkness = nextDarkness(darkness, 0.14);
        const dk = applyDarkness(racers, darkness);
        racers = dk.racers.map((x) => withArt(x));
        if (dk.consumed.length) {
          audio?.sfx.death();
          for (const pid of dk.consumed) {
            alive.delete(pid);
            dead.add(pid);
          }
          if (darkness > 0 && round === 3)
            await narrate(
              "Ah, here it comes, the dark. Fall behind, and it tucks you in. Permanently.",
              "THE ESCAPE",
              80,
            );
        }
        publishShow({
          phase: "finale",
          finale: { racers, darkness, round, cat: fc.cat, opts: [], deadline },
        });
        await wait(800);
      }

      const out = finaleOutcome(racers);
      if (out.survivors.length) {
        winner = true;
        break;
      }
      if (!racers.some((x) => x.alive && !x.out)) break;
      await wait(400);
    }

    const result = finaleOutcome(racers);
    if (result.result === "won") {
      const champ =
        result.survivors[0] ??
        racers.filter((x) => x.alive && !x.out).sort((a, b) => b.x - a.x)[0]?.pid;
      await win(champ);
    } else await gameOver();
  }

  /** Attach doll art metadata to a racer for the finale view. */
  function withArt(r: Racer): Racer & { shape: DollShape; color: string } {
    const c = castMap.get(r.pid);
    return { ...r, shape: c?.shape ?? "blob", color: c?.color ?? "#d98aa0" };
  }

  async function win(pid?: string) {
    audio?.victory();
    villainOn.value = true;
    const c = pid ? castMap.get(pid) : undefined;
    publishShow({ phase: "ending", ending: { result: "won", survivors: pid ? [pid] : [] } });
    confetti.value = true;
    await narrate(
      `${c?.name ?? "Someone"} is out the door. Alive. I am not angry, just deeply, professionally disappointed. Do come again. You will.`,
      "YOUR HOST",
      150,
    );
    menace();
    finishGame("won", pid);
  }

  async function gameOver() {
    audio?.sfx.gameover();
    flash(true);
    villainOn.value = true;
    publishShow({ phase: "ending", ending: { result: "wiped", survivors: [] } });
    await narrate(
      "Nobody made it out. Nobody. Oh, I could weep, with joy. Best ratings all season. The house ate well tonight, and so, my darlings, did I.",
      "YOUR HOST",
      150,
    );
    menace();
    finishGame("wiped");
  }

  function finishGame(result: "won" | "wiped", champ?: string) {
    const rows = cast.map((c) => ({
      id: c.id,
      name: c.name,
      money: money.get(c.id) ?? 0,
      escaped: c.id === champ,
      alive: alive.has(c.id),
    }));
    const board = leaderboard(rows);
    const summary: StandardResults = {
      headline:
        result === "won" && champ
          ? `${castMap.get(champ)?.name ?? "Someone"} escaped the house`
          : "No survivors. The house wins.",
      leaderboard: board.map((r) => ({ id: r.id, name: r.name, score: r.score, detail: r.detail })),
      stats: [
        { label: "Questions asked", value: asked },
        { label: "Survivors", value: alive.size },
      ],
    };
    room.host.finish(summary as unknown as RelayValue);
  }

  // ── Start / lifecycle ─────────────────────────────────────────────────────────
  let armed = false;
  // Unlock WebAudio + speech inside a host user gesture. Idempotent, so any lobby
  // interaction on the big screen (picking a driver, the Start button, a tap) arms
  // it. That way a later remote "start" from the delegated MC's phone still has
  // audible audio here, even though that command carries no gesture of its own.
  function armAudio() {
    if (armed || !room.isHost.value) return;
    armed = true;
    audio = createHorrorAudio();
    void audio.start();
    audio.setMuted(muted.value);
    // Prime speech inside the gesture so the first villain line isn't dropped.
    primeSpeech();
  }
  function beginShow() {
    if (!room.isHost.value || room.phase.value !== "lobby") return;
    if (room.players.value.length < 2) return; // same floor as the Start button
    // freeze the contestant roster
    cast = assignCast(room.players.value.map((p) => ({ id: p.id, name: p.name })));
    for (const c of cast) castMap.set(c.id, c);
    alive = new Set(cast.map((c) => c.id));
    dead = new Set();
    for (const c of cast) money.set(c.id, 0);
    armAudio(); // no-op if the host already armed it during the lobby
    room.host.start();
    void runShow();
  }
  // Host button: we're already inside a click gesture, so arm + begin.
  function startGame() {
    beginShow();
  }
  // The delegated MC can kick the show off from their phone too. The engine
  // validated the intent (current driver, lobby round); map a 'start' to
  // beginShow(), which is a safe no-op outside the lobby.
  watch(
    () => room.command.value?.nonce,
    () => {
      if (room.command.value?.action === "start") beginShow();
    },
  );
  function playAgain() {
    if (typeof window !== "undefined") window.location.reload();
  }

  // clock + intent handlers
  let clock: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    warmUpSpeech();
    clock = setInterval(() => {
      nowMs.value = Date.now();
      audio?.resume();
    }, 250);

    room.onExtra("ans/*/*", (v, key) => {
      const [, q, pid] = key.split("/");
      if (show.value?.phase !== "question" || Number(q) !== qIdx) return;
      if (!pid || !alive.has(pid) || answers.has(pid)) return;
      const choice = (v as { choice?: number } | null)?.choice;
      answers.set(pid, typeof choice === "number" ? choice : null);
      audio?.sfx.select();
      statusTick.value++;
      pokeGate();
    });
    room.onExtra("cup/*/*", (v, key) => {
      const [, f, pid] = key.split("/");
      if (Number(f) !== floor || !pid || cups.has(pid)) return;
      if (show.value?.cellar?.game !== "chalice" || !show.value.cellar.atRisk.includes(pid)) return;
      const pick = (v as { pick?: number } | null)?.pick;
      if (typeof pick !== "number") return;
      cups.set(pid, pick);
      audio?.sfx.select();
      statusTick.value++;
      pokeGate();
    });
    const onSpinRoll = (_v: unknown, key: string) => {
      const [, f, pid] = key.split("/");
      if (Number(f) !== floor || !pid) return;
      const active = show.value?.cellar?.activePid;
      if (active !== pid || spins.has(pid)) return;
      spins.add(pid);
      pokeGate();
    };
    room.onExtra("spin/*/*", onSpinRoll);
    room.onExtra("roll/*/*", onSpinRoll);
    room.onExtra("money/*/*", (v, key) => {
      const [, f, pid] = key.split("/");
      if (Number(f) !== floor || !pid || takes.has(pid)) return;
      if (show.value?.cellar?.game !== "money" || !show.value.cellar.atRisk.includes(pid)) return;
      takes.set(pid, (v as { take?: boolean } | null)?.take === true);
      audio?.sfx.select();
      statusTick.value++;
      pokeGate();
    });
    room.onExtra("fin/*/*", (v, key) => {
      const [, r, pid] = key.split("/");
      if (show.value?.phase !== "finale" || Number(r) !== show.value.finale?.round || !pid) return;
      if (finalePicks.has(pid)) return;
      const picks = (v as { picks?: number[] } | null)?.picks;
      if (!Array.isArray(picks)) return;
      finalePicks.set(
        pid,
        picks.filter((n) => typeof n === "number"),
      );
      audio?.sfx.select();
      statusTick.value++;
      pokeGate();
    });
  });
  onBeforeUnmount(() => {
    if (clock) clearInterval(clock);
    for (const t of timers) clearTimeout(t);
    timers = [];
    cancelSpeech();
    audio?.stop();
  });

  // ── Host visual helpers ───────────────────────────────────────────────────────
  const remaining = computed(() => {
    const d =
      show.value?.question?.deadline ??
      show.value?.cellar?.deadline ??
      show.value?.finale?.deadline;
    if (!d) return null;
    return Math.max(0, Math.ceil((d - nowMs.value) / 1000));
  });
  const galleryReveal = computed(() => (show.value?.phase === "reveal" ? show.value.reveal : null));
  function pickChips(optIndex: number) {
    // who (alive) answered this option, shown at reveal
    if (show.value?.phase !== "reveal") return [] as CastView[];
    const ans = answers;
    return (show.value.cast ?? []).filter((c) => ans.get(c.pid) === optIndex);
  }
  // The scene backdrop swaps per phase (night / curtain / dungeon), like the mockup.
  const sceneClass = computed(() => {
    const p = show.value?.phase;
    if (p === "intro") return "bg-night";
    if (p === "question" || p === "reveal") return "bg-curtain";
    return "bg-dungeon";
  });
  const exitOn = computed(() => ["cellar", "death", "finale"].includes(show.value?.phase ?? ""));
  // A live "ANSWER NOW!" / "CHOOSE!" tally bottom-left. `statusTick` (bumped by the
  // intent handlers) makes the count reactive off the plain collector maps.
  const statusInfo = computed<{ label: string; count: number } | null>(() => {
    void statusTick.value;
    const s = show.value;
    if (!s) return null;
    if (s.phase === "question") return { label: "ANSWER NOW!", count: answers.size };
    if (s.phase === "cellar" && s.cellar?.step === "choose") {
      if (s.cellar.game === "chalice") return { label: "PICK A CUP", count: cups.size };
      if (s.cellar.game === "money") return { label: "DECIDE", count: takes.size };
    }
    if (s.phase === "finale" && !s.finale?.reveal && (s.finale?.cat?.length ?? 0) > 0)
      return { label: "ANSWER NOW!", count: finalePicks.size };
    return null;
  });

  return {
    show,
    caption,
    villainOn,
    villainCenter,
    talking,
    menacing,
    confetti,
    flashKind,
    shakeOn,
    muted,
    voiceMode,
    remaining,
    sceneClass,
    exitOn,
    statusInfo,
    galleryReveal,
    pickChips,
    castMap,
    ROT,
    KEYC,
    startGame,
    armAudio,
    playAgain,
    skip,
    toggleMute,
    cycleVoice,
  };
}
