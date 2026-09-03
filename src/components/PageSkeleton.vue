<template>
  <main class="page page-skeleton" aria-label="正在加载真实数据" aria-busy="true">
    <div class="skeleton skeleton-title" />
    <div class="skeleton skeleton-copy" />
    <section class="skeleton-metrics">
      <div v-for="index in 3" :key="index" class="skeleton metric-placeholder" />
    </section>
    <section class="card skeleton-card">
      <div class="skeleton skeleton-card-title" />
      <div v-for="index in 5" :key="index" class="skeleton skeleton-row" />
    </section>
  </main>
</template>

<style scoped>
.page-skeleton { padding-top: 42px; }
.skeleton { overflow: hidden; border-radius: 10px; background: #e9eef5; }
.skeleton::after { display: block; width: 45%; height: 100%; transform: translateX(-120%); background: linear-gradient(90deg, transparent, #ffffffa8, transparent); content: ''; animation: shimmer 1.6s ease-in-out infinite; }
.skeleton-title { width: 170px; height: 34px; }
.skeleton-copy { width: 360px; max-width: 70%; height: 16px; margin-top: 12px; }
.skeleton-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 30px 0 16px; }
.metric-placeholder { height: 94px; }
.skeleton-card { padding: 22px; }
.skeleton-card-title { width: 130px; height: 20px; margin-bottom: 20px; }
.skeleton-row { height: 54px; margin-top: 1px; border-radius: 0; }
@keyframes shimmer { to { transform: translateX(280%); } }
@media (max-width: 720px) { .skeleton-metrics { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .skeleton::after { animation: none; } }
</style>
