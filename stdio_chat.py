import base64
import binascii
import collections
import hashlib
import json
import sys

# The protocol is layered.
#
# Each line is one wire message. Each wire message is base64-encoded
# data (the line break suggestions of the base64 standard are
# ignored/disallowed because a line break indicates a new message).
#
# The decoded wire message is an MD5 hash of the message body followed
# by the message body. The idea is that if the implementation were to
# use streaming it could read in the hash and then use streaming to
# incrementally calculate the hash on the remainder of the line.
#
# The message body is UTF8 encoded JSON with various keys with
# different meanings:
#
# message: The message itself. Encoded as JSON natively. Only valid if
# message_id is specified.
#
# message_id: This specifies the sequence string of the message for
# the sake of ACKs. Only valid if message is specified.
#
# ack_id: This specifies a message_id string that the writer is
# ACKing.
#
# nak: Set to true if the last received message is invalid.
#
# eof: Set to true if the sender is ready for the recipient to close
# the sender's input stream. When receiving, may close output stream
# as soon as output queue is flushed. Without this, impossible to
# figure out if all ACKs have been received by the other party. Also,
# this should trigger the higher level code to see that input has
# closed (which, e.g., for an echo server would be its trigger to
# close its high-level abstraction output).
#
# When a party writes to the channel, it must generate a new
# message_id and pack it into a wire message with message and
# message_id keys and then write that to the channel. Then it must
# read a line and parse it. If the message is parsable as a message
# and includes a message_id, queue the message body in the inbox and
# send an ACK. If the message fails to parse it as a message or the
# found message does not contain an ack_id matching the message_id of
# the sent message, resend the originally sent message and repeat this
# process.
#
# When a party reads from the channel, it will parse each line. If the
# line does not parse, it should send a nak:true message (so that if
# the other party is sending it knows to retry). If the line parses,
# it shall check if it has message and message_id. If the message
# doesn’t, the process starts over (do not send nak:true). Once a
# message is received, put it in the inbox and send an ack_id for that
# message.
#
# When a party places a message in its inbox, it shall record the
# message’s message_id. If the other party resends the package, the
# receiver must resend an ack for that message.

DEBUG = False

hash = hashlib.md5()

def parse(line):
    '''
    Returns False if the input is invalid or the message body (a dict) if
    successfully parsed.
    '''
    try:
        bytes = base64.b64decode(line)
    except binascii.Error:
        return False

    DEBUG and print('Have {} bytes of data successfully base64decoded'.format(len(bytes)), file=sys.stderr)
    if len(bytes) < hash.digest_size:
        return False

    received_digest = bytes[:hash.digest_size]
    received_data = bytes[hash.digest_size:]
    calculated_hash = hash.copy()
    calculated_hash.update(received_data)
    calculated_digest = calculated_hash.digest()
    DEBUG and print('digested. matches={}'.format(received_digest == calculated_digest), file=sys.stderr)
    if received_digest != calculated_digest:
        return False

    try:
        data = received_data.decode('utf-8')
    except UnicodeError:
        return False

    DEBUG and print('decoded to {}'.format(data), file=sys.stderr)
    try:
        data = json.loads(data)
    except json.JSONDecodeError:
        return False
    DEBUG and print('valid JSON', data, file=sys.stderr)

    if not isinstance(data, dict):
        return False

    return data

class Endpoint(object):
    def format(message):
        '''
        Formats a message as a line that can be printed
        '''
        assert isinstance(message, dict)
        DEBUG and print('formatting', message, file=sys.stderr)

        data = json.dumps(message).encode('utf-8')
        calculated_hash = hash.copy()
        calculated_hash.update(data)
        return base64.b64encode(calculated_hash.digest() + data).decode()

    def __init__(self, input, output):
        self.output = output
        self.input = input
        self.inbox = collections.deque()
        self.last_accepted_message_id = None
        self.last_sent_id = 0
        self.eof = False

    def process_input(self):
        '''
        Returns the read message, False if no message, None if EOF.
        '''
        line = self.input.readline()
        if line == '':
            # eof
            return None

        data = parse(line)
        self.handle_data(data)
        return data

    def handle_data(self, data):
        if 'message_id' in data:
            message_id = data['message_id']
            if message_id != self.last_accepted_message_id and 'message' in data:
                self.inbox.append(data['message'])
            self.last_accepted_message_id = message_id
            print(Endpoint.format({'ack_id': message_id}), file=self.output)
            self.output.flush()

        if 'eof' in data and data['eof']:
            self.eof = True

    def send(self, message):
        self.last_sent_id += 1
        id = str(self.last_sent_id)
        DEBUG and print('sending {}'.format(id), file=sys.stderr)
        formatted = Endpoint.format({'message_id': id, 'message': message})
        while True:
            print(formatted, file=self.output)
            self.output.flush()
            while True:
                received = self.process_input()
                if received is None:
                    return

                if received == False:
                    continue

                if 'ack_id' in received and received['ack_id'] == id:
                    return

                break

    def recv(self):
        while not len(self.inbox):
            DEBUG and print('going to wait for input… eof={}'.format(self.eof), file=sys.stderr)
            if self.eof or self.process_input() is None:
                DEBUG and print('end of input detected', file=sys.stderr)
                # When about to return EOF to the user, we can
                # actually close the output stream.
                self.output.close()
                return None
        return self.inbox.popleft()
