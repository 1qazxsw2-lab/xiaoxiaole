# -*- coding: utf-8 -*-
"""
三消游戏音效合成器（纯标准库，无需安装任何依赖）
运行：python tools/gen_audio.py
输出：assets/audio/*.wav

文件名与 AudioManager 的 Inspector 属性一一对应：
  select.wav / swap.wav / match.wav / bigMatch.wav / invalid.wav / shuffle.wav / bg.wav
"""
import math
import os
import random
import struct
import wave
import array

SR = 44100  # 采样率
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")


def midi_to_freq(m: int) -> float:
    return 440.0 * (2.0 ** ((m - 69) / 12.0))


def tone(freq, dur, amp=0.3, wtype="sine", attack=0.005, release=0.05):
    """生成单段波形，带 AD 包络。freq 可为常数或 callable(t)->Hz 用于滑音。"""
    n = int(dur * SR)
    buf = array.array("f")
    for i in range(n):
        t = i / SR
        env = 1.0
        if t < attack:
            env = t / attack
        elif t > dur - release:
            env = max(0.0, (dur - t) / release)
        f = freq(t) if callable(freq) else freq
        ph = 2 * math.pi * f * t
        if wtype == "square":
            s = 1.0 if math.sin(ph) >= 0 else -1.0
        elif wtype == "triangle":
            frac = (ph / (2 * math.pi)) % 1.0
            s = 2.0 * abs(2.0 * frac - 1.0) - 1.0
        else:
            s = math.sin(ph)
        buf.append(s * amp * env)
    return buf


def noise(dur, amp=0.4, lowpass=0.55):
    """带通感的噪声（低通平滑），包络用 sin 钟形，做出 whoosh/sweep。"""
    n = int(dur * SR)
    buf = array.array("f")
    prev = 0.0
    for i in range(n):
        t = i / SR
        env = math.sin(math.pi * (t / dur))  # 0->1->0，中间最强
        white = random.uniform(-1.0, 1.0)
        prev = prev * lowpass + white * (1.0 - lowpass)
        buf.append(prev * amp * env)
    return buf


def render(events, total_dur):
    """把多个 (start, freq, dur, amp, wtype, attack, release) 叠加进主缓冲。"""
    total = int(total_dur * SR)
    master = array.array("f", bytes(4 * total))  # 全 0
    for ev in events:
        start, freq, dur, amp, wtype, attack, release = ev
        seg = tone(freq, dur, amp, wtype, attack, release)
        off = int(start * SR)
        for i in range(len(seg)):
            if off + i < total:
                master[off + i] += seg[i]
    return master


def normalize(samples, peak_target=0.9):
    peak = max(1e-6, max(abs(s) for s in samples)) if len(samples) else 1.0
    scale = peak_target / peak
    return [s * scale for s in samples]


def write_wav(name, samples):
    path = os.path.join(OUT_DIR, name)
    scale = normalize(samples)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for s in scale:
            v = int(max(-1.0, min(1.0, s)) * 32767)
            frames += struct.pack("<h", v)
        w.writeframes(bytes(frames))
    print(f"  ✓ {name:14s} ({len(samples)/SR:.2f}s)")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("生成音效 ->", os.path.normpath(OUT_DIR))

    # 1) select：轻点，短促柔和高音 tick
    write_wav("select.wav", tone(720, 0.07, amp=0.22, wtype="sine", attack=0.002, release=0.04))

    # 2) swap：两个快速小音，模拟「嗒-嗒」交换
    sw = tone(520, 0.06, amp=0.22, attack=0.002, release=0.03)
    sw2 = tone(680, 0.06, amp=0.22, attack=0.002, release=0.03)
    buf = array.array("f", bytes(4 * int(0.16 * SR)))
    for i in range(len(sw)):
        buf[i] += sw[i]
    off = int(0.075 * SR)
    for i in range(len(sw2)):
        if off + i < len(buf):
            buf[off + i] += sw2[i]
    write_wav("swap.wav", buf)

    # 3) match：上扬小「啵」，音高从 880 滑到 440
    write_wav("match.wav",
              tone(lambda t: 880 - 440 * (t / 0.15), 0.15, amp=0.32, wtype="sine", attack=0.003, release=0.06))

    # 4) bigMatch：大消除，四音上行琶音（C-E-G-C），更华丽
    notes = [midi_to_freq(m) for m in (72, 76, 79, 84)]
    big = array.array("f", bytes(4 * int(0.5 * SR)))
    for idx, f in enumerate(notes):
        seg = tone(f, 0.16, amp=0.28, wtype="triangle", attack=0.004, release=0.08)
        off = int((0.02 + idx * 0.10) * SR)
        for i in range(len(seg)):
            if off + i < len(big):
                big[off + i] += seg[i]
    write_wav("bigMatch.wav", big)

    # 5) invalid：无效交换，低沉下行「噗」，带轻微不和谐
    write_wav("invalid.wav",
              tone(lambda t: 220 - 70 * (t / 0.25), 0.25, amp=0.30, wtype="square", attack=0.004, release=0.08))

    # 6) shuffle：洗牌，噪声 whoosh
    write_wav("shuffle.wav", noise(0.55, amp=0.35, lowpass=0.6))

    # 7) bg：8 秒可循环轻松旋律（I–V–vi–IV in C），柔和铺底 + 拨奏琶音
    pad = [
        (0.0, midi_to_freq(48), 2.0, 0.10, "sine", 0.1, 0.1),
        (2.0, midi_to_freq(43), 2.0, 0.10, "sine", 0.1, 0.1),
        (4.0, midi_to_freq(45), 2.0, 0.10, "sine", 0.1, 0.1),
        (6.0, midi_to_freq(41), 2.0, 0.10, "sine", 0.1, 0.1),
    ]
    mel = [
        (0.0, 72), (0.5, 76), (1.0, 79), (1.5, 76),
        (2.0, 79), (2.5, 83), (3.0, 81), (3.5, 79),
        (4.0, 77), (4.5, 81), (5.0, 84), (5.5, 81),
        (6.0, 77), (6.5, 81), (7.0, 79), (7.5, 76),
    ]
    events = list(pad)
    for start, m in mel:
        events.append((start, midi_to_freq(m), 0.35, 0.16, "triangle", 0.004, 0.12))
    write_wav("bg.wav", render(events, 8.0))

    print("完成。")


if __name__ == "__main__":
    main()
