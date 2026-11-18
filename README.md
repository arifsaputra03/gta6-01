[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![make.fun · rank](https://make.fun/badge/gta6-01/arifsaputra03/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![make.fun · reward](https://make.fun/badge/gta6-01/arifsaputra03/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Heat

A 2D top-down open-world crime game for the make.fun **gta6-01** bounty — an original
story, city, characters and soundtrack, built from scratch in plain JavaScript and canvas.
Nothing here is from Rockstar's GTA or any commercial game.

**The story.** Vic Torres owes Madame Oro **$50,000**. Eight jobs across the coastal city
of Solmar pay the debt down — steal a car, lose the law, make a timed drop, clear out a
gang alley, survive a three-star heat wave, hit a bank van, and pull the big score at the
Casino. Pay it all back and Vic becomes King of Solmar. Then the city is yours to roam.

**The city.** Solmar is a 3,600 × 2,600 open world with six districts — Marina, Old Town,
Downtown, the Docks, the Beach and the Casino Strip — plus a Safehouse, a spray shop, a
clinic, a gun shop and hidden cash stashes. Traffic cars and pedestrians fill the streets;
the world is seeded, so the same seed always builds the same city.

**Systems, all working in the game:**

- Explore on foot and by car — enter and exit any car, steal parked and driven ones
- Traffic and pedestrians with their own behaviour, who flee from gunfire and crashes
- Wanted level (0–5 stars) that rises with crimes the law sees and decays when you stay clean
- Police cars that chase, ram and bust you, plus foot cops at two stars and up
- 8 story missions with objectives, dialogue, win/fail states and cash rewards
- Combat on foot (punch, pistol) and in the car (ramming), with explosions and particles
- HUD with live minimap, health, money, debt, wanted stars and a mission tracker
- Start screen, pause, save/load (localStorage) and restart
- WebAudio synth sound and music — engine hum, sirens, gunshots, cash, mission stingers

**Controls.** WASD / arrows to move and drive (W walks and drives north, up the screen) ·
E to enter/exit a car · F to punch · Click to shoot (with a pistol) · Shift to run ·
Space for the handbrake · P / Esc to pause · M to mute · R on the pause screen to restart
the story.

**Play it.** Serve the game locally (`node serve.ts`, then open http://localhost:8080) or
open `game/index.html` in a desktop browser. No network requests, no build step.

**Screenshots.** `?shot=mission|chase|combat|city` (with `&seed=N`) stages a real moment of
play for a capture; `?test=1` runs the built-in self-test over every system — 29 checks,
including a regression test for every fix below.

**V2 fixes (over the first entry).** A hostile audit of the first version found six issues,
all fixed here and locked in by the self-test:

1. **Save after a mission.** Completing a job now saves *after* the next one has begun,
   so Continue picks up the job still to do — the first version saved the finished job
   and made the player replay it.
2. **Police spawn from the effective position.** Every spawn, chase, sighting and
   despawn decision reads one helper — the car while driving, the feet on foot — so the
   law never goes to wherever the player got in.
3. **Enemy fire is a stated hit chance.** A shot rolls its chance for the range (55% up
   close, 20% at max range, seeded so a fight replays), hits track the target and misses
   go visibly wide; tracers are drawn along the bullet's own angle, and player and enemy
   rounds have different colours.
4. **Cops are not civilians.** A foot cop never drops cash and never flees when hit —
   hitting one is a crime the law sees, killing one raises a full star. Running one over
   counts too.
5. **Bullets vs police, verified.** Two aimed shots kill a foot cop, four kill a police
   car (34 damage each), with the wanted level held so the target stays in the world.
6. **Mission 2 softlock.** The red Comet GT now parks in a real lot spot at the curb —
   never in the traffic lane — it is anchored against rams, takes no ram or traffic
   damage, and the mission marker follows it while the job runs. Ten rams from four
   directions move it 0 px.
7. **Walk north is north.** The on-foot Y axis was flipped (W walked south); driving was
   never affected.
