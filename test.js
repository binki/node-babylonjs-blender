#!/usr/bin/env node
'use strict';

const fs = require('fs');

try {
  fs
  .readdirSync('tests')
  .filter(fn => /\.test\.js$/.test(fn))
  .map(fn => require(`./tests/${fn}`))
  ;
} catch (ex) {
  console.warn('These tests (and this project) requires you to have blender in PATH and have installed the babylonjs exporter plugin from https://github.com/BabylonJS/Babylon.js/tree/master/Exporters/Blender. Please consider if the failure is due to lack of environment configuration or consider contributing a patch which reduces the amount of necessary environment configuration without discriminating against users with particular setups.');
  throw ex;
}
