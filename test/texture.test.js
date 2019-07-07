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

  it('supports inlining through option', function () {
    return runBlender({
      inlineTextures: true,
    }, info => {
      // Verify that there is an inlined texture.
      const material = info.content.materials[0];
      const texture = material.diffuseTexture;
      assert.ok(texture.base64String, 'Expected inline data');
      assert.equal(texture.base64String.substring(0, 'data:image/'.length), 'data:image/', 'Expected inline image data');
      assert.strictEqual(info.job.inlineTextures, true, 'inlineTextures option should be true');
      assert.strictEqual(info.job.builtAssets.length, 0, 'Expected no assets');
    });
  });

  it('supports emitting external textures', function () {
    // Verify that textures are emitted when not inline properly.
    return runBlender(info => {
      // Verify that textures were emitted.
      const material = info.content.materials[0];
      const texture = material.diffuseTexture;
      // Expected output path is to be next to be next to output with
      // name.
      const textureName = texture.name;
      // Verify that the textures are not inline.
      assert.strictEqual(info.job.inlineTextures, false, 'inlineTextures option should still be false');
      assert.strictEqual(texture.base64String, undefined, 'Unexpected inline data');
      assert.strictEqual(info.job.builtAssets.length, 1, 'Expected one emitted asset');
      for (const texturePath of [
        path.join(path.dirname(info.job.output), textureName),
        path.join(info.job.outputPath, textureName),
        path.join(info.job.outputPath, info.job.builtAssets[0]),
      ]) {
        fs.accessSync(texturePath);
      }
    });
  });
});
