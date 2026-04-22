"""
algorithms.py
=============
Manual Python implementations of Dijkstra's and Bellman-Ford algorithms
for network routing performance analysis.

These are the same algorithms used in the interactive HTML application,
re-expressed in clean Python for academic submission and testing.

Course: Performance Analysis of Computer Networks
"""

import heapq
import time
import tracemalloc
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# DATA CLASSES
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class AlgoStep:
    """Represents one step of algorithm execution for visualization."""
    step_num: int
    step_type: str           # 'init' | 'visit' | 'relax' | 'pass' | 'converge' | 'negcycle' | 'done'
    description: str
    distances: dict          # current distance estimates
    current_node: Optional[str] = None
    visited: Set = field(default_factory=set)
    relaxed_edge: Optional[tuple] = None   # (from, to, weight)
    improved: bool = False
    pass_num: int = 0


@dataclass
class AlgoResult:
    """Complete result of one algorithm execution."""
    algorithm: str           # 'dijkstra' | 'bellman-ford'
    source: str
    distances: dict          # final shortest distances
    predecessors: dict       # prev node on shortest path
    paths: dict              # node → path list
    steps: List[AlgoStep]
    execution_time_ms: float
    relaxation_count: int
    pass_count: int
    negative_cycle: bool = False
    negative_weights: bool = False

    def shortest_path(self, target: str) -> List[str]:
        return self.paths.get(target, [])

    def path_cost(self, target: str) -> float:
        return self.distances.get(target, float('inf'))


# ─────────────────────────────────────────────────────────────────────────────
# DIJKSTRA'S ALGORITHM
# ─────────────────────────────────────────────────────────────────────────────

def dijkstra(graph: dict, source: str, directed: bool = False) -> AlgoResult:
    """
    Dijkstra's shortest-path algorithm — manual implementation.

    Uses a binary min-heap (priority queue). Correct only for non-negative
    edge weights. Models centralized link-state routing (e.g. OSPF).

    Parameters
    ----------
    graph    : adjacency dict {node: [(neighbor, weight, edge_id), ...]}
    source   : starting node ID
    directed : if False, edges are traversed in both directions

    Returns
    -------
    AlgoResult with full step trace

    Complexity: O((V + E) log V)
    """
    INF = float('inf')
    nodes = list(graph.keys())

    # Check for negative weights
    neg_weights = any(w < 0 for nlist in graph.values() for _, w, _ in nlist)

    # Initialization
    dist = {n: INF for n in nodes}
    pred = {n: None for n in nodes}
    dist[source] = 0
    visited: Set[str] = set()

    # Min-heap: (distance, node_id)
    heap = [(0, source)]
    steps: List[AlgoStep] = []
    step_num = 0
    relax_count = 0

    steps.append(AlgoStep(
        step_num=step_num,
        step_type='init',
        description=f'Initialize: dist[{source}] = 0, all others = ∞',
        distances=dict(dist),
        visited=set(),
    ))

    tracemalloc.start()
    t0 = time.perf_counter()

    while heap:
        d_u, u = heapq.heappop(heap)

        # Skip if already processed (lazy deletion pattern)
        if u in visited:
            continue
        visited.add(u)
        step_num += 1

        steps.append(AlgoStep(
            step_num=step_num,
            step_type='visit',
            description=f'Visit node {u} (current dist = {d_u if d_u < INF else "∞"})',
            distances=dict(dist),
            current_node=u,
            visited=set(visited),
        ))

        if dist[u] == INF:
            break  # remaining nodes are unreachable

        # Relax all outgoing edges from u
        for (v, w, eid) in graph.get(u, []):
            if v in visited:
                continue

            relax_count += 1
            new_dist = dist[u] + w
            improved = new_dist < dist[v]

            if improved:
                dist[v] = new_dist
                pred[v] = u
                heapq.heappush(heap, (new_dist, v))

            step_num += 1
            steps.append(AlgoStep(
                step_num=step_num,
                step_type='relax',
                description=(
                    f'Relax {u}→{v} (w={w}): '
                    f'{"UPDATE dist[" + v + "] = " + str(d_u) + "+" + str(w) + " = " + str(new_dist) if improved else "no improvement (" + str(new_dist) + " ≥ " + str(dist[v]) + ")"}'
                ),
                distances=dict(dist),
                current_node=u,
                visited=set(visited),
                relaxed_edge=(u, v, w),
                improved=improved,
            ))

    elapsed = (time.perf_counter() - t0) * 1000
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    # Build all shortest paths
    paths = {n: _build_path(pred, source, n) for n in nodes}

    step_num += 1
    steps.append(AlgoStep(
        step_num=step_num,
        step_type='done',
        description=f'Dijkstra complete. Source: {source}. '
                    f'{"⚠ Negative weights — results may be incorrect." if neg_weights else ""}',
        distances=dict(dist),
        visited=set(visited),
    ))

    return AlgoResult(
        algorithm='dijkstra',
        source=source,
        distances=dist,
        predecessors=pred,
        paths=paths,
        steps=steps,
        execution_time_ms=round(elapsed, 4),
        relaxation_count=relax_count,
        pass_count=len([s for s in steps if s.step_type == 'visit']),
        negative_weights=neg_weights,
    )


