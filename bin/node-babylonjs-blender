#!/usr/bin/env node
/* -*- mode: js; -*- */
'use strict';

const babylonjsBlender = require('../index.js');
const nodeGetopt = require('node-getopt');
const path = require('path');

const opt = nodeGetopt.create([
    [ 'j', 'jobs=JOBS', 'Maximum number of jobs to start or unspecified for unlimited. Default is -j=1. POSIX does not seem to support make-style “-j” and neither does this getopt library, so specify the empty string (“-j \'\'”) to request unlimited.', ],
    [ 'h', 'help', 'Show this help and exit.', ],
])
      .bindHelp()
      .parseSystem();

if (opt.options.jobs === undefined) {
    opt.options.jobs = '1';
}
const startJob = function () {
    if (opt.options.jobs === '') {
        /* User requested unlimited. */
        return job => Promise.resolve().then(job);
    }
    let remainingJobSlots = parseInt(opt.options.jobs); /* Let the user use octal or hex if they want :-p—I don’t care */
    if (isNaN(remainingJobSlots)
        || !((remainingJobSlots|0) === remainingJobSlots)) {
        console.error(`Illegal integer specified for -j: “${opt.options.jobs}”`);
        process.exit(1);
    }
    if (remainingJobSlots <= 0) {
        console.error(`Number of jobs must be positive. Value ${remainingJobSlots} is illegal`);
        process.exit(1);
    }
    const queue = [];
    const manageQueue = () => {
        if (!remainingJobSlots) {
            return;
        }
        remainingJobSlots--;
        if (!queue.length) {
            return;
        }
        queue.shift()();
    };
    const jobFinished = () => {
        remainingJobSlots++;
        manageQueue();
    };
    return job => {
        return new Promise((resolve, reject) => {
            queue.push(resolve);
            manageQueue();
        }).then(job).then(o => {
            jobFinished();
            return o;
        }).catch(ex => {
            jobFinished();
            return Promise.reject(ex);
        });
    };
}();

/*
 * This API could be improved by supporting batching instead of
 * launching a blender per file.
 */
Promise.all(opt.argv.map(arg => startJob(() => babylonjsBlender(arg, `${path.basename(arg, '.blend')}.babylon`))))
    .catch(ex => {
        console.error(ex);
        console.error('Encountered error condition. Exiting.');
        process.exit(1);
    });
