<script setup>
import {useFormLeaveGuard} from '../form-leave-guard.mjs'
import ListFilters from '../components/ListFilters.vue'
import ListPagination from '../components/ListPagination.vue'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import SearchInput from '../components/SearchInput.vue'
import {useListState} from '../list-state.mjs'
import AppModal from '../components/AppModal.vue'
import AppIcon from '../components/AppIcon.vue'
import DetailHeader from '../components/DetailHeader.vue'
import DetailGrid from '../components/DetailGrid.vue'
import DetailSection from '../components/DetailSection.vue'
import TruncatedText from '../components/TruncatedText.vue'
import CopyValue from '../components/CopyValue.vue'
import { duplicateRoute, normalizeMessageComponentForSave, producerGroupError, resetMessageComponentForCreate, topicError } from '../message-component-form.mjs'
import { formatDateTime } from '../date-time.mjs'
import {tasksReferencingAnyMessage} from '../message-references.mjs'

const props = defineProps({
  components: { type: Array, default: () => [] },
  templates: { type: Array, default: () => [] },
  tasks: { type: Array, default: () => [] },
  pendingActions: { type: Object, default: () => new Set() },
  canManage: { type: Boolean, default: false },
  canCheckConnection: { type: Boolean, default: false }
  ,connectionChecks: {type: Object, default: () => ({})}
})
const emit = defineEmits(['editing-state', 'create', 'update', 'remove', 'check-component'])
const dialog = ref('')
const {keyword, page, pageSize} = useListState('components')
const filteredComponents = computed(() => props.components.filter(item =>
  (!item.type || item.type === 'ROCKETMQ') &&
  [item.name, namesrvAddrOf(item), ...(item.topics || [])].some(value => String(value || '').toLowerCase().includes(keyword.value.trim().toLowerCase()))))
