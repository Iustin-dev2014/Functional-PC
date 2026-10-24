#!/usr/bin/env python3
"""Create and safely restore a user-home snapshot for the temporary Ubuntu VM."""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath

VERSION = 1
ROOT = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
SAVE_DIR = ROOT / "ubuntu saves"
HOME = Path.home()
MAX_UNPACKED = 5 * 1024 * 1024 * 1024
EXCLUDED_PATHS = {
    ".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker",
    ".local/share/keyrings", ".local/share/Trash", ".config/gh",
    ".cargo/registry", ".gradle/caches", ".mozilla",
    ".config/google-chrome", ".config/chromium",
    ".config/Code/Cache", ".config/Code/CachedData",
    ".config/Code/Service Worker/CacheStorage",
}
EXCLUDED_DIR_NAMES = {
    ".cache", ".npm", ".rustup", ".thumbnails",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox",
    "__pycache__", "node_modules", ".venv", "venv", ".next", ".turbo",
}
PACKAGE_RE = re.compile(r"^[a-z0-9][a-z0-9+.-]*$")

def safe_member(name):
    p = PurePosixPath(name)
    return not p.is_absolute() and ".." not in p.parts and bool(p.parts)

def excluded(rel):
    parts = rel.parts
    value = rel.as_posix()
    # Exclude sensitive/root-level paths and regenerable folders anywhere in HOME.
    if any(value == item or value.startswith(item + "/") for item in EXCLUDED_PATHS):
        return True
    return any(part in EXCLUDED_DIR_NAMES for part in parts)

def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()

def save():
    """Write a directory of small, custom-encoded chunks instead of a nested ZIP."""
    import zlib

    out_dir = ROOT / "ubuntu-session-save"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    payload_dir = out_dir / "payload"
    payload_dir.mkdir(parents=True, exist_ok=True)

    # Fast format: zlib level 1 runs in optimized native code. Avoid Python-level
    # per-byte XOR, which was expensive for large snapshots. This is not encryption.
    magic = b"ICCTV2D"
    chunk_bytes = 4 * 1024 * 1024
    next_chunk = 0
    entries = {}

    def encode_bytes(data):
        return zlib.compress(data, level=1)

    def write_chunk(part, chunk_names):
        nonlocal next_chunk
        chunk_name = f"payload/part-{next_chunk:08d}.dat"
        (out_dir / chunk_name).write_bytes(magic + encode_bytes(part))
        chunk_names.append(chunk_name)
        next_chunk += 1

    def store_logical_file(logical_name, source):
        nonlocal next_chunk
        chunk_names = []
        digest = hashlib.sha256()
        total_size = 0
        with source.open("rb") as stream:
            while True:
                part = stream.read(chunk_bytes)
                if not part:
                    break
                digest.update(part)
                total_size += len(part)
                write_chunk(part, chunk_names)
        if not chunk_names:
            write_chunk(b"", chunk_names)
        entries[logical_name] = {
            "sha256": digest.hexdigest(),
            "size": total_size,
            "chunks": chunk_names,
        }

    package_result = subprocess.run(
        ["bash", "-lc", "apt-mark showmanual"],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False
    )
    packages = sorted({line.strip() for line in package_result.stdout.splitlines()
                       if PACKAGE_RE.fullmatch(line.strip())})

    for base, dirs, files in os.walk(HOME, followlinks=False):
        base_path = Path(base)
        rel_base = base_path.relative_to(HOME)
        dirs[:] = sorted(d for d in dirs
                         if not (rel_base / d).is_symlink()
                         and not excluded(rel_base / d))
        for filename in sorted(files):
            source = base_path / filename
            rel = source.relative_to(HOME)
            if excluded(rel) or source.is_symlink() or not source.is_file():
                continue
            try:
                store_logical_file("home/" + rel.as_posix(), source)
            except OSError as exc:
                print(f"Skipping unreadable file {rel}: {exc}", file=sys.stderr)

    package_data = ("\n".join(packages) + "\n").encode()
    package_temp = ROOT / ".ubuntu-session-apt-manual.tmp"
    try:
        package_temp.write_bytes(package_data)
        store_logical_file("metadata/apt-manual.txt", package_temp)
    finally:
        package_temp.unlink(missing_ok=True)

    manifest = {
        "format": "immersive-cctv-chunked-session",
        "version": VERSION,
        "codec": "ICCTV2D + zlib level 1 (fast, no XOR)",
        "session_mode": os.environ.get("SESSION_MODE", "unknown"),
        "created_utc": subprocess.run(
            ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"],
            text=True, stdout=subprocess.PIPE, check=True
        ).stdout.strip(),
        "home_directory": str(HOME),
        "file_count": len(entries),
        "chunk_count": next_chunk,
        "files": entries,
        "notes": "Original files are split into small encoded .dat pieces; manifest.db is the decoder index."
    }
    manifest_data = json.dumps(manifest, separators=(",", ":"), sort_keys=True).encode()
    (out_dir / "manifest.db").write_bytes(b"ICCTVDB2" + encode_bytes(manifest_data))
    (out_dir / "format.info").write_text(
        "ICCTV-SESSION-CHUNKS\nformat=ICCTV2D\nversion=2\ncodec=zlib-level-1\nindex=manifest.db\npayload=payload/*.dat\n",
        encoding="utf-8"
    )

    total_bytes = sum(p.stat().st_size for p in out_dir.rglob("*") if p.is_file())
    print(f"Snapshot directory created: {out_dir}")
    print(f"Encoded fragments: {next_chunk}; logical files: {len(entries)}")
    print(f"Artifact payload size: {total_bytes:,} bytes ({total_bytes / (1024 ** 2):.1f} MiB)")
    largest = sorted(
        ((meta["size"], name) for name, meta in entries.items() if name.startswith("home/")),
        reverse=True
    )[:20]
    if largest:
        print("Largest included files (original sizes):")
        for size, name in largest:
            print(f"  {size / (1024 ** 2):8.1f} MiB  {name}")
    print("No nested ZIP is created. GitHub will package this folder as the downloadable artifact.")
    print("The custom XOR encoding is obfuscation only; it is not secure encryption.")

