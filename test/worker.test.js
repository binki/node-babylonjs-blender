'use strict';

const accum = require('accum');
const assert = require('assert');
const BabylonjsBlenderWorker = require('..').BabylonjsBlenderWorker;
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf-noglob');
const through2 = require('through2');

const tmpdir = path.join(__dirname, 'tmp');

describe('BabylonjsBlenderWorker', function () {
  this.timeout(120000);

  beforeEach(function (cb) {
    rimraf(tmpdir, ex => ex ? cb(ex) : fs.mkdir(tmpdir, cb));
  });

  it('should process multiple jobs', function (done) {
    const jobs = [
      {
        input: path.join(__dirname, 'simple.blend'),
        output: path.join(tmpdir, 'simple.babylon'),
        userData: {
          artifact: 'Cube',
        },
      },
      {
        input: path.join(__dirname, 'simple.blend'),
        output: path.join(tmpdir, 'blah.asdf'),
        userData: {
          artifact: 'Cube',
        },
      },
      {
        input: path.join(__dirname, 'sphere.blend'),
        output: path.join(tmpdir, 'cube.babylon'),
        userData: {
          artifact: 'Sphere',
        },
      },
      {
        input: path.join(__dirname, 'simple.blend'),
        output: path.join(tmpdir, 'simple2.babylon'),
        userData: {
          artifact: 'Cube',
        },
      },
    ];
    const worker = new BabylonjsBlenderWorker();
    worker
      .on('error', done)
      .pipe(through2.obj((chunk, enc, callback) => {
        fs.accessSync(chunk.output);
        callback(undefined, chunk);
      }))
      .pipe(accum({ objectMode: true, }, finishedJobs => {
        assert.ok(finishedJobs);
        assert.equal(finishedJobs.length, jobs.length, 'Finished jobs count does not match provided jobs.');
        jobs.forEach((job, i) => {
          const finishedJob = finishedJobs[i];
          assert.strictEqual(finishedJob, job, 'became non-identical object');
          const result = JSON.parse(fs.readFileSync(job.output));
          const meshNames = result.meshes.map(mesh => mesh.name);
          assert.strictEqual(meshNames.length, 1, 'Expected each scene to only have one mesh');
          assert.strictEqual(meshNames[0], job.userData.artifact, 'Exported different scene than expected.');
        });
        done();
      }))
    ;
    for (let job of jobs) {
      worker.write(job);
    }
    worker.end();
  });

  it('should fail on a nonexistent file while completing everything prior', function (done) {
    const jobs = [
      {
        input: path.join(__dirname, 'simple.blend'),
        output: path.join(tmpdir, 'simple.babylon'),
      },
      {
        input: path.join(__dirname, 'nonexistent.blend'),
        output: path.join(tmpdir, 'nonexistent.babylon'),
      },
    ];
    const worker = new BabylonjsBlenderWorker();
    var receivedSimple = false;
    worker
      .on('data', chunk => {
        assert.strictEqual(chunk, jobs[0]);
        fs.accessSync(chunk.output);
        receivedSimple = true;
      })
      .on('error', ex => {
        assert.ok(receivedSimple, 'The error is supposed to happen after successfully completing simple.blend.');
        assert.throws(() => fs.accessSync(jobs[1].output), 'file created even though it failed');
        done();
      })
    ;
    for (let job of jobs) {
      worker.write(job);
    }
    worker.end();
  });

  describe('process', function () {
    it('should work as a convenience method', function () {
      const worker = new BabylonjsBlenderWorker();
      return worker.process({
        input: path.join(__dirname, 'simple.blend'),
        output: path.join(tmpdir, 'simple.babylon'),
      }).then(job => {
        fs.accessSync(job.output);
      });
    });
  });
});
