<script setup lang="ts">
/**
 * An animated CSS robot that performs a verse on the big screen: it bobs to the
 * beat and its mouth runs while it's "rapping" (`speaking`). Pure CSS so it is
 * light, theme-aware, and honored by the global prefers-reduced-motion reset.
 * Built for Circuit Cypher's performance moment; `facing` lets two of them square
 * off for the head-to-head battles to come.
 */
withDefaults(
  defineProps<{
    /** The performer's name, shown on a plate under the robot. */
    name?: string
    /** Animate the mouth + bob (true while this robot is performing). */
    speaking?: boolean
    /** Accent color (any CSS color / theme var). Drives the chassis. */
    accent?: string
    /** Pixel height of the robot. */
    size?: number
    /** Which way the robot leans, so a pair can face each other. */
    facing?: 'left' | 'right' | 'center'
  }>(),
  { name: '', speaking: false, accent: 'var(--primary)', size: 180, facing: 'center' },
)
</script>

<template>
  <div
    class="rapper"
    :class="[`face-${facing}`, { speaking }]"
    :style="{ '--accent': accent, '--bot': `${size}px` }"
  >
    <div class="bot">
      <div class="antenna"><i class="ball" /></div>
      <div class="head">
        <div class="ear left" />
        <div class="ear right" />
        <div class="screen">
          <div class="eyes"><i /><i /></div>
          <div class="mouth"><span /><span /><span /><span /><span /></div>
        </div>
      </div>
      <div class="arm left" />
      <div class="arm right" />
      <div class="body"><span class="grill" /></div>
    </div>
    <div v-if="name" class="plate">{{ name }}</div>
  </div>
</template>

<style scoped>
.rapper {
  --w: calc(var(--bot) * 0.78);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.bot {
  position: relative;
  width: var(--w);
  height: var(--bot);
  transform-origin: center bottom;
}
.speaking .bot {
  animation: bob 0.5s ease-in-out infinite;
}
.face-left .bot {
  transform: rotate(7deg);
}
.face-right .bot {
  transform: rotate(-7deg);
}

/* antenna */
.antenna {
  position: absolute;
  top: calc(var(--bot) * -0.05);
  left: 50%;
  width: 3px;
  height: calc(var(--bot) * 0.12);
  background: var(--line);
  transform: translateX(-50%);
}
.ball {
  position: absolute;
  top: calc(var(--bot) * -0.06);
  left: 50%;
  width: calc(var(--bot) * 0.1);
  height: calc(var(--bot) * 0.1);
  border-radius: 50%;
  background: var(--accent);
  transform: translateX(-50%);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 35%, transparent);
}
.speaking .ball {
  animation: pulse 0.5s ease-in-out infinite;
}

/* head */
.head {
  position: absolute;
  top: calc(var(--bot) * 0.08);
  left: 50%;
  transform: translateX(-50%);
  width: calc(var(--w) * 0.82);
  height: calc(var(--bot) * 0.42);
  background: var(--accent);
  border: var(--bd) solid var(--line);
  border-radius: calc(var(--bot) * 0.1);
  box-shadow: var(--shadow-sm);
}
.ear {
  position: absolute;
  top: 35%;
  width: calc(var(--bot) * 0.06);
  height: calc(var(--bot) * 0.16);
  background: var(--accent);
  border: var(--bd) solid var(--line);
  border-radius: 4px;
}
.ear.left {
  left: calc(var(--bot) * -0.05);
}
.ear.right {
  right: calc(var(--bot) * -0.05);
}
.screen {
  position: absolute;
  inset: 14%;
  background: #15110d;
  border-radius: calc(var(--bot) * 0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12%;
  overflow: hidden;
}
.eyes {
  display: flex;
  gap: 22%;
}
.eyes i {
  width: calc(var(--bot) * 0.05);
  height: calc(var(--bot) * 0.05);
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 calc(var(--bot) * 0.03) var(--accent);
}
.speaking .eyes i {
  animation: blink 2.4s steps(1) infinite;
}
/* mouth = an equalizer of bars that dances while rapping */
.mouth {
  display: flex;
  align-items: center;
  gap: 12%;
  height: calc(var(--bot) * 0.07);
}
.mouth span {
  width: calc(var(--bot) * 0.025);
  height: 30%;
  border-radius: 2px;
  background: var(--accent);
}
.speaking .mouth span {
  animation: talk 0.32s ease-in-out infinite;
}
.speaking .mouth span:nth-child(2) {
  animation-delay: 0.08s;
}
.speaking .mouth span:nth-child(3) {
  animation-delay: 0.16s;
}
.speaking .mouth span:nth-child(4) {
  animation-delay: 0.04s;
}
.speaking .mouth span:nth-child(5) {
  animation-delay: 0.12s;
}

/* body */
.body {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: var(--w);
  height: calc(var(--bot) * 0.4);
  background: color-mix(in srgb, var(--accent) 80%, var(--ink));
  border: var(--bd) solid var(--line);
  border-radius: calc(var(--bot) * 0.08) calc(var(--bot) * 0.08) calc(var(--bot) * 0.05) calc(var(--bot) * 0.05);
  box-shadow: var(--shadow-sm);
}
.grill {
  position: absolute;
  inset: 22% 18% auto 18%;
  height: 46%;
  border-radius: calc(var(--bot) * 0.03);
  background: repeating-linear-gradient(
    180deg,
    color-mix(in srgb, #000 25%, transparent) 0 3px,
    transparent 3px 7px
  );
}
.arm {
  position: absolute;
  bottom: calc(var(--bot) * 0.12);
  width: calc(var(--bot) * 0.07);
  height: calc(var(--bot) * 0.26);
  background: var(--accent);
  border: var(--bd) solid var(--line);
  border-radius: 999px;
}
.arm.left {
  left: calc(var(--bot) * -0.04);
  transform-origin: top center;
}
.arm.right {
  right: calc(var(--bot) * -0.04);
  transform-origin: top center;
}
.speaking .arm.left {
  animation: wave-l 0.5s ease-in-out infinite;
}
.speaking .arm.right {
  animation: wave-r 0.5s ease-in-out infinite;
}
.plate {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(14px, 1.6vw, 20px);
  color: var(--ink);
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: 999px;
  padding: 4px 14px;
  box-shadow: var(--shadow-sm);
}

@keyframes bob {
  0%,
  100% {
    transform: translateY(0) scaleY(1);
  }
  50% {
    transform: translateY(calc(var(--bot) * -0.04)) scaleY(1.02);
  }
}
@keyframes talk {
  0%,
  100% {
    height: 18%;
  }
  50% {
    height: 92%;
  }
}
@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  50% {
    box-shadow: 0 0 0 9px color-mix(in srgb, var(--accent) 10%, transparent);
  }
}
@keyframes blink {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  96% {
    transform: scaleY(0.1);
  }
}
@keyframes wave-l {
  0%,
  100% {
    transform: rotate(8deg);
  }
  50% {
    transform: rotate(-14deg);
  }
}
@keyframes wave-r {
  0%,
  100% {
    transform: rotate(-8deg);
  }
  50% {
    transform: rotate(14deg);
  }
}
</style>
