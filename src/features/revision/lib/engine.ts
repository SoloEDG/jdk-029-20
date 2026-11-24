import type {
  EvidenceGap,
  PitchDispute,
  PitchLock,
  PitchPoint,
  PitchRevision,
  PitchShift,
} from '../../../shared/document'

/** 相邻音高点间隔超过该值视为无声缺口，证据在此中断，修订不得跨越。 */
export const GAP_LIMIT = 0.14
/** 同段内相邻点允许的最大半音抖动；超过且音名不同即视为换音。 */
export const GROUP_LIMIT = 1
const OCTAVE = 12

export interface RevisionResult {
  /** 修订后的音高点，时间与原始点一一对应，仅 midi 可能变化。 */
  points: PitchPoint[]
  /** 本次判定中出现的争议；为空表示所有标记都已满足。 */
  disputes: PitchDispute[]
  /** 有声证据之间的无声缺口。 */
  gaps: EvidenceGap[]
  /** 每个音高点最终应用的八度数（0 表示维持检测值），供绘图与调试使用。 */
  offsets: number[]
}

interface Segment {
  pointIndexes: number[]
  pitchClass: number
  median: number
}

interface Run {
  pointIndexes: number[]
  segments: Segment[]
  start: number
  end: number
}

interface Constraint {
  k: number
  kind: 'lock' | 'shift'
  time: number
  message: string
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function classOf(midi: number) {
  return ((Math.round(midi) % OCTAVE) + OCTAVE) % OCTAVE
}

/**
 * 按无声缺口切分有声证据段；段内按音名（pitch class）聚类：
 * 整八度折返（如 60 与 72，音名都是 C）归入同一音名段，真实大跳（音名变化）切断段落。
 */
export function buildRuns(points: PitchPoint[]) {
  const runs: Run[] = []
  const gaps: EvidenceGap[] = []
  let run: Run | null = null
  let previous: PitchPoint | null = null

  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    if (point.midi === null) continue
    if (previous && point.time - previous.time > GAP_LIMIT) {
      gaps.push({ start: previous.time, end: point.time })
      if (run) run.end = previous.time
      run = null
    }
    if (!run) {
      run = { pointIndexes: [], segments: [], start: point.time, end: point.time }
      runs.push(run)
    }
    run.pointIndexes.push(index)
    const segment = run.segments.at(-1)
    const previousMidi = run.pointIndexes.length > 1
      ? points[run.pointIndexes.at(-2)!].midi as number
      : point.midi
    const step = Math.abs(point.midi - previousMidi)
    const sameClass = classOf(point.midi) === classOf(previousMidi)
    if (!segment || (step > GROUP_LIMIT && !sameClass)) {
      run.segments.push({ pointIndexes: [index], pitchClass: classOf(point.midi), median: point.midi })
    } else {
      segment.pointIndexes.push(index)
    }
    previous = point
  }
  if (run && previous) run.end = previous.time
  for (const segment of runs.flatMap(item => item.segments)) {
    segment.median = median(segment.pointIndexes.map(i => points[i].midi as number))
  }
  return { runs, gaps }
}

function octaveOf(midi: number) {
  return Math.floor((midi + 0.5) / OCTAVE)
}

function constraintsAt(point: PitchPoint, revision: PitchRevision): Constraint[] {
  const result: Constraint[] = []
  for (const shift of revision.shifts) {
    if (point.time >= shift.start && point.time < shift.end) {
      result.push({
        k: shift.direction,
        kind: 'shift',
        time: point.time,
        message: shift.direction < 0 ? '移位要求下移八度' : '移位要求上移八度',
      })
    }
  }
  for (const lock of revision.locks) {
    if (lock.time === point.time) {
      result.push({
        k: octaveOf(lock.midi) - octaveOf(point.midi as number),
        kind: 'lock',
        time: point.time,
        message: `锁点要求保留 ${lock.midi}`,
      })
    }
  }
  return result
}

/**
 * 逐点解析约束：锁点代表听觉确认，优先于同点移位；
 * 同一点出现互斥同类约束（两个矛盾锁点，或无锁点时方向相反的移位）时报告争议。
 */
function resolvePoint(point: PitchPoint, revision: PitchRevision, disputes: PitchDispute[]): Constraint | null {
  const constraints = constraintsAt(point, revision)
  if (!constraints.length) return null
  const locks = constraints.filter(item => item.kind === 'lock')
  if (locks.length) {
    const distinct = new Map<number, Constraint>()
    for (const item of locks) distinct.set(item.k, item)
    if (distinct.size > 1) {
      for (const item of distinct.values()) {
        disputes.push({ time: point.time, kind: 'lock', message: item.message })
      }
    }
    return locks[0]
  }
  const distinct = new Map<number, Constraint>()
  for (const item of constraints) distinct.set(item.k, item)
  if (distinct.size > 1) {
    for (const item of distinct.values()) {
      disputes.push({ time: point.time, kind: 'shift', message: item.message })
    }
    return null
  }
  return constraints[0]
}