# ─────────────────────────────────────────────────────────────────────────────
# BELLMAN-FORD ALGORITHM
# ─────────────────────────────────────────────────────────────────────────────

def bellman_ford(graph: dict, source: str, directed: bool = False) -> AlgoResult:
    """
    Bellman-Ford shortest-path algorithm — manual implementation.

    Performs V-1 relaxation passes over all edges. Supports negative weights
    and detects negative cycles. Models distributed distance-vector routing
    (e.g. RIP).

    Parameters
    ----------
    graph    : adjacency dict {node: [(neighbor, weight, edge_id), ...]}
    source   : starting node ID
    directed : if False, edges are traversed in both directions

    Returns
    -------
    AlgoResult with full step trace

    Complexity: O(V · E)
    """
    INF = float('inf')
    nodes = list(graph.keys())
    n = len(nodes)

    # Build flat edge list (undirected → add both directions)
    edges = []
    seen_eids = set()
    for u, neighbors in graph.items():
        for (v, w, eid) in neighbors:
            fwd_key = (u, v)
            if fwd_key not in seen_eids:
                edges.append((u, v, w, eid))
                seen_eids.add(fwd_key)
                if not directed:
                    edges.append((v, u, w, eid + '_r'))
                    seen_eids.add((v, u))

    # Initialization
    dist = {nd: INF for nd in nodes}
    pred = {nd: None for nd in nodes}
    dist[source] = 0

    steps: List[AlgoStep] = []
    step_num = 0
    relax_count = 0
    pass_count = 0
    negative_cycle = False

    steps.append(AlgoStep(
        step_num=step_num,
        step_type='init',
        description=f'Initialize: dist[{source}] = 0, all others = ∞',
        distances=dict(dist),
    ))

    tracemalloc.start()
    t0 = time.perf_counter()

    # V-1 relaxation passes
    for pass_num in range(1, n):
        changed = False
        pass_count += 1
        updated_in_pass = []

        step_num += 1
        steps.append(AlgoStep(
            step_num=step_num,
            step_type='pass',
            description=f'Pass {pass_num}/{n-1}: relax all {len(edges)} edges',
            distances=dict(dist),
            visited={nd for nd in nodes if dist[nd] < INF},
            pass_num=pass_num,
        ))

        for (u, v, w, eid) in edges:
            if dist[u] == INF:
                continue

            relax_count += 1
            new_dist = dist[u] + w
            improved = new_dist < dist[v]

            if improved:
                dist[v] = new_dist
                pred[v] = u
                changed = True
                updated_in_pass.append((u, v, w))

            step_num += 1
            steps.append(AlgoStep(
                step_num=step_num,
                step_type='relax',
                description=(
                    f'Pass {pass_num}, edge {u}→{v} (w={w}): '
                    f'{"UPDATE dist[" + v + "] = " + str(new_dist) if improved else "no improvement"}'
                ),
                distances=dict(dist),
                current_node=u,
                visited={nd for nd in nodes if dist[nd] < INF},
                relaxed_edge=(u, v, w),
                improved=improved,
                pass_num=pass_num,
            ))

        if not changed:
            step_num += 1
            steps.append(AlgoStep(
                step_num=step_num,
                step_type='converge',
                description=f'Converged early after pass {pass_num} — no distances changed',
                distances=dict(dist),
                visited={nd for nd in nodes if dist[nd] < INF},
                pass_num=pass_num,
            ))
            break

    # N-th pass to detect negative cycles
    for (u, v, w, _) in edges:
        if dist[u] != INF and dist[u] + w < dist[v]:
            negative_cycle = True
            step_num += 1
            steps.append(AlgoStep(
                step_num=step_num,
                step_type='negcycle',
                description=f'⚠ NEGATIVE CYCLE DETECTED: edge {u}→{v} (w={w}) still improves. No valid shortest paths.',
                distances=dict(dist),
                relaxed_edge=(u, v, w),
            ))
            break

    elapsed = (time.perf_counter() - t0) * 1000
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    paths = {} if negative_cycle else {nd: _build_path(pred, source, nd) for nd in nodes}

    step_num += 1
    steps.append(AlgoStep(
        step_num=step_num,
        step_type='done',
        description=(
            '⚠ Algorithm detected a negative cycle — paths are unreliable.'
            if negative_cycle else
            f'Bellman-Ford complete after {pass_count} passes. Source: {source}.'
        ),
        distances=dict(dist),
        visited={nd for nd in nodes if dist[nd] < INF},
    ))

    return AlgoResult(
        algorithm='bellman-ford',
        source=source,
        distances=dist,
        predecessors=pred,
        paths=paths,
        steps=steps,
        execution_time_ms=round(elapsed, 4),
        relaxation_count=relax_count,
        pass_count=pass_count,
        negative_cycle=negative_cycle,
    )


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _build_path(pred: dict, source: str, target: str) -> List[str]:
    """Reconstruct shortest path by following predecessor chain."""
    if target == source:
        return [source]
    path = []
    cur = target
    visited = set()
    while cur is not None:
        if cur in visited:  # cycle guard
            return []
        visited.add(cur)
        path.append(cur)
        if cur == source:
            return path[::-1]
        cur = pred.get(cur)
    return []  # unreachable


