import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {createFileGeneration, normalizeFileGroupExtensions, normalizeStorageType} from '../src/file-storage.mjs'

const api = await readFile(new URL('../src/api.js', import.meta.url), 'utf8')
const messageView = await readFile(new URL('../src/views/MessageManagementView.vue', import.meta.url), 'utf8')

test('FILE 报文默认使用 OSS，并允许切换到 OBS 或 HTTP', () => {
  assert.equal(createFileGeneration().storageType, 'OSS')
  assert.equal(normalizeStorageType('OBS'), 'OBS')
  assert.equal(normalizeStorageType('http'), 'HTTP')
  assert.equal(normalizeStorageType('oss'), 'OSS')
  assert.equal(normalizeStorageType('unknown'), 'OSS')
  assert.match(messageView, /<option value="OSS">阿里云 OSS<\/option>/)
  assert.match(messageView, /<option value="OBS">华为云 OBS<\/option>/)
  assert.match(messageView, /<option value="HTTP">HTTP（Nginx）<\/option>/)
  assert.match(messageView, /<option value="PASSTHROUGH">仅替换文件名（内容原样复制）<\/option>/)
  assert.match(messageView, /<option value="POSITIONAL_TEXT">无表头文本定位<\/option>/)
  assert.match(messageView, /<option value="FIXED_WIDTH">定长文本<\/option>/)
  assert.match(messageView, /源文件内容按字节复制，仅替换文件名和外层报文中的文件引用/)
  assert.match(messageView, /file-rule-section\.passthrough/)
})

test('文件扫描将存储类型和对象路径交给后端', () => {
  assert.match(api, /storageType=\$\{encodeURIComponent\(storageType\)\}/)
  assert.match(messageView, /api\.inspectFile\(sourceReference, inspectionDelimiter, form\.fileGeneration\?\.storageType \|\| 'OSS'\)/)
})

test('Shapefile 默认使用主文件和常用附属文件并由页面显式选择', () => {
  assert.deepEqual(normalizeFileGroupExtensions(null, 'SHAPEFILE'), ['.shp', '.shx', '.dbf', '.prj'])
  assert.deepEqual(normalizeFileGroupExtensions({sidecars: []}, 'SHAPEFILE'), [])
  assert.deepEqual(normalizeFileGroupExtensions({sidecars:['.SHP', '.dbf', '.dbf']}, 'SHAPEFILE'), ['.shp', '.dbf'])
  assert.match(messageView, /Shapefile 文件组/)
  assert.match(messageView, /toggleShapefileSidecar/)
  assert.doesNotMatch(messageView, /id="config-panel-file"[^>]*>\s*<template>/)
  assert.doesNotMatch(messageView, /文件组配置（JSON/)
})

test('模板升级必须由配置人员确认且候选模板可以带入完整要素集合', () => {
  assert.match(messageView, /templateUpgradeAvailable/)
  assert.match(messageView, /window\.confirm\(`文件规则模板/)
  assert.match(messageView, /chooseCandidateFileRuleTemplate/)
  assert.match(messageView, /使用此模板/)
})
