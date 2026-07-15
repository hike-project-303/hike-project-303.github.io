#!/usr/bin/env python3
"""Download site links found inside a data.js file.

Usage:
  python download_data_links.py data.js output_dir
  python download_data_links.py data.js output_dir --new-domain https://yourdomain.com
  python download_data_links.py data.js output_dir --new-domain https://yourdomain.com --rewrite-file data.rewrite.js

The script finds all site URLs in the source JS file, downloads each
linked file into a local mirror directory, and optionally rewrites the links to a
new domain in a copied JS file.
"""

import argparse
import os
import re
import time
import urllib.parse

import requests

USER_AGENT = 'site-data-link-downloader/1.0'
URL_PATTERN = re.compile(r'https?://(?:www\.)?bergsteigen\.com[^\s"\'"<>)]*', re.IGNORECASE)


def normalize_url(url):
    url = url.strip()
    while url and url[-1] in '),;\"\'":':
        url = url[:-1]
    return url


def find_links_in_js(js_path):
    with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()
    urls = {normalize_url(m.group(0)) for m in URL_PATTERN.finditer(text)}
    return sorted(urls)


def local_path_for_url(url, output_dir):
    parsed = urllib.parse.urlparse(url)
    path = parsed.path or '/'
    if path.endswith('/'):
        path = os.path.join(path, 'index.html')
    elif not os.path.splitext(path)[1]:
        path = os.path.join(path, 'index.html')
    if parsed.query:
        safe_query = re.sub(r'[^a-zA-Z0-9_-]', '_', parsed.query)
        path = path + '--' + safe_query
    local_path = os.path.join(output_dir, parsed.netloc, path.lstrip('/'))
    return local_path


def download_url(url, dest_path, delay=0.4):
    if os.path.exists(dest_path):
        print(f'  exists: {dest_path}')
        return
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    print(f'  downloading: {url}')
    response = requests.get(url, headers={'User-Agent': USER_AGENT}, timeout=30, stream=True)
    response.raise_for_status()
    with open(dest_path, 'wb') as f:
        for chunk in response.iter_content(8192):
            if chunk:
                f.write(chunk)
    time.sleep(delay)


def rewrite_js_file(js_path, out_path, urls, new_domain):
    with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()

    new_domain = new_domain.rstrip('/')
    for url in sorted(urls, key=len, reverse=True):
        parsed = urllib.parse.urlparse(url)
        target = parsed.path or '/'
        if parsed.query:
            target += '?' + parsed.query
        rewritten = new_domain + target
        text = text.replace(url, rewritten)

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(text)
    return out_path


def parse_args():
    parser = argparse.ArgumentParser(description='Download site links referenced in a data.js file.')
    parser.add_argument('source_js', help='Path to the data.js file')
    parser.add_argument('output_dir', help='Directory where downloaded files are saved')
    parser.add_argument('--new-domain', help='Rewrite found site links to this domain', default=None)
    parser.add_argument('--rewrite-file', help='Write a copy of the JS file with rewritten links', default=None)
    parser.add_argument('--delay', type=float, help='Seconds to wait between downloads', default=0.4)
    return parser.parse_args()


def main():
    args = parse_args()
    urls = find_links_in_js(args.source_js)

    if not urls:
        print('No site links found in', args.source_js)
        return

    print(f'Found {len(urls)} site URLs. Downloading to {args.output_dir}')
    for url in urls:
        dest_path = local_path_for_url(url, args.output_dir)
        try:
            download_url(url, dest_path, delay=args.delay)
        except Exception as exc:
            print(f'  failed: {url} -> {exc}')

    if args.new_domain and args.rewrite_file:
        rewritten_path = rewrite_js_file(args.source_js, args.rewrite_file, urls, args.new_domain)
        print('Rewritten JS file written to', rewritten_path)
    elif args.new_domain:
        print('Note: --new-domain was provided but --rewrite-file is missing; no JS copy was written.')

if __name__ == '__main__':
    main()
