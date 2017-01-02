#!/usr/bin/env python

import bpy
import os
import sys

input = os.getenv('NODEJS_BABYLONJS_BLENDER_INPUT')
output = os.getenv('NODEJS_BABYLONJS_BLENDER_OUTPUT')

print('input=%s' % input, file=sys.stderr)
print('output=%s' % output, file=sys.stderr)

bpy.ops.wm.open_mainfile(filepath=input)
# Because it is broken, the exporter fails if it does not receive a
# full path because it relies on being able to
# mkdir(dirname(filepath)) if not path.isdir(dirname(filepath)) which
# fails when filepath has no slashes in it.
output = os.path.abspath(output)

# Correct way to check for operator existence:
# https://developer.blender.org/T38120
if not 'bjs' in dir(bpy.ops):
    # Try enabling it
    bpy.ops.wm.addon_enable(module='babylon-js')
if 'bjs' in dir(bpy.ops):
    # Get access to the scene to set props on it. http://blender.stackexchange.com/a/39346/20603
    bpy.context.scene.inlineTextures = True

    bpy.ops.bjs.main(filepath=output)
elif 'babylon' in dir(bpy.ops.scene):
    # Fallback to old name of API.
    bpy.ops.scene.babylon(filepath=output)
else:
    print('Blender BabylonJS Export AddOn API not found anywhere. Please ensure you have installed the addon available at https://github.com/BabylonJS/Babylon.js/tree/master/Exporters/Blender into Blender and saved your user preferences or file a bug at https://github.com/binki/node-babylonjs-blender/issues.', file=sys.stderr)
    sys.exit(1)
