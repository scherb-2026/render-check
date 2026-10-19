#!/usr/bin/env node
// Writes rooms/manifest.json: the list of room folders (and dataset folders holding room folders) and the files in each.
//
// Static hosts such as GitHub Pages can't list folders, so the page reads this file instead. Run it
// again whenever the contents of rooms/ change; the GitHub Actions workflow (.github/workflows/pages.yml)
// does it on every deploy. Needs Node 18 or newer, no packages.
//
//   node tools/build-manifest.mjs            reads ./rooms, writes ./rooms/manifest.json
//   node tools/build-manifest.mjs path/to/site   the same for another copy of the project

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..'));
const roomsDir = join(root, 'rooms');
const OUT = 'manifest.json';
const FILE_LIMIT = 100 * 1024 * 1024;      // GitHub rejects bigger files
const SITE_LIMIT = 1024 * 1024 * 1024;     // GitHub Pages sites should stay below about 1 GB
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

let entries;
try { entries = readdirSync(roomsDir, { withFileTypes: true }); }
catch { console.error('Folder not found: ' + roomsDir); process.exit(1); }

// version 2: every folder of rooms/ is { files, dirs, children }. A room folder just has files. A dataset folder (a folder of room
// folders) has dirs, and children[name] = { files, dirs } for each of them, which is all the page needs to find rooms/<dataset>/<room>/.
const manifest = { version: 2, generated: new Date().toISOString(), rooms: {}, loose: [] };
let total = 0, problems = 0;

// One folder: its files (with the size checks) and the names of its subfolders.
function scan(dir, label) {
  const node = { files: [], dirs: [] };
  for (const f of readdirSync(dir, { withFileTypes: true }).sort((a, b) => collator.compare(a.name, b.name))) {
    if (f.name.startsWith('.')) continue;
    if (f.isDirectory()) { node.dirs.push(f.name); continue; }
    const size = statSync(join(dir, f.name)).size;
    total += size;
    node.files.push(f.name);
    if (size > FILE_LIMIT) { problems++; console.warn(`! ${label}/${f.name} is ${mb(size)}: GitHub rejects files over 100 MB. Compress it or host it elsewhere.`); }
  }
  return node;
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

for (const e of entries.sort((a, b) => collator.compare(a.name, b.name))) {
  if (e.name.startsWith('.') || e.name === OUT) continue;
  if (!e.isDirectory()) { manifest.loose.push(e.name); continue; }
  const dir = join(roomsDir, e.name), room = scan(dir, e.name);
  if (room.dirs.length) {
    room.children = {};
    for (const sub of room.dirs) room.children[sub] = scan(join(dir, sub), `${e.name}/${sub}`);
  }
  manifest.rooms[e.name] = room;
  // A folder with media files of its own is a room; one that only holds folders is a dataset (the page makes the same call).
  console.log(room.files.length || !room.dirs.length
    ? `${e.name}/  ${plural(room.files.length, 'file')}`
    : `${e.name}/  dataset, ${plural(room.dirs.length, 'room')}`);
  for (const sub of room.dirs) console.log(`  ${sub}/  ${plural(room.children[sub].files.length, 'file')}`);
}

if (total > SITE_LIMIT) { problems++; console.warn(`! rooms/ is ${mb(total)}: GitHub Pages sites should stay below about 1 GB.`); }
writeFileSync(join(roomsDir, OUT), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nWrote rooms/${OUT}: ${Object.keys(manifest.rooms).length} folders, ${mb(total)} in total${problems ? `, ${problems} warning${problems === 1 ? '' : 's'}` : ''}.`);
