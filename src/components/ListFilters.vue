<template>
  <div class="list-filters" role="group" aria-label="列表筛选"><slot /></div>
</template>

<style scoped>
.list-filters { display: flex; align-items: flex-end; justify-content: flex-start; flex-wrap: wrap; gap: 16px; padding: 16px 20px; border-bottom: 1px solid #f0f0f0; }
.list-filters :deep(label) { display: grid; gap: 6px; color: #595959; font-size: 14px; font-weight: 400; min-width: 0; }
.list-filters :deep(.search-input) { width: 320px; max-width: 100%; box-sizing: border-box; }
.list-filters :deep(select) { height: 38px; min-width: 144px; padding: 0 32px 0 12px; border: 1px solid #d9d9d9; border-radius: 6px; background-color: #fff; color: #262626; font: inherit; cursor: pointer; }
.list-filters :deep(select:hover) { border-color: #4096ff; }
.list-filters :deep(select:focus-visible) { outline: 2px solid #1677ff; outline-offset: 2px; }
.list-filters :deep(.link-button) { min-height: 38px; }
@media (max-width: 640px) {
  .list-filters { padding: 14px; gap: 12px; }
  .list-filters :deep(label) { flex: 1 1 160px; }
  .list-filters :deep(.search-input) { width: 100%; }
}
</style>
