<script setup>
import ListFilters from '../components/ListFilters.vue'
import ListPagination from '../components/ListPagination.vue'
import { computed, ref, watch } from 'vue'
import {useListState} from '../list-state.mjs'
import AppModal from '../components/AppModal.vue'
import SearchInput from '../components/SearchInput.vue'
import DetailHeader from '../components/DetailHeader.vue'
import DetailGrid from '../components/DetailGrid.vue'
import DetailSection from '../components/DetailSection.vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  pendingActions: { type: Object, default: () => new Set() }
})
const emit = defineEmits(['load-data-item'])
const dialog = ref('')
const loadingDetail = ref(false)
const detail = ref(null)
const detailError = ref('')
const requestedItem = ref(null)
const {keyword, page, pageSize} = useListState('data')
const isPending = key => props.pendingActions.has(key)

const detailFields = [
  ['dataRange', '数据范围'],
  ['preTimePoint', '起报时点'],
  ['period', '预报时长', 'hours'],
  ['periodInterval', '时间间隔', 'minutes'],
  ['realtimeFlag', '数据属性', 'realtime'],
  ['dataFormat', '数据格式']
]

const searchableFields = ['dataItemCode', 'dataItemName', 'sourceCode', 'sourceCodeName']
const filteredItems = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  if (!value) return props.items
  return props.items.filter(item => searchableFields.some(field => String(item[field] || '').toLowerCase().includes(value)))
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value)))
const visibleItems = computed(() => filteredItems.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const elements = computed(() => detail.value?.elements || [])
watch(totalPages, value => { if (page.value > value) page.value = value })

function loadGroup(item) {
  if (isPending(`load-data-item:${item.id}`)) return
  detail.value = null
  detailError.value = ''
  requestedItem.value = item
  loadingDetail.value = true
  dialog.value = 'view'
  emit('load-data-item', item.id, result => {
    detail.value = result?.data || null
    detailError.value = result?.error || ''
    loadingDetail.value = false
  })
}

function displayValue(value, type) {
  if (value === null || value === undefined || value === '') return '—'
  if (type === 'hours') return `${value} 小时`
  if (type === 'minutes') return `${value} 分钟`
  if (type === 'realtime') return Number(value) === 1 ? '实况' : '预报'
  return String(value)
}
function commonDetailValue(field) {
  if (!elements.value.length) return '未配置'
  const values = [...new Set(elements.value.map(item => item?.[field[0]] == null ? '' : String(item[field[0]])))]
  return values.length === 1 ? displayValue(values[0], field[2]) : '各要素配置不同'
}
</script>

<template>
  <main class="page data-item-page">
    <div class="page-heading"><div><h1>数据项管理</h1><p>按数据项与数据源查看要素配置。</p></div></div>
    <section class="card data-list-card">
      <ListFilters><label><span>搜索数据项</span><SearchInput v-model="keyword" aria-label="搜索数据项" placeholder="输入编码、名称或数据源" /></label><button v-if="keyword" class="link-button" @click="keyword = ''">清除筛选</button></ListFilters>
      <div class="table-scroll"><table class="data-table management-table"><thead><tr><th>数据项编码</th><th>数据项名称</th><th class="responsive-low">数据源编码</th><th>数据源名称</th><th class="align-right">操作</th></tr></thead><tbody>
        <tr v-for="item in visibleItems" :key="item.id">
          <td><button class="management-primary item-code" :disabled="isPending(`load-data-item:${item.id}`)" @click="loadGroup(item)">{{ item.dataItemCode || '—' }}</button></td>
          <td class="management-body">{{ item.dataItemName || '—' }}</td><td class="responsive-low"><code>{{ item.sourceCode || '—' }}</code></td><td class="management-body">{{ item.sourceCodeName || '—' }}</td>
          <td class="align-right"><div class="row-actions"><button class="link-button" :disabled="isPending(`load-data-item:${item.id}`)" @click="loadGroup(item)">{{ isPending(`load-data-item:${item.id}`) ? '正在加载…' : '查看' }}</button></div></td>
        </tr>
        <tr v-if="!visibleItems.length"><td colspan="5" class="empty-state">{{ keyword ? '没有匹配的数据项。' : '当前暂无数据项。' }}<br><button v-if="keyword" class="link-button empty-state-action" @click="keyword = ''">清除筛选</button></td></tr>
      </tbody></table></div>
      <ListPagination v-model:page="page" v-model:page-size="pageSize" :total="filteredItems.length" :total-pages="totalPages" />
    </section>

    <AppModal v-if="dialog === 'view'" title="数据项详情" wide @close="dialog = ''">
      <div v-if="loadingDetail" class="detail-loading"><i></i><span>正在读取数据项详情…</span></div>
      <div v-else-if="detailError" class="detail-error"><div><b>数据项详情加载失败</b><p>{{ detailError }}</p></div><button class="button secondary" @click="loadGroup(requestedItem)">重新加载</button></div>
      <template v-else-if="detail">
        <div class="data-detail unified-detail">
          <DetailHeader eyebrow="数据项" :title="detail.dataItemName || '未命名数据项'" :code="detail.dataItemCode || '—'" description="只读业务数据定义，属性来自该数据项下全部要素的一致性检查。">
            <template #aside><div class="source-summary"><span>数据源</span><b>{{ detail.sourceCodeName || '未命名数据源' }}</b><code>{{ detail.sourceCode || '—' }}</code></div></template>
          </DetailHeader>
          <DetailGrid v-if="elements.length" :columns="3">
            <div v-for="field in detailFields" :key="field[0]"><dt>{{ field[1] }}</dt><dd :class="{ 'mixed-value': commonDetailValue(field) === '各要素配置不同' }">{{ commonDetailValue(field) }}</dd></div>
          </DetailGrid>
          <DetailSection title="要素项" description="该数据项包含的要素编码与中文名称" :count="elements.length">
            <div v-if="elements.length" class="element-directory">
              <div class="element-directory-head"><span>要素项</span><span>要素项中文名称</span></div>
              <div v-for="(element, index) in elements" :key="element.id || element.elementItemCode || index" class="element-directory-row">
                <code>{{ element.elementItemCode || '—' }}</code>
                <b>{{ element.elementItemName || '未命名要素' }}</b>
              </div>
            </div>
            <div v-else class="detail-empty"><b>当前数据项没有要素信息</b><span>请检查外部数据目录是否已经配置该数据项的要素。</span></div>
          </DetailSection>
        </div>
      </template>
      <template #footer><button class="button secondary" @click="dialog = ''">关闭</button></template>
    </AppModal>
  </main>
</template>

<style scoped>
.data-list-card { padding: 0; overflow: hidden; }
.data-list-card > .card-heading { margin: 0; padding: 18px 20px; border-bottom: 1px solid #ebeef5; }
.search-box { display: block; width: 340px; flex: 0 0 340px; }
.search-label { display: block; margin-bottom: 7px; color: #606266; font-size: 13px; font-weight: 600; line-height: 18px; }
.data-table { width: 100%; min-width: 900px; table-layout: fixed; }
.data-table th:nth-child(1) { width: 170px; }
.data-table th:nth-child(2) { width: 280px; }
.data-table th:nth-child(3) { width: 140px; }
.data-table th:nth-child(4) { width: 240px; }
.data-table th:nth-child(5) { width: 130px; }
.data-table th { padding-top: 12px; padding-bottom: 12px; line-height: 18px; }
.data-table td { padding-top: 14px; padding-bottom: 14px; overflow: hidden; color: #4f6178; font-size: 15px; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.data-table th:first-child, .data-table td:first-child { padding-left: 20px; }
.data-table th:last-child, .data-table td:last-child { padding-right: 20px; }
.data-table code { color: #52647c; font: 550 14px/22px ui-monospace, SFMono-Regular, Menlo, monospace; }
.item-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 16px; font-weight: 650; line-height: 22px; }
.data-detail, .unified-detail { display: grid; gap: 16px; }
.source-summary { min-width: 210px; padding-left: 24px; border-left: 1px solid #dbe4ef; }.source-summary span, .source-summary b, .source-summary code { display: block; }.source-summary span { color: #748399; font-size: 13px; font-weight: 600; }.source-summary b { margin-top: 5px; color: #334a65; font-size: 16px; }.source-summary code { margin-top: 4px; color: #536b86; font: 600 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.mixed-value { color: #9a6b17 !important; }
.detail-loading, .detail-error { display: flex; min-height: 110px; align-items: center; justify-content: center; gap: 12px; padding: 18px; border: 1px solid #f0f0f0; border-radius: 8px; background: #fff; color: #595959; font-size: 15px; }.detail-loading i { width: 18px; height: 18px; border: 2px solid #d9d9d9; border-top-color: #1677ff; border-radius: 50%; animation: detail-spin .8s linear infinite; }.detail-error { justify-content: space-between; border-color: #ffccc7; background: #fff2f0; }.detail-error b { color: #cf1322; font-size: 15px; }.detail-error p { margin: 4px 0 0; color: #a8071a; font-size: 13px; }
.data-detail-hero { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); align-items: center; gap: 28px; padding: 20px 22px; border: 1px solid #f0f0f0; border-radius: 8px; background: #fff; }
.data-detail-title, .data-detail-source { min-width: 0; }
.data-detail-title span, .data-detail-source span { display: block; margin-bottom: 5px; color: #7c899c; font-size: 12px; font-weight: 600; }
.data-detail-title h2 { margin: 0 0 7px; color: #213650; font-size: 21px; line-height: 1.35; }
.data-detail-title code, .data-detail-source code { color: #4f6480; font: 550 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.data-detail-source b { display: block; margin-bottom: 6px; overflow: hidden; color: #334a65; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.core-properties { overflow: hidden; border: 1px solid #f0f0f0; border-radius: 8px; background: #fff; }
.property-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; }
.property-grid > div { min-width: 0; padding: 15px 18px; border-right: 1px solid #edf1f5; border-bottom: 1px solid #edf1f5; }
.property-grid > div:nth-child(3n) { border-right: 0; }
.property-grid dt { margin-bottom: 6px; color: #7a879a; font-size: 13px; font-weight: 550; }
.property-grid dd { margin: 0; overflow-wrap: anywhere; color: #33475f; font-size: 16px; font-weight: 500; line-height: 1.5; }
.element-directory { overflow: hidden; border: 1px solid #f0f0f0; border-radius: 8px; background: #fff; }
.element-directory-head, .element-directory-row { display: grid; grid-template-columns: minmax(170px, .8fr) minmax(240px, 1.2fr); align-items: center; }
.element-directory-head { min-height: 42px; background: #f7f9fc; color: #718198; font-size: 13px; font-weight: 650; }
.element-directory-head span, .element-directory-row > * { min-width: 0; padding: 10px 16px; }
.element-directory-head span + span, .element-directory-row > * + * { border-left: 1px solid #e8edf4; }
.element-directory-row { min-height: 50px; border-top: 1px solid #e8edf4; }
.element-directory-row code { overflow: hidden; color: #1677ff; font: 650 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.element-directory-row b { color: #344a64; font-size: 15px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.detail-empty { display: grid; justify-items: center; gap: 4px; padding: 24px; color: #7e8ca0; text-align: center; }.detail-empty b { color: #42566f; font-size: 15px; }.detail-empty span { font-size: 13px; }
@keyframes detail-spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) {
  .data-list-card > .card-heading { align-items: stretch; flex-direction: column; }
  .search-box { width: 100%; flex-basis: auto; }
  .data-detail-hero { grid-template-columns: 1fr; }
  .source-summary { min-width: 0; padding: 0; border-left: 0; }
  .element-directory-head, .element-directory-row { grid-template-columns: minmax(130px, .8fr) minmax(180px, 1.2fr); }
  .property-grid { grid-template-columns: 1fr; }
  .property-grid > div, .property-grid > div:nth-child(3n) { border-right: 0; }
}
</style>
