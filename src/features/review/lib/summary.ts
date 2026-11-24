import type { GuideNote, Take } from '../../../shared/document'
import { within } from '../../../shared/time'
import { revisePitch } from '../../revision/lib/engine'

/** 指标始终读取当前修订结果；撤销修订后自然回到检测原值。 */
export function effectivePoints(take: Take) {
  return take.revision ? revisePitch(take.pitch, take.revision).points : take.pitch
}

export function accuracy(take: Take, notes: readonly GuideNote[]) {
  let valid = 0
  let hits = 0
  for (const point of effectivePoints(take)) {
    if (point.midi === null) continue
    const target = notes.find(note => within(note, point.time))
    if (!target) continue
    valid++
    if (Math.abs(point.midi - target.midi) <= 0.5) hits++
  }
  return valid > 0 ? Math.round(hits / valid * 100) : null
}
