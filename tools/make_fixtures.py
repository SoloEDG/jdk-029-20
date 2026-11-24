#!/usr/bin/env python3
"""生成八度修订功能的验证夹具。

输出两份数据到 fixtures/：
1. octave-jump/  合成音频（真实八度跳后紧跟倍频误判）+ 模拟检测器音高点；
2. legacy-disc/  只剩音高点的旧盘 JSON（无音频）。

脚本只依赖标准库，用 `python3 -I` 运行。
"""
import json
import math
import os
import struct
import wave

RATE = 22050
STEP = 0.1  # 与前端采样间隔对齐


def midi_to_freq(midi: float) -> float:
    return 440.0 * 2.0 ** ((midi - 69.0) / 12.0)


def synth_note(freq: float, duration: float, amplitude: float = 0.35) -> bytes:
    """带轻微颤音和淡入淡出的单音，避免边界咔哒声。"""
    count = int(duration * RATE)
    frames = bytearray()
    for n in range(count):
        t = n / RATE
        vibrato = 1.0 + 0.004 * math.sin(2 * math.pi * 5.5 * t)
        envelope = min(1.0, n / 400, (count - n) / 400)
        value = amplitude * envelope * math.sin(2 * math.pi * freq * vibrato * t)
        frames += struct.pack('<h', int(max(-1.0, min(1.0, value)) * 32767))
    return bytes(frames)


def write_wav(path: str, segments):
    with wave.open(path, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        for freq, duration in segments:
            wav.writeframes(synth_note(freq, duration))


def main() -> None:
    root = os.path.join(os.path.dirname(__file__), '..', 'fixtures')
    jump_dir = os.path.join(root, 'octave-jump')
    legacy_dir = os.path.join(root, 'legacy-disc')
    os.makedirs(jump_dir, exist_ok=True)
    os.makedirs(legacy_dir, exist_ok=True)

    # ---- 夹具 1：真实八度跳紧跟倍频误判 -------------------------------
    # 实际演唱：C4(60) 四拍 -> 真跳到 C5(72) 两拍 -> 落回 C4(60) 四拍。
    # 检测器在落回段发生倍频误判，仍输出 C5(72)，与真跳紧贴且音名相同。
    detected_midi = [60, 60, 60, 60, 72, 72, 72, 72, 72, 72]
    actual_midi = [60, 60, 60, 60, 72, 72, 60, 60, 60, 60]
    start = 2.0
    pitch = [
        {'time': round(start + i * STEP, 4), 'midi': detected}
        for i, detected in enumerate(detected_midi)
    ]
    segments = [(midi_to_freq(midi), STEP) for midi in actual_midi]
    write_wav(os.path.join(jump_dir, 'octave-jump.wav'), segments)
    with open(os.path.join(jump_dir, 'octave-jump.json'), 'w', encoding='utf-8') as handle:
        json.dump({
            'songId': 'tide',
            'lineId': 'tide-1',
            'start': start,
            'end': round(start + len(actual_midi) * STEP, 4),
            'pitch': pitch,
            'notes': '实际演唱在 0.4s 真跳到 C5，0.6s 落回 C4；检测器把落回段倍频误判为 C5。',
        }, handle, ensure_ascii=False, indent=2)

    # ---- 夹具 2：只剩音高点的旧盘 -------------------------------------
    # 没有音频字段；一段 G 音中间被倍频误判成高八度，首尾仍是正确音高。
    legacy_pitch = []
    legacy_seq = [55, 55, 67, 67, 67, 55, 55]
    for i, midi in enumerate(legacy_seq):
        legacy_pitch.append({'time': round(3.0 + i * STEP, 4), 'midi': midi})
    # 插入一个无声缺口，验证证据中断不跨段修订。
    legacy_pitch.append({'time': 3.0 + len(legacy_seq) * STEP + 0.3, 'midi': 55})
    with open(os.path.join(legacy_dir, 'legacy-disc.json'), 'w', encoding='utf-8') as handle:
        json.dump({
            'songId': 'dawn',
            'lineId': 'dawn-1',
            'start': 3.0,
            'end': legacy_pitch[-1]['time'],
            'pitch': legacy_pitch,
            'notes': '旧盘音频已缺失，只剩音高点；中段 G4(67) 是 G3(55) 的倍频误判。',
        }, handle, ensure_ascii=False, indent=2)

    print('fixtures written:', jump_dir, legacy_dir)


if __name__ == '__main__':
    main()
