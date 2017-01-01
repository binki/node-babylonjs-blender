[![Build Status](https://travis-ci.org/binki/node-babylonjs-blender.svg?branch=master)](https://travis-ci.org/binki/node-babylonjs-blender)
[![Build status](https://ci.appveyor.com/api/projects/status/ynqc3cbu59ydrw0w?svg=true)](https://ci.appveyor.com/project/binki/node-babylonjs-blender)

# Synopsis

This makes it easier (hopefully) to export a Blender scene as
BabylonJS, reducing the need to write custom tools for your own
buildsystem.

# Installation

To use this module, you must perform the following configuration
steps:

1. Ensure `blender` is in your `PATH`. If you are using Windows, it is
   your responsibility to figure out how to do this. Most Operating
   Systems and Package Managers will manage this for you—and if they
   don’t, that means you know what you are doing and are thus on your
   own ^^.

2. Install (official/normal, Tower of Babylon not supported—patches
   welcome of course) [the BabylonJS Blender
   Exporter](https://doc.babylonjs.com/exporters/Installing__the_Babylon_Exporter)
   from
   [here](https://github.com/BabylonJS/Babylon.js/tree/master/Exporters/Blender)
   into Blender. You may use the `node-babylonjs-blender-install`
   command to automatically do this for you. This command downloads a
   specific known working addon version by default, but if you specify
   a `.zip` file as an argument it will install that as a Blender
   addon for you (even non-BabylonJS addons).

# Usage

Currently, all of the interfaces operate on real files. If other sorts
of handling is needed, please [submit
patches/issues](https://github.com/binki/node-babylonjs-blender) to
discuss both how to do this and what the API should look like.

Currently, blender is interacted with in a sessionless way, but it is
possible that great performance gains could be realized by persisting
and reusing a blender instance for many scenes. The API and CLI
provide a batching interface, so any improvements to the
implementation will automatically benefit consumers of those
interfaces.

## CLI

### Installation

Depending on how you use `npm`, the following might be how
you obtain this tool:

    $ npm install -g babylonjs-blender

### Usage

The CLI is quite simplified but it does (pointlessly, for now) support
batching. Just specify all of the files that need to be exported as
arguments:

    $ node-babylonjs-blender myBlendFile1.blend myBlendFile2.blend

Each output shall be written out to the current directory with
`.blend` stripping off (if it exists) and `.babylon`
appended. Appending `.babylon` is not optional and is intended to
encourage respect of conventions.

To run jobs in parallel, use `-j`. This is similar to `make(1)`’s `-j`
except that for specifying unlimited jobs you have to provide an empty
string as an argument because of the limitations of the used
`getopt(3)` implementation. However, it is recommended not to use
unlimited jobs unless you know what you are doing.

4 parallel jobs:

    $ node-babylonjs-blender -j4 *.blend

Unlimited jobs example for completeness:

    $ node-babylonjs-blender -j '' *.blend

## API

### Installation

To reference in your project to consume the API, install [the npm
`babylonjs-blender`
package](https://www.npmjs.com/package/babylonjs-blender) package:

    $ npm install --save babylonjs-blender

### Usage

The module is callable. You may pass a job to it (a plain object with
`input` and `output` keys) or pass those as separate arguments. It
returns a Promise whose value is a job object. If you passed in a
plain object job, the resolved value is identical. Otherwise, it is
generated. If `output` was not supplied (as an argument or key), the
resolved value’s `output` key will specify the path of the exported
file.

    const babylonjsBlender = require('babylonjs-blender');
    babylonjsBlender('myFile.blend', 'arbitraryName.babylon').then(job => {
      console.log('Blender finished');
    });
    babylonjsBlender('myFile.blend').then(job => {
      console.log(`Blender wrote output to ${job.output}.`);
    });
    babylonjsBlender({
      input: 'myFile.blend',
    }).then(job => {
      console.log(`Blender wrote output to ${job.output}.`);
    });

### Job Object

As mentioned, each job is represented by a plain object. The keys are
defined as follows:

* `input` (required): The path to the input Blender file.

* `output` (optional): The path to the destination file. Will be set
   for you if unspecified.

* `userData` (optional): This key is set aside for the caller’s use.
   No future version of this library will repurpose this key for
   itself. This may be useful to tack arbitrary data to a job. Note
   that you may opt to use Symbols directly on the object instead.

### Batching

It is conceivable that in the future this module might gain the
ability to reuse blender instances. If it does, each subsequent job
can save up to the amount of time blender takes to initialize
itself. The implementation does not support that now, but provides a
batching API.

The exported `BabylonjsBlenderWorker` class may be instantiated to
represent a reusable exporter instance. A worker is an object stream
which accepts job objects (see above) or strings. The worker will
process one job object at a time and emit a job object upon
completion. If the `output` property was not set on the job, it will
be set as the job is consumed.

    const BabylonjsBlenderWorker = require('babylonjs-blender').BabylonjsBlenderWorker;
    const worker = new BabylonjsBlenderWorker();
    for (const job in ['a.blend', 'b.blend', ]) {
      worker.write(job);
    }
    worker.end();
    worker.on('data', job => {
      console.log(`${job.input} exported to ${job.output}`);
    });

As convenience, the worker also provides `process()` which returns a
Promise and behaves much like calling the module as a function
directly except that it uses the current worker. It also uses the
streams interface, so if you have the stream piped to anywhere or are
listening on any stream events, you will observe jobs created by
it. You are free to mix this with streams-style code or call it
multiple times prior to completion.

    const BabylonjsBlenderWorker = require('babylonjs-blender').BabylonjsBlenderWorker;
    const worker = new BabylonjsBlenderWorker();
    worker.process('x.blend')
      .then(job => {
        console.log(`${job.input} exported to ${job.output}`);
      });
    worker.end();

If you have a large number of jobs, it is recommended to pool workers
and distribute jobs among them as they become available. Currently I
do not know of a very easy way to do this, but I think [the
implementation of the CLI](bin/node-babylonjs-blender.js) is an
example of how to accomplish this.

The constructor accepts `options` which is passed through to the
`Transform` constructor. You may override things like `highWaterMark`
if you use that to control load balancing among workers (I haven’t
found a good solution for this yet, but I’m imagining that a stream
fanout/fanin construct could be made and automtaically balance based
on `highWaterMark` and
[`drain`](https://nodejs.org/api/stream.html#stream_event_drain)).
