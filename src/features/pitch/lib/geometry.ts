import type { GuideNote, TimeRange } from '../../../shared/document'
import { noteName } from './detect'

export interface PlotGeometry {
  left: number
  right: number
  top: number
  bottom: number
  low: number
  high: number
  x: (time: number) => number
  y: (midi: number) => number
  timeAt: (px: number) => number
  midiAt: (py: number) => number
}

export function buildGeometry(width: number, height: number, range: TimeRange, notes: readonly GuideNote[]): PlotGeometry {
  const left = 43
  const right = width - 15
  const bottom = height - 30
  const top = 14
  const first = range.start
  const duration = Math.max(0.0001, range.end - first)
  const midis = notes.map(note => note.midi)
  const [low, high] = midis.length
    ? [Math.min(...midis) - 3, Math.max(...midis) + 3]
    : [54, 72]
  const span = Math.max(1, high - low)
  const x = (time: number) => left + (time - first) / duration * (right - left)
  const y = (midi: number) => bottom - (midi - low) / span * (bottom - top)
  const timeAt = (px: number) => first + (px - left) / (right - left) * duration
  const midiAt = (py: number) => low + (bottom - py) / (bottom - top) * span
  return { left, right, top, bottom, low, high, x, y, timeAt, midiAt }
}

export function drawGrid(context: CanvasRenderingContext2D, width: number, geometry: PlotGeometry, range: TimeRange, notes: readonly GuideNote[]) {
  const { left, right, top, bottom, low, high, x, y } = geometry
  const ticks = width < 370 ? 3 : width < 520 ? 5 : 8
  context.font = '10px "IBM Plex Mono", monospace'
  for (let midi = low; midi <= high; midi++) {
    const major = midi % 3 === 0
    context.strokeStyle = major ? '#383d33' : '#2a3027'
    context.beginPath()
    context.moveTo(left, y(midi))
    context.lineTo(right, y(midi))
    context.stroke()
    if (major) {
      context.fillStyle = '#a5ac96'
      context.fillText(noteName(midi), 13, y(midi) + 3)
    }
  }
  const duration = range.end - range.start
  for (let index = 0; index <= ticks; index++) {
    const time = range.start + duration * index / ticks
    const px = x(time)
    context.strokeStyle = '#343a30'
    context.beginPath()
    context.moveTo(px, top)
    context.lineTo(px, bottom)
    context.stroke()
    context.fillStyle = '#a5ac96'
    context.textAlign = index === 0 ? 'left' : index === ticks ? 'right' : 'center'
    context.fillText(clockText(time, duration < 6), px, bottom + 20)
  }
}

function clockText(seconds: number, decimal = false) {
  const tenths = Math.floor(Math.max(0, seconds) * 10 + 0.000001)
  const full = Math.floor(tenths / 10)
  const minutes = String(Math.floor(full / 60)).padStart(2, '0')
  const whole = String(full % 60).padStart(2, '0')
  return `${minutes}:${whole}${decimal ? `.${tenths % 10}` : ''}`
}
