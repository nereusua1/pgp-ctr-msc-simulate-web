<script setup>
defineProps({ columns: { type: Number, default: 3 }, tone: { type: String, default: 'plain' } })
</script>

<template>
  <dl class="detail-grid" :class="`tone-${tone}`" :style="{ '--detail-columns': columns }"><slot /></dl>
</template>

<style scoped>
.detail-grid { display: grid; grid-template-columns: repeat(var(--detail-columns), minmax(0, 1fr)); gap: 1px; margin: 0; overflow: hidden; border: 1px solid #f0f0f0; border-radius: 8px; background: #f0f0f0; }
.detail-grid :deep(> div) { min-width: 0; padding: 15px 18px; background: #fff; }
.detail-grid :deep(dt) { margin: 0 0 6px; color: #748399; font-size: 13px; font-weight: 600; line-height: 1.45; }
.detail-grid :deep(dd) { margin: 0; color: #30445d; font-size: 15px; font-weight: 550; line-height: 1.55; overflow-wrap: anywhere; }
.tone-blue { border-color: #bae0ff; background: #e6f4ff; }.tone-blue :deep(> div) { background: #fafdff; }
@media (max-width: 700px) { .detail-grid { grid-template-columns: 1fr !important; } }
</style>
