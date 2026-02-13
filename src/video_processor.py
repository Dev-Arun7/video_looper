#!/usr/bin/env python3
import os
import sys
import json
import math
import shlex
import random
import tempfile
import subprocess
from pathlib import Path

# =========================
# Progress reporting helper
# =========================
def report_progress(stage, percent, message=""):
    """
    Output progress in JSON format for Electron to parse
    Stage 1 = creating video, Stage 2 = optimizing
    """
    progress_data = {
        "stage": stage,
        "percent": percent,
        "message": message
    }
    # Print to stdout as JSON (Electron will read this)
    print(f"PROGRESS:{json.dumps(progress_data)}", flush=True)

# =========================
# Helpers
# =========================
def require_cmd(cmd: str) -> None:
    """Ensure a command exists in PATH."""
    if subprocess.call(["bash", "-lc", f"command -v {shlex.quote(cmd)} >/dev/null 2>&1"]) != 0:
        print(f"ERROR: '{cmd}' not found in PATH. Install it and try again.", file=sys.stderr)
        sys.exit(1)

def ffprobe_duration_seconds(src: str) -> float:
    """Return duration (seconds) using ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        src
    ]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffprobe failed:\n{p.stderr.strip()}")
    val = p.stdout.strip()
    try:
        return float(val)
    except ValueError:
        raise RuntimeError(f"Could not parse duration from ffprobe output: {val!r}")

def ffprobe_resolution(src: str) -> tuple:
    """Return (width, height) using ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        src
    ]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffprobe resolution check failed:\n{p.stderr.strip()}")
    try:
        w, h = p.stdout.strip().split(',')
        return (int(w), int(h))
    except:
        raise RuntimeError(f"Could not parse resolution: {p.stdout.strip()}")

def hms(seconds: float) -> str:
    """Convert seconds to HH:MM:SS.SS format."""
    seconds = max(0, float(seconds))
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:05.2f}"

def build_concat_list_file(sources: list, repeats: int, list_path: str, randomize: bool = False) -> None:
    """
    Build an ffmpeg concat demuxer list file.
    sources: list of absolute file paths
    repeats: how many times to repeat the entire sequence
    randomize: if True, shuffle order each loop
    """
    with open(list_path, "w", encoding="utf-8") as f:
        for _ in range(repeats):
            # If randomize, shuffle the list each iteration
            if randomize:
                files_order = sources.copy()
                random.shuffle(files_order)
            else:
                # Alphabetical order (sources are already sorted)
                files_order = sources
            
            for src in files_order:
                f.write(f"file '{src}'\n")

def run_ffmpeg_stage1(cmd, target_seconds: float) -> int:
    """
    Run ffmpeg and report progress for Stage 1 (creating video).
    """
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True
    )

    last_pct = -1.0
    try:
        for line in proc.stdout:
            line = line.strip()
            # Parse ffmpeg progress output
            if line.startswith("out_time_ms="):
                try:
                    out_ms = int(line.split("=", 1)[1])
                    out_sec = out_ms / 1_000_000.0
                    pct = min(100.0, (out_sec / target_seconds) * 100.0) if target_seconds > 0 else 100.0

                    # Report progress to Electron
                    if pct - last_pct >= 0.5 or pct >= 100.0:
                        last_pct = pct
                        report_progress(1, pct, f"{hms(out_sec)} / {hms(target_seconds)}")
                except Exception:
                    pass

        rc = proc.wait()
        return rc
    finally:
        if proc.stdout:
            proc.stdout.close()

def get_available_disk_space(path: str) -> int:
    """Return available disk space in bytes for the given path."""
    stat = os.statvfs(os.path.dirname(path))
    # Available space = fragment size * available fragments
    return stat.f_bavail * stat.f_frsize

def estimate_output_size(source_files: list, target_seconds: float) -> int:
    """
    Estimate output file size based on source files' bitrate.
    Returns estimated size in bytes.
    """
    total_size = 0
    total_duration = 0.0
    
    for src in source_files:
        # Get file size
        total_size += os.path.getsize(src)
        # Get duration
        total_duration += ffprobe_duration_seconds(src)
    
    if total_duration <= 0:
        raise RuntimeError("Invalid total duration")
    
    # Calculate average bitrate (bytes per second)
    avg_bitrate = total_size / total_duration
    
    # Estimate output size
    estimated_size = int(avg_bitrate * target_seconds)
    
    # Add 15% buffer for overhead
    return int(estimated_size * 1.15)

