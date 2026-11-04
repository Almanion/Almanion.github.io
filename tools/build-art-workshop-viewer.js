'use strict';
// npm install --prefix .local-qa/workshop-deps @babylonjs/core@9.33.1 @babylonjs/loaders@9.33.1
const path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),dependencies=path.join(root,'.local-qa/workshop-deps/node_modules');
esbuild.build({entryPoints:[path.join(root,'game-source/signal-frontier/design/art-workshop/model-viewer-source.js')],
  outfile:path.join(root,'game-source/signal-frontier/design/art-workshop/model-viewer.js'),bundle:true,format:'esm',minify:true,
  alias:{'@babylonjs/core':path.join(dependencies,'@babylonjs/core'),'@babylonjs/loaders':path.join(dependencies,'@babylonjs/loaders')},
  legalComments:'eof',target:'es2022'}).catch(error=>{console.error(error);process.exitCode=1;});
