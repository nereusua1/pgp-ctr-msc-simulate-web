<script setup>
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({ title: { type: String, required: true }, wide: Boolean, centered: Boolean, beforeClose: { type: Function, default: null } })
const emit = defineEmits(['close'])
const closeButton = ref(null)
const modalCard = ref(null)
const closing = ref(false)
const titleId = `modal-title-${getCurrentInstance()?.uid || Date.now()}`
const isCentered = computed(() => props.centered || /^(删除|复制|立即执行|历史补跑)/.test(props.title))
let previousOverflow = ''
let previousFocus = null
let closeTimer

function requestClose() {
  if (closing.value) return
  if (props.beforeClose && props.beforeClose() === false) return
  closing.value = true
  closeTimer = window.setTimeout(() => emit('close'), 160)
}

function onKeydown(event) {
  if (event.key === 'Escape') requestClose()
  if (event.key === 'Tab' && modalCard.value) {
    const focusable = [...modalCard.value.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
}

onMounted(() => {
  previousFocus = document.activeElement
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  document.addEventListener('keydown', onKeydown)
  const input = modalCard.value?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
  const cancel = [...(modalCard.value?.querySelectorAll('button') || [])].find(button => button.textContent.trim() === '取消')
  if (props.title.includes('删除')) (cancel || closeButton.value)?.focus()
  else (input || closeButton.value)?.focus()
})

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  document.removeEventListener('keydown', onKeydown)
  window.clearTimeout(closeTimer)
  previousFocus?.focus?.()
})
</script>

<template>
  <div class="modal-backdrop" :class="{ closing, centered: isCentered }" @click.self="requestClose">
    <section ref="modalCard" class="modal-card" :class="{ wide, centered: isCentered, closing }" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1">
      <header class="modal-header">
        <h2 :id="titleId">{{ title }}</h2>
        <div class="modal-header-actions">
          <slot name="header-actions" />
          <button ref="closeButton" class="icon-button" aria-label="关闭" @click="requestClose">×</button>
        </div>
      </header>
      <div class="modal-body"><slot /></div>
      <footer v-if="$slots.footer" class="modal-footer"><slot name="footer" /></footer>
    </section>
  </div>
</template>
