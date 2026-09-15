// The whole suite, one command, one total:
//   node tests/run.js
//
// Files are DISCOVERED, not listed. Every tests/*.test.js runs, in name order.
// That is the whole point of DOM-127: a new screen means a new file, never an
// append to a shared one, so two branches in flight cannot collide here.

const fs = require('fs');
const path = require('path');
const harness = require('./harness');

const entries = fs.readdirSync(__dirname).filter(f => f.endsWith('.js')).sort();
const files = entries.filter(f => f.endsWith('.test.js'));

if (!files.length) {
  console.error('\nno tests/*.test.js found — the suite would pass vacuously\n');
  process.exit(1);
}

// A file misnamed `foo.tests.js` or `foo-test.js` is simply never required, and
// nothing anywhere would say so. Name the strays rather than run silently.
const strays = entries.filter(f => !files.includes(f) && f !== 'harness.js' && f !== 'run.js');
if (strays.length) {
  console.error('\n  NOT RUN — these are not named *.test.js, so the runner skipped them:\n' +
    strays.map(f => '       tests/' + f).join('\n'));
  process.exitCode = 1;
}

for (const f of files) {
  harness.enterFile(f);
  require(path.join(__dirname, f));
}

// Every top-level `test(` in a file has to have registered. This is the guard
// the DOM-127 split rests on: it is what makes "no test was silently dropped"
// checkable on every run instead of a one-off count at refactor time.
const { passed, perFile } = harness.results();
for (const f of files) {
  const sites = (fs.readFileSync(path.join(__dirname, f), 'utf8').match(/^test\(/gm) || []).length;
  const ran = perFile.get(f) || 0;
  if (sites !== ran) {
    console.error('  DROPPED tests/' + f + ' — ' + sites + ' test() call sites, ' + ran + ' ran');
    process.exitCode = 1;
  }
}

console.log('\n' + passed + ' passed' + (process.exitCode ? ', SOME FAILED' : '') + '\n');
