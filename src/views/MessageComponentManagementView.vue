<script setup>
import { computed, reactive, ref } from 'vue'
import AppModal from '../components/AppModal.vue'
import AppIcon from '../components/AppIcon.vue'
import StatusBadge from '../components/StatusBadge.vue'
import DetailHeader from '../components/DetailHeader.vue'
import DetailGrid from '../components/DetailGrid.vue'
import DetailSection from '../components/DetailSection.vue'
import CopyValue from '../components/CopyValue.vue'
import { resetMessageComponentForCreate } from '../message-component-form.mjs'
import { formatDateTime } from '../date-time.mjs'

const props = defineProps({
  components: { type: Array, default: () => [] },
  templates: { type: Array, default: () => [] },
  tasks: { type: Array, default: () => [] },
  pendingActions: { type: Object, default: () => new Set() }
})
const emit = defineEmits(['create', 'update', 'remove', 'check-component'])
const dialog = ref('')
const selectedItem = ref(null)
const formError = ref('')
const groupDraft = ref('')
const topicDraft = ref('')
const addingKey = ref('')
const editingKey = ref('')
const editingIndex = ref(-1)
const editingValue = ref('')
const form = reactive({ id: '', code: null, name: '', namesrvAddr: '', instanceId: '', accessKey: '', secretKey: '', secretConfigured: false, producerGroups: [], topics: [], status: 'ENABLED' })
const isPending = key => props.pendingActions.has(key)
const referenceTemplates = computed(() => props.templates.filter(item => {
  const componentIds = Array.isArray(item.componentIds) && item.componentIds.length ? item.componentIds : [item.componentId]
  return componentIds.includes(selectedItem.value?.id)
}))
const referenceTasks = computed(() => props.tasks.filter(item => item.componentId === selectedItem.value?.id))

function producerGroupsOf(item) {
  if (Array.isArray(item?.producerGroups)) return item.producerGroups.filter(Boolean)
  return item?.producerGroup ? [item.producerGroup] : []
}

function namesrvAddrOf(item) {
  return item?.namesrvAddr || item?.nameServer || ''
}

function openCreate() {
  resetMessageComponentForCreate(form)
  resetEditorState()
  dialog.value = 'edit'
}

function openEdit(item) {
  Object.assign(form, { ...item, namesrvAddr: namesrvAddrOf(item), secretKey: '', producerGroups: [...producerGroupsOf(item)], topics: [...(item.topics || [])] })
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
}

function addEntry(key, draft, label) {
  const value = draft.value.trim()
  if (!value) { formError.value = `请输入${label}`; return false }
  if (form[key].some(item => item.trim() === value)) { formError.value = `${label}不能重复：${value}`; return false }
  form[key].push(value)
  draft.value = ''
  addingKey.value = ''
  formError.value = ''
  return true
}

function addGroup() { addEntry('producerGroups', groupDraft, 'Producer Group') }
function addTopic() { addEntry('topics', topicDraft, 'Topic') }

function removeEntry(key, index) {
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
}

function cancelAdd() {
  addingKey.value = ''
  groupDraft.value = ''
  topicDraft.value = ''
  formError.value = ''
}

function beginEdit(key, index) {
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
  if (!value) { formError.value = `${label}不能为空`; return }
  if (form[key].some((item, itemIndex) => itemIndex !== index && item.trim() === value)) {
    formError.value = `${label}不能重复：${value}`
    return
  }
  form[key][index] = value
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
  if (new Set(producerGroups).size !== producerGroups.length) { formError.value = 'Producer Group 不能重复'; return }
  if (!topics.length) { formError.value = '至少配置一个 Topic'; return }
  if (new Set(topics).size !== topics.length) { formError.value = 'Topic 不能重复'; return }
  const item = { ...form, name: form.name.trim(), namesrvAddr: form.namesrvAddr.trim(), instanceId: form.instanceId.trim(), accessKey: form.accessKey.trim(), secretKey: form.secretKey, type: 'ROCKETMQ', producerGroups, topics }
  delete item.producerGroup
  delete item.nameServer
  delete item.secretConfigured
  emit(form.id ? 'update' : 'create', item)
  dialog.value = ''
}
</script>

