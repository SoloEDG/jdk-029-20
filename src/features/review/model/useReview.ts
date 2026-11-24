import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import type { LyricLine, PitchRevision, Song, Take } from '../../../shared/document'
import { readTakes, writeTake } from '../lib/archive'
import { parseLegacyTake } from '../lib/legacy'
import { revisePitch } from '../../revision/lib/engine'
import { withoutLatest, withLock, withShift } from '../../revision/lib/marks'

export function useReview(song: Ref<Song>, line: Ref<LyricLine | null>, beforeListen: () => void) {
  const takes = shallowRef<Take[]>([])
  const ids = ref<[string | null, string | null]>([null, null])
  const playingId = ref<string | null>(null)
  const position = ref<number | null>(null)
  const issue = ref('')
  const notice = ref('')
  const editingId = ref<string | null>(null)
  const player = new Audio()
  let source: string | null = null
  let current: Take | undefined
  let frame = 0
  const visible = computed(() => takes.value.filter(take => take.songId === song.value.id && take.lineId === line.value?.id))
  const slots = computed(() => ids.value.map(id => visible.value.find(take => take.id === id)))
  const editing = computed(() => visible.value.find(take => take.id === editingId.value) ?? null)

  function stop() {
    player.pause()
    cancelAnimationFrame(frame)
    if (source) {
      player.removeAttribute('src')
      player.load()
      URL.revokeObjectURL(source)
      source = null
    }
    current = undefined
    playingId.value = null
    position.value = null
  }

  function tick() {
    if (!current || player.paused) return
    position.value = Math.min(current.end, current.start + player.currentTime)
    frame = requestAnimationFrame(tick)
  }

  async function listen(take: Take) {
    // 旧盘无音频时不再切换播放状态，只提示证据缺失。
    if (!take.audio) {
      notice.value = '这条旧盘只剩音高点，没有可复听的原声。'
      return
    }
    const replay = playingId.value !== take.id
    stop()
    if (!replay) return
    beforeListen()
    issue.value = ''
    notice.value = ''
    current = take
    playingId.value = take.id
    position.value = take.start
    source = URL.createObjectURL(take.audio)
    const ownUrl = source
    player.src = source
    try {
      await player.play()
      if (source === ownUrl) tick()
    } catch {
      if (source !== ownUrl) return
      stop()
      issue.value = '无法播放这条录音。'
    }
  }

  function choose(slot: 0 | 1, id: string) {
    const next = [...ids.value] as typeof ids.value
    const peer = slot === 0 ? 1 : 0
    if (id && next[peer] === id) next[peer] = null
    next[slot] = id || null
    ids.value = next
  }

  function startEditing(take: Take) {
    editingId.value = take.id
    notice.value = take.audio ? '' : '旧盘无原声，只能依据音高点修订。'
  }

  function persist(next: Take) {
    const index = takes.value.findIndex(item => item.id === next.id)
    const list = [...takes.value]
    if (index >= 0) list[index] = next
    else list.unshift(next)
    takes.value = list
    void writeTake(next)
  }

  function addLock(takeId: string, lock: Parameters<typeof withLock>[1]) {
    const take = takes.value.find(item => item.id === takeId)
    if (!take) return
    const revision = withLock(take.revision, lock)
    persist({ ...take, revision })
    syncNotice(take.pitch, revision)
  }

  function addShift(takeId: string, shift: Parameters<typeof withShift>[1]) {
    const take = takes.value.find(item => item.id === takeId)
    if (!take) return
    const revision = withShift(take.revision, shift)
    persist({ ...take, revision })
    syncNotice(take.pitch, revision)
  }

  function syncNotice(pitch: Take['pitch'], revision: PitchRevision) {
    const result = revisePitch(pitch, revision)
    notice.value = result.disputes.length
      ? `有 ${result.disputes.length} 处标记在同一证据段内互相冲突，已保留确认内容并标出争议。`
      : '修订已应用，指标按修订轨重算。'
  }

  /** 撤销最近一次修订；标记清空后指标自动回到检测原值。 */
  function undoRevision(takeId: string) {
    const take = takes.value.find(item => item.id === takeId)
    if (!take || !take.revision) return
    const next = withoutLatest(take.revision)
    persist({ ...take, revision: next })
    notice.value = next ? '已撤销最近一处修订。' : '已撤销全部修订，指标恢复为检测原值。'
  }

  function clearRevision(takeId: string) {
    const take = takes.value.find(item => item.id === takeId)
    if (!take) return
    persist({ ...take, revision: undefined })
    notice.value = '已撤销全部修订，指标恢复为检测原值。'
  }

  async function importLegacy(file: File) {
    try {
      const take = parseLegacyTake(await file.text(), { song: song.value, line: line.value })
      await writeTake(take)
      takes.value = [take, ...takes.value.filter(item => item.id !== take.id)]
      startEditing(take)
      notice.value = take.reasons?.[0] ?? '旧盘已导入。'
    } catch (error) {
      issue.value = error instanceof Error ? error.message : '旧盘无法解析。'
    }
  }

  watch([() => song.value.id, () => line.value?.id], () => { stop(); ids.value = [null, null]; editingId.value = null })

  async function save(take: Take) {
    await writeTake(take)
    takes.value = [take, ...takes.value.filter(item => item.id !== take.id)]
    if (visible.value.some(item => item.id === take.id)) {
      if (!ids.value[0]) choose(0, take.id)
      else if (!ids.value[1]) choose(1, take.id)
    }
  }

  onMounted(async () => {
    try {
      const stored = await readTakes()
      const known = new Set(takes.value.map(take => take.id))
      takes.value = [...takes.value, ...stored.filter(take => !known.has(take.id))].sort((a, b) => b.createdAt - a.createdAt)
    } catch {
      issue.value = '无法读取本机练习记录。'
    }
  })
  player.addEventListener('ended', stop)
  onBeforeUnmount(() => { player.removeEventListener('ended', stop); stop() })
  return {
    visible, slots, playingId, position, issue, notice, editing, editingId,
    save, choose, listen, stop, startEditing, addLock, addShift,
    undoRevision, clearRevision, importLegacy,
  }
}
