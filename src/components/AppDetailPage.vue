<script setup>
import { onMounted, ref } from 'vue'
const props = defineProps({title: String, beforeClose: Function})
const emit = defineEmits(['close'])
const heading = ref(null)
function close() {
  if (!props.beforeClose || props.beforeClose() !== false) emit('close')
}
onMounted(() => { heading.value?.focus(); window.scrollTo(0, 0) })
</script>

<template>
  <section class="detail-page">
    <header class="detail-page-heading">
      <div><button class="link-button" @click="close">← 返回列表</button><h1 ref="heading" tabindex="-1">{{ title }}</h1></div>
      <div><slot name="header-actions" /></div>
    </header>
    <div class="detail-page-body"><slot /></div>
    <footer v-if="$slots.footer" class="detail-page-footer"><slot name="footer" /></footer>
  </section>
</template>

<style scoped>
.detail-page { min-width: 0; }
.detail-page-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
h1 { margin: 10px 0 0; font-size: 24px; }
.detail-page-body { padding: 24px; background: #fff; border: 1px solid #f0f0f0; border-radius: 8px; }
.detail-page-footer { position: sticky; bottom: 0; z-index: 5; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; padding: 16px; border-top: 1px solid #e8e8e8; background: #fff; }
@media(max-width:760px) { .detail-page-body { padding: 14px; }.detail-page-heading { align-items: flex-start; flex-direction: column; } }
</style>
