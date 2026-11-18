// Solmar Heat — a gta6-01 entry (Node 22, standard library only). The game
// is this directory's game/ folder: plain static files a desktop browser
// loads offline (game/index.html and its ES modules, no library, no network
// request). This program hands it in: it copies game/ and screenshots/ from
// beside this file to /output and writes /output/dossier.json, the summary
// the judge reads, with the vendored make.fun library.
//
// The game: a 2D top-down open-world crime story. Vic Torres owes Madame Oro
// $50,000 across eight missions in the coastal city of Solmar — driving,
// stealing cars, outrunning the Solmar PD, fighting on foot, and paying the
// debt down, with a live minimap, wanted stars, save/load and WebAudio synth
// sound. Put 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by
// name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the rest refuse an entry the scorer would refuse — more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all; or a path under game/ over 1000 bytes. (game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json.)
const GATE = {
  screenshotsMax: 4,
  screenshotMaxBytes: 262144,
  gameMaxFiles: 993,
  gameMaxBytes: 50331648,
  gamePathMaxBytes: 1000,
  textMaxBytes: 163840,
};

// Fail fast, before anything is copied, when a screenshot would make the
// gate refuse the entry. The gate's own error would arrive only after the
// copy, so this keeps a bad screenshot from ever reaching the output.
function checkScreenshots(dir) {
  if (!existsSync(dir)) return;
  const shots = readdirSync(dir).filter((name) => !name.startsWith('.'));
  if (shots.length > GATE.screenshotsMax) {
    throw new Error(`screenshots/: ${shots.length} files, the gate allows at most ${GATE.screenshotsMax}`);
  }
  for (const name of shots) {
    const size = statSync(join(dir, name)).size;
    if (size > GATE.screenshotMaxBytes) {
      throw new Error(`screenshots/${name} is ${size} bytes, the gate allows at most ${GATE.screenshotMaxBytes}`);
    }
  }
}

const shotsDir = join(here, 'screenshots');
checkScreenshots(shotsDir);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: GATE.textMaxBytes,
    screenshots: { max: GATE.screenshotsMax, max_bytes: GATE.screenshotMaxBytes },
    game_max_files: GATE.gameMaxFiles,
    game_max_bytes: GATE.gameMaxBytes,
    game_path_max_bytes: GATE.gamePathMaxBytes,
  }),
);