def restore():
    import zlib

    if not SAVE_DIR.is_dir():
        print("No 'ubuntu saves' folder found; starting with a clean Ubuntu home.")
        return 0

    shard_dir = SAVE_DIR / "ubuntu-session-save"
    candidates = sorted(p for p in SAVE_DIR.glob("*.zip") if p.is_file())
    has_shards = shard_dir.is_dir() and (shard_dir / "manifest.db").is_file()
    if len(candidates) + int(has_shards) == 0:
        print("No ZIP or chunked snapshot in 'ubuntu saves'; starting with a clean Ubuntu home.")
        return 0
    if len(candidates) + int(has_shards) != 1:
        raise ValueError("Expected exactly one ZIP snapshot or ubuntu-session-save folder; nothing was imported or deleted.")

    verified = {}
    if has_shards:
        snapshot_name = shard_dir.name
        raw_index = (shard_dir / "manifest.db").read_bytes()
        if raw_index.startswith(b"ICCTVDB2"):
            index_header = b"ICCTVDB2"
            magic = b"ICCTV2D"
            def decode_bytes(data):
                return zlib.decompress(data)
        elif raw_index.startswith(b"ICCTVDB1"):
            # Backward compatibility for snapshots made by the previous XOR format.
            index_header = b"ICCTVDB1"
            magic = b"ICCTV1D"
            key = b"immersive-cctv-session-v1"
            def decode_bytes(data):
                unpacked = bytes(value ^ key[index % len(key)] for index, value in enumerate(data))
                return zlib.decompress(unpacked)
        else:
            raise ValueError("Invalid chunked snapshot index header; snapshot retained.")
        try:
            manifest = json.loads(decode_bytes(raw_index[len(index_header):]))
        except Exception as exc:
            raise ValueError(f"Invalid encoded snapshot index ({exc}); snapshot retained.")
        if manifest.get("format") != "immersive-cctv-chunked-session" or manifest.get("version") != VERSION:
            raise ValueError("Unsupported chunked snapshot format/version; snapshot retained.")
        expected_codec = ("ICCTV2D + zlib level 1 (fast, no XOR)"
                          if index_header == b"ICCTVDB2"
                          else "ICCTV1D + repeating-key XOR + zlib")
        if manifest.get("codec") != expected_codec:
            raise ValueError("Snapshot codec does not match its index header; snapshot retained.")
        snapshot_mode = manifest.get("session_mode")
        requested_mode = os.environ.get("SESSION_MODE", "unknown")
        if snapshot_mode not in {"terminal", "desktop"}:
            raise ValueError("Chunked snapshot has no recognized session mode; snapshot retained.")
        if requested_mode not in {"terminal", "desktop"}:
            raise ValueError(f"Invalid requested SESSION_MODE {requested_mode!r}; snapshot retained.")
        if snapshot_mode != requested_mode:
            raise ValueError(
                f"Session mode mismatch: snapshot is '{snapshot_mode}', but this run selected "
                f"'{requested_mode}'. Select the matching mode. Snapshot retained."
            )
        files = manifest.get("files")
        if not isinstance(files, dict) or manifest.get("file_count") != len(files):
            raise ValueError("Chunked index file list/count mismatch; snapshot retained.")
        if manifest.get("chunk_count", 0) > 200000:
            raise ValueError("Chunked snapshot contains too many fragments; snapshot retained.")
        for name, meta in files.items():
            if not safe_member(name) or not (name.startswith("home/") or name == "metadata/apt-manual.txt"):
                raise ValueError(f"Unsafe or unsupported logical path {name!r}; snapshot retained.")
            if not isinstance(meta, dict) or not isinstance(meta.get("chunks"), list):
                raise ValueError(f"Invalid chunk list for {name!r}; snapshot retained.")
            pieces = []
            for chunk_name in meta["chunks"]:
                chunk_path = PurePosixPath(chunk_name)
                if not safe_member(chunk_name) or chunk_path.parts[0] != "payload" or len(chunk_path.parts) != 2 or not chunk_name.endswith(".dat"):
                    raise ValueError(f"Unsafe fragment path {chunk_name!r}; snapshot retained.")
                part_path = shard_dir / Path(*chunk_path.parts)
                if not part_path.is_file() or part_path.is_symlink():
                    raise ValueError(f"Missing/unsafe fragment {chunk_name!r}; snapshot retained.")
                encoded = part_path.read_bytes()
                if not encoded.startswith(magic):
                    raise ValueError(f"Invalid fragment header in {chunk_name!r}; snapshot retained.")
                try:
                    pieces.append(decode_bytes(encoded[len(magic):]))
                except Exception as exc:
                    raise ValueError(f"Could not decode fragment {chunk_name!r}: {exc}; snapshot retained.")
            data = b"".join(pieces)
            if meta.get("size") != len(data) or meta.get("sha256") != sha256_bytes(data):
                raise ValueError(f"Checksum/size mismatch for {name!r}; snapshot retained.")
            verified[name] = data
        actual_chunks = {p.relative_to(shard_dir).as_posix() for p in (shard_dir / "payload").glob("*.dat")}
        listed_chunks = {chunk for meta in files.values() for chunk in meta["chunks"]}
        if actual_chunks != listed_chunks:
            raise ValueError("Fragment files do not match the index; snapshot retained.")
    else:
        archive = candidates[0]
        snapshot_name = archive.name
        with zipfile.ZipFile(archive, "r") as zf:
            bad = zf.testzip()
            if bad:
                raise ValueError(f"ZIP CRC check failed at {bad!r}; snapshot retained.")
            names = zf.namelist()
            if len(names) > 200000:
                raise ValueError("Snapshot contains too many entries; snapshot retained.")
            total = sum(info.file_size for info in zf.infolist())
            if total > MAX_UNPACKED:
                raise ValueError("Snapshot expands beyond 5 GiB; snapshot retained.")
            if "manifest.json" not in names:
                raise ValueError("Missing manifest.json; snapshot retained.")
            try:
                manifest = json.loads(zf.read("manifest.json"))
            except Exception as exc:
                raise ValueError(f"Invalid manifest JSON ({exc}); snapshot retained.")
            if manifest.get("format") != "immersive-cctv-ubuntu-session" or manifest.get("version") != VERSION:
                raise ValueError("Unsupported snapshot format/version; snapshot retained.")
            snapshot_mode = manifest.get("session_mode")
            requested_mode = os.environ.get("SESSION_MODE", "unknown")
            if snapshot_mode not in {"terminal", "desktop"}:
                raise ValueError("Snapshot does not declare a recognized session mode; ZIP retained.")
            if requested_mode not in {"terminal", "desktop"}:
                raise ValueError(f"Invalid requested SESSION_MODE {requested_mode!r}; snapshot retained.")
            if snapshot_mode != requested_mode:
                raise ValueError(
                    f"Session mode mismatch: ZIP is '{snapshot_mode}', but this run selected "
                    f"'{requested_mode}'. Choose the matching mode. ZIP retained."
                )
            files = manifest.get("files")
            if not isinstance(files, dict) or manifest.get("file_count") != len(files):
                raise ValueError("Manifest file list/count mismatch; snapshot retained.")
            actual = set(names) - {"manifest.json", "SHA256SUMS.txt"}
            if actual != set(files):
                raise ValueError("Archive entries do not match manifest; snapshot retained.")
            for name, meta in files.items():
                if not safe_member(name) or not (name.startswith("home/") or name == "metadata/apt-manual.txt"):
                    raise ValueError(f"Unsafe or unsupported archive path {name!r}; snapshot retained.")
                info = zf.getinfo(name)
                unix_mode = (info.external_attr >> 16) & 0o170000
                if unix_mode == 0o120000:
                    raise ValueError(f"Symlink entry {name!r} is not allowed; snapshot retained.")
                data = zf.read(name)
                if not isinstance(meta, dict) or meta.get("size") != len(data) or meta.get("sha256") != sha256_bytes(data):
                    raise ValueError(f"Checksum/size mismatch for {name!r}; snapshot retained.")
                verified[name] = data

    package_data = verified.get("metadata/apt-manual.txt", b"").decode("utf-8")
    packages = sorted({line.strip() for line in package_data.splitlines()
                       if PACKAGE_RE.fullmatch(line.strip())})
    if packages:
        print(f"Restoring {len(packages)} recorded apt packages...")
        subprocess.run(["sudo", "apt-get", "update"], check=True)
        for start in range(0, len(packages), 100):
            subprocess.run(["sudo", "apt-get", "install", "-y", "--no-install-recommends", *packages[start:start + 100]], check=True)

    for name, data in verified.items():
        if not name.startswith("home/"):
            continue
        rel = PurePosixPath(name).relative_to("home")
        if not safe_member(rel.as_posix()):
            raise ValueError(f"Unsafe home path {name!r}; snapshot retained.")
        target = (HOME / Path(*rel.parts)).resolve()
        if target != HOME and HOME not in target.parents:
            raise ValueError(f"Path escapes home directory: {name!r}; snapshot retained.")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as f:
            f.write("restored=true\n")
            f.write(f"snapshot_name={snapshot_name}\n")
    print(f"Snapshot imported successfully from {snapshot_name}. The workflow may now remove it from the repository.")
    return 0

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"save", "restore"}:
        print("Usage: ubuntu-session-state.py save|restore", file=sys.stderr)
        sys.exit(2)
    try:
        if sys.argv[1] == "save":
            save()
        else:
            sys.exit(restore())
    except Exception as exc:
        print(f"::error::Ubuntu snapshot validation/import failed: {exc}", file=sys.stderr)
        sys.exit(1)
