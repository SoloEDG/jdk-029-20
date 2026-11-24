<script setup lang="ts">
import { AudioLines } from '@lucide/vue'
import { songs, SongCatalog, SongHeading, TransportBar } from '../features/playback'
import { LyricStage, PhraseList } from '../features/lyrics'
import { RecordControls } from '../features/capture'
import { PitchPanel } from '../features/pitch'
import { ReviewPanel } from '../features/review'
import { RevisionToolbar } from '../features/revision'
import { effectivePoints } from '../features/review/lib/summary'
import { useWorkspace } from './useWorkspace'

const {
  transport, lyrics, pitch, review, capture, graphRange, graphPosition,
  revision, editing, disputeCount,
  selectLine, adjacent, selectSong, seek, toggleLoop, togglePlay, toggleRecording, listen,
  startEdit, onCanvasPress, onCanvasDrag, onCanvasRelease,
} = useWorkspace()
</script>

<template>
  <header class="app-header">
    <div class="app-header-inner">
      <span class="brand-mark"><AudioLines :size="22" :stroke-width="2.1" /></span>
      <div class="brand-name"><strong>夜航练习室</strong><span>NIGHT SESSION</span></div>
    </div>
  </header>
  <main class="workspace">
    <aside class="left-rail">
      <SongCatalog :songs="songs" :current="transport.song.value" @select="selectSong" />
      <PhraseList :lines="transport.song.value.lines" :selected="lyrics.selected.value" :active="lyrics.active.value" @select="selectLine" />
    </aside>
    <div class="workbench">
      <SongHeading :song="transport.song.value" />
      <LyricStage :selected="lyrics.selected.value" :active="lyrics.active.value" :upcoming="lyrics.upcoming.value"
        :playing="transport.isPlaying.value" :progress="lyrics.lineProgress.value" />
      <RevisionToolbar :take="editing" :mode="revision.mode.value" :pending="revision.pendingRange.value !== null"
        :dispute-count="disputeCount" :lock-count="editing?.revision?.locks.length ?? 0"
        :shift-count="editing?.revision?.shifts.length ?? 0"
        @mode="revision.mode.value = $event"
        @undo="editing && review.undoRevision(editing.id)"
        @clear="editing && review.clearRevision(editing.id)" />
      <PitchPanel :notes="transport.song.value.notes" :position="graphPosition" :range="graphRange"
        :latest="capture.status.value === 'recording' ? pitch.latest.value : null"
        :live="capture.status.value === 'recording' ? pitch.points.value : []"
        :take-a="review.slots.value[0] ? effectivePoints(review.slots.value[0]) : []"
        :take-b="review.slots.value[1] ? effectivePoints(review.slots.value[1]) : []"
        :editing="editing" :mode="revision.mode.value" :pending-range="revision.pendingRange.value"
        @press="onCanvasPress" @drag="onCanvasDrag" @release="onCanvasRelease" />
      <TransportBar :song="transport.song.value" :position="transport.position.value" :playing="transport.isPlaying.value"
        :loop="transport.loop.value" :volume="transport.volume.value" :issue="transport.issue.value"
        @toggle="togglePlay" @previous="adjacent(-1)" @next="adjacent(1)" @loop="toggleLoop"
        @seek="seek" @volume="transport.setVolume" />
      <RecordControls :status="capture.status.value" :issue="capture.issue.value" :level="capture.level.value"
        :selected="lyrics.selected.value" @toggle="toggleRecording" />
    </div>
    <aside class="right-rail">
      <ReviewPanel :takes="review.visible.value" :slots="review.slots.value" :active-id="review.playingId.value"
        :selected="lyrics.selected.value" :notes="transport.song.value.notes" :issue="review.issue.value"
        :notice="review.notice.value" :editing-id="review.editingId.value"
        @listen="listen" @choose="review.choose" @edit="startEdit" @import="review.importLegacy" />
    </aside>
  </main>
</template>