/**
 * 依据人工标记重判整条音高线。
 * - 修订只在连续有声证据段内传播，无声缺口处中断；
 * - 锁点逐点固定实际音高（含真实大跳），并充当传播屏障；
 * - 移位在同一音名段内带动相邻不确定音，真实音程变化（音名切换）会阻断传播；
 * - 同段内锁点互斥无法同时满足时，保留各自确认值并报告争议。
 */
export function revisePitch(points: PitchPoint[], revision: PitchRevision): RevisionResult {
  const { runs, gaps } = buildRuns(points)
  const offsets = new Array<number>(points.length).fill(0)
  const fixed = new Array<boolean>(points.length).fill(false)
  const disputes: PitchDispute[] = []
  const output = points.map(point => ({ ...point }))

  for (const run of runs) {
    for (const segment of run.segments) {
      // 1) 逐点确定固定约束。
      const lockKs = new Set<number>()
      for (const index of segment.pointIndexes) {
        const resolved = resolvePoint(points[index], revision, disputes)
        if (!resolved) continue
        offsets[index] = resolved.k
        fixed[index] = true
        if (resolved.kind === 'lock') lockKs.add(resolved.k)
      }
      // 2) 同一音名段内出现互斥锁点八度：标记争议，已确认值逐点保留。
      if (lockKs.size > 1) {
        for (const index of segment.pointIndexes) {
          if (!fixed[index]) continue
          const constraint = constraintsAt(points[index], revision).find(item => item.kind === 'lock')
          if (constraint && !disputes.some(d => d.time === constraint.time)) {
            disputes.push({ time: constraint.time, kind: 'lock', message: constraint.message })
          }
        }
      }
      // 3) 移位洪泛：从每个移位固定点向同段两侧自由点传播。
      //    屏障有两类：人工固定点（锁点），以及检测八度边界（相邻点本身就相差整八度，
      //    说明一侧是正确音、另一侧才是疑似误判，不能把正确音也拖走）。
      //    真实音程变化已切成不同音名段，天然阻断传播。
      for (let position = 0; position < segment.pointIndexes.length; position++) {
        const index = segment.pointIndexes[position]
        if (!fixed[index]) continue
        const isShift = constraintsAt(points[index], revision).some(item => item.kind === 'shift')
        if (!isShift) continue
        const k = offsets[index]
        const octaveBreaks = (a: number, b: number) =>
          Math.abs(octaveOf(points[a].midi as number) - octaveOf(points[b].midi as number)) >= 1
        let cursor = position - 1
        while (cursor >= 0) {
          const target = segment.pointIndexes[cursor]
          const next = segment.pointIndexes[cursor + 1]
          if (fixed[target] || octaveBreaks(target, next)) break
          offsets[target] = k
          fixed[target] = true
          cursor--
        }
        cursor = position + 1
        while (cursor < segment.pointIndexes.length) {
          const target = segment.pointIndexes[cursor]
          const previous = segment.pointIndexes[cursor - 1]
          if (fixed[target] || octaveBreaks(previous, target)) break
          offsets[target] = k
          fixed[target] = true
          cursor++
        }
      }
      // 4) 仍未固定的自由点保持检测八度（offsets 已是 0）。
    }
  }

  for (let index = 0; index < points.length; index++) {
    if (output[index].midi !== null) output[index].midi = points[index].midi! + offsets[index] * OCTAVE
  }
  return { points: output, disputes, gaps, offsets }
}

/** 找到时间上最接近的有声检测点，用于把锁点吸附到真实采样位置。 */
export function nearestPoint(points: PitchPoint[], time: number): PitchPoint | null {
  let best: PitchPoint | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const point of points) {
    if (point.midi === null) continue
    const distance = Math.abs(point.time - time)
    if (distance < bestDistance) {
      bestDistance = distance
      best = point
    }
  }
  return best
}

export function emptyRevision(now = Date.now()): PitchRevision {
  return { locks: [], shifts: [], updatedAt: now }
}

export function hasMarks(revision: PitchRevision | undefined): revision is PitchRevision {
  return !!revision && (revision.locks.length > 0 || revision.shifts.length > 0)
}

export type { PitchLock, PitchShift }
