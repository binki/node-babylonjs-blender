'use strict';

const path = require('path');
const promisify = require('promisify-node');
const fs = promisify('fs');
const childProcessPromise = require('child-process-promise');
const shellEscape = require('shell-escape');

/*
 * Would be cool to figure out how to make input/input streams later.
 */

const process = function (input, output) {
    /*
     * Remove output file first so we can validate success later by
     * checking for existence.
     */
    return fs.unlink(output).catch(ex => fs.access(output, fs.constants.F_OK).catch(ex => {}).then(() => Promise.reject(ex))).then(() => childProcessPromise.exec(shellEscape(['blender', '-b', '-P', path.join(__dirname, 'export-scene-as-babylonjs.py')]), {
	env: Object.assign({}, process.env, {
	    /*
	     * Cannot figure out the proper way to pass arguments to
	     * python scripts invoked via Blender. So, for now, will
	     * just use environment variables.
	     */
	    NODEJS_BABYLONJS_BLENDER_INPUT: input,
	    NODEJS_BABYLONJS_BLENDER_OUTPUT: output,
	}),
    })).then(results => fs.access(output, fs.constants.F_OK).catch(ex => {throw new Error(`Blender did not emit ${output}`)}).catch(ex => {
	console.error(results.stdout);
	console.error(results.stderr);
	return Promise.reject(ex);
    }));
};

module.exports = process;
