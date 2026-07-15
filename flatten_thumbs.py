#!/usr/bin/env python3
"""Flatten thumbnail subfolders into the thumbs root and update data.js references.

This script moves image files from nested subfolders under the thumbs directory
into the root thumbs directory, then rewrites matching thumbnail URLs inside
`data.js` so they point to the flattened location.

Example:
  python flatten_thumbs.py --data-js data.js --thumbs-dir database/thumbs --backup
"""

import argparse
import re
from collections import defaultdict
from pathlib import Path

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
THUMBS_URL_PATTERN = re.compile(
    r'(?P<prefix>https?://[^"\']*/database/thumbs/)(?P<folder>[^/]+)/(?P<filename>[^"\']+?\.(?:jpg|jpeg|png|webp|gif))',
    re.IGNORECASE,
)


def build_unique_target(root: Path, filename: str, folder_key: str) -> Path:
    target = root / filename
    if not target.exists():
        return target

    # If file already exists in root, create a collision-free name.
    stem = target.stem
    suffix = target.suffix
    candidate = root / f"{stem}_{folder_key}{suffix}"
    count = 1
    while candidate.exists():
        candidate = root / f"{stem}_{folder_key}_{count}{suffix}"
        count += 1
    return candidate


def move_thumb_files(thumbs_root: Path, dry_run: bool = False) -> dict:
    if not thumbs_root.exists():
        raise FileNotFoundError(f"Thumbs directory not found: {thumbs_root}")

    mapping = {}
    collisions = defaultdict(list)
    moved = 0

    for path in thumbs_root.rglob('*'):
        if not path.is_file():
            continue
        if path.parent == thumbs_root:
            continue

        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue

        rel = path.relative_to(thumbs_root)
        folder = rel.parts[0]
        target = thumbs_root / path.name

        if target.exists() and target.samefile(path):
            mapping[f"{folder}/{path.name}"] = path.name
            continue

        if target.exists():
            if target.read_bytes() == path.read_bytes():
                if not dry_run:
                    path.unlink()
                mapping[f"{folder}/{path.name}"] = path.name
                continue
            target = build_unique_target(thumbs_root, path.name, folder)

        if dry_run:
            print(f"Would move: {path} -> {target}")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            path.replace(target)
        mapping[f"{folder}/{path.name}"] = target.name
        moved += 1
        collisions[target.name].append(str(rel))

    for target_name, sources in collisions.items():
        if len(sources) > 1:
            print(f"Warning: multiple source files moved to {target_name}: {sources}")

    if moved == 0:
        print(f"No nested thumbnail files found under {thumbs_root}.")
    else:
        print(f"{moved} files moved into {thumbs_root}.")
    return mapping


def update_data_js(data_js_path: Path, mapping: dict, dry_run: bool = False, backup: bool = False) -> int:
    if not data_js_path.exists():
        raise FileNotFoundError(f"data.js path not found: {data_js_path}")

    text = data_js_path.read_text(encoding='utf-8')

    def replace(match: re.Match) -> str:
        folder = match.group('folder')
        filename = match.group('filename')
        key = f"{folder}/{filename}"
        if key in mapping:
            return f"{match.group('prefix')}{mapping[key]}"
        return match.group(0)

    new_text, count = THUMBS_URL_PATTERN.subn(replace, text)

    if count == 0:
        print(f"No matching thumb URLs found in {data_js_path}.")
        return 0

    print(f"Updated {count} thumbnail URL occurrences in {data_js_path}.")

    if dry_run:
        print("Dry run enabled; data.js will not be modified.")
        return count

    if backup:
        backup_path = data_js_path.with_suffix(data_js_path.suffix + '.bak')
        backup_path.write_text(text, encoding='utf-8')
        print(f"Backup created: {backup_path}")

    data_js_path.write_text(new_text, encoding='utf-8')
    print(f"data.js updated: {data_js_path}")
    return count


def parse_args():
    parser = argparse.ArgumentParser(description='Flatten thumbs subfolders and update data.js thumbnail URLs.')
    parser.add_argument(
        '--data-js',
        default='data.js',
        help='Path to the data.js file to update (default: data.js)',
    )
    parser.add_argument(
        '--thumbs-dir',
        default='database/thumbs',
        help='Thumbs root directory to flatten (default: database/thumbs)',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show changes without writing files.',
    )
    parser.add_argument(
        '--backup',
        action='store_true',
        help='Create a backup copy of data.js before modifying it.',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    base_dir = Path(__file__).resolve().parent
    data_js_path = Path(args.data_js) if Path(args.data_js).is_absolute() else base_dir / args.data_js
    thumbs_root = Path(args.thumbs_dir) if Path(args.thumbs_dir).is_absolute() else base_dir / args.thumbs_dir

    print(f"Using data.js: {data_js_path}")
    print(f"Using thumbs directory: {thumbs_root}")
    if args.dry_run:
        print("Running in dry-run mode.")

    mapping = move_thumb_files(thumbs_root, dry_run=args.dry_run)
    if mapping:
        update_data_js(data_js_path, mapping, dry_run=args.dry_run, backup=args.backup)


if __name__ == '__main__':
    main()
