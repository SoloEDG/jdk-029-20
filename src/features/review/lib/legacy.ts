import type { LyricLine, PitchPoint, Song, Take } from '../../../shared/document'

/** 旧盘数据：只剩音高点可读，音频可能已经缺失。 */
export interface LegacyRecord {
  songId?: string
  lineId?: string
  start?: number
  end?: number
  createdAt?: number
  pitch?: PitchPoint[]
  audio?: string
}

function decodeAudio(dataUrl: string): Blob {
  const [head, base64] = dataUrl.split(',')
  const mime = /data:(.*?);base64/.exec(head)?.[1] ?? 'audio/wav'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mime })
}

/**
 * 解析旧盘 JSON，宽容缺字段；没有音频时显式标注，界面禁止复听但保留修订能力。
 * 缺省的歌曲 / 练习句归入当前选中上下文，确保导入后立即可见、可修订。
 */
export function parseLegacyTake(raw: string, context: { song: Song; line: LyricLine | null }): Take {
  const record = JSON.parse(raw) as LegacyRecord
  if (!Array.isArray(record.pitch)) throw new Error('旧盘里没有音高点。')
  const pitch: PitchPoint[] = record.pitch
    .filter(point => point && typeof point.time === 'number')
    .map(point => ({ time: point.time, midi: typeof point.midi === 'number' ? point.midi : null }))
    .sort((a, b) => a.time - b.time)
  if (!pitch.length) throw new Error('旧盘里没有可读的音高点。')
  const start = record.start ?? pitch[0].time
  const end = record.end ?? Math.max(start, pitch.at(-1)!.time)
  const reasons: string[] = []
  let audio: Blob | undefined
  if (record.audio) {
    try {
      audio = decodeAudio(record.audio)
    } catch {
      reasons.push('内嵌音频无法解码，仅保留音高点。')
    }
  } else {
    reasons.push('旧盘没有音频，只能依据音高点修订。')
  }
  return {
    id: crypto.randomUUID(),
    songId: record.songId ?? context.song.id,
    lineId: record.lineId ?? context.line?.id ?? context.song.lines[0]?.id ?? 'legacy',
    createdAt: record.createdAt ?? Date.now(),
    start,
    end,
    audio,
    pitch,
    reasons,
  }
}
