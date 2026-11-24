export interface TimeRange { start: number; end: number }

export interface LyricLine extends TimeRange {
  id: string
  text: string
}

export interface GuideNote extends TimeRange { midi: number }

export interface Song {
  id: string
  title: string
  artist: string
  bpm: number
  key: string
  duration: number
  audio: string
  cover: string
  lines: LyricLine[]
  notes: GuideNote[]
}

export interface PitchPoint {
  time: number
  midi: number | null
}

/** 人工确认：该音高点确实是实际演唱的大跳（或实际音高），传播时以此为锚点。 */
export interface PitchLock {
  id: string
  time: number
  midi: number
  createdAt: number
}

/** 人工标注：[start, end] 内疑似倍频折返，应整体移动 direction * 12 个半音。 */
export interface PitchShift extends TimeRange {
  id: string
  direction: -1 | 1
  createdAt: number
}

/** 同一证据段内无法同时满足的锁点 / 移位，记录争议位置，已确认内容仍保留。 */
export interface PitchDispute {
  time: number
  kind: 'lock' | 'shift'
  message: string
}

/** 有声证据在哪个无声缺口中断。 */
export interface EvidenceGap {
  start: number
  end: number
}

export interface PitchRevision {
  locks: PitchLock[]
  shifts: PitchShift[]
  /** 每次修订的时间戳，撤销与指标回退依赖它。 */
  updatedAt: number
}

export interface Take extends TimeRange {
  id: string
  songId: string
  lineId: string
  createdAt: number
  /** 旧盘导入时没有可复听的音频，只有音高点可读。 */
  audio?: Blob
  pitch: PitchPoint[]
  revision?: PitchRevision
  /** 无音频等受限原因，用于界面提示。 */
  reasons?: string[]
}

export interface PcmFrame {
  inputTime: number
  samples: Float32Array
}
