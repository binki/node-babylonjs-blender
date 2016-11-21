#!/usr/bin/env node
'use strict';

const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const spawn = require('cross-spawn');

const tmpdir = path.join(__dirname, 'tmp');

if (!fs.existsSync(tmpdir)) {
  fs.mkdirSync(tmpdir);
}

console.log(`Running in ${tmpdir}`);
spawn.spawn.sync(spawn.sync('node', ['../../bin/node-babylonjs-blender', '../simple.blend', ]), {
  cwd: tmpdir,
});
const output = path.join(tmpdir, 'simple.babylon');
if (!fs.existsSync(output)) {
  throw new Error(`Did not write output to ${output}`);
}
const outputJson = JSON.parse(fs.readFileSync(output));
const assertEqual = function (expected, actual) {
    if (typeof expected !== 'string') {
	throw new Error('This simplified assert() implementation requires parameters to be string for the sake of debugability and simplification.');
    }
    if (expected !== actual) {
	throw new Error(`Expected: “${expected}”; actual: “${actual}”.`);
    }
};
assertEqual('Cube', outputJson.meshes[0].name);
assertEqual('0', `${outputJson.meshes[0].position[0]}`);
