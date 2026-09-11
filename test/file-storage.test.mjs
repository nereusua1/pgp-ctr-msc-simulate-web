import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {createFileGeneration, normalizeStorageType} from '../src/file-storage.mjs'

const api = await readFile(new URL('../src/api.js', import.meta.url), 'utf8')
const messageView = await readFile(new URL('../src/views/MessageManagementView.vue', import.meta.url), 'utf8')

test('FILE 报文默认使用 OSS，并且仅允许切换到 OBS', () => {
  assert.equal(createFileGeneration().storageType, 'OSS')
  assert.equal(normalizeStorageType('OBS'), 'OBS')
  assert.equal(normalizeStorageType('oss'), 'OSS')
  assert.equal(normalizeStorageType('unknown'), 'OSS')
  assert.match(messageView, /<option value="OSS">阿里云 OSS<\/option>/)
  assert.match(messageView, /<option value="OBS">华为云 OBS<\/option>/)
})

test('文件扫描将存储类型和对象路径交给后端', () => {
  assert.match(api, /storageType=\$\{encodeURIComponent\(storageType\)\}/)
  assert.match(messageView, /api\.inspectFile\(sourceReference, form\.fileGeneration\?\.delimiter \|\| ',', form\.fileGeneration\?\.storageType \|\| 'OSS'\)/)
})
