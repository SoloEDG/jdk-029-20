import { ref } from 'vue'
import type { Take, TimeRange } from '../../../shared/document'
import { nearestPoint } from './engine'

export type RevisionMode = 'lock' | 'down' | 'up'

export function useRevision() {
  const mode = ref<RevisionMode>('lock')
  /** 拖选移位区间时的起点（歌曲时间）。 */
  const dragStart = ref<number | null>(null)
  const pendingRange = ref<TimeRange | null>(null)

  /** 单击：锁点吸附到最近的有声检测点；移位模式下按下开始拖选。 */
  function handlePress(take: Take, time: number) {
    if (mode.value === 'lock') {
      const target = nearestPoint(take.pitch, time)
      if (!target || target.midi === null) return null
      return { type: 'lock' as const, time: target.time, midi: target.midi }
    }
    dragStart.value = time
    pendingRange.value = { start: time, end: time }
    return null
  }

  function handleDrag(time: number) {
    if (dragStart.value === null) return
    const start = dragStart.value
    pendingRange.value = { start: Math.min(start, time), end: Math.max(start, time) }
  }

  /** 松开拖选：返回一个最小宽度的移位区间。 */
  function handleRelease(): { type: 'shift'; range: TimeRange; direction: -1 | 1 } | null {
    if (dragStart.value === null || !pendingRange.value) return null
    const range = { ...pendingRange.value }
    dragStart.value = null
    pendingRange.value = null
    if (range.end - range.start < 0.05) return null
    return { type: 'shift', range, direction: mode.value === 'up' ? 1 : -1 }
  }

  function cancelDrag() {
    dragStart.value = null
    pendingRange.value = null
  }

  return {
    mode, pendingRange, handlePress, handleDrag, handleRelease, cancelDrag,
  }
}
