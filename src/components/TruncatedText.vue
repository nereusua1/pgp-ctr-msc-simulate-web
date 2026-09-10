<script setup>
import {ref} from 'vue'
const props = defineProps({text: {type: [String, Number], default: ''}, code: Boolean, copyable: Boolean})
const copied = ref(false)
async function copy() { try { await navigator.clipboard.writeText(String(props.text || '')); copied.value = true; setTimeout(() => { copied.value = false }, 1200) } catch { /* 复制不可用时仍可查看 */ } }
</script>
<template><span class="truncate-wrap" tabindex="0"><component :is="code ? 'code' : 'span'" class="truncate-value">{{ text || '—' }}</component><span class="truncate-tooltip" role="tooltip">{{ text || '—' }}<button v-if="copyable" type="button" @click.stop="copy">{{ copied ? '已复制' : '复制' }}</button></span></span></template>
<style scoped>
.truncate-wrap{position:relative;display:block;min-width:0;outline:none}.truncate-value{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.truncate-tooltip{position:absolute;z-index:30;bottom:calc(100% + 7px);left:0;display:flex;width:max-content;max-width:420px;align-items:center;gap:10px;padding:7px 9px;border-radius:4px;background:#262626;color:#fff;font-size:12px;line-height:1.45;white-space:normal;opacity:0;pointer-events:none;transform:translateY(3px);transition:.14s}.truncate-tooltip::after{position:absolute;top:100%;left:14px;border:5px solid transparent;border-top-color:#262626;content:''}.truncate-wrap:hover .truncate-tooltip,.truncate-wrap:focus-visible .truncate-tooltip{opacity:1;pointer-events:auto;transform:none}.truncate-tooltip button{padding:1px 5px;border:0;border-radius:3px;background:#ffffff22;color:#fff;font-size:11px;white-space:nowrap}
</style>
