'use strict';

const assert = require('assert');
const crossSpawn = require('cross-spawn');
const path = require('path');
const stdioChat = require('../stdio-chat.js');
const through2 = require('through2');

describe('stdio-chat', function () {
  it('emit one base64-encoded line when written to', function (done) {
    const input = through2.obj();
    const output = through2.obj()
          .on('data', (data) => {
            const newlineMatch = /^([^]+)\n$/.exec(data);
            assert.ok(newlineMatch, `Line did not match regex verifying newline: “${data}” (${encodeURIComponent(data)})`);
            Buffer.from(newlineMatch[1], 'base64');
            done();
          })
    ;
    const chat = new stdioChat(input, output);
    chat.output.write('hi');
    chat.output.end();
  });

  it('send another instance of itself a message', function (done) {
    const aToB = through2.obj();
    const bToA = through2.obj();

    const a = new stdioChat(bToA, aToB);
    const b = new stdioChat(aToB, bToA);

    b.input.on('data', function (message) {
      assert.strictEqual(message.hi, 'はい', 'Message missing sent data.');
      done();
    });
    a.output.write({hi: 'はい'});
  });

  it('resend a corrupted message', function (done) {
    // Corrupts first n chunks.
    const Corruptor = function (n) {
      this.count = 0;
      this.corruptionsCount = 0;
      this.stream = through2.obj((chunk, encoding, callback) => {
        this.count++;
        if (n) {
          this.corruptionsCount++;
          chunk = chunk.slice(4);
          n--;
        }
        callback(null, chunk);
      });
    };

    const aToB = new Corruptor(1);
    const bToA = new Corruptor(1);

    const a = new stdioChat(bToA.stream, aToB.stream);
    const b = new stdioChat(aToB.stream, bToA.stream);

    b.input.on('data', function (message) {
      assert.strictEqual(message.value, 'value', 'Message missing sent data.');
      // Sender should send corrupted message, received corrupted NAK,
      // send NAK, received NAK, resend message. So sender should send
      // 3 messages by the time we get to this handler.
      assert.strictEqual(3, aToB.count, 'A should have sent 3 messages to B.');
      assert.strictEqual(1, aToB.corruptionsCount, 'A should have sent 1 corrupt messages to B.');
      done();
    });
    a.output.write({value: 'value'});
  });

  it('sends multiple messages', function (done) {
    const aToB = through2.obj();
    const bToA = through2.obj();

    const a = new stdioChat(bToA, aToB);
    const b = new stdioChat(aToB, bToA);

    const receivedMessages = [];
    b.input.on('data', (message) => {
      assert.strictEqual(message.i, receivedMessages.length, 'Received message out of order');
      receivedMessages.push(message);
    });
    b.input.on('end', () => {
      assert.strictEqual(receivedMessages.length, 16, 'received wrong number of messages');
      done();
    });
    for (let i = 0; i < 16; i++) {
      a.output.write({i: i});
    }
    a.output.end();
  });

  [
    {
      name: 'spawn',
      crossSpawnArgsPromise: Promise.resolve(['node', [path.join(path.dirname(__dirname), 'stdio-chat-echo.js')]]),
    },
    {
      name: 'python+spawn',
      crossSpawnArgsPromise: Promise.all(['python3', 'python'].map(python => new Promise((resolve, reject) => {
        crossSpawn(python, ['-c', 'None'])
          .on('exit', code => resolve(python))
          .on('error', () => resolve())
        ;
      }))).then(pythons => {
        console.log(`pythons: ${JSON.stringify(pythons)}`);
        pythons = pythons.filter(python => python);
        if (!pythons.length) {
          throw new Error('Unable to find a python');
        }
        console.log(`chose ${pythons[0]}`);
        return [pythons[0], [path.join(path.dirname(__dirname), 'stdio_chat_echo.py')]];
      }),
    },
  ].forEach(scenario => {
    it(`works with ${scenario.name}`, function (done) {
      this.timeout(20000);
      scenario.crossSpawnArgsPromise.then(crossSpawnArgs => {
        console.log(`given args ${JSON.stringify(crossSpawnArgs)}`);
        const child = crossSpawn.apply(crossSpawn, crossSpawnArgs.concat([
          {
            stdio: ['pipe', 'pipe', 'inherit'],
          },
        ]));
        const chat = new stdioChat(child.stdout, child.stdin);
        chat.output.write({a: 'hi',});
        chat.output.write({b: 'there',});
        chat.output.end();
        const received = [];
        chat.input.on('data', function (chunk) {
          console.log(`Received chunk: ${JSON.stringify(chunk)}`);
          received.push(chunk);
        });
        chat.input.on('end', function () {
          assert.strictEqual(received.length, 2, 'Received fewer messages than expected');
          assert.strictEqual(received[0].a, 'hi', `First message had different value than expected: ${JSON.stringify(received[0])}`);
          assert.strictEqual(received[1].b, 'there', `Second message had different value than expected: ${JSON.stringify(received[1])}`);
          done();
        });
      });
    });
  });
});
