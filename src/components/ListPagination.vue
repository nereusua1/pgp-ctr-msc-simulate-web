<script setup>
defineProps({page: {type: Number, default: 1}, pageSize: {type: Number, default: 10}, total: {type: Number, default: 0}, totalPages: {type: Number, default: 1}, disabled: Boolean})
const emit = defineEmits(['update:page', 'update:pageSize'])
</script>

<template>
  <nav class="list-pagination" aria-label="列表分页">
    <span class="list-pagination-total">共 {{ total }} 条</span>
    <div class="list-pagination-controls">
      <select :value="pageSize" :disabled="disabled" aria-label="每页条数" @change="emit('update:pageSize', Number($event.target.value))">
        <option v-for="size in [10, 20, 50]" :key="size" :value="size">{{ size }} 条 / 页</option>
      </select>
      <button type="button" :disabled="disabled || page <= 1" @click="emit('update:page', page - 1)">上一页</button>
      <span aria-live="polite">{{ page }} / {{ Math.max(1, totalPages) }}</span>
      <button type="button" :disabled="disabled || page >= Math.max(1, totalPages)" @click="emit('update:page', page + 1)">下一页</button>
    </div>
  </nav>
</template>

<style scoped>
.list-pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 16px 20px; border-top: 1px solid #f0f0f0; color: #595959; font-size: 14px; }
.list-pagination-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; font-variant-numeric: tabular-nums; }
select, button { height: 32px; padding: 0 10px; border: 1px solid #d9d9d9; border-radius: 6px; background: #fff; color: #262626; font: inherit; cursor: pointer; }
select { min-width: 112px; }
button:hover:not(:disabled), select:hover:not(:disabled) { border-color: #4096ff; color: #1677ff; }
button:disabled, select:disabled { background: #fafafa; color: #bfbfbf; cursor: not-allowed; }
button:focus-visible, select:focus-visible { outline: 2px solid #1677ff; outline-offset: 2px; }
@media (max-width: 640px) { .list-pagination { padding: 14px; }.list-pagination-controls { gap: 8px; } }
</style>
