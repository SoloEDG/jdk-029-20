<script setup lang="ts">
import { Lock, RotateCcw, Trash, TrendingDown, TrendingUp } from '@lucide/vue'
import type { Take } from '../../../shared/document'
import type { RevisionMode } from '../lib/useRevision'

const props = defineProps<{
  take: Take | null
  mode: RevisionMode
  pending: boolean
  disputeCount: number
  lockCount: number
  shiftCount: number
}>()
const emit = defineEmits<{
  mode: [RevisionMode]
  undo: []
  clear: []
}>()

const modes: { value: RevisionMode; label: string; icon: typeof Lock; hint: string }[] = [
  { value: 'lock', label: '锁住真跳', icon: Lock, hint: '在图上点击确认是实际大跳的音' },
  { value: 'down', label: '移下八度', icon: TrendingDown, hint: '拖选疑似高八度误判的小段' },
  { value: 'up', label: '移上八度', icon: TrendingUp, hint: '拖选疑似低八度误判的小段' },
]
</script>

<template>
  <div class="revision-bar" v-if="take">
    <div class="revision-target">
      <span class="revision-dot" />
      <div>
        <strong>修订音高线</strong>
        <small>{{ take.reasons?.length ? '旧盘 · 仅音高点' : '原轨 / 修订轨 / 原声共用歌曲时间' }}</small>
      </div>
    </div>
    <div class="revision-modes" role="group" aria-label="修订工具">
      <button v-for="item in modes" :key="item.value" type="button" class="revision-mode"
        :class="{ active: mode === item.value }" :title="item.hint" :aria-pressed="mode === item.value"
        @click="emit('mode', item.value)">
        <component :is="item.icon" :size="14" />{{ item.label }}
      </button>
    </div>
    <div class="revision-meta mono">
      <span>锁 {{ lockCount }}</span><span>移位 {{ shiftCount }}</span>
      <span v-if="disputeCount" class="dispute">争议 {{ disputeCount }}</span>
    </div>
    <div class="revision-actions">
      <button type="button" class="revision-step" :disabled="!lockCount && !shiftCount" title="撤销最近一处修订"
        @click="emit('undo')"><RotateCcw :size="14" />撤销</button>
      <button type="button" class="revision-step danger" :disabled="!lockCount && !shiftCount" title="清空全部修订"
        @click="emit('clear')"><Trash :size="14" />清空</button>
    </div>
    <p v-if="pending" class="revision-hint">正在拖选：松开后该小段将整体移回原八度，相邻音会在同一证据段内重新判断。</p>
  </div>
</template>
