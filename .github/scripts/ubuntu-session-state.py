
#!/usr/bin/env python3
"""Safe Ubuntu session snapshot save/restore for GitHub Actions."""

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import zlib
from pathlib import Path, PurePosixPath

VERSION = 1
ROOT = Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
SAVE_DIR = ROOT / "ubuntu saves"
HOME = Path.home().resolve()

MAX_UNPACKED = 5 * 1024 * 1024 * 1024
MAX_FILES = 200000
MAX_CHUNKS = 200000
CHUNK_SIZE = 4 * 1024 * 1024

PACKAGE_RE = re.compile(r"^[a-z0-9][a-z0-9+.-]*$")

EXCLUDED_PATHS = {
    ".ssh",
    ".gnupg",
    ".aws",
    ".azure",
    ".kube",
    ".docker",
    ".local/share/keyrings",
    ".local/share/Trash",
    ".config/gh",
    ".cargo/registry",
    ".gradle/caches",
    ".mozilla",
    ".config/google-chrome",
    ".config/chromium",
    ".config/Code/Cache",
    ".config/Code/CachedData",
    ".config/Code/Service Worker/CacheStorage",
}

EXCLUDED_DIR_NAMES = {
    ".cache",
    ".npm",
    ".rustup",
    ".thumbnails",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    "__pycache__",
    "node_modules",
    ".venv",
    "venv",
    ".next",
    ".turbo",
}

MAGIC_V1 = b"ICCTV1D"
MAGIC_V2 = b"ICCTV2D"

INDEX_V1 = b"ICCTVDB1"
INDEX_V2 = b"ICCTVDB2"


def log(message):
    print(message, flush=True)


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def safe_member(name):
    if not isinstance(name, str) or not name:
        return False

    p = PurePosixPath(name)

    return (
        not p.is_absolute()
        and ".." not in p.parts
        and bool(p.parts)
        and "\\" not in name
        and "\x00" not in name
    )


def excluded(rel):
    parts = rel.parts
    value = rel.as_posix()

    for item in EXCLUDED_PATHS:
        if value == item or value.startswith(item + "/"):
            return True

    return any(part in EXCLUDED_DIR_NAMES for part in parts)


