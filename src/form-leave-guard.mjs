import {computed, ref, watch, onMounted, onBeforeUnmount} from 'vue'

/** 同一份未保存状态用于弹窗关闭、页面导航和浏览器刷新。 */
export function useFormLeaveGuard(isOpen, snapshot, onDirty) {
  const baseline = ref('')
  watch(isOpen, open => { if (open) baseline.value = snapshot() }, {flush: 'sync', immediate: true})
  const dirty = computed(() => isOpen() && snapshot() !== baseline.value)
  watch(dirty, value => onDirty(value), {flush: 'sync', immediate: true})
  function confirmClose() { return !dirty.value || window.confirm('当前修改尚未保存，离开后将丢失。是否离开？') }
  function beforeUnload(event) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnload); onDirty(false) })
  return {dirty, confirmClose}
}
