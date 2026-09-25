#!/usr/bin/env python3
"""Optional Python 3 standard-library launcher.
Default: loopback only. --lan explicitly opts in to an unauthenticated HTTP
server on the local network. Use only a trusted private network; no port forwarding.
Playing the standalone HTML file does not need Python.
"""
from __future__ import annotations
import argparse, socket, threading, webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

def main() -> int:
    parser=argparse.ArgumentParser(description='Orbital Courier 9: optional local server')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--no-browser',action='store_true')
    parser.add_argument('--lan',action='store_true',help='Explicitly serve this game folder on a trusted local network')
    args=parser.parse_args()
    if not 1024<=args.port<=65535:parser.error('Port must be 1024..65535')
    folder=Path(__file__).resolve().parent
    handler=partial(SimpleHTTPRequestHandler,directory=str(folder))
    host='0.0.0.0' if args.lan else '127.0.0.1'
    try:server=ThreadingHTTPServer((host,args.port),handler)
    except OSError as error:
        print(f'Cannot start: {error}\nTry another port: python start_server.py --port 8766')
        return 1
    url=f'http://127.0.0.1:{args.port}/Orbital%20Courier.html'
    print(f'Orbital Courier 9 is ready:\n{url}\nKeep this window open. Ctrl+C stops the server.')
    if args.lan:
        print('\nLAN mode enabled. Both devices must be on your trusted private network.')
        print('Only game files should be stored in this folder. No accounts, TLS or access password.')
        print('Do not forward this port on your router. Close this window after playing.')
        try:ips=sorted({x[4][0] for x in socket.getaddrinfo(socket.gethostname(),None,socket.AF_INET) if not x[4][0].startswith('127.')})
        except OSError:ips=[]
        for ip in ips:print(f'Phone address candidate: http://{ip}:{args.port}/Orbital%20Courier.html')
        if not ips:print(f'Find the computer IPv4 address (Windows: ipconfig). Phone URL: http://<PC_IPV4>:{args.port}/Orbital%20Courier.html')
    if not args.no_browser:threading.Timer(.35,lambda:webbrowser.open(url)).start()
    try:server.serve_forever()
    except KeyboardInterrupt:print('\nServer stopped. Export your progress before moving to another address or browser.')
    finally:server.server_close()
    return 0
if __name__=='__main__':raise SystemExit(main())
