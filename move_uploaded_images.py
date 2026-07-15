from pathlib import Path
import re
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
UPLOADED_LIST = ROOT / "uploaded_images.txt"
THUMBS_DIR = ROOT / "database" / "thumbs"
UPLOADED_DIR = THUMBS_DIR / "uploaded"
DATA_JS = ROOT / "data.js"

BLOGGER_URL_RE = re.compile(r"/s[^/]+/")
URL_ANY_RE = re.compile(r'https?://[^"]+')


def normalize_blogger_url_to_s0(url: str) -> str:
    """Convert any blogger image URL's size segment to /s0/."""
    if "blogger.googleusercontent.com" not in url:
        return url
    return BLOGGER_URL_RE.sub("/s0/", url, count=1)


def parse_basename(line: str) -> str:
    """Extract the image basename from a URL or path line."""
    parsed = urlparse(line)
    if parsed.scheme and parsed.path:
        return Path(parsed.path).name
    return Path(line).name


def main() -> int:
    if not UPLOADED_LIST.exists():
        print(f"Missing uploaded images list: {UPLOADED_LIST}")
        return 1
    if not THUMBS_DIR.exists():
        print(f"Missing thumbs directory: {THUMBS_DIR}")
        return 1
    if not DATA_JS.exists():
        print(f"Missing data file: {DATA_JS}")
        return 1

    entries = []
    for line in UPLOADED_LIST.read_text(encoding="utf-8").splitlines():
        candidate = line.strip()
        if not candidate or candidate.startswith("#"):
            continue
        basename = parse_basename(candidate)
        if not basename:
            continue
        blogger_url = normalize_blogger_url_to_s0(candidate) if "blogger.googleusercontent.com" in candidate else None
        entries.append((basename, blogger_url))

    if not entries:
        print("No image entries found in uploaded_images.txt.")
        return 1

    UPLOADED_DIR.mkdir(parents=True, exist_ok=True)

    moved_count = 0
    missing_files = []
    for basename, _ in entries:
        src = THUMBS_DIR / basename
        dst = UPLOADED_DIR / basename
        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            src.replace(dst)
            moved_count += 1
        else:
            missing_files.append(str(src))

    data_text = DATA_JS.read_text(encoding="utf-8")
    original_text = data_text
    replaced_count = 0

    for basename, blogger_url in entries:
        if blogger_url is None:
            continue
        escaped = re.escape(basename)
        pattern = re.compile(rf'https?://[^"]*?{escaped}')

        def replace_match(match: re.Match) -> str:
            nonlocal replaced_count
            replaced_count += 1
            return blogger_url

        data_text, n = pattern.subn(replace_match, data_text)
        if n > 0:
            continue

        # Fallback: replace any local thumbs path or relative path with basename
        local_pattern = re.compile(rf"(database/thumbs/){escaped}")
        data_text, n2 = local_pattern.subn(lambda m: blogger_url, data_text)
        replaced_count += n2

    if data_text != original_text:
        DATA_JS.write_text(data_text, encoding="utf-8")

    print(f"Moved {moved_count} images to {UPLOADED_DIR}")
    if missing_files:
        print(f"Missing {len(missing_files)} source files:")
        for path in missing_files:
            print(f"  {path}")
    print(f"Replaced {replaced_count} URL occurrences in {DATA_JS}")
    if missing_files:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
