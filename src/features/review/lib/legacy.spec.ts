import { describe, expect, it } from 'vitest'
import type { LyricLine, Song } from '../../../shared/document'
import { parseLegacyTake } from './legacy'

const song: Song = {
  id: 'tide', title: 't', artist: 'a', bpm: 90, key: 'C', duration: 10,
  audio: '', cover: '',
  lines: [{ id: 'tide-1', text: '句', start: 0, end: 4 }] as LyricLine[],
  notes: [],
}
const line = song.lines[0]

describe('parseLegacyTake', () => {
  it('只有音高点、没有音频时也能解析，并标注原因', () => {
    const raw = JSON.stringify({
      songId: 'tide', lineId: 'tide-1', start: 2, end: 4,
      pitch: [{ time: 2.1, midi: 60 }, { time: 2.2, midi: null }, { time: 2.3, midi: 62 }],
    })
    const take = parseLegacyTake(raw, { song, line })
    expect(take.audio).toBeUndefined()
    expect(take.pitch).toHaveLength(3)
    expect(take.reasons?.length).toBeGreaterThan(0)
    expect(take.songId).toBe('tide')
  })

  it('拒绝没有音高点的旧盘', () => {
    expect(() => parseLegacyTake(JSON.stringify({ pitch: [] }), { song, line })).toThrow()
  })

  it('宽容缺失的归属与起止时间，归入当前歌曲句子并用音高点补齐时间', () => {
    const take = parseLegacyTake(JSON.stringify({ pitch: [{ time: 1, midi: 60 }, { time: 2, midi: 60 }] }), { song, line })
    expect(take.songId).toBe('tide')
    expect(take.lineId).toBe('tide-1')
    expect(take.start).toBe(1)
    expect(take.end).toBe(2)
  })
})
