// LOCAL-ONLY helper: copies the official note assets from FunkinCrew/funkin.assets into
// public/official/ so `?pack=./official` can use them on YOUR machine.
// The folder is gitignored and must never be committed, bundled or deployed: the assets repo is
// "all rights reserved" (see its LICENSE.md) and is not ours to redistribute.
//
//   node scripts/fetch-official.mjs                       # sparse-clones funkin.assets into a temp dir
//   FUNKIN_ASSETS_DIR=/path/to/funkin.assets node scripts/fetch-official.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'official');
let src = process.env.FUNKIN_ASSETS_DIR;
if (!src) {
  src = mkdtempSync(join(tmpdir(), 'funkin-assets-'));
  const git = (...a) => execFileSync('git', a, { cwd: src, stdio: 'inherit' });
  git('init', '-q');
  git('remote', 'add', 'origin', 'https://github.com/FunkinCrew/funkin.assets.git');
  git('sparse-checkout', 'set', 'shared/images', 'preload/data/notestyles');
  git('pull', '--depth=1', 'origin', 'main');
}

const files = [
  'notes', 'noteStrumline', 'noteSplashes',
  'holdCoverBlue', 'holdCoverGreen', 'holdCoverPurple', 'holdCoverRed',
].flatMap((n) => [`${n}.png`, `${n}.xml`]).concat('NOTE_hold_assets.png');

mkdirSync(out, { recursive: true });
for (const f of files) {
  const from = join(src, 'shared', 'images', f);
  if (!existsSync(from)) throw new Error(`missing ${from}`);
  cpSync(from, join(out, f));
}
cpSync(join(src, 'preload', 'data', 'notestyles', 'funkin.json'), join(out, 'notestyle.json'));
for (const l of ['LICENSE.md', 'LICENSE']) if (existsSync(join(src, l))) cpSync(join(src, l), join(out, 'ASSETS-LICENSE.md'));
console.log(`Official assets copied to ${out}\nOpen:  npm run dev  ->  http://localhost:5173/?pack=./official\n(local use only - do not commit or deploy)`);
