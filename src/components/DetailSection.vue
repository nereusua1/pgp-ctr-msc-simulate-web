<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  count: { type: [Number, String], default: '' },
  collapsible: Boolean,
  open: Boolean
})
</script>

<template>
  <details v-if="collapsible" class="detail-section" :open="open">
    <summary class="detail-section-heading">
      <span><b>{{ title }}</b><small v-if="description">{{ description }}</small></span>
      <em v-if="count !== ''">{{ count }} 项</em>
    </summary>
    <div class="detail-section-body"><slot /></div>
  </details>
  <section v-else class="detail-section">
    <header class="detail-section-heading">
      <span><b>{{ title }}</b><small v-if="description">{{ description }}</small></span>
      <em v-if="count !== ''">{{ count }} 项</em>
      <slot name="actions" />
    </header>
    <div class="detail-section-body"><slot /></div>
  </section>
</template>

<style scoped>
.detail-section { overflow: hidden; border: 1px solid #e0e6ef; border-radius: 13px; background: #fff; }
.detail-section-heading { display: flex; min-height: 58px; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 18px; border-bottom: 1px solid #edf1f5; background: #fbfcfe; }
summary.detail-section-heading { cursor: pointer; list-style: none; }
summary.detail-section-heading::-webkit-details-marker { display: none; }
summary.detail-section-heading::after { color: #6d7d92; font-size: 15px; content: '展开'; }
details[open] > summary.detail-section-heading::after { content: '收起'; }
.detail-section-heading > span { min-width: 0; }
.detail-section-heading b { display: block; color: #263a54; font-size: 16px; font-weight: 700; line-height: 1.45; }
.detail-section-heading small { display: block; margin-top: 3px; color: #7a899d; font-size: 13px; line-height: 1.5; }
.detail-section-heading em { flex: none; padding: 4px 9px; border-radius: 999px; background: #edf2ff; color: #2d5fcf; font-size: 13px; font-style: normal; font-weight: 650; }
.detail-section-body { padding: 18px; color: #465b74; font-size: 15px; line-height: 1.7; }
.detail-section-body :deep(p:first-child) { margin-top: 0; }
.detail-section-body :deep(p:last-child) { margin-bottom: 0; }
</style>
