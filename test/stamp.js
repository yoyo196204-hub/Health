// Stamps the web app with a version: node test/stamp.js
// Every script and stylesheet in index.html, and the offline copy list in sw.js, get ?v=<stamp>, where the stamp
// is a hash of all of their contents. A browser therefore can never pair a new page with an old file it still
// holds from before (GitHub Pages lets browsers reuse files for 10 minutes): any change gives every file a new
// address. node test/run.js fails if the stamp is out of date, so a change cannot ship without it.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');

function assets() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  return [...html.matchAll(/(?:src|href)="([a-z0-9-]+\.(?:js|css|webmanifest))(?:\?v=[a-z0-9]+)?"/g)].map(m => m[1]);
}
function stamp() {
  const h = crypto.createHash('sha256');
  for (const f of assets()) h.update(f).update(fs.readFileSync(path.join(root, f)));
  return h.digest('hex').slice(0, 10);
}
function apply(v) {
  const ip = path.join(root, 'index.html'), sp = path.join(root, 'sw.js');
  const html = fs.readFileSync(ip, 'utf8').replace(/((?:src|href)="[a-z0-9-]+\.(?:js|css|webmanifest))(?:\?v=[a-z0-9]+)?"/g, `$1?v=${v}"`);
  const sw = fs.readFileSync(sp, 'utf8').replace(/const STAMP = '[a-z0-9]*';/, `const STAMP = '${v}';`);
  fs.writeFileSync(ip, html); fs.writeFileSync(sp, sw);
}
function current() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const marks = new Set([...html.matchAll(/\.(?:js|css|webmanifest)\?v=([a-z0-9]+)"/g)].map(m => m[1]));
  const swm = (sw.match(/const STAMP = '([a-z0-9]*)';/) || [])[1];
  return { marks: [...marks], sw: swm, count: assets().length };
}
if (require.main === module) { const v = stamp(); apply(v); console.log('stamped', v); }
module.exports = { stamp, current, assets };
