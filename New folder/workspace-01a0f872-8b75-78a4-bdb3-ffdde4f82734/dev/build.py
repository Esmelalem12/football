#!/usr/bin/env python3
"""Bundle the game into one self-contained HTML file."""
import os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(ROOT), 'AI_FOOTBALL_RISE_TO_GLORY.html')

GAME_FILES = [
    'js/core.js',
    'js/sim.js',
    'js/ai.js',
    'js/match.js',
    'js/render.js',
    'js/input_hud.js',
    'js/career.js',
    'js/ui_main.js',
]

def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()

def safe_js(code):
    if '</script' in code.lower():
        code = code.replace('</script', '<\\/script')
        print('  (escaped a </script sequence)')
    return code

def main():
    shell = read('shell.html')
    css = read('ui.css')
    three = safe_js(read('three.min.js'))
    game = '\n\n'.join(safe_js(read(f)) for f in GAME_FILES)
    html = shell.replace('/*__CSS__*/', css).replace('/*__THREE__*/', three).replace('/*__GAME__*/', game)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    print('wrote', OUT, f'{os.path.getsize(OUT)/1024:.0f} KB')

if __name__ == '__main__':
    main()
