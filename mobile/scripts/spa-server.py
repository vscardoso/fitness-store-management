"""Servidor estático com volta para index.html (rota do app). Uso: python spa_server.py <pasta> <porta>"""
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

root, port = sys.argv[1], int(sys.argv[2])


class H(SimpleHTTPRequestHandler):
    def do_GET(self):
        p = self.translate_path(self.path.split("?")[0])
        if not os.path.exists(p) or os.path.isdir(p):
            self.path = "/index.html"
        return super().do_GET()

    def log_message(self, *a):
        pass


ThreadingHTTPServer(("127.0.0.1", port), partial(H, directory=root)).serve_forever()
