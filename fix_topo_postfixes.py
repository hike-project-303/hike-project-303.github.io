#!/usr/bin/env python3
"""Fix topo image postfixes in data.js and thumbnail folders.

This script removes query suffixes from topo JPEG URLs inside data.js, e.g.
"/topo_4727_6842980_1200.jpg?1714090113" -> "/topo_4727_6842980_1200.jpg".
It also renames local topo files under the thumbs tree from
"topo_4727_6842980_1200.jpg--1714090113" to
"topo_4727_6842980_1200.jpg".
"""

import argparse
import re
from pathlib import Path

TOPO_JS_PATTERN = re.compile(r'(/[^"\']*?/topo_[^"\']+?\.jpg)(?:[?#][^"\']*)')
TOPO_FILE_PATTERN = re.compile(r'^(topo_.+?\.jpg)--.+$')


def fix_data_js(data_js_path: Path, dry_run: bool = False, backup: bool = False) -> int:
    if not data_js_path.exists():
        raise FileNotFoundError(f"data.js path not found: {data_js_path}")

    text = data_js_path.read_text(encoding="utf-8")
    new_text, count = TOPO_JS_PATTERN.subn(r"\1", text)

    if count == 0:
        print(f"No topo postfixes found in data.js at {data_js_path}")
        return 0

    print(f"Found {count} topo URL postfix(es) in data.js")

    if dry_run:
        print("Dry run enabled; data.js will not be modified.")
        return count

    if backup:
        backup_path = data_js_path.with_suffix(data_js_path.suffix + ".bak")
        backup_path.write_text(text, encoding="utf-8")
        print(f"Backup created: {backup_path}")

    data_js_path.write_text(new_text, encoding="utf-8")
    print(f"Updated data.js: {data_js_path}")
    return count


def fix_topo_files(thumbs_root: Path, dry_run: bool = False) -> int:
    if not thumbs_root.exists():
        raise FileNotFoundError(f"thumbs root not found: {thumbs_root}")

    renamed = 0

    for path in thumbs_root.rglob("topo_*"):
        if not path.is_file():
            continue

        match = TOPO_FILE_PATTERN.match(path.name)
        if not match:
            continue

        target = path.with_name(match.group(1))
        if target.exists():
            print(f"Skipping rename because target already exists: {target}")
            continue

        print(f"Renaming: {path} -> {target}")
        if not dry_run:
            path.rename(target)
        renamed += 1

    if renamed == 0:
        print(f"No topo file postfixes found under {thumbs_root}")
    else:
        print(f"Renamed {renamed} topo file(s) under {thumbs_root}")
    return renamed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remove topo postfixes from data.js and local topo files.")
    parser.add_argument(
        "--data-js",
        default="data.js",
        help="Path to the data.js file to update (default: data.js)",
    )
    parser.add_argument(
        "--thumbs-dir",
        default="database/www.bergsteigen.com/thumbs",
        help="Root thumbs directory to scan for topo files (default: database/www.bergsteigen.com/thumbs)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without modifying any files.",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Create a backup copy of data.js before editing.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    base_dir = Path(__file__).resolve().parent
    data_js_path = (Path(args.data_js) if Path(args.data_js).is_absolute() else base_dir / args.data_js)
    thumbs_root = (Path(args.thumbs_dir) if Path(args.thumbs_dir).is_absolute() else base_dir / args.thumbs_dir)

    print(f"Using data.js: {data_js_path}")
    print(f"Using thumbs directory: {thumbs_root}")
    if args.dry_run:
        print("Running in dry-run mode.")

    fix_data_js(data_js_path, dry_run=args.dry_run, backup=args.backup)
    fix_topo_files(thumbs_root, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