# =========================
# Main
# =========================
def main():
    # Check for ffmpeg and ffprobe
    require_cmd("ffmpeg")
    require_cmd("ffprobe")

    # Parse command-line arguments from Electron
    # Expected format: python video_processor.py <files_json> <hours> <randomize> <output_path>
    if len(sys.argv) < 5:
        print("Usage: video_processor.py <files_json> <hours> <randomize> <output_path>", file=sys.stderr)
        sys.exit(1)

    files_json = sys.argv[1]  # JSON array of file paths
    target_hours = float(sys.argv[2])
    randomize = sys.argv[3].lower() == 'true'
    output_path = sys.argv[4]

    # Parse file list
    try:
        source_files = json.loads(files_json)
    except:
        print("ERROR: Invalid files JSON", file=sys.stderr)
        sys.exit(1)

    # Validate files exist
    for f in source_files:
        if not os.path.isfile(f):
            print(f"ERROR: File not found: {f}", file=sys.stderr)
            sys.exit(1)

    # Sort files alphabetically (if not randomizing, this is the base order)
    source_files_abs = [str(Path(f).resolve()) for f in sorted(source_files)]

    # Check if multiple files have different resolutions
    if len(source_files_abs) > 1:
        resolutions = [ffprobe_resolution(f) for f in source_files_abs]
        if len(set(resolutions)) > 1:
            # Different resolutions detected - would need re-encoding
            print("ERROR: Videos have different resolutions. Re-encoding not yet implemented.", file=sys.stderr)
            print(f"Resolutions found: {resolutions}", file=sys.stderr)
            sys.exit(1)

    # Calculate total duration of all source files
    total_source_duration = sum(ffprobe_duration_seconds(f) for f in source_files_abs)
    
    if total_source_duration <= 0:
        print("ERROR: Source duration is invalid.", file=sys.stderr)
        sys.exit(1)

    # Calculate how many loops needed
    target_seconds = target_hours * 3600.0
    repeats = int(math.ceil(target_seconds / total_source_duration))

    # Estimate output file size using accurate method
    print("INFO: Estimating output size...", file=sys.stderr)
    estimated_size = estimate_output_size(source_files_abs, target_seconds)
    estimated_size_gb = estimated_size / (1024**3)

    # Check available disk space
    available_space = get_available_disk_space(output_path)
    available_space_gb = available_space / (1024**3)

    print(f"INFO: Estimated output size: {estimated_size_gb:.2f} GB", file=sys.stderr)
    print(f"INFO: Available disk space: {available_space_gb:.2f} GB", file=sys.stderr)

    # DEBUG output
    print(f"DEBUG: estimated_size = {estimated_size} bytes", file=sys.stderr)
    print(f"DEBUG: available_space = {available_space} bytes", file=sys.stderr)
    print(f"DEBUG: Need {estimated_size + 1024**3} bytes (with 1GB buffer)", file=sys.stderr)

    # Check if enough space (need estimated size + 1GB buffer)
    if available_space < (estimated_size + 1024**3):
        print(f"ERROR: Insufficient disk space!", file=sys.stderr)
        print(f"ERROR: Need {estimated_size_gb + 1:.2f} GB, but only {available_space_gb:.2f} GB available", file=sys.stderr)
        print(f"ERROR: Please free up space or choose different output location", file=sys.stderr)
        sys.exit(1)

    # Report initial info
    print(f"INFO: Processing {len(source_files_abs)} file(s)", file=sys.stderr)
    print(f"INFO: Target duration: {hms(target_seconds)}", file=sys.stderr)
    print(f"INFO: Loops needed: {repeats}", file=sys.stderr)
    print(f"INFO: Randomize: {randomize}", file=sys.stderr)
    print(f"INFO: Output: {output_path}", file=sys.stderr)

    # Create concat list file
    with tempfile.TemporaryDirectory() as td:
        list_file = os.path.join(td, "concat_list.txt")
        build_concat_list_file(source_files_abs, repeats, list_file, randomize)

        # Start Stage 1: Creating video
        report_progress(1, 0, "Starting...")

        # ffmpeg command
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-f", "concat",
            "-safe", "0",
            "-i", list_file,
            "-t", str(target_seconds),
            "-c", "copy",
            "-movflags", "+faststart",
            "-y",
            "-progress", "pipe:1",
            output_path
        ]

        # Run Stage 1 with progress tracking
        rc = run_ffmpeg_stage1(cmd, target_seconds)
        
        if rc != 0:
            print("ERROR: ffmpeg failed.", file=sys.stderr)
            sys.exit(rc)

        # Stage 1 complete
        report_progress(1, 100, "Complete")

        # Stage 2: The faststart process happens DURING the ffmpeg call
        # So we just report it's done
        report_progress(2, 0, "Finalizing...")

        # Small delay to show stage 2 started
        import time
        time.sleep(0.1)

        # Check if file was created successfully
        if not os.path.exists(output_path):
            print("ERROR: Output file was not created", file=sys.stderr)
            sys.exit(1)

        actual_size = os.path.getsize(output_path)
        report_progress(2, 100, f"Complete - {actual_size / (1024**3):.2f} GB")


    # Final success message
    print(f"SUCCESS: Output saved to {output_path}", file=sys.stderr)
    report_progress(2, 100, "Complete")

if __name__ == "__main__":
    main()