def get_packages():
    result = subprocess.run(
        ["bash", "-lc", "apt-mark showmanual"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    return sorted({
        line.strip()
        for line in result.stdout.splitlines()
        if PACKAGE_RE.fullmatch(line.strip())
    })


def save():
    log("Starting Ubuntu session snapshot...")

    out_dir = ROOT / "ubuntu-session-save"

    if out_dir.exists():
        shutil.rmtree(out_dir)

    payload_dir = out_dir / "payload"
    payload_dir.mkdir(parents=True, exist_ok=True)

    entries = {}
    next_chunk = 0
    total_original = 0

    def write_chunk(data, chunk_names):
        nonlocal next_chunk

        chunk_name = f"payload/part-{next_chunk:08d}.dat"
        encoded = MAGIC_V2 + zlib.compress(data, level=1)

        (out_dir / chunk_name).write_bytes(encoded)

        chunk_names.append(chunk_name)
        next_chunk += 1

    def store_file(logical_name, source):
        nonlocal total_original

        digest = hashlib.sha256()
        chunk_names = []
        total_size = 0

        with source.open("rb") as stream:
            while True:
                part = stream.read(CHUNK_SIZE)

                if not part:
                    break

                total_size += len(part)
                total_original += len(part)

                if total_original > MAX_UNPACKED:
                    raise ValueError(
                        "Snapshot exceeds the maximum allowed size of 5 GiB."
                    )

                digest.update(part)
                write_chunk(part, chunk_names)

        if not chunk_names:
            write_chunk(b"", chunk_names)

        try:
            mode = stat.S_IMODE(source.stat().st_mode)
        except OSError:
            mode = 0o644

        entries[logical_name] = {
            "sha256": digest.hexdigest(),
            "size": total_size,
            "mode": mode,
            "chunks": chunk_names,
        }

    for base, dirs, files in os.walk(HOME, followlinks=False):
        base_path = Path(base)
        rel_base = base_path.relative_to(HOME)

        dirs[:] = sorted(
            directory
            for directory in dirs
            if not (base_path / directory).is_symlink()
            and not excluded(rel_base / directory)
        )

        for filename in sorted(files):
            source = base_path / filename
            rel = source.relative_to(HOME)

            if excluded(rel):
                continue

            if source.is_symlink() or not source.is_file():
                continue

            if len(entries) >= MAX_FILES:
                raise ValueError("Maximum snapshot file count exceeded.")

            try:
                store_file("home/" + rel.as_posix(), source)

            except OSError as exc:
                log(f"Skipping unreadable file {rel}: {exc}")

    packages = get_packages()

    package_data = (
        "\n".join(packages) + "\n"
    ).encode("utf-8")

    package_temp = ROOT / ".ubuntu-session-apt-manual.tmp"

    try:
        package_temp.write_bytes(package_data)
        store_file("metadata/apt-manual.txt", package_temp)
    finally:
        package_temp.unlink(missing_ok=True)

    manifest = {
        "format": "immersive-cctv-chunked-session",
        "version": VERSION,
        "codec": "ICCTV2D + zlib level 1 (fast, no XOR)",
        "session_mode": os.environ.get("SESSION_MODE", "unknown"),
        "created_utc": subprocess.run(
            ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"],
            text=True,
            stdout=subprocess.PIPE,
            check=True,
        ).stdout.strip(),
        "home_directory": str(HOME),
        "file_count": len(entries),
        "chunk_count": next_chunk,
        "total_original_bytes": total_original,
        "files": entries,
    }

    manifest_data = json.dumps(
        manifest,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")

    compressed_manifest = zlib.compress(manifest_data, level=1)

    (out_dir / "manifest.db").write_bytes(
        INDEX_V2 + compressed_manifest
    )

    (out_dir / "format.info").write_text(
        "ICCTV-SESSION-CHUNKS\n"
        "format=ICCTV2D\n"
        "version=2\n"
        "codec=zlib-level-1\n"
        "index=manifest.db\n"
        "payload=payload/*.dat\n",
        encoding="utf-8",
    )

    total_bytes = sum(
        path.stat().st_size
        for path in out_dir.rglob("*")
        if path.is_file()
    )

    log("========================================")
    log("Ubuntu snapshot successfully created.")
    log(f"Files: {len(entries)}")
    log(f"Fragments: {next_chunk}")
    log(f"Original size: {total_original / (1024 ** 2):.1f} MiB")
    log(f"Artifact size: {total_bytes / (1024 ** 2):.1f} MiB")
    log("Format: ICCTV2D + zlib")
    log("========================================")


def decode_manifest(raw):
    if raw.startswith(INDEX_V2):
        return (
            json.loads(zlib.decompress(raw[len(INDEX_V2):])),
            MAGIC_V2,
            "ICCTV2D + zlib level 1 (fast, no XOR)",
        )

    if raw.startswith(INDEX_V1):
        raise ValueError(
            "Legacy ICCTVDB1 manifests require the legacy XOR decoder. "
            "Use a snapshot generated by the current workflow."
        )

    raise ValueError("Unknown or invalid snapshot index format.")


def decode_chunk(data, magic):
    if not data.startswith(magic):
        raise ValueError("Invalid snapshot fragment header.")

    encoded = data[len(magic):]

    if magic == MAGIC_V2:
        return zlib.decompress(encoded)

    if magic == MAGIC_V1:
        key = b"immersive-cctv-session-v1"

        decoded = bytes(
            value ^ key[index % len(key)]
            for index, value in enumerate(encoded)
        )

        return zlib.decompress(decoded)

    raise ValueError("Unsupported snapshot codec.")


def validate_session_mode(manifest):
    snapshot_mode = manifest.get("session_mode")
    requested_mode = os.environ.get("SESSION_MODE", "unknown")

    if snapshot_mode not in {"terminal", "desktop"}:
        raise ValueError("Snapshot has an invalid session mode.")

    if requested_mode not in {"terminal", "desktop"}:
        raise ValueError("Requested SESSION_MODE is invalid.")

    if snapshot_mode != requested_mode:
        raise ValueError(
            f"Session mode mismatch: snapshot is '{snapshot_mode}', "
            f"but requested mode is '{requested_mode}'."
        )


def validate_path(name):
    if not safe_member(name):
        raise ValueError(f"Unsafe snapshot path: {name!r}")

    if not (
        name.startswith("home/")
        or name == "metadata/apt-manual.txt"
    ):
        raise ValueError(f"Unsupported snapshot path: {name!r}")


def restore_chunks(shard_dir):
    raw_index = (shard_dir / "manifest.db").read_bytes()

    manifest, magic, expected_codec = decode_manifest(raw_index)

    if manifest.get("format") != "immersive-cctv-chunked-session":
        raise ValueError("Invalid snapshot format.")

    if manifest.get("version") != VERSION:
        raise ValueError("Unsupported snapshot version.")

    if manifest.get("codec") != expected_codec:
        raise ValueError("Snapshot codec does not match its index.")

    validate_session_mode(manifest)

    files = manifest.get("files")

    if not isinstance(files, dict):
        raise ValueError("Invalid snapshot file index.")

    if manifest.get("file_count") != len(files):
        raise ValueError("Snapshot file count mismatch.")

    if len(files) > MAX_FILES:
        raise ValueError("Snapshot contains too many files.")

    if manifest.get("chunk_count", 0) > MAX_CHUNKS:
        raise ValueError("Snapshot contains too many fragments.")

    verified = {}
    total_size = 0
    listed_chunks = set()

    for name, meta in files.items():
        validate_path(name)

        if not isinstance(meta, dict):
            raise ValueError(f"Invalid metadata for {name!r}.")

        chunks = meta.get("chunks")

        if not isinstance(chunks, list) or not chunks:
            raise ValueError(f"Invalid fragment list for {name!r}.")

        pieces = []

        for chunk_name in chunks:
            if not safe_member(chunk_name):
                raise ValueError("Unsafe fragment path.")

            chunk_path = PurePosixPath(chunk_name)

            if (
                len(chunk_path.parts) != 2
                or chunk_path.parts[0] != "payload"
                or not chunk_name.endswith(".dat")
                or chunk_name in listed_chunks
            ):
                raise ValueError("Invalid or duplicate fragment reference.")

            listed_chunks.add(chunk_name)

            part_path = shard_dir / Path(*chunk_path.parts)

            if part_path.is_symlink() or not part_path.is_file():
                raise ValueError(f"Missing or unsafe fragment: {chunk_name}")

            decoded = decode_chunk(part_path.read_bytes(), magic)

            pieces.append(decoded)

        data = b"".join(pieces)

        if len(data) != meta.get("size"):
            raise ValueError(f"File size mismatch: {name}")

        if sha256_bytes(data) != meta.get("sha256"):
            raise ValueError(f"SHA-256 verification failed: {name}")

        total_size += len(data)

        if total_size > MAX_UNPACKED:
            raise ValueError("Snapshot exceeds the 5 GiB restore limit.")

        verified[name] = (
            data,
            meta.get("mode", 0o644),
        )

    payload_dir = shard_dir / "payload"

    actual_chunks = {
        path.relative_to(shard_dir).as_posix()
        for path in payload_dir.glob("*.dat")
        if path.is_file() and not path.is_symlink()
    }

    if actual_chunks != listed_chunks:
        raise ValueError("Snapshot fragment index does not match payload.")

    return verified


def install_packages(verified):
    package_entry = verified.get("metadata/apt-manual.txt")

    if not package_entry:
        log("No saved apt package list found.")
        return

    package_data = package_entry[0].decode("utf-8")

    packages = sorted({
        line.strip()
        for line in package_data.splitlines()
        if PACKAGE_RE.fullmatch(line.strip())
    })

    if not packages:
        log("No additional apt packages to restore.")
        return

    log(f"Restoring {len(packages)} manually installed packages...")

    subprocess.run(
        ["sudo", "apt-get", "update"],
        check=True,
    )

    for start in range(0, len(packages), 100):
        batch = packages[start:start + 100]

        subprocess.run(
            [
                "sudo",
                "apt-get",
                "install",
                "-y",
                "--no-install-recommends",
                *batch,
            ],
            check=True,
        )


def restore_files(verified):
    restored = 0

    for name, (data, mode) in verified.items():
        if not name.startswith("home/"):
            continue

        rel = PurePosixPath(name).relative_to("home")

        if not safe_member(rel.as_posix()):
            raise ValueError(f"Unsafe home path: {name}")

        target = HOME.joinpath(*rel.parts)

        # Reject symlinks in existing parent directories.
        current = HOME

        for part in rel.parts[:-1]:
            current = current / part

            if current.is_symlink():
                raise ValueError(
                    f"Refusing to restore through symlink: {current}"
                )

        if target.is_symlink():
            raise ValueError(
                f"Refusing to overwrite symlink: {target}"
            )

        resolved_parent = target.parent.resolve()

        if resolved_parent != HOME and HOME not in resolved_parent.parents:
            raise ValueError(f"Path escapes home directory: {name}")

        target.parent.mkdir(parents=True, exist_ok=True)

        temp = target.with_name(target.name + ".restore-tmp")

        try:
            with temp.open("wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())

            os.chmod(temp, mode & 0o777)

            os.replace(temp, target)

        finally:
            temp.unlink(missing_ok=True)

        restored += 1

    log(f"Restored {restored} Ubuntu home files.")


def restore():
    log("Starting Ubuntu session restoration...")

    if not SAVE_DIR.is_dir():
        log("No snapshot directory found. Starting clean.")
        return 0

    shard_dir = SAVE_DIR / "ubuntu-session-save"

    if not shard_dir.is_dir():
        log("No chunked snapshot found. Starting clean.")
        return 0

    if not (shard_dir / "manifest.db").is_file():
        raise ValueError("Snapshot manifest.db is missing.")

    verified = restore_chunks(shard_dir)

    # Verify every file before changing the home directory.
    log(f"Snapshot verified: {len(verified)} logical files.")

    install_packages(verified)
    restore_files(verified)

    output = os.environ.get("GITHUB_OUTPUT")

    if output:
        with open(output, "a", encoding="utf-8") as stream:
            stream.write("restored=true\n")
            stream.write("snapshot_name=ubuntu-session-save\n")

    log("========================================")
    log("Ubuntu session restored successfully.")
    log("Snapshot integrity verified.")
    log("========================================")

    return 0


def main():
    if len(sys.argv) != 2:
        print(
            "Usage: ubuntu-session-state.py save|restore",
            file=sys.stderr,
        )
        return 2

    action = sys.argv[1]

    try:
        if action == "save":
            save()
            return 0

        if action == "restore":
            return restore()

        print("Unknown action.", file=sys.stderr)
        return 2

    except Exception as exc:
        print(
            f"::error::Ubuntu session operation failed: {exc}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
