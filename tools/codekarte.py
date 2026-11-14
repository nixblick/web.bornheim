"""Übersicht über den Spielcode, damit niemand game.js (über 500 KB) ganz lesen muss.
Aufruf:  python tools/codekarte.py            Module mit Größe und Zweck, Abschnitte von game.js mit Zeilen
         python tools/codekarte.py -f         dazu die Funktionsnamen je Abschnitt von game.js
         python tools/codekarte.py -f datei   Funktionen einer anderen Datei mit Zeilen
Die Ausgabe wird nicht eingecheckt: Zeilennummern ändern sich mit jedem Commit."""
import glob, io, os, re, sys

FN = re.compile(r"^\s{0,2}(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)")
ABSCHNITT = re.compile(r"^// -{5,} (.+?) -{3,}")

def zeilen(p): return io.open(p, encoding="utf-8").read().split("\n")

def zweck(z):
    for l in z[:6]:
        m = re.match(r"^\s*(?://+|/\*+|\*)\s*(.{12,})", l)
        if m: return m.group(1).strip(" */")[:110]
    return ""

def funktionen(p):
    for i, l in enumerate(zeilen(p), 1):
        m = FN.match(l)
        if m: print(f"  {i:5} {m.group(1)}")

def main():
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass
    a = sys.argv[1:]; mitf = "-f" in a; a = [x for x in a if x != "-f"]
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    if a: print(a[0]); funktionen(a[0]); return
    print("MODULE (KB, Zeilen, Zweck)")
    for p in sorted(glob.glob("*.js"), key=lambda p: -os.path.getsize(p)):
        z = zeilen(p); print(f"  {p:18} {os.path.getsize(p) // 1024:4} {len(z):5}  {zweck(z)}")
    print("\ngame.js: ABSCHNITTE (ab Zeile)")
    z = zeilen("game.js"); teile = [(i, ABSCHNITT.match(l).group(1)) for i, l in enumerate(z, 1) if ABSCHNITT.match(l)]
    for k, (i, name) in enumerate(teile):
        ende = teile[k + 1][0] - 1 if k + 1 < len(teile) else len(z)
        print(f"  {i:5}-{ende:<5} {name[:90]}")
        if mitf:
            namen = [FN.match(l).group(1) for l in z[i - 1:ende] if FN.match(l)]
            for j in range(0, len(namen), 9): print("        " + " ".join(namen[j:j + 9]))
    print("\nLesen: nie ganze Dateien. grep -n -o -E '.{0,200}NAME.{0,300}' game.js  oder  sed -n 'A,Bp' game.js | cut -c1-600")

main()
