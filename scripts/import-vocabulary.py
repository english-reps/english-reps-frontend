"""Import the supplied vocabulary PDF's `pdftotext -layout` output.

Usage: python scripts/import-vocabulary.py extracted.txt public/data/vocabulary.json
Requires Python 3; extracting the PDF requires Poppler's pdftotext.
"""
import json
import re
import sys
from pathlib import Path


def import_vocabulary(text):
    entries = []
    pages = [page for page in text.split('\f') if page.strip()]
    for page_number, page in enumerate(pages, 1):
        blocks = re.split(r'\n\s*\n', page.strip())
        if len(blocks) != 10:
            raise ValueError(f'Page {page_number}: expected 10 entries, got {len(blocks)}')
        for block in blocks:
            lines = [line.strip() for line in block.splitlines() if line.strip()]
            example_start = next((i for i, line in enumerate(lines[1:], 1) if re.match(r'^[A-Za-z“"‘]', line)), None)
            if example_start is None:
                raise ValueError(f'Missing English example: {lines[0]}')
            heading = ''.join(lines[:example_start])
            translation_start = next((i for i in range(example_start + 1, len(lines)) if re.search(r'[\u3400-\u9fff]', lines[i])), None)
            if translation_start is None:
                raise ValueError(f'Missing Chinese example: {lines[0]}')
            example = ''
            for line in lines[example_start:translation_start]:
                if example.endswith('-'):
                    example = example[:-1] + line
                else:
                    example += (' ' if example else '') + line
            markers = list(re.finditer(r'（(n|v|adj|adv|prep|conj|pron|det|aux|interj|phr)\.）', heading))
            if not markers:
                raise ValueError(f'Missing part of speech: {heading}')
            senses = []
            for i, marker in enumerate(markers):
                end = markers[i + 1].start() if i + 1 < len(markers) else len(heading)
                meaning = heading[marker.end():end].strip('；; ')
                if not meaning:
                    raise ValueError(f'Missing definition: {heading}')
                senses.append({'pos': marker.group(1) + '.', 'meaning': meaning})
            entries.append({
                'id': f'word-{len(entries) + 1:04d}',
                'word': heading[:markers[0].start()].strip(),
                'senses': senses,
                'example': example,
                'translation': ''.join(lines[translation_start:]),
                'page': page_number,
                'unit': len(entries) // 50 + 1,
            })
    if len(entries) != 1000:
        raise ValueError(f'Expected 1,000 source entries, got {len(entries)}')
    return {
        'source': {'title': '【刷刷鍋】多益一千單字表', 'pages': len(pages), 'count': len(entries)},
        'entries': entries,
    }


if __name__ == '__main__':
    source, destination = map(Path, sys.argv[1:])
    data = import_vocabulary(source.read_text(encoding='utf-8'))
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Imported {len(data['entries'])} entries from {data['source']['pages']} pages.")
