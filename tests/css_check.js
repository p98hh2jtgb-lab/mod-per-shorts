// Validates the CSS embedded in DriftSketch HTML templates with css-tree.
const fs = require('fs');
const cs = require(process.argv[2]);
let bad = 0;
for (const file of process.argv.slice(3)) {
  const html = fs.readFileSync(file, 'utf8');
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  if (!styles.length) { console.log('FAIL: no <style> block in ' + file); bad++; continue; }
  styles.forEach((css, index) => {
    const errors = [];
    cs.parse(css, { positions: true, onParseError: e => errors.push(e.message + ' @ line ' + e.line) });
    if (errors.length) {
      bad += errors.length;
      errors.slice(0, 10).forEach(msg => console.log('FAIL: CSS ' + file + ' #' + index + ': ' + msg));
    } else {
      console.log('ok  : CSS parsed clean (' + css.length + ' chars) in ' + file + ' #' + index);
    }
    // Balanced braces / parentheses are a cheap extra guard.
    const count = (s, ch) => (s.match(new RegExp('\\' + ch, 'g')) || []).length;
    if (count(css, '{') !== count(css, '}') || count(css, '(') !== count(css, ')')) {
      bad++; console.log('FAIL: unbalanced braces/parentheses in ' + file);
    }
  });
}
process.exitCode = bad > 0 ? 1 : 0;
