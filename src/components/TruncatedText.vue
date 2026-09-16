<script setup>
import {computed, nextTick, onBeforeUnmount, ref, useId} from 'vue'

const props = defineProps({text: {type: [String, Number], default: ''}, code: Boolean, copyable: Boolean})
const trigger = ref(null)
const tooltip = ref(null)
const visible = ref(false)
const positioned = ref(false)
const placement = ref('above')
const tooltipStyle = ref({})
const copied = ref(false)
const displayText = computed(() => props.text === '' || props.text === null || props.text === undefined ? '—' : String(props.text))
const tooltipId = `truncate-tooltip-${useId()}`
let hideTimer

async function copy() {
  try {
    await navigator.clipboard.writeText(displayText.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1200)
  } catch { /* 复制不可用时仍可查看 */ }
}

function updatePosition() {
  if (!visible.value || !trigger.value || !tooltip.value) return
  const anchor = trigger.value.getBoundingClientRect()
  const panel = tooltip.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const edge = 8
  const gap = 8
  const maxWidth = Math.max(160, Math.min(420, viewportWidth - edge * 2))
  const useBelow = anchor.top < panel.height + gap + edge && viewportHeight - anchor.bottom > anchor.top
  const desiredTop = useBelow ? anchor.bottom + gap : anchor.top - panel.height - gap
  const top = Math.min(Math.max(edge, desiredTop), Math.max(edge, viewportHeight - panel.height - edge))
  const left = Math.min(Math.max(edge, anchor.left), Math.max(edge, viewportWidth - panel.width - edge))
  const arrowLeft = Math.min(Math.max(12, anchor.left + anchor.width / 2 - left), Math.max(12, panel.width - 12))
  placement.value = useBelow ? 'below' : 'above'
  tooltipStyle.value = {
    top: `${Math.round(top)}px`, left: `${Math.round(left)}px`, maxWidth: `${maxWidth}px`,
    '--tooltip-arrow-left': `${Math.round(arrowLeft)}px`
  }
  positioned.value = true
}

function addViewportListeners() {
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
}

function removeViewportListeners() {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
}

function cancelHide() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = undefined
}

function showTooltip() {
  cancelHide()
  if (visible.value) return
  visible.value = true
  positioned.value = false
  addViewportListeners()
  nextTick(updatePosition)
}

function hideTooltip() {
  cancelHide()
  visible.value = false
  positioned.value = false
  removeViewportListeners()
}

function scheduleHide() {
  cancelHide()
  hideTimer = setTimeout(hideTooltip, 120)
}

function handleKeydown(event) {
  if (event.key === 'Escape') hideTooltip()
}

onBeforeUnmount(() => {
  cancelHide()
  removeViewportListeners()
})
</script>

<template>
  <span ref="trigger" class="truncate-wrap" tabindex="0" :aria-describedby="visible ? tooltipId : undefined"
        @mouseenter="showTooltip" @mouseleave="scheduleHide" @focusin="showTooltip" @focusout="scheduleHide" @keydown="handleKeydown">
    <component :is="code ? 'code' : 'span'" class="truncate-value">{{ displayText }}</component>
  </span>
  <Teleport to="body">
    <span v-if="visible" :id="tooltipId" ref="tooltip" class="truncate-tooltip" :class="[placement, {positioned}]"
          :style="tooltipStyle" role="tooltip" @mouseenter="cancelHide" @mouseleave="scheduleHide" @focusin="cancelHide" @focusout="scheduleHide">
      <span>{{ displayText }}</span>
      <button v-if="copyable" type="button" aria-label="复制完整内容" @click.stop="copy">{{ copied ? '已复制' : '复制' }}</button>
    </span>
  </Teleport>
</template>

<style scoped>
.truncate-wrap { display: block; min-width: 0; outline: none; }
.truncate-wrap:focus-visible { border-radius: 3px; box-shadow: 0 0 0 3px rgba(22, 119, 255, .14); }
.truncate-value { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.truncate-tooltip { position: fixed; z-index: 1200; display: flex; width: max-content; max-width: min(420px, calc(100vw - 16px)); align-items: center; gap: 10px; padding: 7px 9px; border-radius: 4px; background: #262626; box-shadow: 0 6px 18px rgba(0, 0, 0, .2); color: #fff; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; white-space: normal; opacity: 0; pointer-events: none; visibility: hidden; transform: translateY(3px); transition: opacity .14s, transform .14s; }
.truncate-tooltip.positioned { opacity: 1; pointer-events: auto; visibility: visible; transform: none; }
.truncate-tooltip::after { position: absolute; left: var(--tooltip-arrow-left, 14px); margin-left: -5px; border: 5px solid transparent; content: ''; }
.truncate-tooltip.above::after { top: 100%; border-top-color: #262626; }
.truncate-tooltip.below::after { bottom: 100%; border-bottom-color: #262626; }
.truncate-tooltip button { flex: none; padding: 2px 6px; border: 0; border-radius: 3px; background: rgba(255, 255, 255, .14); color: #fff; font-family: inherit; font-size: 11px; white-space: nowrap; }
.truncate-tooltip button:hover, .truncate-tooltip button:focus-visible { background: rgba(255, 255, 255, .24); outline: 2px solid rgba(255, 255, 255, .55); outline-offset: 1px; }
</style>