<template>
  <main class="page">
    <div class="page-heading"><div><h1>消息组件管理</h1><p>维护 RocketMQ 实例鉴权、Producer Group 与 Topic，连接验证由后端使用真实凭证访问服务端。</p></div><button class="button primary" @click="openCreate"><AppIcon name="plus" :size="16" />新建消息组件</button></div>
    <section class="card instance-list-card">
      <div class="card-heading"><div><h2>MQ 实例列表</h2><p>每行对应一个独立 MQ 实例；点击实例名称查看连接与路由配置。</p></div><span class="muted">共 {{ components.length }} 个实例</span></div>
      <div class="table-scroll"><table class="data-table management-table instance-table"><thead><tr><th>MQ 实例</th><th>NAMESRV_ADDR</th><th>Producer Group</th><th>Topic</th><th>状态</th><th class="align-right">操作</th></tr></thead><tbody>
        <tr v-for="item in components" :key="item.id">
          <td><button class="management-primary instance-name" @click="openDetail(item)">{{ item.name }}</button><small>{{ item.type }}</small></td>
          <td><code>{{ namesrvAddrOf(item) }}</code></td>
          <td><span v-if="producerGroupsOf(item).length" class="summary-chip">{{ producerGroupsOf(item)[0] }}</span><span v-if="producerGroupsOf(item).length > 1" class="more-count">+{{ producerGroupsOf(item).length - 1 }}</span><span v-if="!producerGroupsOf(item).length" class="muted">未配置</span></td>
          <td><span class="count-summary"><b>{{ item.topics?.length || 0 }}</b> 个 Topic</span></td>
          <td><StatusBadge :status="item.status" /></td>
          <td class="align-right"><div class="table-actions"><button class="link-button" :disabled="isPending(`check:${item.id}:`)" @click="emit('check-component', { id: item.id })">{{ isPending(`check:${item.id}:`) ? '测试中…' : '测试连接' }}</button><button class="link-button" @click="openDetail(item)">详情</button><button class="link-button" :disabled="isPending(`update:message-components:${item.id}`)" @click="openEdit(item)">修改</button><button class="link-button danger-text" :disabled="isPending(`remove:message-components:${item.id}`)" @click="openDelete(item)">删除</button></div></td>
        </tr>
        <tr v-if="!components.length"><td colspan="6" class="empty-state">后端尚无消息组件，请先新建实例。</td></tr>
      </tbody></table></div>
    </section>

    <AppModal v-if="dialog === 'detail' && selectedItem" title="消息组件详情" wide @close="dialog = ''">
      <div class="component-detail unified-detail">
        <DetailHeader eyebrow="RocketMQ 实例" :title="selectedItem.name" :code="selectedItem.id" description="受控管理连接参数、生产组和 Topic 路由。">
          <template #aside><StatusBadge :status="selectedItem.status"/></template>
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
            <div v-if="selectedItem.topics?.length" class="route-list"><div v-for="topic in selectedItem.topics" :key="topic"><CopyValue :value="topic"/><button class="link-button" :disabled="isPending(`check:${selectedItem.id}:${topic}`)" @click="emit('check-component', { id: selectedItem.id, topic })">{{ isPending(`check:${selectedItem.id}:${topic}`) ? '验证中…' : '验证路由' }}</button></div></div><div v-else class="inline-empty">尚未配置 Topic</div>
          </DetailSection>
        </div>
        <DetailGrid :columns="2"><div><dt>创建时间</dt><dd>{{ formatDateTime(selectedItem.createdAt) }}</dd></div><div><dt>更新时间</dt><dd>{{ formatDateTime(selectedItem.updatedAt) }}</dd></div></DetailGrid>
      </div>
      <template #footer><button class="button secondary" :disabled="isPending(`check:${selectedItem.id}:`)" @click="emit('check-component', { id: selectedItem.id })">{{ isPending(`check:${selectedItem.id}:`) ? '测试中…' : '测试连接' }}</button><button class="button primary" @click="openEdit(selectedItem)">修改配置</button></template>
    </AppModal>

    <AppModal v-if="dialog === 'delete' && selectedItem" title="删除 MQ 实例" @close="dialog = ''">
      <p>确定删除 MQ 实例 <b>{{ selectedItem.name }}</b> 吗？删除后无法在本系统中恢复。</p>
      <div v-if="referenceTemplates.length || referenceTasks.length" class="notice"><b>当前不能删除：</b><span v-if="referenceTemplates.length"> {{ referenceTemplates.length }} 个报文引用该实例</span><span v-if="referenceTemplates.length && referenceTasks.length">，</span><span v-if="referenceTasks.length"> {{ referenceTasks.length }} 个任务引用该实例</span>。请先调整相关配置。</div>
      <div v-else class="notice">该实例没有被报文或任务引用，确认后将从 PostgreSQL 删除。</div>
      <template #footer><button class="button secondary" @click="dialog = ''">取消</button><button class="button danger" :disabled="referenceTemplates.length || referenceTasks.length || isPending(`remove:message-components:${selectedItem.id}`)" @click="confirmDelete">{{ isPending(`remove:message-components:${selectedItem.id}`) ? '正在删除…' : '确认删除' }}</button></template>
    </AppModal>

    <AppModal v-if="dialog === 'edit'" :title="form.id ? '编辑 RocketMQ 组件' : '新建 RocketMQ 组件'" wide @close="dialog = ''">
      <section class="basic-panel">
        <div class="section-heading"><div><h3>基础配置与鉴权</h3><p>字段语义与 RocketMQ 官方配置一致；SecretKey 使用密码框输入且服务端不会回显。</p></div></div>
        <div class="form-grid three-column component-editor-base">
          <label>组件名称<input v-model="form.name" placeholder="例如 RocketMQ-测试"></label>
          <label>NAMESRV_ADDR<input v-model="form.namesrvAddr" placeholder="例如 127.0.0.1:9876"></label>
          <label>INSTANCE_ID<input v-model="form.instanceId" placeholder="例如 MQ_INST_xxx"></label>
          <label>AccessKey<input v-model="form.accessKey" autocomplete="off" placeholder="请输入 AccessKey"></label>
          <label>SecretKey<input v-model="form.secretKey" type="password" autocomplete="new-password" :placeholder="form.secretConfigured ? '已配置，留空保持不变' : '请输入 SecretKey'"></label>
          <label>状态<select v-model="form.status"><option value="ENABLED">已启用</option><option value="DISABLED">已停用</option></select></label>
        </div>
      </section>
      <div class="collection-grid">
        <section class="collection-panel">
          <div class="collection-heading"><div><h3>Producer Group <span class="count-tag">{{ form.producerGroups.length }}</span></h3><p>任务发送时从已配置的发送组中选择一个。</p></div><button v-if="addingKey !== 'producerGroups'" class="button primary small" @click="beginAdd('producerGroups')"><AppIcon name="plus" :size="14" />添加 Group</button></div>
          <div v-if="addingKey === 'producerGroups'" class="collection-add"><input v-model="groupDraft" autofocus placeholder="输入 Producer Group" @keyup.enter="addGroup" @keyup.esc="cancelAdd"><button class="button primary" @click="addGroup">确认</button><button class="button secondary" @click="cancelAdd">取消</button></div>
          <div class="collection-list">
            <div v-for="(group, index) in form.producerGroups" :key="`group-${index}`" class="collection-row">
              <span class="row-index">{{ index + 1 }}</span>
              <template v-if="editingKey === 'producerGroups' && editingIndex === index"><input v-model="editingValue" autofocus aria-label="编辑 Producer Group" @keyup.enter="saveEdit('producerGroups', index, 'Producer Group')" @keyup.esc="cancelEdit"><button class="button primary small" @click="saveEdit('producerGroups', index, 'Producer Group')">保存</button><button class="button secondary small" @click="cancelEdit">取消</button></template>
              <template v-else><code>{{ group }}</code><div class="row-actions"><button class="link-button" @click="beginEdit('producerGroups', index)">编辑</button><button class="link-button danger-text" @click="removeEntry('producerGroups', index)">删除</button></div></template>
            </div>
            <div v-if="!form.producerGroups.length" class="empty-state compact">尚未配置 Producer Group</div>
          </div>
        </section>
        <section class="collection-panel">
          <div class="collection-heading"><div><h3>Topic <span class="count-tag">{{ form.topics.length }}</span></h3><p>独立维护 Topic，并可验证真实 RocketMQ 路由。</p></div><button v-if="addingKey !== 'topics'" class="button primary small" @click="beginAdd('topics')"><AppIcon name="plus" :size="14" />添加 Topic</button></div>
          <div v-if="addingKey === 'topics'" class="collection-add"><input v-model="topicDraft" autofocus placeholder="输入 Topic" @keyup.enter="addTopic" @keyup.esc="cancelAdd"><button class="button primary" @click="addTopic">确认</button><button class="button secondary" @click="cancelAdd">取消</button></div>
          <div class="collection-list">
            <div v-for="(topic, index) in form.topics" :key="`topic-${index}`" class="collection-row">
              <span class="row-index">{{ index + 1 }}</span>
              <template v-if="editingKey === 'topics' && editingIndex === index"><input v-model="editingValue" autofocus aria-label="编辑 Topic" @keyup.enter="saveEdit('topics', index, 'Topic')" @keyup.esc="cancelEdit"><button class="button primary small" @click="saveEdit('topics', index, 'Topic')">保存</button><button class="button secondary small" @click="cancelEdit">取消</button></template>
              <template v-else><code>{{ topic }}</code><div class="row-actions"><button class="link-button" :disabled="!form.id || isPending(`check:${form.id}:${topic.trim()}`)" @click="emit('check-component', { id: form.id, topic: topic.trim() })">{{ isPending(`check:${form.id}:${topic.trim()}`) ? '验证中…' : '验证' }}</button><button class="link-button" @click="beginEdit('topics', index)">编辑</button><button class="link-button danger-text" @click="removeEntry('topics', index)">删除</button></div></template>
            </div>
            <div v-if="!form.topics.length" class="empty-state compact">尚未配置 Topic</div>
          </div>
        </section>
      </div>
      <p v-if="formError" class="status-badge negative editor-error">{{ formError }}</p>
      <template #footer><span class="save-hint">Group 和 Topic 的修改将在保存组件后生效</span><button class="button secondary" @click="dialog = ''">取消</button><button class="button primary" :disabled="form.id ? isPending(`update:message-components:${form.id}`) : isPending('create:message-components')" @click="submit">{{ (form.id ? isPending(`update:message-components:${form.id}`) : isPending('create:message-components')) ? '正在保存…' : '保存组件' }}</button></template>
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
.count-tag { display: inline-grid; min-width: 22px; height: 22px; margin-left: 5px; place-items: center; border-radius: 11px; background: #ecf5ff; color: #409eff; font-size: 12px; font-weight: 600; vertical-align: 2px; }
.collection-add { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; margin-bottom: 12px; padding: 10px; border: 1px solid #c6e2ff; border-radius: 4px; background: #ecf5ff; }
.collection-add input, .collection-row input { min-width: 0; margin-top: 0; }
.collection-list { display: grid; gap: 7px; }
.collection-row { display: flex; min-height: 44px; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid #e4e7ed; border-radius: 4px; background: #fff; }
.collection-row:hover { border-color: #c6e2ff; }
.collection-row input { flex: 1; }
.collection-row code { flex: 1; overflow: hidden; color: #303133; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; text-overflow: ellipsis; white-space: nowrap; }
.row-index { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 28px; border-radius: 4px; background: #ecf5ff; color: #409eff; font-weight: 700; }
.editor-error { display: inline-block; margin-top: 16px; }
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
.inline-empty { padding: 19px; border: 1px dashed #d8e0eb; border-radius: 10px; color: #7d8a9d; text-align: center; background: #fafbfd; font-size: 14px; }
@media (max-width: 900px) {
  .collection-grid, .three-column, .component-collection-grid { grid-template-columns: 1fr; }
}
</style>
