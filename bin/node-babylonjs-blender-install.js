#!/usr/bin/env node
'use strict';

const crossSpawn = require('cross-spawn');
const fs = require('fs');
const https = require('https');
const nodeGetopt = require('node-getopt');
const path = require('path');
const request = require('request').defaults({ strictSSL: true, });

const opt = nodeGetopt.create([
    [ 'h', 'help', 'Show this help and exit.', ],
])
      .setHelp(`Usage: ${process.argv[0]} [-h] [Blender AddOn ZIP] …

Any files specified on the command line are installed as
Blender addons. These should be ZIP bundles. If no file(s)
are specified, a particular babylonjs exporter version
known to work with this version of node-babylonjs-blender
will be downloaded and installed.

[[OPTIONS]]`)
      .bindHelp()
      .parseSystem();

const installBlenderAddOn = path => {
  return new Promise((resolve, reject) => {
    crossSpawn('blender', [
      '--background',
      '--python-expr',
      'import bpy; import os; bpy.ops.wm.addon_install(filepath=os.path.abspath(' + JSON.stringify(filename) + '));',
    ], {
      stdio: 'inherit',
    }).on('exit', code => {
      if (code) {
        reject(new Error(`Blender exited with code: ${code}`));
      } else {
        resolve();
      }
    }).on('error', reject);
  });
};

const cliHandleRejection = ex => {
  console.error(ex);
  if (ex instanceof Error) {
    console.error(ex.message);
  } else {
    console.error('General failure');
  }
  process.exit(1);
};

if (opt.argv.length) {
  opt.argv.reduce((prior, path) => prior.then(installBlenderAddOn(path)), Promise.resolve()).catch(cliHandleRejection);
}

// Hardcoded URI.
const uri = 'https://github.com/BabylonJS/Babylon.js/raw/6dfc63dab7de0b227dd1a34192e3e70c466c6189/Exporters/Blender/Blender2Babylon-5.1.zip';
const filename = /[^\/]*$/.exec(uri)[0];

console.log(`Downloading ${uri}…`);
request(uri)
  .on('error', ex => {
    console.error(ex);
    console.error('Error downloading.');
    process.exit(1);
  })
  .on('response', response => {
    if (response.statusCode != 200) {
      cliHandleRejection(new Error(`Unexpected response: ${response.statusCode}`));
    }
  })
  .pipe(fs.createWriteStream(filename).on('close', () => {
    installBlenderAddOn(filename).catch(cliHandleRejection);
  }))
;
