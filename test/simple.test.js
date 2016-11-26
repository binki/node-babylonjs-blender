#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf-noglob');
const spawn = require('cross-spawn');

const tmpdir = path.join(__dirname, 'tmp');

rimraf.sync(tmpdir);
fs.mkdirSync(tmpdir);

console.log(`Running in ${tmpdir}`);
spawn.sync('node', ['../../bin/node-babylonjs-blender', '../simple.blend', ], {
  cwd: tmpdir,
  stdio: 'inherit',
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

/****/

rimraf.sync(tmpdir);
fs.mkdirSync(tmpdir);
console.log(`Running 4 jobs with concurrency 2`);
const jobFiles = [
  'a',
  'b',
  'c',
  'd',
].map(name => path.join(tmpdir, `${name}.blend`));
jobFiles.forEach(jobFile => fs.linkSync(path.join(__dirname, 'simple.blend'), jobFile));
spawn.sync('node', [path.join(path.dirname(__dirname), 'bin', 'node-babylonjs-blender'), '-j2', ].concat(jobFiles), {
  cwd: tmpdir,
  stdio: 'inherit',
});
jobFiles.forEach(jobFile => {
  const output = jobFile.replace(/\.blend$/, '.babylon');
  const outputJson = JSON.parse(fs.readFileSync(output));
});