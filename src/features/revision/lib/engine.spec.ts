import { describe, expect, it } from 'vitest'
import type { PitchPoint, PitchRevision } from '../../../shared/document'
import { buildRuns, emptyRevision, GAP_LIMIT, nearestPoint, revisePitch } from './engine'
const step = 0.1

/** 生成等间隔音高点。 */
function line(sequence: (number | null)[], start = 0, interval = step): PitchPoint[] {
  return sequence.map((midi, index) => ({ time: start + index * interval, midi }))
}

function revision(locks: PitchRevision['locks'] = [], shifts: PitchRevision['shifts'] = []): PitchRevision {
  return { locks, shifts, updatedAt: 0 }
}

function lock(time: number, midi: number) {
  return { id: `lock-${time}`, time, midi, createdAt: 0 }
}

function shift(start: number, end: number, direction: -1 | 1) {
  return { id: `shift-${start}`, start, end, direction, createdAt: 0 }
}

describe('revisePitch', () => {
  it('无标记时保持检测原值，并识别无声缺口', () => {
    const points = line([60, 60, null, 62, 62])
    const result = revisePitch(points, emptyRevision())
    expect(result.points.map(p => p.midi)).toEqual([60, 60, null, 62, 62])
    expect(result.gaps).toHaveLength(1)
    expect(result.disputes).toHaveLength(0)
  })

  it('真实八度跳与倍频误判紧贴：锁住真跳后，只把误判小段移回原八度，真跳保持不动', () => {
    // 0.0-0.3 唱 C4(60)；0.4-0.5 真跳到 C5(72)；0.6-0.9 歌手落回 C4，
    // 但检测器倍频误判仍输出 C5(72)，误判与真跳紧贴、音名相同。
    const points = line([60, 60, 60, 60, 72, 72, 72, 72, 72, 72])
    const rev = revision([
      lock(0.4, 72), // 确认 0.4、0.5 的 72 是实际大跳
      lock(0.5, 72),
    ], [
      shift(0.58, 0.92, -1), // 0.6 起的误判小段移回下八度
    ])
    const result = revisePitch(points, rev)
    const midi = result.points.map(p => p.midi)
    // 真跳点保持 72，误判点归位 60。
    expect(midi.slice(0, 6)).toEqual([60, 60, 60, 60, 72, 72])
    expect(midi.slice(6)).toEqual([60, 60, 60, 60])
    expect(result.disputes).toHaveLength(0)
  })

  it('移位标记在同一声证据段内带动相邻不确定音重新判断，保持连续', () => {
    // 全段音名相同（都是 C）。前半是正确的 C4(60)，后半被倍频误判成 C5(72)；
    // 移位带精确覆盖误判的 72，下移后回到 60，正确的 60 自由点保持原八度。
    const points = line([60, 60, 60, 72, 72, 72])
    const result = revisePitch(points, revision([], [shift(0.3, 0.6, -1)]))
    expect(result.points.map(p => p.midi)).toEqual([60, 60, 60, 60, 60, 60])
    expect(result.offsets).toEqual([0, 0, 0, -1, -1, -1])
  })

  it('移位不会跨过真实音程：音名不同的相邻音段保持各自检测八度', () => {
    // C(60) 与 G(67) 音名不同，是真实音程；移位只作用于 G 段，C 段不受影响。
    const points = line([60, 60, 60, 67, 67, 67])
    const result = revisePitch(points, revision([], [shift(0.3, 0.6, -1)]))
    expect(result.offsets.slice(0, 3)).toEqual([0, 0, 0])
    expect(result.offsets.slice(3)).toEqual([-1, -1, -1])
    expect(result.points.map(p => p.midi)).toEqual([60, 60, 60, 55, 55, 55])
  })

  it('修订不跨越无声缺口：缺口另一侧没有锚点时保持检测值', () => {
    // 前半段与后半段之间人为插入一个长间隔（> GAP_LIMIT）。
    const points: PitchPoint[] = [
      { time: 0, midi: 60 }, { time: 0.1, midi: 60 },
      { time: 0.1 + GAP_LIMIT + 0.05, midi: 72 }, { time: 0.1 + GAP_LIMIT + 0.15, midi: 72 },
    ]
    const { runs, gaps } = buildRuns(points)
    expect(runs).toHaveLength(2)
    expect(gaps).toHaveLength(1)
    const result = revisePitch(points, revision([], [shift(0, 0.15, -1)]))
    // 第一段下移；第二段在独立证据段、无锚点，不动。
    expect(result.points[0].midi).toBe(48)
    expect(result.points[2].midi).toBe(72)
  })

  it('同段多个锁点互相矛盾时保留已确认内容并报告争议位置', () => {
    // 同一稳定音组内，一个锁点要求维持、另一个要求下移八度。
    const points = line([60, 60, 60, 60])
    const rev = revision([lock(0.0, 60), lock(0.2, 48)])
    const result = revisePitch(points, rev)
    expect(result.disputes.length).toBeGreaterThan(0)
    expect(result.disputes.some(d => d.time === 0.2)).toBe(true)
    // 两个锁点各自的确认值都保留在对应点上。
    expect(result.points[0].midi).toBe(60)
    expect(result.points[2].midi).toBe(48)
  })

  it('移位与锁点在同一点冲突时锁点优先，且不破坏其他已确认段', () => {
    const points = line([60, 60, 60, 60, 60])
    const rev = revision([lock(0.2, 60)], [shift(0.15, 0.25, -1)])
    const result = revisePitch(points, rev)
    expect(result.disputes).toHaveLength(0)
    // 锁点确认该组维持原八度，移位要求被听觉确认覆盖。
    expect(result.points[2].midi).toBe(60)
  })

  it('无锁点时方向相反的移位覆盖同一组会进入争议并保留确认值', () => {
    const points = line([60, 60, 60, 60])
    const rev = revision([], [shift(0.05, 0.25, -1), shift(0.15, 0.35, 1)])
    const result = revisePitch(points, rev)
    expect(result.disputes.length).toBeGreaterThan(0)
  })

  it('只剩音高点的旧盘：无音频也能完成锁点与移位修订', () => {
    // 旧盘里一整段 G 音，中间被倍频误判成高八度 G4(67)，首尾是正确的 G3(55)，三者音名相同。
    const points = line([55, 55, 67, 67, 55, 55])
    const rev = revision([lock(0.0, 55), lock(0.1, 55)], [shift(0.12, 0.35, -1)])
    const result = revisePitch(points, rev)
    expect(result.points.map(p => p.midi)).toEqual([55, 55, 55, 55, 55, 55])
  })

  it('锁点吸附到最近的有声检测点，忽略空点', () => {
    const points = line([60, null, 62])
    expect(nearestPoint(points, 0.22)?.time).toBe(0.2)
    expect(nearestPoint(points, 0.05)?.midi).toBe(60)
  })

  it('长跨度真跳不会被抹平：锁点确认后大跳原样保留', () => {
    const points = line([48, 48, 48, 84, 84, 48, 48])
    const rev = revision([lock(0.3, 84), lock(0.4, 84)])
    const result = revisePitch(points, rev)
    expect(result.points.map(p => p.midi)).toEqual([48, 48, 48, 84, 84, 48, 48])
    expect(result.disputes).toHaveLength(0)
  })

  it('修订轨与原轨共用歌曲时间：只改音高，不改任何时间点', () => {
    const points = line([60, null, 72, 60, 72])
    const rev = revision([lock(0.2, 72)], [shift(0.38, 0.5, -1)])
    const result = revisePitch(points, rev)
    expect(result.points.map(p => p.time)).toEqual(points.map(p => p.time))
    expect(result.points.map(p => p.midi === null)).toEqual(points.map(p => p.midi === null))
  })

  it('相反方向的移位在同一点冲突时报告争议，且不产生越界八度', () => {
    const points = line([60, 60, 60, 60])
    const rev = revision([], [shift(0.15, 0.25, -1), shift(0.15, 0.25, 1)])
    const result = revisePitch(points, rev)
    expect(result.disputes.length).toBeGreaterThan(0)
    for (const offset of result.offsets) expect(Math.abs(offset)).toBeLessThanOrEqual(1)
  })
})
