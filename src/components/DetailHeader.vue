<script setup>
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  code: { type: String, default: '' },
  description: { type: String, default: '' }
})
</script>

<template>
  <header class="detail-header">
    <div class="detail-header-main">
      <span v-if="eyebrow" class="detail-eyebrow">{{ eyebrow }}</span>
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
      <code v-if="code">{{ code }}</code>
      <slot />
    </div>
    <aside v-if="$slots.aside" class="detail-header-aside"><slot name="aside" /></aside>
  </header>
</template>

<style scoped>
.detail-header { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 28px; padding: 20px 22px; border: 1px solid #f0f0f0; border-radius: 8px; background: #fff; }
.detail-header-main { min-width: 0; }
.detail-eyebrow { display: block; margin-bottom: 5px; color: #738299; font-size: 13px; font-weight: 650; }
h2 { margin: 0; color: #203650; font-size: 21px; font-weight: 720; line-height: 1.4; letter-spacing: -.02em; overflow-wrap: anywhere; }
p { margin: 7px 0 0; color: #60728a; font-size: 15px; line-height: 1.65; }
code { display: block; margin-top: 7px; color: #49617e; font: 600 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.detail-header-aside { display: flex; min-width: 150px; align-items: center; justify-content: flex-end; gap: 12px; }
@media (max-width: 700px) { .detail-header { align-items: flex-start; flex-direction: column; gap: 16px; }.detail-header-aside { min-width: 0; justify-content: flex-start; } }
</style>
