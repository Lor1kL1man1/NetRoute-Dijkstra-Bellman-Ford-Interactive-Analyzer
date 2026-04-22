"""
verify_server.py
----------------
Small local API that makes algorithms.py actively used by the web app.

Run:
    python3 verify_server.py

Then in NetRoute click: "Verify with Python".
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from typing import Dict, List, Tuple

from algorithms import dijkstra, bellman_ford

HOST = "127.0.0.1"
PORT = 8008


def build_adjacency(nodes: List[str], edges: List[dict], directed: bool) -> Dict[str, List[Tuple[str, float, str]]]:
    adj = {n: [] for n in nodes}
    for e in edges:
        eid = str(e.get("id", "e"))
        u = e.get("from")
        v = e.get("to")
        w = float(e.get("weight", 1))
        if u not in adj or v not in adj:
            continue
        adj[u].append((v, w, eid))
        if not directed:
            adj[v].append((u, w, eid + "_r"))
    return adj


def normalize_distances(dist: Dict[str, float]) -> Dict[str, float]:
    out = {}
    for k, v in dist.items():
        out[k] = None if v == float("inf") else v
    return out


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
            return

        self.send_response(404)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != "/verify":
            self.send_response(404)
            self._cors()
            self.end_headers()
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            data = json.loads(raw.decode("utf-8"))

            algorithm = data.get("algorithm", "dijkstra")
            source = data["source"]
            directed = bool(data.get("directed", False))
            nodes = data.get("nodes", [])
            edges = data.get("edges", [])

            adj = build_adjacency(nodes, edges, directed)
            if source not in adj:
                raise ValueError("Invalid source node")

            if algorithm == "bellman-ford":
                result = bellman_ford(adj, source, directed=directed)
            else:
                result = dijkstra(adj, source, directed=directed)

            payload = {
                "algorithm": result.algorithm,
                "source": result.source,
                "distances": normalize_distances(result.distances),
                "paths": result.paths,
                "negativeCycle": result.negative_cycle,
                "negativeWeights": result.negative_weights,
                "relaxationCount": result.relaxation_count,
                "passCount": result.pass_count,
                "executionTimeMs": result.execution_time_ms,
            }

            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode("utf-8"))

        except Exception as ex:
            self.send_response(400)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(ex)}).encode("utf-8"))


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), Handler)
    print(f"Python verify API running on http://{HOST}:{PORT}")
    print("Endpoints: GET /health, POST /verify")
    server.serve_forever()
