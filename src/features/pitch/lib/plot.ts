import type { EvidenceGap, GuideNote, PitchDispute, PitchLock, PitchPoint, PitchShift, TimeRange } from '../../../shared/document'
import { GAP_LIMIT } from '../../revision/lib/engine'
import { buildGeometry, drawGrid, type PlotGeometry } from './geometry'

interface Trace { points: PitchPoint[]; color: string; dashed?: boolean }

export interface RevisionOverlay {
  locks: PitchLock[]
  shifts: PitchShift[]
  disputes: PitchDispute[]
  gaps: EvidenceGap[]
}

interface Plot {
  position: number
  range: TimeRange
  notes: GuideNote[]
  traces: Trace[]
  overlay?: RevisionOverlay
}

function strokeTrace(context: CanvasRenderingContext2D, geometry: PlotGeometry, trace: Trace) {
  const { x, y } = geometry
  context.save()
  context.strokeStyle = trace.color
  context.lineWidth = 2
  if (trace.dashed) context.setLineDash([5, 4])
  context.beginPath()
  let last: PitchPoint | undefined
  for (const point of trace.points) {
    if (point.midi === null) { last = undefined; continue }
    if (!last || point.time - last.time > GAP_LIMIT) context.moveTo(x(point.time), y(point.midi))
    else context.lineTo(x(point.time), y(point.midi))
    last = point
  }
  context.stroke()
  context.restore()
}

function drawOverlay(context: CanvasRenderingContext2D, geometry: PlotGeometry, overlay: RevisionOverlay) {
  const { left, right, top, bottom, x, y } = geometry
  context.save()
  context.beginPath()
  context.rect(left, top, right - left, bottom - top)
  context.clip()

  // 移位带：标出应移回原八度的小段。
  for (const shift of overlay.shifts) {
    const start = x(shift.start)
    const end = x(shift.end)
    context.fillStyle = shift.direction < 0 ? 'rgba(236,159,169,0.14)' : 'rgba(133,203,213,0.14)'
    context.fillRect(start, top, Math.max(3, end - start), bottom - top)
    context.strokeStyle = shift.direction < 0 ? 'rgba(236,159,169,0.75)' : 'rgba(133,203,213,0.75)'
    context.setLineDash([4, 4])
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(start, top)
    context.lineTo(start, bottom)
    context.moveTo(end, top)
    context.lineTo(end, bottom)
    context.stroke()
    context.setLineDash([])
    context.fillStyle = shift.direction < 0 ? '#ec9fa9' : '#85cbd5'
    context.font = '11px "IBM Plex Mono", monospace'
    context.fillText(shift.direction < 0 ? '−8va' : '+8va', start + 3, top + 12)
  }

  // 无声缺口：明确显示有声证据在哪里中断。
  for (const gap of overlay.gaps) {
    const start = x(gap.start)
    const end = x(gap.end)
    if (end < left || start > right) continue
    context.fillStyle = 'rgba(24,26,21,0.82)'
    context.fillRect(start, top, Math.max(2, end - start), bottom - top)
    context.strokeStyle = '#6b6552'
    context.setLineDash([2, 3])
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(start, top)
    context.lineTo(start, bottom)
    context.moveTo(end, top)
    context.lineTo(end, bottom)
    context.stroke()
    context.setLineDash([])
    context.fillStyle = '#989b89'
    context.font = '9px "IBM Plex Mono", monospace'
    context.fillText('无声缺口', start + 2, bottom - 5)
  }

  // 锁点：确认是实际大跳 / 实际音高的音。
  for (const lock of overlay.locks) {
    const px = x(lock.time)
    const py = y(lock.midi)
    context.fillStyle = '#e5bd70'
    context.strokeStyle = '#f6eddb'
    context.lineWidth = 1.4
    context.beginPath()
    context.arc(px, py, 4.5, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }

  // 争议：同一证据段内无法同时满足的位置。
  const disputeTimes = new Map<number, PitchDispute>()
  for (const dispute of overlay.disputes) {
    if (!disputeTimes.has(dispute.time)) disputeTimes.set(dispute.time, dispute)
  }
  for (const time of disputeTimes.keys()) {
    const px = x(time)
    context.strokeStyle = '#ff8d75'
    context.lineWidth = 1.6
    context.beginPath()
    context.moveTo(px - 6, top + 4)
    context.lineTo(px + 6, top + 16)
    context.moveTo(px + 6, top + 4)
    context.lineTo(px - 6, top + 16)
    context.stroke()
    context.fillStyle = '#ffac98'
    context.font = '9px "IBM Plex Mono", monospace'
    context.fillText('争议', px - 8, top + 28)
  }
  context.restore()
}

export function drawPitch(canvas: HTMLCanvasElement, width: number, height: number, plot: Plot) {
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const context = canvas.getContext('2d')
  if (!context) return
  context.scale(ratio, ratio)
  const geometry = buildGeometry(width, height, plot.range, plot.notes)
  const { left, right, top, bottom, x } = geometry
  drawGrid(context, width, geometry, plot.range, plot.notes)

  context.save()
  context.beginPath()
  context.rect(left, top, right - left, bottom - top)
  context.clip()
  for (const note of plot.notes) {
    const start = x(note.start)
    const length = Math.max(4, x(note.end) - start)
    context.fillStyle = '#e5bd70'
    context.beginPath()
    context.roundRect(start, geometry.y(note.midi) - 4, length, 8, 4)
    context.fill()
  }
  for (const trace of plot.traces) strokeTrace(context, geometry, trace)
  context.restore()

  if (plot.overlay) drawOverlay(context, geometry, plot.overlay)

  if (plot.position >= plot.range.start && plot.position <= plot.range.end) {
    context.strokeStyle = '#f6eddb'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(x(plot.position), top)
    context.lineTo(x(plot.position), bottom)
    context.stroke()
  }
}
