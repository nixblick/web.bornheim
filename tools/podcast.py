#!/usr/bin/env python3
"""Podcast-Liste (#284): liest audio/podcast/*.mp3 und schreibt data/podcast.json.

  python3 tools/podcast.py            # Liste neu schreiben (Titel bleiben erhalten, neue Dateien bekommen den Dateinamen als Titel)
  python3 tools/podcast.py --pruefen  # nur prüfen: keine Datei über 30 MB, insgesamt höchstens 400 MB, Liste passt zum Ordner

Nur Standardbibliothek. Die Dauer ist geschätzt aus der Bitrate des ersten MP3-Rahmens (bei NotebookLM-Exporten konstant).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORDNER = ROOT / 'audio' / 'podcast'
LISTE = ROOT / 'data' / 'podcast.json'
MAX_DATEI = 30 * 1024 * 1024
MAX_SUMME = 400 * 1024 * 1024

RATEN = {  # MPEG-1 Layer III, MPEG-2/2.5 Layer III (kbit/s)
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}


def dauer(p: Path) -> int:
    b = p.read_bytes()[:256 * 1024]
    i = 0
    if b[:3] == b'ID3' and len(b) > 10:
        i = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f))
    while i + 4 <= len(b):
        if b[i] == 0xFF and (b[i + 1] & 0xE0) == 0xE0:
            ver = (b[i + 1] >> 3) & 3
            idx = b[i + 2] >> 4
            if 0 < idx < 15 and ver != 1:
                kbit = RATEN[1 if ver == 3 else 2][idx]
                sr = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}[ver][(b[i + 2] >> 2) & 3] if (b[i + 2] >> 2) & 3 < 3 else 0
                for tag in (b'Xing', b'Info'):  # VBR-/Info-Kopf: Rahmenzahl steht drin
                    k = b.find(tag, i + 4, i + 64)
                    if k > 0 and sr and b[k + 7] & 1:
                        n = int.from_bytes(b[k + 8:k + 12], 'big')
                        return round(n * (1152 if ver == 3 else 576) / sr)
                return round(p.stat().st_size * 8 / (kbit * 1000))
        i += 1
    return 0


def lies_liste():
    try:
        return json.loads(LISTE.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return []


def main() -> int:
    dateien = sorted(ORDNER.glob('*.mp3')) if ORDNER.is_dir() else []
    fehler = []
    summe = 0
    for p in dateien:
        g = p.stat().st_size
        summe += g
        if g > MAX_DATEI:
            fehler.append(f'{p.name}: {g / 1048576:.1f} MB, erlaubt sind 30 MB (leiser/kleiner exportieren oder kürzen)')
    if summe > MAX_SUMME:
        fehler.append(f'zusammen {summe / 1048576:.0f} MB, erlaubt sind 400 MB')
    alt = {e.get('file'): e for e in lies_liste() if isinstance(e, dict)}
    if '--pruefen' in sys.argv:
        namen = {p.name for p in dateien}
        for f in alt:
            if f not in namen:
                fehler.append(f'data/podcast.json nennt {f}, die Datei fehlt in audio/podcast/')
        for n in sorted(namen - set(alt)):
            fehler.append(f'{n} fehlt in data/podcast.json (python3 tools/podcast.py)')
        for f in fehler:
            print('PODCAST ROT:', f)
        print(f'PODCAST: {len(dateien)} Folgen, {summe / 1048576:.1f} MB' + (' ok' if not fehler else ''))
        return 1 if fehler else 0
    if fehler:
        for f in fehler:
            print('PODCAST ROT:', f)
        return 1
    neu = []
    for p in dateien:
        e = alt.get(p.name, {})
        titel = e.get('title') or p.stem.replace('_', ' ').replace('-', ' ').strip()
        neu.append({'title': titel, 'file': p.name, 'duration': dauer(p)})
    LISTE.write_text(json.dumps(neu, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'data/podcast.json: {len(neu)} Folgen, {summe / 1048576:.1f} MB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
