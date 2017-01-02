'use strict';

const assert = require('assert');
const babylonjsBlender = require('..');
const path = require('path');
const promisify = require('promisify-node');
const tmp = require('tmp-promise');

const fs = promisify('fs');

describe('texture', function () {
  this.timeout(20000);

  const textureBlendPath = path.join(__dirname, 'texture.blend');

  const runBlender = (options, cb) => tmp.withDir(tmpdirInfo => {
    const outputPath = path.join(tmpdirInfo.path, 'texture.babylon');
    console.log(`Desired path: ${tmpdirInfo.path} -> ${outputPath}`);
    fs.accessSync(tmpdirInfo.path);
    if (!cb) {
      cb = options;
      options = undefined;
    }
    options = Object.assign({
      input: textureBlendPath,
      output: outputPath,
    }, options);
    return babylonjsBlender(options).then(job => {
      // Slurp emitted JSON
      return fs.readFile(outputPath).then(json => {
        return {
          content: JSON.parse(json),
          job: job,
          tmpdir: tmpdirInfo.path,
        };
      });
    }).then(cb).catch(ex => new Promise((resolve, reject) => setTimeout(() => reject(ex), 10000)));
  }, {unsafeCleanup: true});

  it('is inlined by default', function () {
    return runBlender(info => {
      // Verify that there is an inlined texture.
      const material = info.content.materials[0];
      const texture = material.diffuseTexture;
      assert.ok(texture.base64String, 'Expected inline data');
      assert.equal(texture.base64String.substring(0, 'data:image/'.length), 'data:image/', 'Expected inline image data');
    });
  });
});
