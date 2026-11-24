<script setup lang="ts">
import { Activity } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import type { GuideNote, PitchPoint, TimeRange } from '../../../shared/document'
import { drawPitch, type RevisionOverlay } from '../lib/plot'
import { buildGeometry } from '../lib/geometry'
import { revisePitch } from '../../revision/lib/engine'
import type { RevisionMode } from '../../revision/lib/useRevision'
import type { Take } from '../../../shared/document'

const props = defineProps<{
  notes: GuideNote[]; position: number; range: TimeRange; latest: string | null
  live: PitchPoint[]; takeA: PitchPoint[]; takeB: PitchPoint[]
  editing: Take | null
  mode: RevisionMode
  pendingRange: TimeRange | null
}>()
const emit = defineEmits<{
  press: [Take, number]
  drag: [number]
  release: [Take]
}>()
const canvas = ref<HTMLCanvasElement | null>(null)
const size = ref({ width: 0, height: 0 })
let observer: ResizeObserver | undefined
let dragging = false

function eventTime(event: PointerEvent) {
  const canvasEl = canvas.value
  if (!canvasEl) return 0
  const rect = canvasEl.getBoundingClientRect()
  const geometry = buildGeometry(rect.width, rect.height, props.range, props.notes)
  return geometry.timeAt(event.clientX - rect.left)
}

function onPointerDown(event: PointerEvent) {
  if (!props.editing) return
  event.preventDefault()
  dragging = true
  canvas.value?.setPointerCapture(event.pointerId)
  emit('press', props.editing, eventTime(event))
}
function onPointerMove(event: PointerEvent) {
  if (!dragging || !props.editing) return
  emit('drag', eventTime(event))
}
function onPointerUp() {
  if (!dragging || !props.editing) return
  dragging = false
  emit('release', props.editing)
}

onMounted(() => {
  if (!canvas.value) return
  observer = new ResizeObserver(([entry]) => {
    size.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  observer.observe(canvas.value)
})
onBeforeUnmount(() => observer?.disconnect())

watchEffect(() => {
  const { width, height } = size.value
  if (!canvas.value || width < 80 || height < 80) return
  const edited = props.editing
  const revision = edited?.revision ? revisePitch(edited.pitch, edited.revision) : null
  const overlay: RevisionOverlay | undefined = edited && edited.revision
    ? {
        locks: edited.revision.locks,
        shifts: [...edited.revision.shifts, ...(props.pendingRange
          ? [{ ...props.pendingRange, id: 'pending', direction: (props.mode === 'up' ? 1 : -1) as -1 | 1, createdAt: 0 }]
          : [])],
        disputes: revision?.disputes ?? [],
        gaps: revision?.gaps ?? [],
      }
    : undefined
  const traces: { points: PitchPoint[]; color: string; dashed?: boolean }[] = [
    { points: props.takeA, color: '#85cbd5' },
    { points: props.takeB, color: '#ec9fa9' },
    { points: props.live, color: '#b8dc9d' },
  ]
  if (edited) {
    // 原轨虚线打底，修订轨实线覆盖，二者共用同一歌曲时间轴。
    traces.push({ points: edited.pitch, color: '#7d8172', dashed: true })
    traces.push({ points: revision ? revision.points : edited.pitch, color: '#e5bd70' })
  }
  drawPitch(canvas.value, width, height, {
    notes: props.notes, range: props.range, position: props.position, traces, overlay,
  })
})
</script>

<template>
  <section class="pitch-panel" aria-labelledby="pitch-title">
    <div class="pitch-heading">
      <h2 id="pitch-title" class="panel-heading"><Activity :size="17" /> 音高轨迹</h2>
      <div class="pitch-legends">
        <span><i class="legend reference"></i>参考音</span><span><i class="legend live"></i>我的声音</span>
        <span v-if="takeA.length"><i class="legend a"></i>A</span><span v-if="takeB.length"><i class="legend b"></i>B</span>
        <span v-if="editing"><i class="legend origin"></i>原轨</span><span v-if="editing"><i class="legend revised"></i>修订轨</span>
      </div>
    </div>
    <canvas ref="canvas" class="pitch-canvas" :class="{ editable: editing }" role="img"
      :aria-label="`参考音与录音音高轨迹，当前音高 ${latest ?? '未检测到'}`"
      @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"></canvas>
    <div class="pitch-footer">
      <span>当前音高 <strong class="mono">{{ latest ?? '—' }}</strong></span>
      <span v-if="editing" class="edit-hint">点击锁定真跳，或拖选小段移动八度 · 缺口处证据中断不跨段修订</span>
      <span>歌曲时间</span>
    </div>
  </section>
</template>
