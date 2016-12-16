#!/usr/bin/env python3

import stdio_chat
import sys

endpoint = stdio_chat.Endpoint(sys.stdin, sys.stdout)
while True:
    message = endpoint.recv()
    if message is None:
        break
    endpoint.send(message)
