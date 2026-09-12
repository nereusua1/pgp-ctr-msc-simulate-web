<script setup>
import { getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({ title: { type: String, required: true }, description: { type: String, default: '' }, wide: Boolean })
const emit = defineEmits(['close'])
const drawer = ref(null)
const closeButton = ref(null)
const titleId = `drawer-title-${getCurrentInstance()?.uid || Date.now()}`
let previousFocus = null
let previousOverflow = ''

function close() { emit('close') }
function onKeydown(event) {
  if (event.key === 'Escape') close()
  if (event.key !== 'Tab' || !drawer.value) return
  const focusable = [...drawer.value.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

onMounted(() => {
  previousFocus = document.activeElement
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', onKeydown)
  requestAnimationFrame(() => (drawer.value?.querySelector('.drawer-body input:not([disabled]), .drawer-body select:not([disabled])') || closeButton.value)?.focus())
})
onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  document.removeEventListener('keydown', onKeydown)
  previousFocus?.focus?.()
})
</script>

<template>
  <div class="drawer-backdrop" @click.self="close">
    <aside ref="drawer" class="app-drawer" :class="{ wide }" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <header class="drawer-header">
        <div><h2 :id="titleId">{{ title }}</h2><p v-if="description">{{ description }}</p></div>
        <button ref="closeButton" class="icon-button" type="button" aria-label="关闭" @click="close">×</button>
      </header>
      <div class="drawer-body"><slot /></div>
      <footer v-if="$slots.footer" class="drawer-footer"><slot name="footer" /></footer>
    </aside>
  </div>
</template>

<style scoped>
.drawer-backdrop { position: fixed; z-index: 70; inset: 0; display: flex; justify-content: flex-end; background: #0f172a42; animation: drawer-fade .16s ease-out; }
.app-drawer { display: grid; width: min(460px, 94vw); height: 100%; grid-template-rows: auto minmax(0, 1fr) auto; border-left: 1px solid #dfe5ee; background: #fff; box-shadow: -12px 0 32px #0f172a24; animation: drawer-enter .2s ease-out; }
.app-drawer.wide { width: min(560px, 94vw); }
.drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 22px 16px; border-bottom: 1px solid #e5eaf2; }
.drawer-header h2 { margin: 0; color: #1d2a3a; font-size: 19px; }
.drawer-header p { margin: 6px 0 0; color: #667085; font-size: 13px; line-height: 1.6; }
.drawer-body { min-height: 0; padding: 20px 22px; overflow-y: auto; }
.drawer-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 14px 22px; border-top: 1px solid #e5eaf2; background: #fff; }
@keyframes drawer-enter { from { transform: translateX(20px); opacity: .5; } }
@keyframes drawer-fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .drawer-backdrop, .app-drawer { animation: none; } }
</style>
