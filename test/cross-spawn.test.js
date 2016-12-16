'use strict';

const assert = require('assert');
const crossSpawn = require('cross-spawn');
const path = require('path');
const readline = require('readline');

describe('cross-spawn', function () {
  this.timeout(20000);

  it('should support pipe', function (done) {
    const child = crossSpawn('node', [
      path.join(path.dirname(__dirname), 'echo.js'),
    ], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    child.stdin.write('hi\r\n');
    child.stdin.write('there\r\n');
    child.stdin.end();
    const received = [];
    readline.createInterface({
      input: child.stdout,
    })
      .on('line', line => received.push(line.trim()))
      .on('close', () => {
        assert.strictEqual(received.length, 2, 'Expected more lines');
        assert.strictEqual(received[0], 'hi', 'first message');
        assert.strictEqual(received[1], 'there', 'second message');
        done();
      })
    ;
  });
});
