<script setup>
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import AppIcon from './AppIcon.vue'
import {buildGlobalSearchItems, filterGlobalSearchItems, rememberItem, safeStoredItems, statusMeta} from '../global-search.mjs'

const props = defineProps({
  tasks: {type: Array, default: () => []}, templates: {type: Array, default: () => []},
  components: {type: Array, default: () => []}, dataItems: {type: Array, default: () => []},
  canManage: {type: Boolean, default: false}
})
const emit = defineEmits(['open', 'action', 'search-executions'])
const RECENT_KEY = 'msc.global-search.recent'
const FAVORITE_KEY = 'msc.global-search.favorites'
const open = ref(false)
const keyword = ref('')
const remoteExecutions = ref([])
const activeIndex = ref(0)
const inputRef = ref(null)
const triggerRef = ref(null)
const shortcutLabel = /Mac|iPhone|iPad/.test(window.navigator?.platform || '') ? '⌘ K' : 'Ctrl K'
const recent = ref(safeStoredItems(window.localStorage, RECENT_KEY))
const favorites = ref(safeStoredItems(window.localStorage, FAVORITE_KEY, 20))
let searchTimer
let requestSequence = 0
let returnFocusElement = null

const allItems = computed(() => buildGlobalSearchItems({...props, executions: remoteExecutions.value}))
const searchResults = computed(() => filterGlobalSearchItems(allItems.value, keyword.value))
const groups = computed(() => {
  if (!keyword.value.trim()) return [
    ...(favorites.value.length ? [{label: '收藏', items: favorites.value}] : []),
    ...(recent.value.length ? [{label: '最近访问', items: recent.value}] : []),
    {label: '快捷动作', items: allItems.value.filter(item => item.kind === 'action')}
  ]
  const order = ['task', 'message', 'execution', 'component', 'source', 'action']
  const labels = {task: '任务', message: '报文', execution: '执行记录', component: 'MQ 组件', source: '数据源', action: '快捷动作'}
  return order.map(kind => ({label: labels[kind], items: searchResults.value.filter(item => item.kind === kind)})).filter(group => group.items.length)
})
const flatResults = computed(() => groups.value.flatMap(group => group.items))

function openPanel() {
  returnFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.value
  open.value = true
  keyword.value = ''
  remoteExecutions.value = []
  activeIndex.value = 0
  nextTick(() => inputRef.value?.focus())
}
function closePanel() {
  open.value = false
  const focusTarget = returnFocusElement?.isConnected ? returnFocusElement : triggerRef.value
  returnFocusElement = null
  nextTick(() => focusTarget?.focus())
}
function onGlobalKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    open.value ? closePanel() : openPanel()
  } else if (open.value && event.key === 'Escape') closePanel()
}
window.addEventListener('keydown', onGlobalKeydown)
onBeforeUnmount(() => { window.removeEventListener('keydown', onGlobalKeydown); clearTimeout(searchTimer) })

watch(keyword, value => {
  activeIndex.value = 0
  clearTimeout(searchTimer)
  const query = value.trim()
  if (!query) { remoteExecutions.value = []; return }
  const sequence = ++requestSequence
  searchTimer = setTimeout(() => emit('search-executions', query, rows => {
    if (sequence === requestSequence) remoteExecutions.value = Array.isArray(rows) ? rows : []
  }), 250)
})

function persist(key, rows) { try { window.localStorage.setItem(key, JSON.stringify(rows)) } catch { /* 存储不可用时不影响搜索 */ } }
function isFavorite(item) { return favorites.value.some(row => row.key === item.key) }
function toggleFavorite(item) {
  favorites.value = isFavorite(item) ? favorites.value.filter(row => row.key !== item.key) : rememberItem(favorites.value, item, 20)
  persist(FAVORITE_KEY, favorites.value)
}
function choose(item) {
  if (item.kind !== 'action') {
    recent.value = rememberItem(recent.value, item)
    persist(RECENT_KEY, recent.value)
    emit('open', item)
  } else emit('action', item.action)
  closePanel()
}
function handleListKeydown(event) {
  if (!flatResults.value.length) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + flatResults.value.length) % flatResults.value.length
    nextTick(() => document.querySelector(`[data-global-result="${activeIndex.value}"]`)?.scrollIntoView({block: 'nearest'}))
  } else if (event.key === 'Enter') {
    event.preventDefault(); choose(flatResults.value[activeIndex.value])
  }
}
function indexOf(item) { return flatResults.value.findIndex(row => row.key === item.key) }
</script>

<template>
  <button ref="triggerRef" class="global-search-trigger" type="button" aria-label="打开全局搜索" @click="openPanel">
    <AppIcon name="search" :size="16"/><span>搜索任务、报文、执行记录…</span><kbd>{{ shortcutLabel }}</kbd>
  </button>
  <teleport to="body">
    <div v-if="open" class="command-backdrop" @mousedown.self="closePanel">
      <section class="command-panel" role="dialog" aria-modal="true" aria-label="全局搜索">
        <div class="command-input-wrap"><AppIcon name="search" :size="20"/><input ref="inputRef" v-model="keyword" role="combobox" aria-label="全局搜索" aria-autocomplete="list" aria-controls="global-search-results" :aria-activedescendant="flatResults.length ? `global-search-option-${activeIndex}` : undefined" :aria-expanded="open" placeholder="搜索名称、编号、Topic、Group 或异常摘要" autocomplete="off" @keydown="handleListKeydown"><kbd>ESC</kbd></div>
        <div id="global-search-results" class="command-results" role="listbox">
          <template v-for="group in groups" :key="group.label">
            <div class="command-group-label">{{ group.label }}<span>{{ group.items.length }}</span></div>
            <div v-for="item in group.items" :id="`global-search-option-${indexOf(item)}`" :key="item.key" class="command-result" :class="{active: indexOf(item) === activeIndex}" role="option" :aria-selected="indexOf(item) === activeIndex" :data-global-result="indexOf(item)" @mouseenter="activeIndex = indexOf(item)" @click="choose(item)">
              <span class="command-type-mark" :data-kind="item.kind"><AppIcon :name="item.icon" :size="17"/></span>
              <span class="command-result-main"><span><b>{{ item.title }}</b><em>{{ item.type }}</em></span><small><code v-if="item.code">{{ item.code }}</code><span v-if="item.detail">{{ item.detail }}</span></small></span>
              <span v-if="item.status" class="status-badge" :class="statusMeta(item.status)[1]">{{ statusMeta(item.status)[0] }}</span>
              <button v-if="item.kind !== 'action'" class="favorite-button" type="button" :aria-label="isFavorite(item) ? '取消收藏' : '收藏'" :title="isFavorite(item) ? '取消收藏' : '收藏'" @click.stop="toggleFavorite(item)">{{ isFavorite(item) ? '★' : '☆' }}</button>
              <span v-else class="enter-hint">↵</span>
            </div>
          </template>
          <div v-if="keyword.trim() && !flatResults.length" class="command-empty"><b>没有匹配结果</b><span>可尝试任务编号、Topic、Group 或错误关键词。</span></div>
        </div>
        <footer class="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> 打开</span><span><kbd>ESC</kbd> 关闭</span></footer>
      </section>
    </div>
  </teleport>
</template>
