<script setup lang="ts">
/**
 * Dev showcase for the controller kit. Mounts every control under the site's
 * theme switcher (top bar, includes Bubblegum) and logs each logical-input event
 * so you can confirm emissions. Visual QA only; not linked from navigation.
 */
import {
  ActionCluster,
  type AnalogInputEvent,
  BUILTIN_LAYOUTS,
  Bumper,
  Buzzer,
  ConnChip,
  ControlSlider,
  type ControllerLayout,
  ControllerPad,
  DPad,
  type DigitalInputEvent,
  type GamepadBridge,
  GamepadMapper,
  PadButton,
  PlayerHeader,
  Segmented,
  Thumbstick,
  ToggleSwitch,
  createGamepadBridge,
} from '@doot-games/ui'
import { computed, onUnmounted, ref } from 'vue'

useHead({ title: 'Controller kit, dev showcase' })

const log = ref<string[]>([])
function push(line: string) {
  log.value.unshift(line)
  if (log.value.length > 40) log.value.pop()
}
function onInput(e: DigitalInputEvent) {
  push(`${e.source ?? 'touch'}  ${e.id}  ${e.pressed ? 'press' : 'release'}`)
}
function onAxis(e: AnalogInputEvent) {
  push(`${e.source ?? 'touch'}  ${e.side} stick  x ${e.x.toFixed(2)}  y ${e.y.toFixed(2)}`)
}

// Settings widgets
const aim = ref(60)
const wager = ref(3)
const throttle = ref(40)
const lights = ref(false)
const lane = ref('mid')

// Assembled pad
const layoutId = ref('snes')
const layout = computed<ControllerLayout>(
  () => BUILTIN_LAYOUTS.find((l) => l.id === layoutId.value) ?? BUILTIN_LAYOUTS[0]!,
)
const layoutOptions = BUILTIN_LAYOUTS.map((l) => ({ value: l.id, label: l.label }))

// Gamepad
const gpStatus = ref('no gamepad detected')
const remapOpen = ref(false)
let bridge: GamepadBridge | null = null
function startGamepad() {
  bridge?.stop()
  bridge = createGamepadBridge({
    onInput,
    onAxis,
    onConnect: ({ id }) => {
      gpStatus.value = `connected: ${id}`
    },
    onDisconnect: () => {
      gpStatus.value = 'gamepad disconnected'
    },
  })
  bridge.start()
  gpStatus.value = 'listening for a gamepad (press a button)'
}
onUnmounted(() => bridge?.stop())
</script>

<template>
  <main class="wrap">
    <h1>Controller kit</h1>
    <p class="lede">
      Theme-aware touch controls. Switch themes in the top bar (Bubblegum is the new one).
      Every momentary/analog control emits the logical-input contract; the log on the right
      shows live events.
    </p>

    <div class="cols">
      <div class="stage">
        <section class="card">
          <h3>Directional</h3>
          <div class="row">
            <DPad @input="onInput" />
            <Thumbstick @axis="onAxis" />
          </div>
        </section>

        <section class="card">
          <h3>Action</h3>
          <div class="row">
            <ActionCluster
              layout="diamond"
              :buttons="[
                { id: 'x', label: 'X', hue: 'c4', pos: 'n' },
                { id: 'y', label: 'Y', hue: 'c5', pos: 'w' },
                { id: 'a', label: 'A', hue: 'primary', pos: 'e' },
                { id: 'b', label: 'B', hue: 'c1', pos: 's' },
              ]"
              @input="onInput"
            />
            <Buzzer @input="onInput" />
            <div class="stack">
              <PadButton id="confirm" label="OK" hue="primary" shape="pill" @input="onInput" />
              <div class="row">
                <Bumper id="l" side="left" @input="onInput" />
                <Bumper id="r" side="right" @input="onInput" />
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <h3>Settings widgets</h3>
          <div class="stack wide">
            <ControlSlider v-model="aim" label="aim" />
            <ControlSlider v-model="wager" label="wager" :min="1" :max="5" :step="1" />
            <div class="row">
              <ControlSlider v-model="throttle" orientation="vertical" label="throttle" />
              <div class="stack">
                <ToggleSwitch v-model="lights" label="Headlights" />
                <Segmented
                  v-model="lane"
                  :options="[
                    { value: 'left', label: 'Left' },
                    { value: 'mid', label: 'Mid' },
                    { value: 'right', label: 'Right' },
                  ]"
                />
              </div>
            </div>
          </div>
        </section>

        <section class="card">
          <h3>Status</h3>
          <div class="row">
            <ConnChip status="connected" :ping-ms="24" />
            <ConnChip status="connecting" />
            <ConnChip status="disconnected" />
          </div>
          <PlayerHeader name="virgilvox" status="in round 3" :score="1240" />
        </section>

        <section class="card">
          <h3>Assembled pad</h3>
          <Segmented v-model="layoutId" :options="layoutOptions" />
          <div class="phone">
            <ControllerPad :layout="layout" @input="onInput" @axis="onAxis" />
          </div>
        </section>

        <section class="card">
          <h3>Physical gamepad</h3>
          <p class="muted">{{ gpStatus }}</p>
          <div class="row">
            <button class="mini" @click="startGamepad">Listen for gamepad</button>
            <button class="mini" @click="remapOpen = !remapOpen">{{ remapOpen ? 'Close remap' : 'Remap' }}</button>
          </div>
          <GamepadMapper
            v-if="remapOpen"
            :layout="layout"
            @done="remapOpen = false"
          />
        </section>
      </div>

      <aside class="logpanel">
        <h3>Input log</h3>
        <ol>
          <li v-for="(l, i) in log" :key="i">{{ l }}</li>
          <li v-if="!log.length" class="muted">touch a control to emit a signal</li>
        </ol>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px 20px 80px;
}
h1 {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 30px;
}
.lede {
  color: var(--ink-soft);
  max-width: 70ch;
  margin: 8px 0 24px;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 20px;
  align-items: start;
}
.stage {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.card {
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 18px;
}
.card h3 {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  margin: 0 0 14px;
}
.row {
  display: flex;
  gap: 22px;
  align-items: center;
  flex-wrap: wrap;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stack.wide {
  width: 100%;
  max-width: 420px;
}
.phone {
  margin-top: 14px;
  height: 360px;
  max-width: 520px;
  background: var(--bg-2);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  padding: 12px;
}
.muted {
  color: var(--mute);
  font-family: var(--font-mono);
  font-size: 12px;
}
.mini {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 8px 14px;
  border-radius: 999px;
  border: var(--bd) solid var(--line);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}
.logpanel {
  position: sticky;
  top: 16px;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 16px;
  max-height: 80vh;
  overflow: auto;
}
.logpanel h3 {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  margin: 0 0 10px;
}
.logpanel ol {
  list-style: none;
  margin: 0;
  padding: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
@media (max-width: 820px) {
  .cols {
    grid-template-columns: 1fr;
  }
  .logpanel {
    position: static;
    max-height: 240px;
  }
}
</style>
