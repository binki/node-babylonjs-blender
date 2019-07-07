'use strict';

const babylonjsBlender = require('..');
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf-noglob');

const tmpdir = path.join(__dirname, 'tmp');

describe('babylonjsBlender', function () {
  this.timeout(120000);

  /*
   * Verify that requested filenames are respected.
   */
  for (let output of [
    /* Allow us to change the basename */
    'asdf.babylon',
    /*
     * Ensure that we allow arbitrary extensions. The exporter addon
     * fights against us wrt this by replacing any non-matching
     * extension with “.babylon”. Verify that our workaround works.
     */
    'asdf.arbitrary',
  ]) {
    it(`should let me use an output of “${output}”`, function () {
      rimraf.sync(tmpdir);
      fs.mkdirSync(tmpdir);
      const outputPath = path.join(tmpdir, output);
      return babylonjsBlender(path.join(__dirname, 'simple.blend'), outputPath)
        .then(() => {
          fs.accessSync(outputPath);
        })
      ;
    });
  }
});
