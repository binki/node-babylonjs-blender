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
      },
      {
        input: path.join(__dirname, 'simple.blend'),
        output: path.join(tmpdir, 'blah.asdf'),
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
          fs.accessSync(job.output);
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
