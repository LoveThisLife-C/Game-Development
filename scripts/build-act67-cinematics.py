#!/usr/bin/env python3
"""Build versioned Act 6–7 cinematic MP4s from approved production stills."""

from __future__ import annotations

import math
import subprocess
import tempfile
import wave
import zlib
from pathlib import Path

import imageio_ffmpeg
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "prototype/assets/images"
MEDIA = ROOT / "prototype/assets/media"
FPS = 18
SIZE = "1280x720"
WIDTH = 1280
HEIGHT = 720
SAMPLE_RATE = 22_050


def synth_track(path: Path, duration: float, intensity: float, family: str) -> None:
    samples = int(duration * SAMPLE_RATE)
    time = np.arange(samples, dtype=np.float64) / SAMPLE_RATE
    rng = np.random.default_rng(zlib.crc32(f"{path.name}:{family}".encode()))
    signal = 0.08 * np.sin(2 * math.pi * (38 + intensity * 7) * time)
    signal += 0.025 * np.sin(2 * math.pi * 73 * time + np.sin(time * 0.7))
    noise = rng.normal(0, 1, samples)
    noise = np.convolve(noise, np.ones(220) / 220, mode="same")
    signal += noise * (0.12 + intensity * 0.07)

    if family in {"nightmare", "walk", "power", "finale"}:
        interval = max(1.1, 2.8 - intensity * 1.3)
        for impact_at in np.arange(1.2, duration, interval):
            start = int(impact_at * SAMPLE_RATE)
            length = min(samples - start, int(SAMPLE_RATE * 0.8))
            if length <= 0:
                continue
            local = np.arange(length) / SAMPLE_RATE
            impact = np.sin(2 * math.pi * (46 + intensity * 18) * local)
            impact *= np.exp(-local * (5.2 - intensity)) * (0.12 + intensity * 0.16)
            signal[start : start + length] += impact

    if family == "power":
        signal += 0.04 * np.sin(2 * math.pi * 50 * time) * np.maximum(0, 1 - time / duration)
        for tick_at in np.arange(0.7, duration - 0.4, 0.83):
            start = int(tick_at * SAMPLE_RATE)
            length = min(samples - start, int(SAMPLE_RATE * 0.045))
            signal[start : start + length] += rng.normal(0, 0.28, length) * np.linspace(1, 0, length)

    if family == "finale":
        reveal = np.clip((time - duration * 0.35) / (duration * 0.4), 0, 1)
        signal += reveal * 0.035 * np.sin(2 * math.pi * 118 * time)

    fade = np.minimum(np.clip(time / 0.45, 0, 1), np.clip((duration - time) / 0.65, 0, 1))
    pcm = np.int16(np.clip(signal * fade, -0.95, 0.95) * 32767)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())


def segment_filter(index: int, duration: float, motion: bool, grade: float) -> str:
    frames = max(1, round(duration * FPS))
    if motion:
        visual = (
            f"[{index}:v]scale=1500:844:force_original_aspect_ratio=increase,"
            f"zoompan=z='min(zoom+0.00035,1.045)':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={SIZE}:fps={FPS}"
        )
    else:
        visual = f"[{index}:v]scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,crop={WIDTH}:{HEIGHT}"
    return (
        f"{visual},eq=contrast={1.03 + grade * 0.08:.3f}:"
        f"saturation={0.82 + grade * 0.16:.3f}:brightness={-0.025 - grade * 0.018:.3f},"
        f"noise=alls={2 + grade * 5:.1f}:allf=t,format=yuv420p,"
        f"fade=t=in:st=0:d=0.35,fade=t=out:st={max(0, duration - .45):.2f}:d=0.45[v{index}]"
    )


def build_video(
    output: Path,
    images: list[Path],
    durations: list[float],
    *,
    family: str,
    intensity: float = 0.5,
    motion: list[bool] | None = None,
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    motion = motion or [True] * len(images)
    with tempfile.TemporaryDirectory(prefix="blackout-cinematic-") as temporary:
        soundtrack = Path(temporary) / "soundtrack.wav"
        synth_track(soundtrack, sum(durations), intensity, family)
        command = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error"]
        for image, duration in zip(images, durations, strict=True):
            command += ["-loop", "1", "-t", str(duration), "-i", str(image)]
        command += ["-i", str(soundtrack)]
        filters = [segment_filter(index, duration, motion[index], intensity) for index, duration in enumerate(durations)]
        labels = "".join(f"[v{index}]" for index in range(len(images)))
        if len(images) > 1:
            filters.append(f"{labels}concat=n={len(images)}:v=1:a=0[outv]")
            video_label = "[outv]"
        else:
            video_label = "[v0]"
        command += [
            "-filter_complex", ";".join(filters),
            "-map", video_label,
            "-map", f"{len(images)}:a",
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "21",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "112k",
            "-shortest",
            "-movflags", "+faststart",
            str(output),
        ]
        subprocess.run(command, check=True)
    print(f"built {output.relative_to(ROOT)} ({output.stat().st_size / 1024 / 1024:.1f} MiB)")


def image(relative: str) -> Path:
    return IMAGES / relative


def main() -> None:
    build_video(
        MEDIA / "act6/opening-legacy-hold-v1.mp4",
        [
            image("act6/production/opening-atmospheric-hold-v2.webp"),
            image("act7/production/evacuation-opening-v1.webp"),
            image("act7/production/mara-conversation-v1.webp"),
        ],
        [4, 4, 4],
        family="opening",
        intensity=0.35,
    )
    build_video(
        MEDIA / "act6/nightmare-return-v1.mp4",
        [
            image("act6/production/nightmare-skylight-v1.webp"),
            image("act6/production/nightmare-figures-v1.webp"),
            image("act6/production/nightmare-face-v1.webp"),
        ],
        [5, 5, 5],
        family="nightmare",
        intensity=0.8,
        motion=[True, False, False],
    )

    normal_walk = [
        image("act7/opening-critical-cabin-v1.webp"),
        image("act7/production/cctv-console-v1.webp"),
        image("act6/production/nightmare-return-v1.webp"),
        image("act7/production/key-hatch-apparatus-v1.webp"),
    ]
    altered = [
        image("act7/production/walk-fire-v1.webp"),
        image("act7/production/walk-monitor-v1.webp"),
        image("act7/production/walk-skylight-v1.webp"),
        image("act7/production/walk-hatch-v1.webp"),
    ]
    for ordinal in range(1, 8):
        threshold = max(0, ordinal - 2)
        frames = [altered[index] if threshold > index else normal_walk[index] for index in range(4)]
        build_video(
            MEDIA / f"act7/walk/walk-{ordinal:02d}-v1.mp4",
            frames,
            [2, 2, 2, 2],
            family="walk",
            intensity=ordinal / 7,
            motion=[True, False, True, False],
        )

    build_video(
        MEDIA / "act7/power-failure-v1.mp4",
        [image("act7/production/power-failure-v1.webp")],
        [10],
        family="power",
        intensity=0.9,
    )
    for film in range(1, 6):
        build_video(
            MEDIA / f"act7/finale/f{film:02d}-v1.mp4",
            [image(f"act7/production/ending-f{film:02d}-v1" + ".webp")],
            [12],
            family="finale",
            intensity=0.35 + film * 0.1,
        )


if __name__ == "__main__":
    main()
