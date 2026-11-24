<script setup lang="ts">
import { AudioLines, GitCompareArrows, Headphones, PenLine, Play, Square, Upload } from '@lucide/vue'
import { ref } from 'vue'
import type { GuideNote, LyricLine, Take } from '../../../shared/document'
import { clockLabel } from '../../../shared/time'
import { accuracy } from '../lib/summary'

const props = defineProps<{
  takes: Take[]; slots: (Take | undefined)[]; activeId: string | null; selected: LyricLine | null
  notes: GuideNote[]; issue: string; notice: string; editingId: string | null
}>()
const emit = defineEmits<{
  listen: [Take]; choose: [0 | 1, string]; edit: [Take]; import: [File]
}>()
const slotIndices = [0, 1] as const
const fileInput = ref<HTMLInputElement | null>(null)

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('import', file)
  input.value = ''
}
</script>

<template>
  <section class="review" aria-labelledby="review-title">
    <h2 class="rail-title" id="review-title"><Headphones :size="17" /> 练习回顾 <span class="mono">{{ takes.length }}</span></h2>
    <div class="review-line">{{ selected?.text ?? '未选择练习句' }}</div>
    <button type="button" class="legacy-import" @click="fileInput?.click()">
      <Upload :size="14" /> 导入旧盘（仅音高点也可修订）
    </button>
    <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onPick" />
    <div v-if="!takes.length" class="empty-takes"><AudioLines :size="23" /><span>本句暂无录音</span></div>
    <ol v-else class="take-list">
      <li v-for="(take, index) in takes" :key="take.id" :class="{ editing: take.id === editingId }">
        <button class="icon-button listen-button" :disabled="!take.audio"
          :aria-label="take.audio ? `${activeId === take.id ? '停止' : '播放'}录音 ${takes.length - index}` : '旧盘无音频，无法复听'"
          :title="take.audio ? '复听原声' : take.reasons?.[0] ?? '没有可复听的音频'"
          @click="emit('listen', take)">
          <Square v-if="activeId === take.id" :size="13" fill="currentColor" /><Play v-else :size="13" fill="currentColor" />
        </button>
        <div class="take-info">
          <strong>
            录音 {{ takes.length - index }}
            <em v-if="!take.audio" class="legacy-badge">旧盘</em>
            <em v-if="take.revision" class="revised-badge">已修订</em>
          </strong>
          <small class="mono">{{ clockLabel(take.start, true) }}–{{ clockLabel(take.end, true) }}</small>
        </div>
        <span class="mono take-score" title="按当前修订轨计算的参考音命中率">{{ accuracy(take, notes) ?? '—' }}<template v-if="accuracy(take, notes) !== null">%</template></span>
        <button class="icon-button edit-button" :class="{ active: take.id === editingId }" title="在音高图上修订这条录音"
          :aria-label="`修订录音 ${takes.length - index}`" @click="emit('edit', take)">
          <PenLine :size="14" />
        </button>
      </li>
    </ol>
    <div v-if="takes.length" class="compare-tools">
      <p><GitCompareArrows :size="16" /> 音高对比</p>
      <label v-for="slot in slotIndices" :key="slot"><span :class="slot === 0 ? 'slot-a' : 'slot-b'">{{ slot === 0 ? 'A' : 'B' }}</span>
        <select :aria-label="slot === 0 ? '对比录音 A' : '对比录音 B'" :value="slots[slot]?.id ?? ''"
          @change="emit('choose', slot, ($event.target as HTMLSelectElement).value)">
          <option value="">未选择</option>
          <option v-for="(take, index) in takes" :key="take.id" :value="take.id">录音 {{ takes.length - index }}</option>
        </select>
      </label>
    </div>
    <p v-if="notice" class="inline-notice" role="status">{{ notice }}</p>
    <p v-if="issue" class="inline-error" role="alert">{{ issue }}</p>
  </section>
</template>
