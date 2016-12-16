'use strict';

const path = require('path');
const promisify = require('promisify-node');
const fs = promisify('fs');
const crossSpawn = require('cross-spawn');
const stdioChat = require('./stdio-chat.js');
const through2 = require('through2');
const VError = require('verror').VError;

const fileNotExists = Symbol('file does not exist');

/**
 * A worker is capable of processing one blender file at a time and
 * requires its lifetime to be managed by the caller. It is an object
 * stream which accepts job plain objects. The object must have a key
 * 'input' which is the path to an input .blend to process. It may
 * optionally have an 'output' key. The 'output' key will be set if
 * not specified (to same directory as input with .blend stripped and
 * .babylon appended). For each object, the passed-in object is
 * emitted when it is done processing successfully. If an error
 * occurs, an 'error' event is emitted.
 *
 * Currently, the implementation does not support batch
 * processing. This API is intended to enable that to be added as a
 * feature in the future.
 *
 * Only use this API if you want to handle the lifetime of this object
 * and have figured out how to handle stream errors. Be sure to call
 * end() when you are done with it.
 *
 * While a worker is still alive, you may use the convenience method
 * process(job) which accepts the same object as write(). This
 * function will return a promise which tracks completion of that one
 * job and handles interaction with the stream for you. However, you
 * still have to call end(). Note that if you have any stream handlers
 * or pipe this stream anywhere, it will see job pass through it.
 */
