#!/usr/bin/env python3
"""Turn before/after captures into reviewer-ready evidence (pr-evidence skill).

Subcommands:
  pair   --before DIR --after DIR --out DIR [--before-label TXT] [--after-label TXT]
         Side-by-side PNG per shot, changed region boxed, plus summary.json.
  reel   --pairs DIR --out FILE.webp [--max-frames 6]
         Animated WebP that flips before/after for the shots that changed.
  video  IN.webm OUT.mp4 [--trim-start SECONDS]
         Transcode a capture video to H.264 MP4 (needs ffmpeg).
  sheet  IN.mp4 OUT.png
         Contact sheet of one frame per second, to check a video without watching it.

Needs Pillow only (and ffmpeg for video/sheet). DIRs are capture.mjs output folders.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

# Paper & Pine (docs/design-aesthetic.md): paper, pine for chrome, ember for what changed.
PAPER = (250, 248, 243)
PINE = (27, 67, 50)
EMBER = (242, 101, 34)
INK = (28, 28, 26)
MUTED = (110, 110, 100)
RULE = (226, 222, 210)

FONT_CANDIDATES = {
    "bold": [
        "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
    ],
    "regular": [
        "/usr/share/fonts/opentype/inter/Inter-Regular.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial.ttf",
    ],
}

# Each side of a pair is scaled to this width so desktop and mobile pairs read alike.
SIDE_WIDTH = {"desktop": 720, "mobile": 390}
MAX_SIDE_HEIGHT = 2400  # longer full-page shots are scaled down to fit
GAP = 24
PAD = 20


def font(weight: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES[weight]:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def load_manifest(folder: Path) -> dict:
    path = folder / "manifest.json"
    if not path.exists():
        sys.exit(f"no manifest.json in {folder}")
    return json.loads(path.read_text())


def shot_key(shot: dict) -> str:
    return f"{shot['viewport']}/{shot['flow']}--{shot['shot']}"


def changed_box(before: Image.Image, after: Image.Image) -> tuple[int, int, int, int] | None:
    """Bounding box of pixels that differ, or None when identical. Sizes must match."""
    diff = ImageChops.difference(before.convert("RGB"), after.convert("RGB"))
    # Ignore anti-aliasing noise: only count channels that moved by more than 16.
    mask = diff.convert("L").point(lambda v: 255 if v > 16 else 0)
    return mask.getbbox()


def fit(img: Image.Image, width: int) -> tuple[Image.Image, float]:
    scale = width / img.width
    if img.height * scale > MAX_SIDE_HEIGHT:
        scale = MAX_SIDE_HEIGHT / img.height
    size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    return img.resize(size, Image.LANCZOS), scale


def boxed(img: Image.Image, box, scale: float) -> Image.Image:
    if not box:
        return img
    out = img.copy()
    x0, y0, x1, y1 = (round(v * scale) for v in box)
    pad = 6
    ImageDraw.Draw(out).rounded_rectangle(
        (
            max(0, x0 - pad),
            max(0, y0 - pad),
            min(out.width - 1, x1 + pad),
            min(out.height - 1, y1 + pad),
        ),
        radius=8,
        outline=EMBER,
        width=3,
    )
    return out


def placeholder(width: int, height: int, text: str) -> Image.Image:
    img = Image.new("RGB", (width, height), PAPER)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, width - 1, height - 1), radius=12, outline=RULE, width=2)
    f = font("regular", 18)
    w = d.textlength(text, font=f)
    d.text(((width - w) / 2, height / 2 - 10), text, fill=MUTED, font=f)
    return img


def chip(d: ImageDraw.ImageDraw, x: float, y: float, text: str, color) -> float:
    f = font("bold", 14)
    w = d.textlength(text, font=f)
    d.rounded_rectangle((x, y, x + w + 20, y + 26), radius=13, fill=color)
    d.text((x + 10, y + 5), text, fill=(255, 255, 255), font=f)
    return x + w + 28


def compose_pair(
    shot: dict, before: Image.Image | None, after: Image.Image | None, labels
) -> tuple[Image.Image, str]:
    width = SIDE_WIDTH.get(shot["viewport"], 720)
    box = None
    status = "changed"
    if before is not None and after is not None:
        if before.size == after.size:
            box = changed_box(before, after)
            status = "changed" if box else "unchanged"
        else:
            status = "resized"
    elif after is None:
        status = "removed"
    else:
        status = "new"

    sides = []
    for img in (before, after):
        if img is None:
            sides.append(None)
            continue
        scaled, scale = fit(img, width)
        sides.append(boxed(scaled, box, scale))
    height = max(s.height for s in sides if s is not None)
    sides = [
        s if s is not None else placeholder(width, min(height, 480), "Not on this side")
        for s in sides
    ]
    height = max(s.height for s in sides)

    header = 92
    canvas = Image.new("RGB", (PAD * 2 + width * 2 + GAP, header + height + PAD), PAPER)
    d = ImageDraw.Draw(canvas)
    d.rectangle((0, 0, canvas.width, 44), fill=PINE)
    d.text(
        (PAD, 11),
        f"{shot['flowTitle']} · {shot['viewport']}",
        fill=(255, 255, 255),
        font=font("bold", 18),
    )
    status_text = {
        "changed": "CHANGED",
        "unchanged": "NO VISIBLE CHANGE",
        "resized": "CHANGED SIZE",
        "new": "NEW",
        "removed": "REMOVED",
    }[status]
    f = font("bold", 14)
    sw = d.textlength(status_text, font=f) + 20
    chip(d, canvas.width - PAD - sw, 9, status_text, EMBER if status != "unchanged" else MUTED)
    d.text((PAD, 52), shot["caption"], fill=INK, font=font("regular", 16))
    for i, (img, label) in enumerate(zip(sides, labels, strict=True)):
        x = PAD + i * (width + GAP)
        d.text((x, 72), label, fill=MUTED, font=font("bold", 13))
        canvas.paste(img, (x, header))
    return canvas, status


def cmd_pair(args) -> None:
    before_dir, after_dir, out = Path(args.before), Path(args.after), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    before = {shot_key(s): s for s in load_manifest(before_dir)["shots"]}
    after_manifest = load_manifest(after_dir)
    after = {shot_key(s): s for s in after_manifest["shots"]}
    labels = (args.before_label, args.after_label)
    results = []
    for key in list(dict.fromkeys([*after, *before])):
        shot = after.get(key) or before[key]
        b = Image.open(before_dir / before[key]["file"]) if key in before else None
        a = Image.open(after_dir / after[key]["file"]) if key in after else None
        canvas, status = compose_pair(shot, b, a, labels)
        name = key.replace("/", "--") + ".png"
        canvas.save(out / name, optimize=True)
        results.append({**shot, "pair": name, "status": status})
        print(f"{status:>10}  {name}")
    summary = {
        "labels": labels,
        "pairs": results,
        "failures": after_manifest.get("failures", []),
        "videos": after_manifest.get("videos", []),
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2))


def frame(img: Image.Image, label: str, caption: str, color, size: tuple[int, int]) -> Image.Image:
    scaled, _ = fit(img, size[0] - 2 * PAD)
    if scaled.height > size[1] - 72:
        ratio = (size[1] - 72) / scaled.height
        scaled = scaled.resize((max(1, round(scaled.width * ratio)), size[1] - 72), Image.LANCZOS)
    canvas = Image.new("RGB", size, PAPER)
    d = ImageDraw.Draw(canvas)
    x = chip(d, PAD, 16, label, color)
    d.text((x, 19), caption, fill=INK, font=font("regular", 16))
    canvas.paste(scaled, ((size[0] - scaled.width) // 2, 56))
    return canvas


def cmd_reel(args) -> None:
    pairs = Path(args.pairs)
    summary = json.loads((pairs / "summary.json").read_text())
    before_label, after_label = summary["labels"]
    picked = [p for p in summary["pairs"] if p["status"] in ("changed", "resized", "new")]
    # Prefer cropped or first-screen shots: whole-page frames are unreadable at reel size.
    picked.sort(key=lambda p: (p["shot"] in ("full", "page"), p["viewport"] != "desktop"))
    picked = picked[: args.max_frames // 2 or 1]
    if not picked:
        print("nothing changed visibly; no reel written")
        return
    root = pairs.parent
    frames, durations = [], []
    size = (960, 720)
    for p in picked:
        for side, label, color in (("before", "BEFORE", MUTED), ("after", "AFTER", EMBER)):
            src = root / side / p["file"]
            if not src.exists():
                continue
            frames.append(
                frame(Image.open(src), label, f"{p['flowTitle']}: {p['caption']}", color, size)
            )
            durations.append(1800 if side == "after" else 1400)
    frames[0].save(
        args.out,
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        quality=82,
        method=6,
    )
    print(f"reel: {args.out} ({len(frames)} frames)")


def need_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if not exe:
        sys.exit("ffmpeg not found: keep the WebM and say so in the evidence section")
    return exe


def cmd_video(args) -> None:
    cmd = [need_ffmpeg(), "-y", "-i", args.input]
    if args.trim_start:
        cmd += ["-ss", str(args.trim_start)]  # output seeking: frame-accurate on screencast WebM
    cmd += [
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "26",
        "-preset",
        "slow",
        "-movflags",
        "+faststart",
    ]
    cmd += ["-an", args.output]
    subprocess.run(cmd, check=True, capture_output=True)
    print(f"video: {args.output} ({Path(args.output).stat().st_size // 1024} KB)")


def cmd_sheet(args) -> None:
    cmd = [
        need_ffmpeg(),
        "-y",
        "-i",
        args.input,
        "-vf",
        "fps=1,scale=420:-1,tile=5x3",
        "-frames:v",
        "1",
    ]
    subprocess.run([*cmd, args.output], check=True, capture_output=True)
    print(f"sheet: {args.output}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pair")
    p.add_argument("--before", required=True)
    p.add_argument("--after", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--before-label", default="BEFORE")
    p.add_argument("--after-label", default="AFTER")
    p.set_defaults(func=cmd_pair)
    r = sub.add_parser("reel")
    r.add_argument("--pairs", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--max-frames", type=int, default=6)
    r.set_defaults(func=cmd_reel)
    v = sub.add_parser("video")
    v.add_argument("input")
    v.add_argument("output")
    v.add_argument("--trim-start", type=float, default=0)
    v.set_defaults(func=cmd_video)
    s = sub.add_parser("sheet")
    s.add_argument("input")
    s.add_argument("output")
    s.set_defaults(func=cmd_sheet)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
