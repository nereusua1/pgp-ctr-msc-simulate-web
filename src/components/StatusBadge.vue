<script setup>
import { computed } from 'vue'

const props = defineProps({ status: { type: String, required: true } })
const labels = {
  RUNNING: '运行中', QUEUED: '排队中', SUCCESS: '成功', PARTIAL_SUCCESS: '部分成功', FAILED: '失败',
  ENABLED: '已启用', DISABLED: '已停用', PUBLISHED: '已发布', DRAFT: '草稿', PAUSED: '已暂停'
}
const tone = computed(() => {
  if (['RUNNING', 'SUCCESS', 'ENABLED', 'PUBLISHED'].includes(props.status)) return 'positive'
  if (['QUEUED', 'PARTIAL_SUCCESS'].includes(props.status)) return 'warning'
  if (props.status === 'FAILED') return 'negative'
  return 'neutral'
})
</script>

<template><span class="status-badge" :class="tone">{{ labels[status] || status }}</span></template>