def networkx_to_adj(G) -> dict:
    """
    Convert a NetworkX graph to the adjacency dict format expected by
    dijkstra() and bellman_ford().

    adj[node] = [(neighbor, weight, edge_id), ...]
    """
    adj = {n: [] for n in G.nodes()}
    for i, (u, v, data) in enumerate(G.edges(data=True)):
        w = data.get('weight', 1)
        eid = f'e{i}'
        adj[u].append((v, w, eid))
        if not G.is_directed():
            adj[v].append((u, w, eid + '_r'))
    return adj


# ─────────────────────────────────────────────────────────────────────────────
# QUICK TEST
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    # Simple 6-node undirected graph
    adj = {
        'A': [('B', 4, 'e1'), ('D', 7, 'e2')],
        'B': [('A', 4, 'e1'), ('C', 9, 'e3'), ('D', 10, 'e4'), ('E', 11, 'e5')],
        'C': [('B', 9, 'e3'), ('E', 5, 'e6'), ('F', 2, 'e7')],
        'D': [('A', 7, 'e2'), ('B', 10, 'e4'), ('E', 3, 'e8'), ('F', 14, 'e9')],
        'E': [('B', 11, 'e5'), ('C', 5, 'e6'), ('D', 3, 'e8'), ('F', 6, 'e10')],
        'F': [('C', 2, 'e7'), ('D', 14, 'e9'), ('E', 6, 'e10')],
    }

    print('=== Dijkstra ===')
    r = dijkstra(adj, 'A')
    for node, d in sorted(r.distances.items()):
        path = ' → '.join(r.shortest_path(node))
        print(f'  {node}: dist={d}  path={path}')
    print(f'  Steps: {len(r.steps)}  Relaxations: {r.relaxation_count}  Time: {r.execution_time_ms:.4f}ms')

    print('\n=== Bellman-Ford ===')
    r2 = bellman_ford(adj, 'A')
    for node, d in sorted(r2.distances.items()):
        path = ' → '.join(r2.shortest_path(node))
        print(f'  {node}: dist={d}  path={path}')
    print(f'  Steps: {len(r2.steps)}  Relaxations: {r2.relaxation_count}  Passes: {r2.pass_count}  Time: {r2.execution_time_ms:.4f}ms')
