#!/usr/bin/env node
'use strict';

const BabylonjsBlenderWorker = require('../index.js').BabylonjsBlenderWorker;
const gulpLock = require('gulp-lock');
const nodeGetopt = require('node-getopt');
const path = require('path');
const through2 = require('through2');

const opt = nodeGetopt.create([
    [ 'j', 'jobs=JOBS', 'Maximum number of jobs to start or unspecified for unlimited. Default is -j=1. POSIX does not seem to support make-style “-j” and neither does this getopt library, so specify the empty string (“-j \'\'”) to request unlimited.', ],
    [ 'h', 'help', 'Show this help and exit.', ],
])
      .bindHelp()
      .parseSystem();

if (opt.options.jobs === undefined) {
    opt.options.jobs = '1';
}

/*
 * Let the user use octal or hex if they want :-p—I don’t care.
 */
const jobs = parseInt(opt.options.jobs);
/*
 * Apparently instead of parsing the empty string to a string,
 * node-getopt turns the empty string into NaN.
 */
if (jobs !== '' && !isNaN(jobs)) {
  /* Validate as a positive integer */
  if (isNaN(jobs)
      || !((jobs|0) === jobs)) {
    console.error(`Illegal integer specified for -j: “${opt.options.jobs}”`);
    process.exit(1);
  }
  if (jobs <= 0) {
    console.error(`Number of jobs must be positive. Value ${jobs} is illegal`);
    process.exit(1);
  }
}

const lock = jobs ? gulpLock(jobs) : gulpLock.unlimited;

const freeWorkers = [];

Promise.all(opt.argv.map(arg => lock.promise(() => {
  console.log(`<- ${arg}`);
  const worker = freeWorkers.pop() || new BabylonjsBlenderWorker();
  return worker.process({
    input: arg,
    /*
     * Specify our own output here. The API will output the file to
     * the directory of the source file, the CLI will output it to the
     * current working directory.
     */
    output: `${path.basename(arg, '.blend')}.babylon`,
  }).then(job => {
    console.log(`-> ${job.output}`);
    freeWorkers.push(worker);
  });
})())).then(() => {
  for (const worker of freeWorkers) {
    worker.end();
  }
});
