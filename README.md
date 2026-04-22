# NetRoute Routing Analyzer

NetRoute is an interactive visual tool for learning and testing shortest-path routing algorithms.

It lets you:
- build a graph manually (nodes + weighted links),
- run Dijkstra or Bellman-Ford,
- step through each relaxation/visit operation,
- compare both algorithms on the same topology.

---

## What this project is

NetRoute is a browser-based simulator for **routing path computation**.

It is designed for:
- students learning computer networking and graph algorithms,
- instructors demonstrating shortest-path behavior live,
- quick experiments with positive/negative weights and failure scenarios.

Main files:
- `NetRoute_Routing_Analyzer.html` → page structure (UI layout)
- `netroute.css` → styles/theme/layout
- `netroute.js` → graph editor, algorithms, playback engine, rendering
- `algorithms.py` → Python reference implementation of the same algorithms
- `verify_server.py` → local verification API so frontend can validate results with Python

---

## Why this is useful

In routing classes, shortest-path algorithms are often taught as static formulas.

NetRoute makes them visual and interactive:
- you can see which node is selected next,
- which edge is being relaxed,
- how distance values change over time,
- when Bellman-Ford detects negative cycles.

This helps connect theory to behavior in actual network topologies.

---

## Core concepts used

- **Node**: router / host in a network graph
- **Edge**: link between nodes
- **Weight**: cost/metric of using that link (delay, cost, hops, etc.)
- **Source**: starting node where path computation begins
- **Target**: optional destination focus
- **Directed graph**: one-way links
- **Undirected graph**: two-way links

---

## How to run

### Option 1 (recommended): local server
From the project folder, run a simple HTTP server and open the HTML in the browser.

### Option 2: direct file open
You can also open the HTML file directly, but a local server is more reliable for browser behavior.

---

## How to use NetRoute

## 1) Build or load a graph

You can:
- click a sample scenario (Basic, Negative, Neg. Cycle, Medium, Large, Failure), or
- create your own graph manually.

## 2) Graph editor tools

- **Add Node**: click canvas to add a node
- **Add Edge**: click first node then second node
- **Move**: drag nodes to reposition
- **Delete**: click node/edge to remove
- **Set Weight**: click edge and enter new weight
- **Src/Dst**: choose source and optional target by clicking nodes

## 3) Configure graph settings

- choose **Undirected** or **Directed**,
- set default edge weight,
- use Fit / Zoom controls.

## 4) Run algorithm

- choose **Dijkstra** or **Bellman-Ford**,
- set Source (and optional Target),
- click **Run Algorithm**.

## 4.1) Verify with Python (optional but recommended)

This feature makes `algorithms.py` actively used by the web UI.

1. Start the verification server:
   - `python3 verify_server.py`
2. In NetRoute click **✓ Verify with Python**.
3. The app sends current graph + algorithm selection to Python and compares distances.

Status outcomes:
- **PASS**: JS and Python distances match
- **FAIL**: mismatch count shown (sample mismatches displayed)
- **Backend offline**: start `verify_server.py`

## 5) Playback controls

- Play/Pause,
- Step forward/back,
- Jump to start/end,
- Speed slider.

---

## Visualization legend and meaning

The visualization is state-driven. While stepping/playing:

- **Current node (orange)**: node currently processed
- **Visited node (green-ish)**: node finalized/settled in current step context
- **Source node (blue)**: algorithm start node
- **Target node (purple)**: destination focus node
- **Path edges (yellow/highlighted)**: currently reconstructed best path
- **Relaxed edge (red accent)**: edge currently evaluated for distance improvement

Distance badges near nodes show current best-known distances at that step.

---

## What happens when you click Play

When you click **Play**:

1. A timer advances `currentStep` through precomputed algorithm steps.
2. At each step, UI updates:
   - step description panel,
   - progress bar,
   - distance table,
   - canvas highlights.
3. Canvas redraw renders:
   - all edges,
   - all nodes,
   - active highlights for the current step state.
4. Playback stops automatically at the last step (or when paused/stopped).

So Play is not recomputing from scratch each frame. It is animating a stored step trace.

---

## Dijkstra vs Bellman-Ford (in this app)

## Dijkstra

- Fast on non-negative weights
- Uses greedy frontier expansion
- Can be wrong if negative edges exist

In NetRoute, a warning appears if negative weights are detected.

## Bellman-Ford

- Handles negative edge weights
- Slower (relaxes all edges in passes)
- Detects negative cycles

In NetRoute, a negative cycle triggers a clear warning in steps/results.

---

## Tabs and panels explained

## Distances tab

Shows step-by-step table:
- node label,
- current distance,
- predecessor (via),
- state (waiting/current/visited/unreachable).

## Results tab

Shows final run summary:
- algorithm name,
- execution time,
- relaxations and total steps,
- final distances and path(s).

## Compare tab

Runs both algorithms on same graph and compares:
- execution time bars,
- relaxation counts,
- final distances by node,
- warning notes for negatives/cycles.

## Event log

Chronological action/algorithm log for user operations and system messages.

---

## Sample scenarios (what they demonstrate)

- **Basic 6-Node**: standard positive-weight shortest paths
- **Negative Edges**: behavior difference Dijkstra vs Bellman-Ford
- **Neg. Cycle**: Bellman-Ford cycle detection
- **Medium / Large**: scaling and performance feel
- **Link Failure**: delete key links and rerun to observe rerouting

---

## Keyboard shortcuts

- `n` add node tool
- `e` add edge tool
- `m` move tool
- `d` delete tool
- `w` weight tool
- `s` source/target tool
- `space` run/play-pause
- `←` / `→` step back/forward
- `f` fit graph
- `Esc` stop algorithm / close modal context

---

## Typical learning workflow

1. Load **Basic 6-Node**.
2. Set source and target.
3. Run Dijkstra and press Play.
4. Observe edge relaxations and distance evolution.
5. Switch to **Negative Edges** and compare with Bellman-Ford.
6. Use **Compare** tab to evaluate both algorithms quantitatively.

---

## Troubleshooting

- If graph seems missing, use **FIT** and/or zoom controls.
- If interactions fail, refresh page and verify script file loads.
- If Dijkstra output looks strange with negative weights, use Bellman-Ford.
- If no route exists, check disconnected components or directed edge direction.

---

## Educational note

This project is a visualization and teaching tool. It emphasizes clarity of algorithm steps over backend-scale optimization.

For large production routing systems, additional constraints apply (dynamic updates, protocol convergence, distributed state, etc.).

---

## License / usage

Use this project for learning, coursework demonstrations, and algorithm experimentation.
