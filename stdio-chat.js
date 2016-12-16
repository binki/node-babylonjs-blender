'use strict';

const crypto = require('crypto');
const readline = require('readline');
const through2 = require('through2');
const verror = require('verror');

const createHash = () => crypto.createHash('md5');

const hashWidth = createHash().digest().length;

const ReferenceCount = function (count, reclaim) {
  this.ref = () => {
    if (!count) {
      throw new Error('Attempt to reference a reclaimed reference counter.');
    }
    count++;
  };
  this.unref = () => {
    if (!count) {
      throw new Error('Attempt to reduce reference counter to less than 0.');
    }
    if (!--count) {
      reclaim();
    }
  };
};

/**
 * \brief
 *   An endpoint for communicating with another stdio-chat implementation.
 *
 * Emits event 'warning' when processing a line fails. This is assumed
 * to be part of the normal operations of stdio-chat, but when
 * debugging stdio-chat itself this information can be helpful.
 *
 * \param input
 *   The stream to read data from another stdio-chat.
 * \param output
 *   The stream to write data to the other stdio-chat.
 */
const Endpoint = function (input, output) {
  if (!input) throw new Error('Parameter null: input');
  if (!output) throw new Error('Parameter null: output');
  const lineReaderWriter = readline.createInterface({
    input: input,
    terminal: false,
  });

  // For things which need to observe that a line was received at all
  // and see both invalid and valid messages. If a message of any sort
  // can be decoded, it is passed to the consumer as chunk.data. If a
  // line was received but could not be decoded, an empty object is
  // sent.
  const rawInputMessageStream = through2.obj(function (chunk, encoding, callback) {
    const fail = () => {
      callback(null, {});
    };

    /* base64 */
    let buf;
    try {
      buf = Buffer.from(chunk, 'base64');
    } catch (ex) {
      return fail();
    }
    if (buf.length < hashWidth) {
      return fail();
    }

    /* hash */
    const receivedHash = buf.slice(0, hashWidth);
    const receivedDataBytes = buf.slice(hashWidth);
    const calculatedHash = [receivedDataBytes].reduce((accumulator, value) => {
      accumulator.update(value);
      return accumulator;
    }, createHash()).digest();
    if (!calculatedHash.equals(receivedHash)) {
      console.warn(`Received base64 message but md5 verification failed. Calculated: ${calculatedHash.toString('hex')}, remote provided hash: ${receivedHash.toString('hex')}`);
      return fail();
    }

    /* UTF-8 */
    let receivedJson;
    try {
      receivedJson = receivedDataBytes.toString('utf-8');
    } catch (ex) {
      console.warn(`Received message did not decode as UTF-8: ${ex}`);
      return fail();
    }

    /* JSON */
    let receivedData;
    try {
      receivedData = JSON.parse(receivedJson);
    } catch (ex) {
      console.warn(`Received message is not valid JSON: ${ex}, data: ${receivedData}`);
      return fail();
    }

    callback(null, {
      data: receivedData,
    });
  });
  lineReaderWriter.on('line', line => rawInputMessageStream.write(line));
  lineReaderWriter.on('close', () => rawInputMessageStream.end());

  const rawOutputMessageStream = through2.obj(function (chunk, encoding, callback) {
    const body = Buffer.from(JSON.stringify(chunk));
    const hash = createHash();
    hash.update(body);

    callback(null, Buffer.concat([hash.digest(), body]).toString('base64') + '\r\n');
  });
  // Necessary to track closedness because we might close it when
  // there is still trailing junk data on the input stream.
  let rawOutputMessageStreamClosed = false;
  // Two references: one for input to unref when receiving eof=true,
  // another for output to unref when we’re done sending all output.
  const rawOutputMessageStreamRefCount = new ReferenceCount(2, () => {
    rawOutputMessageStreamClosed = true;
    rawOutputMessageStream.end();
  });

  // For external to read messages.
  this.input = through2.obj();

  // Always-on raw message handlers
  let last_acked_message;
  let input_ended = false;
  const handle_eof = () => {
    if (!input_ended) {
      input_ended = true;
      this.input.end();
      rawOutputMessageStreamRefCount.unref();
    }
  };
  rawInputMessageStream.pipe(through2.obj((chunk, encoding, callback) => {
    // If there’s no data key, we received a line which couldn’t be
    // parsed. We must send a NAK.
    const data = chunk.data;
    if (data === undefined) {
      rawOutputMessageStream.write({nak: true});
      return callback();
    }

    const message = data.message;
    if (message) {
      if (data.message_id === undefined) {
        console.warn('Received message without identifier. Ignoring (would be unable to ACK or detect retransmission!)');
      } else {
        rawOutputMessageStream.write({ack_id: data.message_id});
        // Don’t re-receive an already-received message
        if (data.message_id !== last_acked_message) {
          this.input.write(message);
        }
        last_acked_message = data.message_id;
      }
    }

    // Handle eof. If the sender sends eof, that means we are
    // permitted to close our output. The whole ref()/unref() thing
    // prevents the output from closing until after we receive an ACK
    // if applicable. If the sender sends eof, that also means that we
    // will receive no more high-level messages from the sender. This
    // means we have to end the this.input—but still leave our raw
    // input open. This way, the caller can tell that we have EOF and
    // can react while we still can continue trying to send out our
    // last message if we had queued output messages (because that
    // requires raw input still being open).
    if (data.eof) {
      handle_eof();
    }

    callback();
  }, function (callback) {
    // Handle “hard” eof if necessary (this is how our Python
    // implementation does it).
    handle_eof();
  }));

  // For external to write messages.
  let outputSequence = 0;
  this.output = through2.obj(function (chunk, encoding, callback) {
    outputSequence = (outputSequence + 1) % 10;
    const sentData = {message_id: outputSequence, message: chunk};

    let handleInputData;
    let handleInputEnd;
    const unsubscribe = (ex) => {
      rawInputMessageStream.removeListener('data', handleInputData);
      rawInputMessageStream.removeListener('end', handleInputEnd);
      callback(ex);
    };
    rawInputMessageStream
      .on('data', handleInputData = data => {
        if (data.data && data.data.ack_id === outputSequence) {
          // Success!
          unsubscribe();
        } else {
          rawOutputMessageStream.write(sentData);
        }
      })
      .on('end', handleInputEnd = () => unsubscribe(new Error('Input stream closed before ACK received')))
    ;
    rawOutputMessageStream.write(sentData);
  }, function (callback) {
    // Handle eof: write and wait for either input to yield an eof or
    // be closed by the other party.
    const sentData = {eof: true};
    let handleInputData;
    let handleInputEnd;
    const unsubscribe = ex => {
      rawInputMessageStream.removeListener('data', handleInputData);
      rawInputMessageStream.removeListener('end', handleInputEnd);
      rawOutputMessageStreamRefCount.unref();
      callback(ex);
    };
    rawInputMessageStream
      .on('data', handleInputData = data => {
        if (data.data && data.data.eof) {
          // Success!
          unsubscribe();
        } else {
          rawOutputMessageStream.write(sentData);
        }
      })
      .on('end', handleInputEnd = () => unsubscribe())
    ;
    rawOutputMessageStream.write(sentData);
  });

  rawOutputMessageStream.pipe(output);
};

module.exports = Endpoint;
