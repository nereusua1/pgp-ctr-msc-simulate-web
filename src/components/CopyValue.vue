<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ value: { type: [String, Number], default: '' }, masked: Boolean, emptyText: { type: String, default: '未配置' } })
const revealed = ref(false)
const copied = ref(false)
const text = computed(() => String(props.value ?? ''))
const display = computed(() => {
  if (!text.value) return props.emptyText
  if (!props.masked || revealed.value) return text.value
  if (text.value.length <= 6) return '••••••'
  return `${text.value.slice(0, 4)}••••${text.value.slice(-2)}`
})

async function copy() {
  if (!text.value) return
  await navigator.clipboard?.writeText(text.value)
  copied.value = true
  window.setTimeout(() => { copied.value = false }, 1200)
}
</script>

<template>
  <span class="copy-value"><code :title="display">{{ display }}</code><button v-if="masked && text" type="button" @click="revealed = !revealed">{{ revealed ? '隐藏' : '显示' }}</button><button v-if="text" type="button" @click="copy">{{ copied ? '已复制' : '复制' }}</button></span>
</template>

<style scoped>
.copy-value { display: flex; min-width: 0; align-items: center; gap: 9px; }
code { min-width: 0; overflow: hidden; color: #344b66; font: 600 14px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
button { flex: none; padding: 1px 0; border: 0; background: transparent; color: #2d5fcf; font-size: 13px; font-weight: 650; }
</style>
