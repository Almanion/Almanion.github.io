'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Build=require('../tools/build-site');
const root=process.env.ALMANION_TEST_SITE||path.resolve('.'),files=process.env.ALMANION_TEST_SITE?Build.walkFiles(root):Build.trackedFiles(root).filter(f=>Build.isPublishable(f,Build.readConfig()));
for(const file of files)if(/\.(html|js|json|css|svg|xml|txt|webmanifest)$/i.test(file))assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/альманион/iu,file+': use the Almanion spelling');
const html=fs.readFileSync(path.join(root,'games/index.html'),'utf8');
assert.match(html,/signal-frontier\/\?renderer=canvas/);assert.match(html,/signal-frontier\/\?renderer=babylon/);
console.log('PASS public branding uses Almanion; both Signal Frontier editions are linked');