const totalPages = computed(() => Math.max(1, Math.ceil(filteredComponents.value.length / pageSize.value)))
const visibleComponents = computed(() => filteredComponents.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch(totalPages, value => { if (page.value > value) page.value = value })
const selectedItem = ref(null)
const formError = ref('')
const groupDraft = ref('')
const topicDraft = ref('')
const addingKey = ref('')
const editingKey = ref('')
const editingIndex = ref(-1)
const editingValue = ref('')
const groupInput = ref(null)
const topicInput = ref(null)
const entryErrors = reactive({producerGroups: '', topics: ''})
const duplicateEntries = reactive({producerGroups: '', topics: ''})
const persistedGroups = ref(new Set())
const form = reactive({ id: '', code: null, type: 'ROCKETMQ', name: '', namesrvAddr: '', instanceId: '', accessKey: '', secretKey: '', secretConfigured: false, producerGroups: [], topics: [], status: 'ENABLED' })
const isPending = key => props.pendingActions.has(key)
const referenceTemplates = computed(() => props.templates.filter(item => {
  const componentIds = Array.isArray(item.componentIds) && item.componentIds.length ? item.componentIds : [item.componentId]
  return componentIds.includes(selectedItem.value?.id) || item.deliveryTargets?.some(target => target.componentId === selectedItem.value?.id)
}))
const referenceTasks = computed(() => {
  const templateIds = referenceTemplates.value.map(template => template.id)
  const viaMessages = tasksReferencingAnyMessage(props.tasks, templateIds)
  const direct = props.tasks.filter(item => item.componentId === selectedItem.value?.id)
  return [...new Map([...direct, ...viaMessages].map(item => [item.id, item])).values()]
})

function producerGroupsOf(item) {
  if (Array.isArray(item?.producerGroups)) return item.producerGroups.filter(Boolean)
  return item?.producerGroup ? [item.producerGroup] : []
}

function namesrvAddrOf(item) {
  return item?.namesrvAddr || item?.nameServer || ''
}

function componentTypeLabel(item) {
  return 'RocketMQ'
}

function componentAddress(item) {
  return namesrvAddrOf(item)
}

function openCreate() {
  resetMessageComponentForCreate(form)
  persistedGroups.value = new Set()
  resetEditorState()
  dialog.value = 'edit'
}

function openEdit(item) {
  Object.assign(form, { ...item, type: 'ROCKETMQ', namesrvAddr: namesrvAddrOf(item), secretKey: '', producerGroups: [...producerGroupsOf(item)], topics: [...(item.topics || [])] })
  persistedGroups.value = new Set(producerGroupsOf(item))
  resetEditorState()
  dialog.value = 'edit'
}

function openDetail(item) {
  selectedItem.value = item
  dialog.value = 'detail'
}

function openDelete(item) {
  selectedItem.value = item
  dialog.value = 'delete'
}

function confirmDelete() {
  if (!selectedItem.value || referenceTemplates.value.length || referenceTasks.value.length) return
  emit('remove', selectedItem.value.id, () => {
    selectedItem.value = null
    dialog.value = ''
  })
}

function resetEditorState() {
  groupDraft.value = ''
  topicDraft.value = ''
  addingKey.value = ''
  editingKey.value = ''
  editingIndex.value = -1
  editingValue.value = ''
  formError.value = ''
  entryErrors.producerGroups = ''
  entryErrors.topics = ''
  duplicateEntries.producerGroups = ''
  duplicateEntries.topics = ''
}

function addEntry(key, draft, label) {
  const value = draft.value.trim()
  const validationError = key === 'producerGroups' ? producerGroupError(value) : topicError(value)
  if (!value) { entryErrors[key] = `请输入${label}`; focusEntry(key); return false }
  if (validationError) { entryErrors[key] = validationError; focusEntry(key); return false }
  if (form[key].some(item => item.trim() === value)) {
    duplicateEntries[key] = value
    entryErrors[key] = `${label}已存在：${value}`
    focusEntry(key)
    return false
  }
  form[key].push(value)
  draft.value = ''
  entryErrors[key] = ''
  duplicateEntries[key] = ''
  formError.value = ''
  focusEntry(key)
  return true
}

function addGroup() { addEntry('producerGroups', groupDraft, 'Producer Group') }
function addTopic() { addEntry('topics', topicDraft, 'Topic') }

function removeEntry(key, index) {
  const value = form[key][index]
  if (routeReferenceCount(key, value)) {
    entryErrors[key] = `${key === 'producerGroups' ? 'Producer Group' : 'Topic'} 已被报文引用，不能删除：${value}`
    return
  }
  form[key].splice(index, 1)
  cancelEdit()
  formError.value = ''
}

function beginAdd(key) {
  addingKey.value = key
  if (key === 'producerGroups') groupDraft.value = ''
  else topicDraft.value = ''
  cancelEdit()
  formError.value = ''
  entryErrors[key] = ''
  duplicateEntries[key] = ''
  focusEntry(key)
}

function focusEntry(key) {
  nextTick(() => (key === 'producerGroups' ? groupInput.value : topicInput.value)?.focus())
}

function routeReferenceCount(key, value) {
  const field = key === 'producerGroups' ? 'producerGroup' : 'topic'
  return props.templates.filter(template => (template.deliveryTargets || []).some(target =>
    target.componentId === form.id && target[field] === value)).length
}

function cancelAdd() {
  addingKey.value = ''
  groupDraft.value = ''
  topicDraft.value = ''
  formError.value = ''
}

function beginEdit(key, index) {
  if (key === 'producerGroups' && persistedGroups.value.has(form[key][index])) {
    entryErrors[key] = '已创建的 Producer Group 不能直接改名'
    return
  }
  editingKey.value = key
  editingIndex.value = index
  editingValue.value = form[key][index]
  cancelAdd()
}

function cancelEdit() {
  editingKey.value = ''
  editingIndex.value = -1
  editingValue.value = ''
}

function saveEdit(key, index, label) {
  const value = editingValue.value.trim()
  const validationError = key === 'producerGroups' ? producerGroupError(value) : topicError(value)
  if (!value) { entryErrors[key] = `${label}不能为空`; return }
  if (validationError) { entryErrors[key] = validationError; return }
  if (form[key].some((item, itemIndex) => itemIndex !== index && item.trim() === value)) {
    duplicateEntries[key] = value
    entryErrors[key] = `${label}已存在：${value}`
    return
  }
  if (routeReferenceCount(key, form[key][index])) {
    entryErrors[key] = `${label}已被报文引用，不能改名：${form[key][index]}`
    return
  }
  form[key][index] = value
  entryErrors[key] = ''
  duplicateEntries[key] = ''
  formError.value = ''
  cancelEdit()
}

function normalizedEntries(values) {
  return values.map(value => value.trim()).filter(Boolean)
}

function submit() {
  const producerGroups = normalizedEntries(form.producerGroups)
  const topics = normalizedEntries(form.topics)
  if (!form.name.trim()) { formError.value = '请输入组件名称'; return }
  if (!form.namesrvAddr.trim()) { formError.value = '请输入 NAMESRV_ADDR'; return }
  if (!form.instanceId.trim()) { formError.value = '请输入 INSTANCE_ID'; return }
  if (!form.accessKey.trim()) { formError.value = '请输入 AccessKey'; return }
  if (!form.secretKey.trim() && !form.secretConfigured) { formError.value = '请输入 SecretKey'; return }
  if (!producerGroups.length) { formError.value = '至少配置一个 Producer Group'; return }
  const duplicateGroup = duplicateRoute(producerGroups)
  if (duplicateGroup) { duplicateEntries.producerGroups = duplicateGroup; entryErrors.producerGroups = `Producer Group 已存在：${duplicateGroup}`; focusEntry('producerGroups'); return }
  const invalidGroup = producerGroups.map(value => producerGroupError(value)).find(Boolean)
  if (invalidGroup) { entryErrors.producerGroups = invalidGroup; return }
  if (!topics.length) { formError.value = '至少配置一个 Topic'; return }
  const duplicateTopic = duplicateRoute(topics)
  if (duplicateTopic) { duplicateEntries.topics = duplicateTopic; entryErrors.topics = `Topic 已存在：${duplicateTopic}`; focusEntry('topics'); return }
  const invalidTopic = topics.map(value => topicError(value)).find(Boolean)
  if (invalidTopic) { entryErrors.topics = invalidTopic; return }
  const item = normalizeMessageComponentForSave({
    ...form,
    name: form.name.trim(),
    namesrvAddr: form.namesrvAddr.trim(),
    instanceId: form.instanceId.trim(),
    accessKey: form.accessKey.trim(),
    secretKey: form.secretKey,
    producerGroups,
    topics
  })
  const saved = result => {
    if (result?.success === false) { formError.value = result.error || '保存失败，输入已保留'; return }
    dialog.value = ''
  }
  emit(form.id ? 'update' : 'create', item, saved, error => { formError.value = error })
}

const {dirty: formDirty, confirmClose: confirmFormClose} = useFormLeaveGuard(
  () => dialog.value === 'edit',
  () => JSON.stringify({form, group: groupDraft.value, topic: topicDraft.value, editing: editingValue.value}),
  value => emit('editing-state', value)
)
</script>

<template>
  <main class="page">
    <div class="page-heading"><div><h1>消息组件</h1><p>统一维护 RocketMQ 投递目标，所有 JSON 和文件报文最终都通过消息组件发送。</p></div><button v-if="canManage" class="button primary" @click="openCreate"><AppIcon name="plus" :size="16" />新建消息组件</button></div>
    <section class="card instance-list-card">
      <ListFilters>
        <label>搜索组件<SearchInput v-model="keyword" aria-label="搜索组件" placeholder="名称、地址或 Topic" /></label>
        <button v-if="keyword" class="link-button" @click="keyword = ''">清除筛选</button>
      </ListFilters>
      <div class="table-scroll"><table class="data-table management-table instance-table"><thead><tr><th>组件</th><th>类型</th><th class="responsive-low">连接地址</th><th>Topic</th><th>最近检测</th><th class="align-right">操作</th></tr></thead><tbody>
        <tr v-for="item in visibleComponents" :key="item.id">
          <td><button class="management-primary instance-name" @click="openDetail(item)">{{ item.name }}</button><small>{{ item.id }}</small></td>
          <td><span class="summary-chip">{{ componentTypeLabel(item) }}</span></td>
          <td class="responsive-low"><TruncatedText :text="componentAddress(item)" code copyable /></td>
          <td><span class="count-summary"><b>{{ item.topics?.length || 0 }}</b> 个 Topic</span></td>
          <td><span :class="['status-badge', connectionChecks[item.id + ':']?.success ? 'positive' : (connectionChecks[item.id + ':'] ? 'negative' : 'neutral')]">{{ connectionChecks[item.id + ':'] ? (connectionChecks[item.id + ':'].success ? '检测通过' : '检测失败') : '尚未检测' }}</span></td>
          <td class="align-right"><div class="table-actions"><button v-if="canCheckConnection && item.type === 'ROCKETMQ'" class="link-button" :disabled="isPending(`check:${item.id}:`)" @click="emit('check-component', { id: item.id })">{{ isPending(`check:${item.id}:`) ? '测试中…' : '测试连接' }}</button><button class="link-button" @click="openDetail(item)">详情</button><button v-if="canManage" class="link-button" :disabled="isPending(`update:message-components:${item.id}`)" @click="openEdit(item)">修改</button><button v-if="canManage" class="link-button danger-text" :disabled="isPending(`remove:message-components:${item.id}`)" @click="openDelete(item)">删除</button></div></td>
        </tr>
        <tr v-if="!visibleComponents.length"><td colspan="6" class="empty-state"><template v-if="components.length">没有匹配的组件。<br><button class="link-button empty-state-action" @click="keyword = ''">清除筛选</button></template><template v-else>还没有消息云组件。<br><button v-if="canManage" class="link-button empty-state-action" @click="openCreate">新建第一个组件</button></template></td></tr>
      </tbody></table></div>
      <ListPagination v-model:page="page" v-model:page-size="pageSize" :total="filteredComponents.length" :total-pages="totalPages" />
    </section>

    <AppModal v-if="dialog === 'detail' && selectedItem" title="消息组件详情" wide @close="dialog = ''">
      <div class="notice"><b>最近一次连接检测</b><p>{{ connectionChecks[selectedItem.id + ':']?.message || '尚未检测连接' }}</p><small>{{ connectionChecks[selectedItem.id + ':']?.checkedAt || '' }}</small></div>
      <div class="component-detail unified-detail">
        <DetailHeader :eyebrow="componentTypeLabel(selectedItem)" :title="selectedItem.name" :code="selectedItem.id" description="受控管理 RocketMQ 连接参数、生产组和 Topic 路由。">
          <template #aside><span class="summary-chip">云 RocketMQ 配置</span></template>
        </DetailHeader>
        <DetailSection title="连接与鉴权" description="凭据默认脱敏，完整 SecretKey 不会由服务端回显">
          <DetailGrid :columns="2">
            <div><dt>NAMESRV_ADDR</dt><dd><CopyValue :value="namesrvAddrOf(selectedItem)"/></dd></div>
            <div><dt>INSTANCE_ID</dt><dd><CopyValue :value="selectedItem.instanceId"/></dd></div>
            <div><dt>AccessKey</dt><dd><CopyValue :value="selectedItem.accessKey" masked/></dd></div>
            <div><dt>SecretKey</dt><dd>{{ selectedItem.secretConfigured ? '已安全配置，不回显' : '未配置' }}</dd></div>
          </DetailGrid>
        </DetailSection>
        <div class="component-collection-grid">
          <DetailSection title="Producer Group" description="发送报文时使用的生产组" :count="producerGroupsOf(selectedItem).length">
            <div v-if="producerGroupsOf(selectedItem).length" class="route-list"><CopyValue v-for="group in producerGroupsOf(selectedItem)" :key="group" :value="group"/></div><div v-else class="inline-empty">尚未配置 Producer Group</div>
          </DetailSection>
          <DetailSection title="Topic" description="可逐项验证真实 RocketMQ 路由" :count="selectedItem.topics?.length || 0">
            <div v-if="selectedItem.topics?.length" class="route-list"><div v-for="topic in selectedItem.topics" :key="topic"><CopyValue :value="topic"/><button v-if="canCheckConnection" class="link-button" :disabled="isPending(`check:${selectedItem.id}:${topic}`)" @click="emit('check-component', { id: selectedItem.id, topic })">{{ isPending(`check:${selectedItem.id}:${topic}`) ? '验证中…' : '验证路由' }}</button></div></div><div v-else class="inline-empty">尚未配置 Topic</div>
          </DetailSection>
        </div>
        <DetailGrid :columns="2"><div><dt>创建时间</dt><dd>{{ formatDateTime(selectedItem.createdAt) }}</dd></div><div><dt>更新时间</dt><dd>{{ formatDateTime(selectedItem.updatedAt) }}</dd></div></DetailGrid>
      </div>
      <template #footer><button v-if="canCheckConnection && selectedItem.type === 'ROCKETMQ'" class="button secondary" :disabled="isPending(`check:${selectedItem.id}:`)" @click="emit('check-component', { id: selectedItem.id })">{{ isPending(`check:${selectedItem.id}:`) ? '测试中…' : '测试连接' }}</button><button v-if="canManage" class="button primary" @click="openEdit(selectedItem)">修改配置</button></template>
    </AppModal>

    <AppModal v-if="canManage && dialog === 'delete' && selectedItem" title="删除 MQ 实例" @close="dialog = ''">
      <p>确定删除 MQ 实例 <b>{{ selectedItem.name }}</b> 吗？删除后无法在本系统中恢复。</p>
      <div v-if="referenceTemplates.length || referenceTasks.length" class="notice"><b>当前不能删除：</b><span v-if="referenceTemplates.length"> {{ referenceTemplates.length }} 个报文引用该实例</span><span v-if="referenceTemplates.length && referenceTasks.length">，</span><span v-if="referenceTasks.length"> {{ referenceTasks.length }} 个任务引用该实例</span>。请先调整相关配置。</div>
      <div v-else class="notice">该实例没有被报文或任务引用，确认后将删除该配置。</div>
      <template #footer><button class="button secondary" @click="dialog = ''">取消</button><button class="button danger" :disabled="referenceTemplates.length || referenceTasks.length || isPending(`remove:message-components:${selectedItem.id}`)" @click="confirmDelete">{{ isPending(`remove:message-components:${selectedItem.id}`) ? '正在删除…' : '确认删除' }}</button></template>
    </AppModal>

    <AppModal v-if="canManage && dialog === 'edit'" :title="form.id ? '编辑消息组件' : '新建消息组件'" wide @close="dialog = ''" :before-close="confirmFormClose">
      <p v-if="formDirty" class="muted" role="status">有未保存修改</p>
      <section class="basic-panel">
        <div class="section-heading"><div><h3>基础配置与鉴权</h3><p>字段语义与 RocketMQ 官方配置一致；SecretKey 使用密码框输入且服务端不会回显。</p></div></div>
        <div class="form-grid three-column component-editor-base">
          <label>组件名称<input v-model="form.name" placeholder="例如 RocketMQ-测试"></label>
          <label>组件类型<input value="RocketMQ" disabled></label>
          <label>NAMESRV_ADDR<input v-model="form.namesrvAddr" placeholder="例如 127.0.0.1:9876"></label>
          <label>INSTANCE_ID<input v-model="form.instanceId" placeholder="例如 MQ_INST_xxx"></label>
          <label>AccessKey<input v-model="form.accessKey" autocomplete="off" placeholder="请输入 AccessKey"></label>
          <label>SecretKey<input v-model="form.secretKey" type="password" autocomplete="new-password" :placeholder="form.secretConfigured ? '已配置，留空保持不变' : '请输入 SecretKey'"></label>
        </div>
      </section>
      <div class="collection-grid">
        <section class="collection-panel">
          <div class="collection-heading"><div><h3>Producer Group <span class="count-tag">{{ form.producerGroups.length }}</span></h3><p>任务发送时从已配置的发送组中选择一个。</p></div><button v-if="addingKey !== 'producerGroups'" class="button primary small" @click="beginAdd('producerGroups')"><AppIcon name="plus" :size="14" />添加 Group</button></div>
          <div v-if="addingKey === 'producerGroups'" class="collection-add"><input ref="groupInput" v-model="groupDraft" placeholder="输入 Producer Group" aria-describedby="group-rule group-error" @input="entryErrors.producerGroups = ''; duplicateEntries.producerGroups = ''" @keyup.enter="addGroup" @keyup.esc="cancelAdd"><button class="button primary" @click="addGroup">确认</button><button class="button secondary" @click="cancelAdd">取消</button></div>
          <small id="group-rule" class="route-rule">以 GID_ 或 GID- 开头，仅支持字母、数字、短横线和下划线，长度 7～64；创建后不能改名。</small>
          <p v-if="entryErrors.producerGroups" id="group-error" class="field-error" role="alert">{{ entryErrors.producerGroups }}</p>
          <div class="collection-list">
            <div v-for="(group, index) in form.producerGroups" :key="`group-${index}`" :class="['collection-row', { 'duplicate-route': duplicateEntries.producerGroups === group }]">
              <span class="row-index">{{ index + 1 }}</span>
              <template v-if="editingKey === 'producerGroups' && editingIndex === index"><input v-model="editingValue" autofocus aria-label="编辑 Producer Group" @keyup.enter="saveEdit('producerGroups', index, 'Producer Group')" @keyup.esc="cancelEdit"><button class="button primary small" @click="saveEdit('producerGroups', index, 'Producer Group')">保存</button><button class="button secondary small" @click="cancelEdit">取消</button></template>
              <template v-else><code>{{ group }}</code><div class="row-actions"><button v-if="!persistedGroups.has(group)" class="link-button" @click="beginEdit('producerGroups', index)">编辑</button><span v-else class="locked-route">已创建</span><button class="link-button danger-text" :disabled="routeReferenceCount('producerGroups', group) > 0" @click="removeEntry('producerGroups', index)">删除</button></div></template>
            </div>
            <div v-if="!form.producerGroups.length" class="empty-state compact">尚未配置 Producer Group</div>
          </div>
        </section>
        <section class="collection-panel">
          <div class="collection-heading"><div><h3>Topic <span class="count-tag">{{ form.topics.length }}</span></h3><p>独立维护 Topic，并可验证真实 RocketMQ 路由。</p></div><button v-if="addingKey !== 'topics'" class="button primary small" @click="beginAdd('topics')"><AppIcon name="plus" :size="14" />添加 Topic</button></div>
          <div v-if="addingKey === 'topics'" class="collection-add"><input ref="topicInput" v-model="topicDraft" placeholder="输入 Topic" aria-describedby="topic-rule topic-error" @input="entryErrors.topics = ''; duplicateEntries.topics = ''" @keyup.enter="addTopic" @keyup.esc="cancelAdd"><button class="button primary" @click="addTopic">确认</button><button class="button secondary" @click="cancelAdd">取消</button></div>
          <small id="topic-rule" class="route-rule">仅支持字母、数字、短横线和下划线，长度 3～64，不能以 CID 或 GID 开头。</small>
          <p v-if="entryErrors.topics" id="topic-error" class="field-error" role="alert">{{ entryErrors.topics }}</p>
          <div class="collection-list">
            <div v-for="(topic, index) in form.topics" :key="`topic-${index}`" :class="['collection-row', { 'duplicate-route': duplicateEntries.topics === topic }]">
              <span class="row-index">{{ index + 1 }}</span>
              <template v-if="editingKey === 'topics' && editingIndex === index"><input v-model="editingValue" autofocus aria-label="编辑 Topic" @keyup.enter="saveEdit('topics', index, 'Topic')" @keyup.esc="cancelEdit"><button class="button primary small" @click="saveEdit('topics', index, 'Topic')">保存</button><button class="button secondary small" @click="cancelEdit">取消</button></template>
              <template v-else><code>{{ topic }}</code><div class="row-actions"><button class="link-button" :disabled="!form.id || isPending(`check:${form.id}:${topic.trim()}`)" @click="emit('check-component', { id: form.id, topic: topic.trim() })">{{ isPending(`check:${form.id}:${topic.trim()}`) ? '验证中…' : '验证' }}</button><button class="link-button" :disabled="routeReferenceCount('topics', topic) > 0" @click="beginEdit('topics', index)">编辑</button><button class="link-button danger-text" :disabled="routeReferenceCount('topics', topic) > 0" @click="removeEntry('topics', index)">删除</button></div></template>
            </div>
            <div v-if="!form.topics.length" class="empty-state compact">尚未配置 Topic</div>
          </div>
        </section>
      </div>
      <p v-if="formError" class="status-badge negative editor-error">{{ formError }}</p>
      <template #footer><span class="save-hint">密码不会回显；Group 和 Topic 的修改将在保存后生效</span><button class="button secondary" @click="confirmFormClose() && (dialog = '')">取消</button><button class="button primary" :disabled="form.id ? isPending(`update:message-components:${form.id}`) : isPending('create:message-components')" @click="submit">{{ (form.id ? isPending(`update:message-components:${form.id}`) : isPending('create:message-components')) ? '正在保存…' : '保存组件' }}</button></template>
    </AppModal>
  </main>
</template>

<style scoped>
.basic-panel { margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid #e3e8ed; }
.section-heading h3, .collection-heading h3 { margin: 0; }
.section-heading p, .collection-heading p { margin: 4px 0 0; color: #667085; }
.component-editor-base { margin-top: 14px; }
.three-column { grid-template-columns: 1.15fr 1.3fr .7fr; }
.collection-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 16px; }
.collection-panel { padding: 16px; border: 1px solid #e3e8ed; border-radius: 4px; background: #fafafa; }
.collection-panel h3 { margin: 0 0 6px; }
.collection-panel p { margin: 0 0 16px; color: #6b7b96; }
.collection-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.count-tag { display: inline-grid; min-width: 22px; height: 22px; margin-left: 5px; place-items: center; border-radius: 4px; background: #e6f4ff; color: #1677ff; font-size: 12px; font-weight: 600; vertical-align: 2px; }
.collection-add { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; margin-bottom: 12px; padding: 10px; border: 1px solid #c6e2ff; border-radius: 4px; background: #ecf5ff; }
.collection-add input, .collection-row input { min-width: 0; margin-top: 0; }
.collection-list { display: grid; gap: 7px; }
.collection-row { display: flex; min-height: 44px; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid #e4e7ed; border-radius: 4px; background: #fff; }
.collection-row:hover { border-color: #c6e2ff; }
.collection-row.duplicate-route { border-color: #ff4d4f; background: #fff2f0; }
.collection-row input { flex: 1; }
.collection-row code { flex: 1; overflow: hidden; color: #303133; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.row-index { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 28px; border-radius: 4px; background: #e6f4ff; color: #1677ff; font-weight: 700; }
.editor-error { display: inline-block; margin-top: 16px; }
.route-rule { display: block; margin: -4px 0 10px; color: #667085; line-height: 1.5; }
.field-error { margin: -3px 0 10px; color: #cf1322; font-size: 12px; }
.locked-route { color: #8c8c8c; font-size: 12px; }
.save-hint { margin-right: auto; color: #909399; font-size: 12px; }
.instance-list-card { padding: 0; overflow: hidden; }
.instance-list-card > .card-heading { margin: 0; padding: 18px 20px; border-bottom: 1px solid #ebeef5; }
.instance-table th:first-child, .instance-table td:first-child { padding-left: 20px; }
.instance-table th:last-child, .instance-table td:last-child { padding-right: 20px; }
.instance-table td { vertical-align: middle; }
.instance-table td:first-child small { display: block; margin-top: 4px; color: #909399; }
.instance-table code { color: #52647c; font: 550 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.instance-name { max-width: 220px; padding: 2px 0; overflow: hidden; border: 0; background: transparent; color: var(--management-link); font-size: 16px; font-weight: 650; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.instance-name:hover { color: #173f9e; }
.summary-chip { display: inline-block; max-width: 190px; padding: 4px 8px; overflow: hidden; border: 1px solid #d9ecff; border-radius: 4px; background: #ecf5ff; color: #4564bf; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; vertical-align: middle; white-space: nowrap; }
.more-count { margin-left: 6px; color: #909399; font-size: 12px; }
.count-summary { color: #606266; white-space: nowrap; }
.count-summary b { color: #303133; font-size: 16px; }
.preview-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid #ebeef5; }
.preview-heading h2 { margin: 5px 0; color: #303133; }
.preview-heading p { margin: 0; color: #606266; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.eyebrow { color: #909399; font-size: 12px; font-weight: 600; letter-spacing: .08em; }
.preview-metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 18px 0; }
.preview-metrics > div { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border: 1px solid #ebeef5; border-radius: 4px; background: #fafafa; }
.preview-metrics span { color: #606266; }
.preview-metrics strong { color: #303133; font-size: 22px; }
.preview-section + .preview-section { margin-top: 18px; }
.preview-section h3 { margin: 0 0 10px; font-size: 14px; }
.preview-section .chip { margin: 0 8px 8px 0; }
.unified-detail { display: grid; gap: 16px; }
.component-collection-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 16px; }
.route-list { display: grid; max-height: 310px; overflow: auto; }.route-list > div, .route-list > :deep(.copy-value) { min-height: 45px; padding: 10px 2px; border-bottom: 1px solid #edf1f5; }.route-list > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.route-list > :last-child { border-bottom: 0; }
.inline-empty { padding: 19px; border: 1px dashed #d9d9d9; border-radius: 8px; color: #8c8c8c; text-align: center; background: #fafafa; font-size: 14px; }
@media (max-width: 900px) {
  .collection-grid, .three-column, .component-collection-grid { grid-template-columns: 1fr; }
}
</style>
