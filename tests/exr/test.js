// Decodes every file written by gen.py with js/lib/exr.js and compares it with the expected values. Run: node tests/exr/test.js
const fs = require('fs'), EXR = require('../../js/lib/exr.js');
const man = JSON.parse(fs.readFileSync(__dirname + '/cases/manifest.json'));
(async () => {
  let bad = 0;
  for (const c of man) {
    const buf = fs.readFileSync(`${__dirname}/cases/${c.name}.exr`); const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const exp = new Float32Array(fs.readFileSync(`${__dirname}/cases/${c.name}.f32`).buffer.slice(0));
    try {
      const t0 = Date.now(), r = await EXR.decode(ab, { linear: true });
      let maxErr = 0, n = 0;
      for (let i = 0; i < exp.length; i++) { const e = Math.abs(r.data[i] - exp[i]) / Math.max(1, Math.abs(exp[i])); if (e > maxErr) maxErr = e; }
      const tol = c.note === 'lossy24' ? 1e-4 : 0;
      const ok = r.width === c.w && r.height === c.h && maxErr <= tol;
      if (!ok) bad++;
      console.log((ok ? 'OK  ' : 'FAIL') + ` ${c.name.padEnd(26)} ${r.info.compression.padEnd(5)} types=${r.info.types.join('+').padEnd(10)} layer="${r.info.layer}" size ${r.width}x${r.height} max rel err ${maxErr.toExponential(2)} (${Date.now()-t0} ms)`);
    } catch (e) { console.log((c.note === 'unsupported' ? 'OK  ' : 'FAIL') + ` ${c.name.padEnd(26)} -> error: ${e.message}`); if (c.note !== 'unsupported') bad++; }
  }
  console.log(bad ? bad + ' FAILED' : 'ALL PASSED');
})();
