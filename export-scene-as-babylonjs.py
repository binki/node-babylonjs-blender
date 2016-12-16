#!/usr/bin/env python

import bpy
import os
import sys

input = os.getenv('NODEJS_BABYLONJS_BLENDER_INPUT')
output = os.getenv('NODEJS_BABYLONJS_BLENDER_OUTPUT')
disable_stdio_chat = os.getenv('NODEJS_BABYLONJS_BLENDER_NOSTDIOCHAT')

print('input=%s' % input, file=sys.stderr)
print('output=%s' % output, file=sys.stderr)

# Discover the export method.
export_method = None
# Correct way to check for operator existence:
# https://developer.blender.org/T38120
if not 'bjs' in dir(bpy.ops):
    # Try enabling it
    bpy.ops.wm.addon_enable(module='babylon-js')
if 'bjs' in dir(bpy.ops):
    export_method = bpy.ops.bjs.main
elif 'babylon' in dir(bpy.ops.scene):
    # Fallback to old name of API.
    export_method = bpy.ops.scene.babylon

if not export_method:
    print('Blender BabylonJS Export AddOn API not found anywhere. Please ensure you have installed the addon available at https://github.com/BabylonJS/Babylon.js/tree/master/Exporters/Blender into Blender and saved your user preferences or file a bug at https://github.com/binki/node-babylonjs-blender/issues.', file=sys.stderr)
    sys.exit(1)

def process(input, output):
    bpy.ops.wm.open_mainfile(filepath=input)
    # Because it is broken, the exporter fails if it does not receive a
    # full path because it relies on being able to
    # mkdir(dirname(filepath)) if not path.isdir(dirname(filepath)) which
    # fails when filepath has no slashes in it.
    output = os.path.abspath(output)
    export_method(filepath=output)

process(input, output)

# Skip stdio_chat if requested
if disable_stdio_chat is None:
    sys.path.append(os.path.dirname(__file__))
    import stdio_chat
    # Open stdio_chat.
    endpoint = stdio_chat.Endpoint(sys.stdin, sys.stdout)
    sys.stdout.flush()

    while True:
        # Send success message.
        endpoint.send(True)

        message = endpoint.recv()
        if message is None:
            break

        process(message['input'], message['output'])
