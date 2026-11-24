import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PitchPoint, PitchRevision } from '../../../shared/document'
import { buildRuns, revisePitch } from './engine'

const root = resolve(__dirname, '../../../../fixtures')

describe('验证夹具', () => {
  it('真实八度跳紧跟倍频误判：锁真跳 + 移位误判段，修订后与实际演唱一致', () => {
    const raw = JSON.parse(readFileSync(resolve(root, 'octave-jump/octave-jump.json'), 'utf-8'))
    const points = raw.pitch as PitchPoint[]
    // 操作 1：锁住 0.4s、0.5s 的真跳 C5。
    // 操作 2：把 0.6s 起的误判小段框选下移八度。
    const revision: PitchRevision = {
      locks: [
        { id: 'l1', time: points[4].time, midi: 72, createdAt: 1 },
        { id: 'l2', time: points[5].time, midi: 72, createdAt: 2 },
      ],
      shifts: [
        { id: 's1', start: points[6].time - 0.02, end: points[9].time + 0.02, direction: -1, createdAt: 3 },
      ],
      updatedAt: 3,
    }
    const result = revisePitch(points, revision)
    expect(result.disputes).toHaveLength(0)
    // 真跳保留 72，误判段归位 60，前半正确段不动。
    expect(result.points.map(p => p.midi)).toEqual([60, 60, 60, 60, 72, 72, 60, 60, 60, 60])
  })

  it('只剩音高点的旧盘：无音频也能修订，且无声缺口阻断跨段传播', () => {
    const raw = JSON.parse(readFileSync(resolve(root, 'legacy-disc/legacy-disc.json'), 'utf-8'))
    const points = raw.pitch as PitchPoint[]
    const { gaps } = buildRuns(points)
    expect(gaps.length).toBeGreaterThan(0)
    const revision: PitchRevision = {
      locks: [{ id: 'l1', time: points[0].time, midi: 55, createdAt: 1 }],
      shifts: [{ id: 's1', start: points[2].time - 0.02, end: points[4].time + 0.02, direction: -1, createdAt: 2 }],
      updatedAt: 2,
    }
    const result = revisePitch(points, revision)
    // 中段误判 67 -> 55；缺口另一侧的点不被跨段修订。
    expect(result.points.slice(2, 5).map(p => p.midi)).toEqual([55, 55, 55])
    const lastPoint = result.points.at(-1)!
    expect(lastPoint.midi).toBe(55)
    expect(result.offsets.at(-1)).toBe(0)
  })
})
