#!/usr/bin/env node
'use strict';

const stdioChat = require('./stdio-chat.js');

const chat = new stdioChat(process.stdin, process.stdout);
chat.input.pipe(chat.output);
