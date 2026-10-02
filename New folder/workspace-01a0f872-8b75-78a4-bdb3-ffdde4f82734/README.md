# AI FOOTBALL: RISE TO GLORY

A complete, playable browser game — an arcade-style **3D football game with a full career mode**, where every one of the 22 players on the pitch makes their own decisions based on the match situation.

**Play it:** open `AI_FOOTBALL_RISE_TO_GLORY.html` — one self-contained file (Three.js is embedded, no internet needed after download).

## Features

### Intelligent match AI (the core feature)
- **Utility-based decision making** — the ball carrier evaluates shooting (xG-style model), passes (progression + receiver space + pass-lane risk), through balls, crosses, dribbling (space probes) and clearances every ~0.15s, with commitment locks so behaviour is human, not twitchy.
- **Situational defending** — nearest defender presses, second covers, defenders goal-side mark dangerous runners, everyone else holds a dynamic defensive line.
- **Attacking movement** — forwards run in behind the last line, wingers hold width or cut inside, midfielders form support triangles, fullbacks overlap.
- **Goalkeeper brains** — angle-based positioning, sweeping claims on through balls, diving saves with catch/parry outcomes, distribution to open teammates.
- **Game-state awareness** — losing teams push more players forward late; leading teams drop deeper.
- Turn on **AI LABELS** in Settings (or press nothing — watch them) to see live intent tags like `RUN IN BEHIND`, `PRESS`, `THROUGH BALL`, `CLAIM!` above every player.
- Audio is procedurally synthesized (crowd, whistle, kicks, goal roar) — no external files.

### Career mode — "Rise to Glory"
- Create a player (name + position), start at **Addis United** in the 8-club *Rise to Glory League* (14 matchdays, double round-robin).
- Every other fixture is simulated with a strength-based model; full league table with form.
- Match ratings → **XP → levels → attribute points** you spend on Pace / Shooting / Passing / Dribbling / Defending / Physical.
- End of season: champion, **Golden Boot / Player of the Season** awards, and **transfer offers** from bigger clubs based on your performances.
- Save persists automatically where allowed, plus **export/import save codes** (works even where localStorage is blocked).

### Presentation
- Third-person follow camera behind your player (mouse drag / screen-edge steering / wheel zoom, auto-aligns to the ball), plus a **tele-broadcast camera** (`V`).
- Camera zooms out slightly when your team has possession and snaps smoothly on player switches.
- Full stadium: striped pitch with painted markings, goals with nets, ad boards, raked crowd stands, floodlights, corner flags, referee, goal confetti.
- Live HUD: scoreboard + clock, stamina bar, shot-power bar, minimap radar, commentary ticker, goal banners, set-piece prompts.
- Menu background is a **live AI vs AI match** you can watch anytime.

## Controls (desktop)

| Key | Action |
|---|---|
| **W A S D** | Move (camera-relative) |
| **Shift** | Sprint (drains stamina) |
| **Space** | Shoot — *hold for power, A/D to place* |
| **E** | Pass |
| **Q** | Through ball |
| **R** | Cross / long ball |
| **C** | Tackle / poke (defending) |
| **F** | Switch to nearest teammate |
| **Mouse** | Camera: drag to orbit, edges to steer, wheel to zoom |
| **V / P / H / M** | Camera mode / Pause / Hide help / Mute |

Set pieces: when it's your restart the game prompts you (`E` short, `Q` quick, `R` cross, `SPACE` shoot — penalties: aim with A/D, hold Space for power).

## Dev layout
- `dev/js/*.js` — source modules (core, sim, ai, match, render, input_hud, career, ui_main)
- `dev/build.py` — bundles everything + Three.js r128 into the single HTML file
- `dev/test/` — headless suites: full-match simulation, multi-match stats, career lifecycle, DOM-stubbed UI smoke test, THREE scene-graph render test
