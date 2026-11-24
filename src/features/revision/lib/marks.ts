import type { PitchLock, PitchRevision, PitchShift } from '../../../shared/document'
import { emptyRevision } from './engine'

/** 追加或替换同一时间点的锁点（重复点击视为重新确认）。 */
export function withLock(revision: PitchRevision | undefined, lock: PitchLock): PitchRevision {
  const base = revision ?? emptyRevision()
  return {
    ...base,
    locks: [...base.locks.filter(item => item.time !== lock.time), lock],
    updatedAt: lock.createdAt,
  }
}

/** 追加一个八度移位区间。 */
export function withShift(revision: PitchRevision | undefined, shift: PitchShift): PitchRevision {
  const base = revision ?? emptyRevision()
  return {
    ...base,
    shifts: [...base.shifts, shift],
    updatedAt: shift.createdAt,
  }
}

/** 撤销最近一次加入的标记（锁点或移位中 createdAt 更大者）；清空后返回 undefined。 */
export function withoutLatest(revision: PitchRevision): PitchRevision | undefined {
  const lock = revision.locks.at(-1)
  const shift = revision.shifts.at(-1)
  let locks = revision.locks
  let shifts = revision.shifts
  if (lock && (!shift || lock.createdAt >= shift.createdAt)) {
    locks = revision.locks.filter(item => item.id !== lock.id)
  } else if (shift) {
    shifts = revision.shifts.filter(item => item.id !== shift.id)
  }
  return locks.length || shifts.length
    ? { locks, shifts, updatedAt: Date.now() }
    : undefined
}
