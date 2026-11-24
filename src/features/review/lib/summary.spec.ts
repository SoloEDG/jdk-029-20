import { describe, expect, it } from 'vitest'
import type { GuideNote, Take } from '../../../shared/document'
import { accuracy, effectivePoints } from './summary'
import { emptyRevision } from '../../revision/lib/engine'

function take(pitch: Take['pitch'], revision?: Take['revision']): Take {
  return {
    id: 't', songId: 's', lineId: 'l', createdAt: 0,
    start: 0, end: 1, audio: new Blob(), pitch, revision,
  }
}

const notes: GuideNote[] = [{ start: 0, end: 1, midi: 60 }]

describe('accuracy', () => {
  it('无修订时按检测原值计算命中率', () => {
    const t = take([{ time: 0.1, midi: 72 }, { time: 0.2, midi: 60 }])
    expect(accuracy(t, notes)).toBe(50)
  })

  it('倍频误判被移位修正后，指标随修订轨提升', () => {
    const t = take([{ time: 0.1, midi: 72 }], {
      locks: [],
      shifts: [{ id: 's', start: 0, end: 1, direction: -1, createdAt: 0 }],
      updatedAt: 0,
    })
    expect(effectivePoints(t)[0].midi).toBe(60)
    expect(accuracy(t, notes)).toBe(100)
  })

  it('撤销全部修订后指标回到检测原值', () => {
    const t = take([{ time: 0.1, midi: 72 }], {
      locks: [],
      shifts: [{ id: 's', start: 0, end: 1, direction: -1, createdAt: 0 }],
      updatedAt: 0,
    })
    expect(accuracy(t, notes)).toBe(100)
    t.revision = emptyRevision(0)
    t.revision = undefined
    expect(accuracy(t, notes)).toBe(0)
  })
})
