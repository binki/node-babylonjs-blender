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
   into Blender, enable it, and ensure you save your use profile. It
   is presumably possible that Blender might make it possible for
   scripts to temporarily enable addons for themselves (i.e., so that
   you can have the addon installed but disabled in Blender for normal
   work), but I don’t know how to do use Blender’s API—feel free to
   submit a patch to do so. However, installation of the addon itself
   is the job of the Package Manager you use, so I do not think that
   should be the responsibility of this module.

# Usage

Currently, the interfaces only permit handling operations at the files
level. Again, if other sorts of handling is needed, please submit
patches/issues to discuss both how to do this and what the API should
look like.

Currently, blender is interacted with in a sessionless way, but it is
possible that great performance gains could be realized by persisting
and reusing a blender instance for many scenes. The API does not know
about this at all, but the CLI supports batching and will
automatically gain any benefits from future performance work on this
route.

## CLI

Depending on how you use `npm`, the following might be how
you obtain this tool:

    $ npm install -g babylonjs-blender

The CLI is quite simplified but it does (pointlessly, for now) support
batching. Just specify all of the files that need to be exported as
arguments:

    $ node-babylonjs-blender myBlendFile1.blend myBlendFile2.blend

Each output shall be written out with `.blend` stripping off (if it
exists) and `.babylon` appended. Appending `.babylon` is not optional
and is intended to encourage respect of conventions.

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

    Promise babylonjsBlender(input, output)

The API requires a single input and output string which are
filenames. It yields a Promise whose value is meaningless but whose
resolution incidates success/completion.

    const babylonjsBlender = require('babylonjs-blender');
    babylonjsBlender('myFile.blend', 'myFile.babylon').then(() => {
      console.log('Blender finished.');
    });

To reference in your project, install [the npm `babylonjs-blender`
package](https://www.npmjs.com/package/babylonjs-blender) package:

    $ npm install --save babylonjs-blender
