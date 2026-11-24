import { describe, expect, it } from 'vitest'
import type { PitchLock, PitchRevision, PitchShift } from '../../../shared/document'
import { withoutLatest, withLock, withShift } from './marks'
import { emptyRevision } from './engine'

const lock = (time: number, createdAt: number, midi = 60): PitchLock => ({ id: `l-${time}`, time, midi, createdAt })
const shift = (createdAt: number, direction: -1 | 1 = -1): PitchShift => ({
  id: `s-${createdAt}`, start: 0, end: 1, direction, createdAt,
})

describe('revision marks', () => {
  it('同一时间点重复加锁会替换旧锁点', () => {
    const once = withLock(undefined, lock(0.2, 1))
    const twice = withLock(once, lock(0.2, 2, 72))
    expect(twice.locks).toHaveLength(1)
    expect(twice.locks[0].midi).toBe(72)
  })

  it('追加移位并保留既有锁点', () => {
    const withLockFirst = withLock(undefined, lock(0.1, 1))
    const both = withShift(withLockFirst, shift(2))
    expect(both.locks).toHaveLength(1)
    expect(both.shifts).toHaveLength(1)
  })

  it('撤销移除最近加入的标记，全部清空后返回 undefined', () => {
    let revision: PitchRevision | undefined = emptyRevision(0)
    revision = withLock(revision, lock(0.1, 1))
    revision = withShift(revision, shift(2))
    revision = withLock(revision, lock(0.3, 3))
    expect(revision.locks).toHaveLength(2)

    revision = withoutLatest(revision!)
    expect(revision?.locks).toHaveLength(1)
    expect(revision?.shifts).toHaveLength(1)

    revision = withoutLatest(revision!)
    expect(revision?.locks).toHaveLength(1)
    expect(revision?.shifts).toHaveLength(0)

    revision = withoutLatest(revision!)
    expect(revision).toBeUndefined()
  })
})