const BabylonjsBlenderWorker = function (options) {
  let childInfo;

  const worker = through2.obj(Object.assign({
    /*
     * Set the highWaterMark to 1 because each each chunk is expected
     * to take a “large” amount of time to process in comparison to
     * scheduling/streaming overhead. The idea is that this would
     * allow a user to best balance work among multiple workers. If
     * the highWaterMark is high and a stream fanout system were to
     * feed jobs to workers at the rate that they consumed them, you
     * might leave some workers idle while other workers finish off
     * their backlog if the durations of jobs vary, reducing the
     * efficiency of a system.
     */
    highWaterMark: 1,
  }, options), function (chunk, encoding, callback) {
    if (typeof chunk === 'string') {
      /* Upgrade to job object if necessary. */
      chunk = {
        input: chunk,
      };
    }
    /* Don’t use basename: output in same directory as input. */
    chunk.output = chunk.output || `${chunk.input.replace(/\.blend$/, '')}.babylon`;

    /*
     * If the requested filename does not end in “.babylon”,
     * babylonjs’s export script replaces the file ending with
     * “.babylon”. For example, if we request “blah.babylon.new”, we
     * will get “blah.babylon.babylon” instead. So ensure that we
     * always specify a “.babylon” ending. This intermediate file is
     * used both to provide transactionality (we don’t replace an
     * outdated build artifact until we have fully and successfully
     * created a replacement) and enables people using the API to
     * ignore the extension convension enforced by the exporter addon.
     */
    const newOutput = `${chunk.output}.new.babylon`;

    /*
     * Remove newOutput first. In case if we do not properly catch an
     * error during export, the absence of the file is an indication
     * of failure.
     */
    fs.unlink(newOutput)
    /* It’s fine if the file already doesn’t exist. */
      .catch(ex => ex.code === 'ENOENT' ? undefined : Promise.reject(ex))
      .then(() => {
        if (childInfo) {
          childInfo.chat.output.write({
            input: chunk.input,
            output: newOutput,
          });
        } else {
          childInfo = {
            instance: crossSpawn('blender', ['-b', '-P', path.join(__dirname, 'export-scene-as-babylonjs.py')], {
              env: Object.assign({}, process.env, {
                /*
                 * Cannot figure out the proper way to pass arguments to
                 * python scripts invoked via Blender. So, for now, will
                 * just use environment variables.
                 */
                NODEJS_BABYLONJS_BLENDER_INPUT: chunk.input,
                NODEJS_BABYLONJS_BLENDER_OUTPUT: newOutput,
              }),
              stdio: ['pipe', 'pipe', 'inherit'],
            })
              .on('error', () => childInfo = undefined)
              .on('close', () => childInfo = undefined),
          };
          childInfo.chat = new stdioChat(childInfo.instance.stdout, childInfo.instance.stdin);
        }

        let handled = false;
        let closeHandler;
        let dataHandler;
        let errorHandler;
        const unsubscribe = () => {
          /*
           * If the process already exited, no point in bothreing to
           * unsubscribe these as they’ll do nothing now.
           */
          if (!childInfo) {
            return;
          }
          childInfo.instance.removeListener('close', closeHandler);
          childInfo.chat.input.removeListener('data', dataHandler);
          childInfo.instance.removeListener('error', errorHandler);
        };
        return new Promise((resolve, reject) => {
          /*
           * If the child fails on first launch before even trying to
           * run an export or cannot access the requested pipe, it
           * will exit to indicate success/failure. For example, it
           * might not be able to use the pipe but might indicate
           * success with the job passed via the environment
           * variables. Then we sort of hobble along by launching an
           * instance per job.
           */
          closeHandler = function (code) {
            if (!handled) {
              if (code) {
                reject(new Error(`Blender exited with ${code}`));
              } else {
                resolve();
              }
              handled = true;
            }
          };
          childInfo.instance.on('close', closeHandler);

          dataHandler = function (chunk) {
            if (!handled) {
              if (chunk === true) {
                resolve();
              } else {
                reject(new Error(`Unrecognized message from blender: ${JSON.stringify(chunk)}`));
              }
              handled = true;
            }
          };
          childInfo.chat.input.on('data', dataHandler);

          /*
           * We mostly expect this handler to be used to detect errors
           * on process spawning. We probably don’t correctly handle
           * if this event is emitted after the process launches
           * successfully.
           */
          errorHandler = function (ex) {
            if (!handled) {
              reject(ex);
              handled = true;
            }
          };
          childInfo.instance.on('error', errorHandler);
        }).then(result => {
          unsubscribe();
          return result;
        }, ex => {
          unsubscribe();
          return Promise.reject(ex);
        });
      })
      .then(
        results => fs.access(newOutput)
          .catch(ex => Promise.reject(new VError({
            cause: ex,
            info: {
              /* How to propery get this information?
              blenderStderr: results.stderr,
              blenderStdout: results.stdout,
              */
            },
          }, `Blender did not emit ${newOutput}`))))
      .then(
        () => fs.rename(newOutput, chunk.output)
          .catch(ex => Promise.reject(new VError(ex, `Unable to rename ${newOutput} to ${chunk.output}`))))
      .then(() => callback(undefined, chunk), ex => callback(ex))
    ;
  }, function (callback) {
    if (childInfo) {
      /* Closing the pipe should trigger graceful exit. */
      childInfo.chat.output.end();
      childInfo.instance.on('error', callback);
      childInfo.instance.on('exit', code => callback());
    } else {
      callback();
    }
  });

  worker.process = function (job) {
    /*
     * We have to be able to unsubscribe.
     */
    let dataHandler;
    let errorHandler;
    const unsubscribe = function () {
      worker.removeListener('data', dataHandler);
      worker.removeListener('error', errorHandler);
    };

    return new Promise((resolve, reject) => {
      /*
       * For convenience support (input, output) signature too.
       */
      if (typeof job === 'string') {
        job = {
          input: job,
          output: arguments[1],
        };
      }

      dataHandler = function (chunk) {
        if (chunk === job) {
          resolve(chunk);
        }
      };
      errorHandler = function (ex) {
        reject(ex);
      };

      worker.on('data', dataHandler);
      worker.on('error', errorHandler);

      worker.write(job);
    }).then(job => {
      unsubscribe();
      return job;
    }, ex => {
      unsubscribe();
      return Promise.reject(ex);
    });
  };

  return worker;
};

const process = function (job) {
  const worker = new BabylonjsBlenderWorker();
  return worker.process.apply(worker, arguments).then(result => {
    worker.end();
    return result;
  });
};

process.BabylonjsBlenderWorker = BabylonjsBlenderWorker;

module.exports = process;
