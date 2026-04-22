

/* ═══════════════════════════════════════════════════════════════════════════
   NETROUTE — Complete Interactive Routing Algorithm Analyzer
   
   Architecture:
   - Graph state: nodes (Map) + edges (Map)
   - Algorithm engine: produces step[] arrays with full trace data
   - Canvas renderer: draws graph + highlights per step
   - Player: animates through steps with configurable speed
   - UI: syncs sidebar panels with state
═══════════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────

const state = {
  // Graph data
  nodes: new Map(),       // id → {x, y, label}
  edges: new Map(),       // id → {from, to, weight}
  directed: false,
  nodeCounter: 0,
  edgeCounter: 0,

  // Selection
  source: null,
  target: null,
  selectedTool: 'addnode',

  // Editor temps
  edgeStartNode: null,     // for add-edge drag
  draggingNode: null,
  dragOffX: 0, dragOffY: 0,
  mouseX: 0, mouseY: 0,

  // Algorithm
  algorithm: 'dijkstra',   // 'dijkstra' | 'bellman-ford'
  steps: [],
  currentStep: -1,
  playing: false,
  playTimer: null,
  algoResult: null,        // final result after completion
  compareResult: null,

  // Rendering
  zoom: 1,
  panX: 0,
  panY: 0,
  showGrid: true,
  animFrame: null,
  initialized: false,
};

// ─────────────────────────────────────────────────────────
// CANVAS SETUP
// ─────────────────────────────────────────────────────────

const canvas = document.getElementById('graph-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  const area = document.getElementById('canvas-area');
  const rect = area.getBoundingClientRect();
  const fallbackW = Math.max(320, window.innerWidth - 560);
  const fallbackH = Math.max(240, window.innerHeight - 80);
  canvas.width  = Math.max(280, Math.floor(rect.width) || area.clientWidth || fallbackW);
  canvas.height = Math.max(220, Math.floor(rect.height) || area.clientHeight || fallbackH);

  // Avoid rendering during script bootstrap before constants/functions are ready.
  if (!state.initialized) return;

  if (canvas.width < 300 || canvas.height < 220) {
    notify('Canvas area is too small. Expand window or hide sidebars.', 'warn');
  }

  if (state.nodes.size) fitGraph();
  else drawAll();
}
window.addEventListener('resize', resizeCanvas);

// ─────────────────────────────────────────────────────────
// COORD TRANSFORMS
// ─────────────────────────────────────────────────────────

function worldToScreen(wx, wy) {
  const zoom = Number.isFinite(state.zoom) && state.zoom !== 0 ? state.zoom : 1;
  const panX = Number.isFinite(state.panX) ? state.panX : 0;
  const panY = Number.isFinite(state.panY) ? state.panY : 0;
  return {
    x: wx * zoom + panX,
    y: wy * zoom + panY,
  };
}
function screenToWorld(sx, sy) {
  const zoom = Number.isFinite(state.zoom) && state.zoom !== 0 ? state.zoom : 1;
  const panX = Number.isFinite(state.panX) ? state.panX : 0;
  const panY = Number.isFinite(state.panY) ? state.panY : 0;
  return {
    x: (sx - panX) / zoom,
    y: (sy - panY) / zoom,
  };
}
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// ─────────────────────────────────────────────────────────
// DRAW ENGINE
// ─────────────────────────────────────────────────────────

const COLOR = {
  bg:      '#080c12',
  grid:    '#0f1a28',
  edge:    '#1e3050',
  edgeHi:  '#f5c842',   // path edge
  edgeRel: '#ff5c6a',   // relaxed
  edgeFwd: '#4da6ff',   // BF pass
  nodeDefault: '#162236',
  nodeBorder: '#4da6ff',
  nodeSrc:  '#1a6ecc',
  nodeDst:  '#5a2ecc',
  nodeCur:  '#cc5500',
  nodeVis:  '#1a5c34',
  nodeOnPath: '#1a5c34',
  textDefault: '#d4e4f7',
  weightText: '#6b8aad',
};

function drawAll() {
  if (!Number.isFinite(state.zoom) || Math.abs(state.zoom) < 0.05) state.zoom = 1;
  if (!Number.isFinite(state.panX)) state.panX = canvas.width / 2;
  if (!Number.isFinite(state.panY)) state.panY = canvas.height / 2;

  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, W, H);

  if (state.showGrid) drawGrid(W, H);

  // Get current algo display state
  const vis = getCurrentVisState();

  // Draw edges
  for (const [id, edge] of state.edges) {
    drawEdge(edge, id, vis);
  }

  // Draw temp edge while adding
  if (state.selectedTool === 'addedge' && state.edgeStartNode !== null) {
    const startNode = state.nodes.get(state.edgeStartNode);
    if (startNode) {
      const s = worldToScreen(startNode.x, startNode.y);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(state.mouseX, state.mouseY);
      ctx.strokeStyle = 'rgba(56,217,217,.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Draw nodes
  for (const [id, node] of state.nodes) {
    drawNode(id, node, vis);
  }

  // Schedule next frame if playing
  if (state.playing) {
    state.animFrame = requestAnimationFrame(drawAll);
  }
}

function drawGrid(W, H) {
  const z = Number.isFinite(state.zoom) && state.zoom !== 0 ? Math.abs(state.zoom) : 1;
  const step = Math.max(8, 40 * z);
  const offX = ((state.panX % step) + step) % step;
  const offY = ((state.panY % step) + step) % step;
  ctx.strokeStyle = COLOR.grid;
  ctx.lineWidth = 1;
  for (let x = offX; x < W; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = offY; y < H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

function getCurrentVisState() {
  // Returns {visitedNodes, currentNode, pathNodes, pathEdges, relaxedEdge, updatedEdges, distances}
  const vis = {
    visitedNodes: new Set(),
    currentNode: null,
    pathNodes: new Set(),
    pathEdges: new Set(),  // edge id set
    relaxedEdge: null,
    updatedEdges: new Set(),
    distances: null,
    queue: null,
  };

  if (state.currentStep < 0 || !state.steps.length) return vis;

  const step = state.steps[Math.min(state.currentStep, state.steps.length - 1)];
  if (!step) return vis;

  vis.distances = step.dist ? { ...step.dist } : null;
  vis.currentNode = step.currentNode || null;

  if (step.visited) {
    for (const n of step.visited) vis.visitedNodes.add(n);
  }
  if (step.relaxedEdge) {
    vis.relaxedEdge = step.relaxedEdge;
  }
  if (step.updatedEdges) {
    for (const e of step.updatedEdges) vis.updatedEdges.add(e);
  }
  if (step.pathEdges) {
    for (const e of step.pathEdges) vis.pathEdges.add(e);
  }
  if (step.pathNodes) {
    for (const n of step.pathNodes) vis.pathNodes.add(n);
  }
  return vis;
}

function drawEdge(edge, id, vis) {
  const fromNode = state.nodes.get(edge.from);
  const toNode   = state.nodes.get(edge.to);
  if (!fromNode || !toNode) return;

  const f = worldToScreen(fromNode.x, fromNode.y);
  const t = worldToScreen(toNode.x, toNode.y);

  // Determine color
  let color = COLOR.edge;
  let width = 1.5;
  let dash = [];
  let glow = false;

  if (vis.pathEdges.has(id)) {
    color = COLOR.edgeHi; width = 3.5; glow = true;
  } else if (vis.relaxedEdge === id) {
    color = COLOR.edgeRel; width = 2.5; glow = true;
  } else if (vis.updatedEdges.has(id)) {
    color = COLOR.edgeFwd; width = 2;
  }

  // Draw glow
  if (glow) {
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = color + '44';
    ctx.lineWidth = width + 6;
    ctx.setLineDash(dash);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  ctx.lineTo(t.x, t.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow for directed
  if (state.directed) {
    drawArrow(f.x, f.y, t.x, t.y, color, width, Math.max(10, 22 * Math.abs(state.zoom)));
  }

  // Weight label
  const mx = (f.x + t.x) / 2;
  const my = (f.y + t.y) / 2;
  const wText = String(edge.weight);
  const wColor = edge.weight < 0 ? '#ff8c42' : COLOR.weightText;

  ctx.font = `${Math.max(9, 11 * state.zoom)}px IBM Plex Mono`;
  const tw = ctx.measureText(wText).width;

  ctx.fillStyle = 'rgba(8,12,18,.85)';
  ctx.fillRect(mx - tw/2 - 3, my - 8, tw + 6, 14);
  ctx.fillStyle = wColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(wText, mx, my);
}

function drawArrow(x1, y1, x2, y2, color, width, nodeRadius) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowSize = 10 * state.zoom;
  const tx = x2 - Math.cos(angle) * nodeRadius;
  const ty = y2 - Math.sin(angle) * nodeRadius;

  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(
    tx - arrowSize * Math.cos(angle - 0.4),
    ty - arrowSize * Math.sin(angle - 0.4)
  );
  ctx.moveTo(tx, ty);
  ctx.lineTo(
    tx - arrowSize * Math.cos(angle + 0.4),
    ty - arrowSize * Math.sin(angle + 0.4)
  );
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawNode(id, node, vis) {
  const s = worldToScreen(node.x, node.y);
  const r = Math.max(10, 22 * Math.abs(state.zoom));

  // Determine appearance
  let fillColor   = COLOR.nodeDefault;
  let borderColor = COLOR.nodeBorder;
  let textColor   = '#d4e4f7';
  let glow = false;
  let glowColor = COLOR.nodeBorder;

  if (vis.pathNodes.has(id)) {
    fillColor = '#1a4a2e'; borderColor = '#3ddc97'; glowColor = '#3ddc97'; glow = true;
  } else if (id === vis.currentNode) {
    fillColor = '#3d1800'; borderColor = '#ff8c42'; glowColor = '#ff8c42'; glow = true;
  } else if (vis.visitedNodes.has(id)) {
    fillColor = '#0d2e1a'; borderColor = '#2a9e60';
  }

  if (id === state.source) {
    fillColor = '#0d2040'; borderColor = '#4da6ff'; glowColor = '#4da6ff'; glow = true;
  }
  if (id === state.target) {
    fillColor = '#1a0d40'; borderColor = '#b57aff'; glowColor = '#b57aff'; glow = true;
  }

  // Glow
  if (glow) {
    const grad = ctx.createRadialGradient(s.x, s.y, r * 0.5, s.x, s.y, r * 1.8);
    grad.addColorStop(0, glowColor + '30');
    grad.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Node circle
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2 * Math.max(0.5, Math.abs(state.zoom));
  ctx.stroke();

  // Label
  ctx.fillStyle = textColor;
  ctx.font = `${Math.max(9, 11 * state.zoom)}px IBM Plex Mono`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(node.label, s.x, s.y);

  // Distance badge (if available)
  if (vis.distances && vis.distances[id] !== undefined) {
    const d = vis.distances[id];
    const dStr = d === Infinity ? '∞' : String(d);
    ctx.font = `${Math.max(7, 9 * state.zoom)}px IBM Plex Mono`;
    ctx.fillStyle = '#3ddc97';
    ctx.fillText(dStr, s.x, s.y + r + 10 * state.zoom);
  }
}

// ─────────────────────────────────────────────────────────
// GRAPH MANAGEMENT
// ─────────────────────────────────────────────────────────

function mkNodeId() { return 'n' + (++state.nodeCounter); }
function mkEdgeId() { return 'e' + (++state.edgeCounter); }

function addNode(x, y, label) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    const c = screenToWorld(canvas.width / 2, canvas.height / 2);
    x = c.x;
    y = c.y;
  }
  const id = mkNodeId();
  const lbl = label || id.toUpperCase();
  state.nodes.set(id, { x, y, label: lbl });
  updateNodeSelects();
  updateGraphInfo();
  drawAll();
  log(`Node ${lbl} added`, 'info');
  notify(`Node ${lbl} added`, 'ok');
  return id;
}

function removeNode(id) {
  const node = state.nodes.get(id);
  if (!node) return;
  state.nodes.delete(id);
  // Remove connected edges
  for (const [eid, edge] of state.edges) {
    if (edge.from === id || edge.to === id) state.edges.delete(eid);
  }
  if (state.source === id) state.source = null;
  if (state.target === id) state.target = null;
  updateNodeSelects();
  updateGraphInfo();
  drawAll();
  log(`Node ${node.label} removed`, 'warn');
}

function addEdge(fromId, toId, weight) {
  // Prevent duplicate
  for (const [, edge] of state.edges) {
    if (edge.from === fromId && edge.to === toId) {
      notify('Edge already exists', 'warn'); return null;
    }
    if (!state.directed && edge.from === toId && edge.to === fromId) {
      notify('Edge already exists (undirected)', 'warn'); return null;
    }
  }
  if (fromId === toId) { notify('Self-loops not allowed', 'warn'); return null; }

  const id = mkEdgeId();
  const w  = parseInt(weight) || parseInt(document.getElementById('default-weight').value) || 1;
  state.edges.set(id, { from: fromId, to: toId, weight: w });
  updateGraphInfo();
  drawAll();
  log(`Edge ${state.nodes.get(fromId)?.label}→${state.nodes.get(toId)?.label} (w=${w})`, 'info');
  return id;
}

function removeEdge(id) {
  state.edges.delete(id);
  updateGraphInfo();
  drawAll();
  log('Edge removed', 'warn');
}

function setEdgeWeight(id, w) {
  const edge = state.edges.get(id);
  if (edge) {
    edge.weight = parseInt(w);
    updateGraphInfo();
    drawAll();
    log(`Edge weight → ${w}`, 'info');
  }
}

function clearGraph() {
  state.nodes.clear();
  state.edges.clear();
  state.source = null;
  state.target = null;
  state.nodeCounter = 0;
  state.edgeCounter = 0;
  state.steps = [];
  state.currentStep = -1;
  stopAlgo();
  updateNodeSelects();
  updateGraphInfo();
  clearDistTable();
  drawAll();
  log('Graph cleared', 'warn');
}

function toggleDirected() {
  const val = document.getElementById('graph-type').value;
  state.directed = (val === 'directed');
  updateGraphInfo();
  drawAll();
}

function addNodeBtn() {
  const W = canvas.width, H = canvas.height;
  const angle = (state.nodes.size / 8) * Math.PI * 2;
  const r = Math.min(W, H) / 3 / state.zoom;
  const cx = (W / 2 - state.panX) / state.zoom;
  const cy = (H / 2 - state.panY) / state.zoom;
  addNode(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
}

// ─────────────────────────────────────────────────────────
// HIT TESTING
// ─────────────────────────────────────────────────────────

function hitTestNode(sx, sy) {
  const r = Math.max(12, 22 * Math.abs(state.zoom));
  for (const [id, node] of state.nodes) {
    const s = worldToScreen(node.x, node.y);
    const dx = sx - s.x, dy = sy - s.y;
    if (dx*dx + dy*dy <= r*r) return id;
  }
  return null;
}

function hitTestEdge(sx, sy) {
  const thresh = 8;
  for (const [id, edge] of state.edges) {
    const fn = state.nodes.get(edge.from);
    const tn = state.nodes.get(edge.to);
    if (!fn || !tn) continue;
    const f = worldToScreen(fn.x, fn.y);
    const t = worldToScreen(tn.x, tn.y);
    const dist = pointToSegmentDist(sx, sy, f.x, f.y, t.x, t.y);
    if (dist < thresh) return id;
  }
  return null;
}

function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx*dx + dy*dy;
  if (len2 === 0) return Math.hypot(px-ax, py-ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / len2));
  return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
}

// ─────────────────────────────────────────────────────────
// CANVAS EVENTS
// ─────────────────────────────────────────────────────────

canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup',   onMouseUp);
canvas.addEventListener('dblclick',  onDblClick);
canvas.addEventListener('wheel',     onWheel, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function onMouseDown(e) {
  if (state.playing) return;
  const { x: sx, y: sy } = canvasPos(e);
  const w = screenToWorld(sx, sy);

  if (e.button === 1 || e.button === 2) {
    // Middle or right: pan
    state.panning = true;
    state.panStartX = sx - state.panX;
    state.panStartY = sy - state.panY;
    return;
  }

  const nodeId = hitTestNode(sx, sy);
  const edgeId = hitTestEdge(sx, sy);

  switch (state.selectedTool) {
    case 'addnode':
      if (e.button === 0 && nodeId === null) addNode(w.x, w.y);
      break;

    case 'addedge':
      if (nodeId !== null) {
        if (state.edgeStartNode === null) {
          state.edgeStartNode = nodeId;
        } else {
          if (state.edgeStartNode !== nodeId) {
            const w = parseInt(document.getElementById('default-weight').value) || 1;
            addEdge(state.edgeStartNode, nodeId, w);
          }
          state.edgeStartNode = null;
        }
      } else {
        state.edgeStartNode = null;
      }
      break;

    case 'move':
      if (nodeId !== null) {
        state.draggingNode = nodeId;
        const node = state.nodes.get(nodeId);
        const s = worldToScreen(node.x, node.y);
        state.dragOffX = sx - s.x;
        state.dragOffY = sy - s.y;
      }
      break;

    case 'delete':
      if (nodeId !== null) { removeNode(nodeId); }
      else if (edgeId !== null) { removeEdge(edgeId); }
      break;

    case 'weight':
      if (edgeId !== null) {
        const edge = state.edges.get(edgeId);
        showModal('Set Edge Weight',
          `<div class="field"><label>New Weight</label><input type="number" id="modal-input" value="${edge.weight}"></div>`,
          () => {
            const v = parseInt(document.getElementById('modal-input').value);
            if (!isNaN(v)) setEdgeWeight(edgeId, v);
          }
        );
      }
      break;

    case 'select':
      if (nodeId !== null) {
        if (!state.source || state.target) {
          // Set source first
          if (!state.source) {
            state.source = nodeId;
            document.getElementById('src-select').value = nodeId;
            log(`Source set to ${state.nodes.get(nodeId).label}`, 'ok');
          } else {
            state.target = nodeId;
            document.getElementById('dst-select').value = nodeId;
            log(`Target set to ${state.nodes.get(nodeId).label}`, 'ok');
          }
        } else {
          state.source = nodeId;
          state.target = null;
          document.getElementById('src-select').value = nodeId;
          document.getElementById('dst-select').value = '';
          log(`Source set to ${state.nodes.get(nodeId).label}`, 'ok');
        }
        updateGraphInfo();
        drawAll();
      }
      break;
  }
}

function onMouseMove(e) {
  const { x: sx, y: sy } = canvasPos(e);
  state.mouseX = sx;
  state.mouseY = sy;

  if (state.panning) {
    state.panX = sx - state.panStartX;
    state.panY = sy - state.panStartY;
    drawAll();
    return;
  }

  if (state.draggingNode !== null) {
    const w = screenToWorld(sx - state.dragOffX, sy - state.dragOffY);
    const node = state.nodes.get(state.draggingNode);
    if (node) { node.x = w.x; node.y = w.y; }
    drawAll();
    return;
  }

  // Tooltip
  const nodeId = hitTestNode(sx, sy);
  const edgeId = !nodeId ? hitTestEdge(sx, sy) : null;
  const tip = document.getElementById('tooltip');
  if (nodeId) {
    const n = state.nodes.get(nodeId);
    const d = state.algoResult?.distances?.[nodeId];
    const dStr = d !== undefined ? (d === Infinity ? '∞' : String(d)) : '';
    tip.textContent = `Node: ${n.label}` + (dStr ? `  dist: ${dStr}` : '');
    tip.style.display = 'block';
    tip.style.left = (e.clientX + 12) + 'px';
    tip.style.top  = (e.clientY + 12) + 'px';
  } else if (edgeId) {
    const edge = state.edges.get(edgeId);
    const fn = state.nodes.get(edge.from)?.label;
    const tn = state.nodes.get(edge.to)?.label;
    tip.textContent = `${fn} → ${tn}  w=${edge.weight}`;
    tip.style.display = 'block';
    tip.style.left = (e.clientX + 12) + 'px';
    tip.style.top  = (e.clientY + 12) + 'px';
  } else {
    tip.style.display = 'none';
  }

  // Draw for edge preview
  if (state.selectedTool === 'addedge' && state.edgeStartNode !== null) {
    drawAll();
  }
}

function onMouseUp(e) {
  state.panning = false;
  state.draggingNode = null;
}

function onDblClick(e) {
  const { x: sx, y: sy } = canvasPos(e);
  const nodeId = hitTestNode(sx, sy);
  if (nodeId !== null) {
    const node = state.nodes.get(nodeId);
    showModal('Rename Node',
      `<div class="field"><label>Node Label</label><input type="text" id="modal-input" value="${node.label}" maxlength="4"></div>`,
      () => {
        const v = document.getElementById('modal-input').value.trim();
        if (v) {
          node.label = v;
          updateNodeSelects();
          drawAll();
          log(`Renamed to ${v}`, 'info');
        }
      }
    );
  }
}

function onWheel(e) {
  e.preventDefault();
  const { x: sx, y: sy } = canvasPos(e);
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  zoom(factor, sx, sy);
}

function zoom(factor, cx, cy) {
  const wx = cx ?? canvas.width / 2;
  const wy = cy ?? canvas.height / 2;
  const newZoom = Math.max(0.2, Math.min(4, state.zoom * factor));
  state.panX = wx - (wx - state.panX) * (newZoom / state.zoom);
  state.panY = wy - (wy - state.panY) * (newZoom / state.zoom);
  state.zoom = newZoom;
  drawAll();
}

function fitGraph() {
  if (!state.nodes.size) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of state.nodes.values()) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  const pad = 80;
  const W = canvas.width, H = canvas.height;
  const gw = maxX - minX || 1, gh = maxY - minY || 1;
  const zx = (W - pad*2) / gw, zy = (H - pad*2) / gh;
  state.zoom = Math.max(0.1, Math.min(zx, zy, 2));
  state.panX = (W - gw * state.zoom) / 2 - minX * state.zoom;
  state.panY = (H - gh * state.zoom) / 2 - minY * state.zoom;
  drawAll();
}

function toggleGrid() {
  state.showGrid = !state.showGrid;
  document.getElementById('grid-btn').classList.toggle('active', state.showGrid);
  drawAll();
}

// ─────────────────────────────────────────────────────────
// TOOL SELECTION
// ─────────────────────────────────────────────────────────

function setTool(tool) {
  state.selectedTool = tool;
  state.edgeStartNode = null;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tool-' + tool)?.classList.add('active');
  updateCursor();
}

function updateCursor() {
  const cursors = {
    addnode: 'crosshair',
    addedge: 'cell',
    move:    'grab',
    delete:  'not-allowed',
    weight:  'pointer',
    select:  'pointer',
  };
  canvas.style.cursor = cursors[state.selectedTool] || 'default';
}

// ─────────────────────────────────────────────────────────
// DIJKSTRA ALGORITHM (manual implementation)
// ─────────────────────────────────────────────────────────

function runDijkstra(sourceId) {
  const nodes = Array.from(state.nodes.keys());
  const steps = [];

  // Check for negative weights
  const hasNeg = Array.from(state.edges.values()).some(e => e.weight < 0);
  if (hasNeg) {
    log('⚠ Negative weights detected! Dijkstra may produce incorrect results.', 'warn');
  }

  // Init
  const dist = {};
  const pred = {};
  const visited = new Set();
  for (const id of nodes) {
    dist[id] = id === sourceId ? 0 : Infinity;
    pred[id] = null;
  }

  // Priority queue (simple array, sorted)
  const pq = [{ id: sourceId, d: 0 }];

  steps.push({
    type: 'init',
    dist: { ...dist },
    visited: new Set(visited),
    currentNode: null,
    desc: `Initialize: set dist[${nodeLabel(sourceId)}] = 0, all others = ∞`,
  });

  const getEdgesFrom = (nodeId) => {
    const result = [];
    for (const [eid, edge] of state.edges) {
      if (edge.from === nodeId) result.push({ eid, to: edge.to, w: edge.weight });
      if (!state.directed && edge.to === nodeId) result.push({ eid, to: edge.from, w: edge.weight });
    }
    return result;
  };

  while (pq.length > 0) {
    // Extract min
    pq.sort((a, b) => a.d - b.d);
    const { id: u, d: du } = pq.shift();

    if (visited.has(u)) continue;
    visited.add(u);

    steps.push({
      type: 'visit',
      currentNode: u,
      dist: { ...dist },
      visited: new Set(visited),
      desc: `Visit node ${nodeLabel(u)} (dist=${du === Infinity ? '∞' : du})`,
    });

    if (dist[u] === Infinity) break; // unreachable nodes

    // Relax neighbors
    for (const { eid, to: v, w } of getEdgesFrom(u)) {
      if (visited.has(v)) continue;
      const newDist = dist[u] + w;

      steps.push({
        type: 'relax',
        currentNode: u,
        relaxedEdge: eid,
        from: u, to: v,
        newDist,
        oldDist: dist[v],
        dist: { ...dist },
        visited: new Set(visited),
        desc: `Relax edge ${nodeLabel(u)}→${nodeLabel(v)} (w=${w}): ` +
              (newDist < dist[v]
                ? `UPDATE dist[${nodeLabel(v)}] = ${du}+${w} = ${newDist} (was ${dist[v] === Infinity ? '∞' : dist[v]})`
                : `no update (${newDist} ≥ ${dist[v]})`),
      });

      if (newDist < dist[v]) {
        dist[v] = newDist;
        pred[v] = u;
        pq.push({ id: v, d: newDist });
        steps[steps.length - 1].dist = { ...dist };
        steps[steps.length - 1].improved = true;
      }
    }
  }

  // Build shortest paths
  const paths = {};
  for (const nodeId of nodes) {
    paths[nodeId] = buildPath(pred, sourceId, nodeId);
  }

  steps.push({
    type: 'done',
    dist: { ...dist },
    pred: { ...pred },
    paths,
    visited: new Set(visited),
    currentNode: null,
    pathEdges: getPathEdgeIds(pred, sourceId, state.target),
    pathNodes: state.target ? new Set(paths[state.target]) : new Set(nodes.filter(n => paths[n].length > 0).flat()),
    desc: `Algorithm complete. Source: ${nodeLabel(sourceId)}`,
    negWeights: hasNeg,
  });

  return { steps, dist, pred, paths, negWeights: hasNeg };
}

// ─────────────────────────────────────────────────────────
// BELLMAN-FORD ALGORITHM (manual implementation)
// ─────────────────────────────────────────────────────────

function runBellmanFord(sourceId) {
  const nodes = Array.from(state.nodes.keys());
  const edges = Array.from(state.edges.entries()).map(([id, e]) => ({ id, ...e }));
  const allEdges = [];
  for (const e of edges) {
    allEdges.push(e);
    if (!state.directed) allEdges.push({ id: e.id + '_r', from: e.to, to: e.from, weight: e.weight });
  }

  const steps = [];
  const dist = {};
  const pred = {};

  for (const id of nodes) {
    dist[id] = id === sourceId ? 0 : Infinity;
    pred[id] = null;
  }

  steps.push({
    type: 'init',
    dist: { ...dist },
    visited: new Set(),
    currentNode: null,
    desc: `Initialize: dist[${nodeLabel(sourceId)}] = 0, all others = ∞`,
  });

  const n = nodes.length;
  let negativeCycle = false;

  for (let pass = 1; pass <= n - 1; pass++) {
    let changed = false;
    const updatedEdges = new Set();

    steps.push({
      type: 'pass_start',
      passNum: pass,
      dist: { ...dist },
      visited: new Set(nodes.filter(id => dist[id] < Infinity)),
      currentNode: null,
      desc: `Pass ${pass}/${n-1}: Relax all edges`,
    });

    for (const edge of allEdges) {
      const { id: eid, from: u, to: v, weight: w } = edge;
      if (dist[u] === Infinity) continue;
      const newDist = dist[u] + w;

      const improved = newDist < dist[v];
      if (improved) {
        dist[v] = newDist;
        pred[v] = u;
        changed = true;
        updatedEdges.add(eid.replace('_r', ''));
      }

      steps.push({
        type: 'relax',
        passNum: pass,
        currentNode: u,
        relaxedEdge: eid.replace('_r', ''),
        updatedEdges: new Set(updatedEdges),
        from: u, to: v,
        newDist, oldDist: improved ? newDist : dist[v],
        dist: { ...dist },
        visited: new Set(nodes.filter(id => dist[id] < Infinity)),
        improved,
        desc: `Pass ${pass}, edge ${nodeLabel(u)}→${nodeLabel(v)} (w=${w}): ` +
              (improved
                ? `UPDATE dist[${nodeLabel(v)}] = ${newDist}`
                : `no improvement`),
      });
    }

    if (!changed) {
      steps.push({
        type: 'converged',
        passNum: pass,
        dist: { ...dist },
        visited: new Set(nodes.filter(id => dist[id] < Infinity)),
        currentNode: null,
        desc: `Converged early after pass ${pass} — no distances changed`,
      });
      break;
    }
  }

  // Extra pass to detect negative cycles
  for (const edge of allEdges) {
    const { from: u, to: v, weight: w } = edge;
    if (dist[u] !== Infinity && dist[u] + w < dist[v]) {
      negativeCycle = true;
      steps.push({
        type: 'negcycle',
        dist: { ...dist },
        visited: new Set(nodes.filter(id => dist[id] < Infinity)),
        currentNode: null,
        desc: `⚠ NEGATIVE CYCLE DETECTED! (edge ${nodeLabel(u)}→${nodeLabel(v)} still improves)`,
      });
      break;
    }
  }

  const paths = {};
  for (const nodeId of nodes) {
    paths[nodeId] = negativeCycle ? [] : buildPath(pred, sourceId, nodeId);
  }

  steps.push({
    type: 'done',
    dist: { ...dist },
    pred: { ...pred },
    paths,
    visited: new Set(nodes.filter(id => dist[id] < Infinity)),
    currentNode: null,
    pathEdges: negativeCycle ? new Set() : getPathEdgeIds(pred, sourceId, state.target),
    pathNodes: state.target ? new Set(paths[state.target]) : new Set(),
    desc: negativeCycle
      ? `Algorithm detected a negative cycle. Results are unreliable.`
      : `Algorithm complete. ${nodeLabel(sourceId)} to all nodes computed.`,
    negativeCycle,
  });

  return { steps, dist, pred, paths, negativeCycle };
}

// ─────────────────────────────────────────────────────────
// ALGORITHM HELPERS
// ─────────────────────────────────────────────────────────

function nodeLabel(id) {
  return state.nodes.get(id)?.label || id;
}

function buildPath(pred, source, target) {
  if (target === source) return [source];
  const path = [];
  let cur = target;
  const visited = new Set();
  while (cur !== null && cur !== undefined) {
    if (visited.has(cur)) return []; // cycle guard
    visited.add(cur);
    path.unshift(cur);
    if (cur === source) return path;
    cur = pred[cur];
  }
  return []; // unreachable
}

function getPathEdgeIds(pred, source, target) {
  const pathSet = new Set();
  if (!target) return pathSet;
  const path = buildPath(pred, source, target);
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i], to = path[i + 1];
    for (const [eid, edge] of state.edges) {
      if (edge.from === from && edge.to === to) { pathSet.add(eid); break; }
      if (!state.directed && edge.from === to && edge.to === from) { pathSet.add(eid); break; }
    }
  }
  return pathSet;
}

// ─────────────────────────────────────────────────────────
// ALGORITHM RUNNER + PLAYER
// ─────────────────────────────────────────────────────────

function selectAlgo(name) {
  state.algorithm = name;
  document.getElementById('algo-dijk').classList.toggle('active', name === 'dijkstra');
  document.getElementById('algo-bf').classList.toggle('active', name === 'bellman-ford');
}

function setSource(val) {
  state.source = val || null;
  updateGraphInfo();
  drawAll();
}

function setTarget(val) {
  state.target = val || null;
  updateGraphInfo();
  drawAll();
}

function runAlgorithm() {
  if (!state.source) {
    notify('Select a source node first', 'warn');
    return;
  }
  if (!state.nodes.has(state.source)) {
    notify('Source node not found in graph', 'error');
    return;
  }
  if (state.nodes.size < 2) {
    notify('Graph needs at least 2 nodes', 'warn');
    return;
  }

  stopAlgo();
  state.currentStep = 0;

  const t0 = performance.now();
  let result;

  if (state.algorithm === 'dijkstra') {
    result = runDijkstra(state.source);
    log(`Dijkstra run: ${result.steps.length} steps, source=${nodeLabel(state.source)}`, 'ok');
  } else {
    result = runBellmanFord(state.source);
    log(`Bellman-Ford run: ${result.steps.length} steps, source=${nodeLabel(state.source)}`, 'ok');
  }

  const t1 = performance.now();
  result.execTimeMs = t1 - t0;
  result.iterCount  = result.steps.filter(s => s.type === 'relax').length;
  result.passCount  = result.steps.filter(s => s.type === 'visit' || s.type === 'pass_start').length;
  result.algorithm  = state.algorithm;
  result.source     = state.source;

  state.steps      = result.steps;
  state.algoResult = result;

  // Switch to run mode
  document.getElementById('mode-badge').textContent = 'RUN MODE';
  document.getElementById('mode-badge').className = 'mode-badge run';
  document.getElementById('player-bar').style.display = 'flex';

  updateStepUI();
  updateDistTable();
  updateResultsTab(result);
  drawAll();

  notify(`${state.algorithm === 'dijkstra' ? 'Dijkstra' : 'Bellman-Ford'} complete — ${result.steps.length} steps`, 'ok');
}

function stopAlgo() {
  if (state.playTimer) { clearInterval(state.playTimer); state.playTimer = null; }
  state.playing = false;
  state.steps = [];
  state.currentStep = -1;
  state.algoResult = null;
  document.getElementById('player-bar').style.display = 'none';
  document.getElementById('mode-badge').textContent = 'EDIT MODE';
  document.getElementById('mode-badge').className = 'mode-badge edit';
  document.getElementById('btn-play').textContent = '▶';
  clearDistTable();
  drawAll();
}

function togglePlay() {
  if (state.playing) {
    pausePlay();
  } else {
    startPlay();
  }
}

function startPlay() {
  if (!state.steps.length) return;
  if (state.currentStep >= state.steps.length - 1) state.currentStep = 0;
  state.playing = true;
  document.getElementById('btn-play').textContent = '⏸';

  const speedVal = parseInt(document.getElementById('speed-slider').value);
  const delay    = Math.round(1200 / speedVal);

  state.playTimer = setInterval(() => {
    if (state.currentStep < state.steps.length - 1) {
      state.currentStep++;
      updateStepUI();
      updateDistTable();
      drawAll();
    } else {
      pausePlay();
    }
  }, delay);
}

function pausePlay() {
  state.playing = false;
  if (state.playTimer) { clearInterval(state.playTimer); state.playTimer = null; }
  document.getElementById('btn-play').textContent = '▶';
}

function stepForward() {
  pausePlay();
  if (state.currentStep < state.steps.length - 1) {
    state.currentStep++;
    updateStepUI();
    updateDistTable();
    drawAll();
  }
}

function stepBack() {
  pausePlay();
  if (state.currentStep > 0) {
    state.currentStep--;
    updateStepUI();
    updateDistTable();
    drawAll();
  }
}

function stepGo(idx) {
  pausePlay();
  if (idx === -1) idx = state.steps.length - 1;
  state.currentStep = Math.max(0, Math.min(state.steps.length - 1, idx));
  updateStepUI();
  updateDistTable();
  drawAll();
}

// ─────────────────────────────────────────────────────────
// UI UPDATES
// ─────────────────────────────────────────────────────────

function updateStepUI() {
  const step = state.steps[state.currentStep];
  if (!step) return;

  const total = state.steps.length;
  const cur   = state.currentStep + 1;

  document.getElementById('step-counter').textContent = `${cur} / ${total}`;
  document.getElementById('step-progress').style.width = `${(cur / total) * 100}%`;

  const info = document.getElementById('step-info');

  let typeTag = '';
  const typeColors = {
    init:       'var(--blue)',
    visit:      'var(--orange)',
    relax:      'var(--cyan)',
    pass_start: 'var(--purple)',
    converged:  'var(--green)',
    negcycle:   'var(--red)',
    done:       'var(--green)',
  };
  const color = typeColors[step.type] || 'var(--muted)';

  info.innerHTML = `
    <div class="step-num">
      Step ${cur}/${total} &nbsp;
      <span style="color:${color};text-transform:uppercase">${step.type}</span>
      ${step.passNum ? `· Pass ${step.passNum}` : ''}
    </div>
    <div style="color:var(--text);margin-top:.3rem">${step.desc || ''}</div>
    ${step.type === 'negcycle' ? `<div style="color:var(--red);margin-top:.3rem">⚠ Bellman-Ford detected a negative cycle. No valid shortest paths exist.</div>` : ''}
    ${step.type === 'done' && step.negWeights ? `<div style="color:var(--yellow);margin-top:.3rem">⚠ Note: Negative weights present — Dijkstra results may be incorrect.</div>` : ''}
  `;

  // Enable/disable player buttons
  document.getElementById('btn-stepback').disabled = state.currentStep === 0;
  document.getElementById('btn-stepfwd').disabled = state.currentStep >= state.steps.length - 1;
}

function updateDistTable() {
  const step = state.steps[state.currentStep];
  if (!step || !step.dist) { clearDistTable(); return; }

  const tbody = document.getElementById('dist-tbody');
  const rows = [];

  const sortedNodes = Array.from(state.nodes.keys()).sort((a, b) => {
    const da = step.dist[a] ?? Infinity;
    const db = step.dist[b] ?? Infinity;
    return da - db;
  });

  const lastStep = state.steps[state.steps.length - 1];
  const pathNodesSet = lastStep?.pathNodes || new Set();

  for (const id of sortedNodes) {
    const d = step.dist[id];
    const dStr = (d === undefined || d === Infinity) ? '∞' : String(d);
    const pred = step.pred?.[id] || findPredAtStep(id);
    const predLabel = pred ? nodeLabel(pred) : '—';
    const label = nodeLabel(id);

    let rowClass = '';
    if (id === step.currentNode) rowClass = 'current';
    else if (step.visited?.has(id)) rowClass = 'visited';
    if (pathNodesSet.has(id)) rowClass = 'path';

    let stateStr = '⬜ waiting';
    if (id === step.currentNode) stateStr = '🟠 current';
    else if (step.visited?.has(id)) stateStr = '🟢 visited';
    if (d === Infinity) stateStr = '⬜ unreach.';

    rows.push(`<tr class="${rowClass}">
      <td>${label}</td>
      <td style="color:${d===Infinity?'var(--dim)':'var(--cyan)'}">${dStr}</td>
      <td style="color:var(--muted)">${predLabel}</td>
      <td>${stateStr}</td>
    </tr>`);
  }

  tbody.innerHTML = rows.join('');
}

function findPredAtStep(nodeId) {
  // Walk back through steps to find last set predecessor
  for (let i = state.currentStep; i >= 0; i--) {
    const s = state.steps[i];
    if (s.pred && s.pred[nodeId] !== undefined) return s.pred[nodeId];
    if (s.to === nodeId && s.improved) return s.from;
  }
  return null;
}

function clearDistTable() {
  document.getElementById('dist-tbody').innerHTML =
    '<tr><td colspan="4" style="color:var(--dim);text-align:center;padding:.5rem">No data</td></tr>';
  document.getElementById('step-info').innerHTML =
    '<div class="step-num">Status</div><span style="color:var(--muted)">Select source node and run algorithm to begin.</span>';
  document.getElementById('step-progress').style.width = '0%';
  document.getElementById('step-counter').textContent = '0 / 0';
}

function updateResultsTab(result) {
  switchTab('results');
  const area = document.getElementById('results-area');
  const algo = result.algorithm === 'dijkstra' ? 'Dijkstra' : 'Bellman-Ford';
  const negCycleWarn = result.negativeCycle
    ? `<div style="color:var(--red);border:1px solid var(--red);border-radius:5px;padding:.5rem;margin-bottom:.5rem;font-size:.75rem">⚠ Negative cycle detected — paths are unreliable</div>`
    : '';
  const negWeightWarn = result.negWeights
    ? `<div style="color:var(--yellow);border:1px solid var(--yellow);border-radius:5px;padding:.5rem;margin-bottom:.5rem;font-size:.75rem">⚠ Negative weights present — Dijkstra may be incorrect</div>`
    : '';

  // Build path display
  let pathHTML = '';
  if (state.target && result.paths?.[state.target]) {
    const path = result.paths[state.target];
    const d = result.dist[state.target];
    const dStr = d === Infinity ? '∞ (unreachable)' : d;
    if (path.length > 0) {
      pathHTML = `
        <div class="result-card">
          <div class="rc-title">Shortest Path: ${nodeLabel(state.source)} → ${nodeLabel(state.target)}</div>
          <div class="rc-val">${path.map(nodeLabel).join(' → ')}</div>
          <div class="rc-sub">Total cost: ${dStr}</div>
        </div>`;
    } else {
      pathHTML = `<div class="result-card"><div class="rc-title">Path to ${nodeLabel(state.target)}</div><div style="color:var(--red)">Unreachable</div></div>`;
    }
  } else {
    // All-nodes summary
    const reachable = Object.values(result.dist).filter(d => d < Infinity).length;
    pathHTML = `
      <div class="result-card">
        <div class="rc-title">Reachable Nodes</div>
        <div class="rc-val">${reachable} / ${state.nodes.size}</div>
        <div class="rc-sub">from source ${nodeLabel(state.source)}</div>
      </div>`;
  }

  area.innerHTML = `
    ${negCycleWarn}${negWeightWarn}
    ${pathHTML}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-bottom:.5rem">
      <div class="result-card">
        <div class="rc-title">Algorithm</div>
        <div class="rc-val" style="font-size:.9rem;color:var(--${result.algorithm==='dijkstra'?'blue':'purple'})">${algo}</div>
      </div>
      <div class="result-card">
        <div class="rc-title">Exec Time</div>
        <div class="rc-val" style="font-size:1rem">${result.execTimeMs.toFixed(3)}<span style="font-size:.7rem;color:var(--muted)">ms</span></div>
      </div>
      <div class="result-card">
        <div class="rc-title">Relaxations</div>
        <div class="rc-val" style="font-size:1rem">${result.iterCount}</div>
      </div>
      <div class="result-card">
        <div class="rc-title">Total Steps</div>
        <div class="rc-val" style="font-size:1rem">${result.steps.length}</div>
      </div>
    </div>
    <div class="result-card">
      <div class="rc-title">Distance Table (final)</div>
      <table class="dist-table" style="margin-top:.3rem">
        <thead><tr><th>Node</th><th>Dist</th><th>Path</th></tr></thead>
        <tbody>
          ${Array.from(state.nodes.keys()).map(id => {
            const d = result.dist[id];
            const dStr = d === Infinity ? '∞' : String(d);
            const path = result.paths?.[id] || [];
            const pathStr = path.length > 0 ? path.map(nodeLabel).join('→') : '—';
            return `<tr><td>${nodeLabel(id)}</td><td style="color:var(--cyan)">${dStr}</td><td style="color:var(--muted);font-size:.65rem">${pathStr}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function runComparison() {
  if (!state.source) {
    notify('Select source node first', 'warn');
    return;
  }

  const t0 = performance.now();
  const dResult = runDijkstra(state.source);
  const t1 = performance.now();
  const bfResult = runBellmanFord(state.source);
  const t2 = performance.now();

  dResult.execTimeMs  = t1 - t0;
  bfResult.execTimeMs = t2 - t1;
  dResult.iterCount   = dResult.steps.filter(s => s.type === 'relax').length;
  bfResult.iterCount  = bfResult.steps.filter(s => s.type === 'relax').length;

  state.compareResult = { dijkstra: dResult, bellmanFord: bfResult };

  switchTab('compare');
  renderCompareTab(dResult, bfResult);
  log(`Comparison: Dijkstra ${dResult.execTimeMs.toFixed(3)}ms | BF ${bfResult.execTimeMs.toFixed(3)}ms`, 'ok');
  notify('Comparison complete', 'ok');
}

async function verifyWithPython() {
  const statusEl = document.getElementById('verify-status');

  if (!state.source) {
    notify('Select source node first', 'warn');
    if (statusEl) statusEl.textContent = 'Python verification: source node required';
    return;
  }
  if (!state.nodes.size) {
    notify('Graph is empty', 'warn');
    if (statusEl) statusEl.textContent = 'Python verification: graph is empty';
    return;
  }

  const payload = {
    algorithm: state.algorithm,
    source: state.source,
    directed: state.directed,
    nodes: Array.from(state.nodes.keys()),
    edges: Array.from(state.edges.entries()).map(([id, e]) => ({ id, from: e.from, to: e.to, weight: e.weight })),
  };

  try {
    if (statusEl) {
      statusEl.textContent = 'Python verification: running...';
      statusEl.style.color = 'var(--muted)';
    }

    const res = await fetch('http://127.0.0.1:8008/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      throw new Error(`HTTP ${res.status}: ${errTxt}`);
    }

    const py = await res.json();
    const js = state.algorithm === 'dijkstra' ? runDijkstra(state.source) : runBellmanFord(state.source);

    const mismatches = [];
    for (const id of state.nodes.keys()) {
      const jv = js.dist[id];
      const pv = py.distances?.[id];
      const eq = (jv === Infinity && (pv === null || pv === 'INF')) || (jv !== Infinity && Number(jv) === Number(pv));
      if (!eq) mismatches.push({ id, js: jv, py: pv });
    }

    if (mismatches.length === 0) {
      notify('Python verification passed: distances match', 'ok');
      if (statusEl) {
        statusEl.textContent = `Python verification: PASS (${state.algorithm})`;
        statusEl.style.color = 'var(--green)';
      }
    } else {
      const sample = mismatches.slice(0, 3).map(m => `${nodeLabel(m.id)}: js=${m.js === Infinity ? '∞' : m.js}, py=${m.py === null ? '∞' : m.py}`).join(' | ');
      notify('Python verification found mismatches', 'warn');
      if (statusEl) {
        statusEl.textContent = `Python verification: FAIL (${mismatches.length} mismatch) · ${sample}`;
        statusEl.style.color = 'var(--yellow)';
      }
    }
  } catch (err) {
    notify('Python backend not reachable. Start verify_server.py', 'error');
    if (statusEl) {
      statusEl.textContent = 'Python verification: backend offline (run verify_server.py)';
      statusEl.style.color = 'var(--red)';
    }
    log(`Python verify error: ${err.message}`, 'warn');
  }
}

function renderCompareTab(d, bf) {
  const area = document.getElementById('compare-area');

  const maxTime  = Math.max(d.execTimeMs,  bf.execTimeMs)  || 1;
  const maxIter  = Math.max(d.iterCount,   bf.iterCount)   || 1;
  const maxSteps = Math.max(d.steps.length, bf.steps.length) || 1;

  const pct = (v, max) => Math.min(100, (v / max) * 100);

  const nodeCount = state.nodes.size;
  const edgeCount = state.edges.size;

  area.innerHTML = `
    <div style="font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:.5rem">
      Graph: ${nodeCount} nodes, ${edgeCount} edges
    </div>

    ${bf.negativeCycle ? `<div style="color:var(--red);font-size:.75rem;margin-bottom:.5rem">⚠ Negative cycle detected — BF results unreliable</div>` : ''}
    ${d.negWeights ? `<div style="color:var(--yellow);font-size:.75rem;margin-bottom:.5rem">⚠ Negative weights — Dijkstra results may be wrong</div>` : ''}

    <div class="bar-chart">
      <div style="font-size:.65rem;color:var(--muted);margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.08em">Execution Time (ms)</div>
      <div class="bar-row">
        <div class="bar-label">Dijkstra</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct(d.execTimeMs, maxTime)}%;background:var(--blue)"></div></div>
        <div class="bar-val">${d.execTimeMs.toFixed(3)}</div>
      </div>
      <div class="bar-row">
        <div class="bar-label">Bellman-Ford</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct(bf.execTimeMs, maxTime)}%;background:var(--purple)"></div></div>
        <div class="bar-val">${bf.execTimeMs.toFixed(3)}</div>
      </div>
    </div>

    <div class="bar-chart">
      <div style="font-size:.65rem;color:var(--muted);margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.08em">Edge Relaxations</div>
      <div class="bar-row">
        <div class="bar-label">Dijkstra</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct(d.iterCount, maxIter)}%;background:var(--blue)"></div></div>
        <div class="bar-val">${d.iterCount}</div>
      </div>
      <div class="bar-row">
        <div class="bar-label">Bellman-Ford</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct(bf.iterCount, maxIter)}%;background:var(--purple)"></div></div>
        <div class="bar-val">${bf.iterCount}</div>
      </div>
    </div>

    <div class="bar-chart">
      <div style="font-size:.65rem;color:var(--muted);margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.08em">Total Algorithm Steps</div>
      <div class="bar-row">
        <div class="bar-label">Dijkstra</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct(d.steps.length, maxSteps)}%;background:var(--blue)"></div></div>
        <div class="bar-val">${d.steps.length}</div>
      </div>
      <div class="bar-row">
        <div class="bar-label">Bellman-Ford</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct(bf.steps.length, maxSteps)}%;background:var(--purple)"></div></div>
        <div class="bar-val">${bf.steps.length}</div>
      </div>
    </div>

    <div class="sep"></div>

    <table class="dist-table" style="font-size:.7rem">
      <thead><tr><th>Node</th><th>Dijkstra dist</th><th>BF dist</th><th>Match?</th></tr></thead>
      <tbody>
        ${Array.from(state.nodes.keys()).map(id => {
          const dd  = d.dist[id] === Infinity ? '∞' : String(d.dist[id]);
          const bfd = bf.dist[id] === Infinity ? '∞' : String(bf.dist[id]);
          const match = d.dist[id] === bf.dist[id];
          return `<tr>
            <td>${nodeLabel(id)}</td>
            <td style="color:var(--blue)">${dd}</td>
            <td style="color:var(--purple)">${bfd}</td>
            <td style="color:${match?'var(--green)':'var(--red)'}">${match ? '✓ yes' : '✗ differ'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="sep"></div>
    <div style="font-size:.7rem;line-height:1.8;color:var(--muted)">
      <div><span style="color:var(--blue)">Dijkstra:</span> ${d.negWeights ? 'Negative weights present ⚠' : 'Non-negative weights ✓'} · O((V+E) log V)</div>
      <div><span style="color:var(--purple)">Bellman-Ford:</span> ${bf.negativeCycle ? 'Negative cycle detected ⚠' : 'No negative cycle ✓'} · O(V·E)</div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────

function updateNodeSelects() {
  const selectors = ['src-select', 'dst-select', 'edge-from', 'edge-to'];
  for (const selId of selectors) {
    const sel = document.getElementById(selId);
    const cur = sel.value;
    const isDst = selId.includes('dst') || selId.includes('to');
    sel.innerHTML = `<option value="">${isDst ? '— all nodes —' : '— none —'}</option>`;
    for (const [id, node] of state.nodes) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = node.label;
      if (id === cur) opt.selected = true;
      sel.appendChild(opt);
    }
  }
}

function updateGraphInfo() {
  document.getElementById('info-nodes').textContent = state.nodes.size;
  document.getElementById('info-edges').textContent = state.edges.size;
  document.getElementById('info-type').textContent = state.directed ? 'Directed' : 'Undirected';
  const hasNeg = Array.from(state.edges.values()).some(e => e.weight < 0);
  document.getElementById('info-neg').textContent = hasNeg ? 'Yes ⚠' : 'No';
  document.getElementById('info-neg').style.color = hasNeg ? 'var(--yellow)' : 'var(--muted)';
  document.getElementById('info-src').textContent = state.source ? nodeLabel(state.source) : '—';
  document.getElementById('info-dst').textContent = state.target ? nodeLabel(state.target) : '—';
}

function addEdgeFromForm() {
  const from = document.getElementById('edge-from').value;
  const to   = document.getElementById('edge-to').value;
  const w    = document.getElementById('edge-weight-input').value;
  if (!from || !to) { notify('Select From and To nodes', 'warn'); return; }
  addEdge(from, to, w);
}

function removeEdgeFromForm() {
  const from = document.getElementById('edge-from').value;
  const to   = document.getElementById('edge-to').value;
  if (!from || !to) { notify('Select From and To nodes', 'warn'); return; }
  for (const [id, edge] of state.edges) {
    if (edge.from === from && edge.to === to) { removeEdge(id); return; }
    if (!state.directed && edge.from === to && edge.to === from) { removeEdge(id); return; }
  }
  notify('Edge not found', 'warn');
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('tc-' + name).classList.add('active');
}

function log(msg, type = 'info') {
  const area = document.getElementById('log-area');
  const div  = document.createElement('div');
  div.className = 'log-entry ' + type;
  const time = new Date().toTimeString().slice(0, 8);
  div.textContent = `[${time}] ${msg}`;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  // Keep max 80 entries
  while (area.children.length > 80) area.removeChild(area.firstChild);
}

let notifTimer;
function notify(msg, type = 'info') {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.className = '', 2800);
}

function showModal(title, bodyHTML, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.add('show');
  state.modalConfirm = onConfirm;
  setTimeout(() => {
    const inp = document.getElementById('modal-input');
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
}

function confirmModal() {
  if (state.modalConfirm) state.modalConfirm();
  closeModal();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
  state.modalConfirm = null;
}

// ─────────────────────────────────────────────────────────
// SAMPLE GRAPHS
// ─────────────────────────────────────────────────────────

function loadSample(name) {
  clearGraph();
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;

  if (name === 'basic') {
    // 6-node positive network
    state.directed = false;
    document.getElementById('graph-type').value = 'undirected';
    const labels = ['A','B','C','D','E','F'];
    const positions = [
      [cx-200, cy-100], [cx, cy-160], [cx+200, cy-100],
      [cx-200, cy+100], [cx, cy+100], [cx+200, cy+100],
    ];
    const ids = [];
    for (let i = 0; i < 6; i++) {
      const id = mkNodeId();
      state.nodes.set(id, { x: positions[i][0] / state.zoom - state.panX / state.zoom, y: positions[i][1] / state.zoom - state.panY / state.zoom, label: labels[i] });
      ids.push(id);
    }
    const edgeDefs = [[0,1,4],[0,3,7],[1,2,9],[1,4,11],[2,5,2],[3,4,3],[3,5,14],[4,5,6],[1,3,10],[2,4,5]];
    for (const [f,t,w] of edgeDefs) addEdgeRaw(ids[f], ids[t], w);
    state.source = ids[0];
    document.getElementById('src-select').value = ids[0];
    fitGraph();
    log('Loaded: Basic 6-node positive network', 'ok');
    notify('Loaded: Basic 6-node graph', 'ok');
  }

  else if (name === 'negative') {
    // Negative weights — demonstrates BF vs Dijkstra
    state.directed = true;
    document.getElementById('graph-type').value = 'directed';
    const labels = ['S','A','B','C','T'];
    const positions = [
      [cx-250, cy], [cx-100, cy-120], [cx+50, cy-120],
      [cx-100, cy+100], [cx+250, cy],
    ];
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const id = mkNodeId();
      state.nodes.set(id, { x: positions[i][0] / state.zoom - state.panX / state.zoom, y: positions[i][1] / state.zoom - state.panY / state.zoom, label: labels[i] });
      ids.push(id);
    }
    addEdgeRaw(ids[0], ids[1], 6);
    addEdgeRaw(ids[0], ids[3], 7);
    addEdgeRaw(ids[1], ids[2], 5);
    addEdgeRaw(ids[1], ids[3], 8);
    addEdgeRaw(ids[1], ids[4], -4); // ← negative
    addEdgeRaw(ids[2], ids[1], -2); // ← negative
    addEdgeRaw(ids[3], ids[2], -3); // ← negative
    addEdgeRaw(ids[3], ids[4], 9);
    addEdgeRaw(ids[4], ids[0], 2);
    addEdgeRaw(ids[4], ids[2], 7);
    state.source = ids[0];
    state.target = ids[4];
    document.getElementById('src-select').value = ids[0];
    document.getElementById('dst-select').value = ids[4];
    fitGraph();
    log('Loaded: Negative weights graph (from CLRS)', 'ok');
    notify('Loaded: Negative edges graph', 'warn');
  }

  else if (name === 'negcycle') {
    state.directed = true;
    document.getElementById('graph-type').value = 'directed';
    const labels = ['A','B','C','D','E'];
    const cx2 = cx, cy2 = cy;
    const r = 130;
    const positions = Array.from({length:5}, (_,i) => [
      cx2 + r * Math.cos((i/5)*2*Math.PI - Math.PI/2),
      cy2 + r * Math.sin((i/5)*2*Math.PI - Math.PI/2),
    ]);
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const id = mkNodeId();
      state.nodes.set(id, { x: positions[i][0] / state.zoom - state.panX / state.zoom, y: positions[i][1] / state.zoom - state.panY / state.zoom, label: labels[i] });
      ids.push(id);
    }
    addEdgeRaw(ids[0], ids[1], 3);
    addEdgeRaw(ids[1], ids[2], 4);
    addEdgeRaw(ids[2], ids[3], -8); // ← creates cycle A→B→C→D→B = 3+4-8-3 = -4 < 0
    addEdgeRaw(ids[3], ids[1], -3);
    addEdgeRaw(ids[1], ids[4], 6);
    addEdgeRaw(ids[0], ids[3], 10);
    state.source = ids[0];
    document.getElementById('src-select').value = ids[0];
    fitGraph();
    log('Loaded: Negative cycle graph', 'warn');
    notify('Loaded: Graph with negative cycle', 'warn');
  }

  else if (name === 'medium') {
    state.directed = false;
    document.getElementById('graph-type').value = 'undirected';
    const n = 12;
    const ids = [];
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI;
      const r = i < 6 ? 160 : 80;
      const id = mkNodeId();
      state.nodes.set(id, {
        x: cx/state.zoom - state.panX/state.zoom + r*Math.cos(angle),
        y: cy/state.zoom - state.panY/state.zoom + r*Math.sin(angle),
        label: String.fromCharCode(65 + i),
      });
      ids.push(id);
    }
    const edgeDefs = [
      [0,1,4],[0,5,10],[1,2,8],[1,6,3],[2,3,7],[2,7,6],[3,4,9],[3,8,2],
      [4,5,5],[4,9,11],[5,10,1],[6,7,5],[6,11,8],[7,8,4],[8,9,7],[9,10,3],
      [10,11,6],[11,6,2],[0,7,15],[2,9,12],[4,11,9],
    ];
    for (const [f,t,w] of edgeDefs) addEdgeRaw(ids[f], ids[t], w);
    state.source = ids[0];
    state.target = ids[3];
    document.getElementById('src-select').value = ids[0];
    document.getElementById('dst-select').value = ids[3];
    fitGraph();
    log('Loaded: Medium 12-node network', 'ok');
    notify('Loaded: Medium 12-node graph', 'ok');
  }

  else if (name === 'large') {
    state.directed = false;
    document.getElementById('graph-type').value = 'undirected';
    const n = 20;
    const ids = [];
    // Grid-like layout
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 5);
      const col = i % 5;
      const id = mkNodeId();
      state.nodes.set(id, {
        x: cx/state.zoom - state.panX/state.zoom - 200 + col * 100,
        y: cy/state.zoom - state.panY/state.zoom - 150 + row * 100,
        label: String(i+1),
      });
      ids.push(id);
    }
    // Connect grid with random weights
    const rng = (min, max) => Math.floor(Math.random() * (max-min+1)) + min;
    for (let i = 0; i < n; i++) {
      if ((i+1) % 5 !== 0) addEdgeRaw(ids[i], ids[i+1], rng(1,15));
      if (i + 5 < n)        addEdgeRaw(ids[i], ids[i+5], rng(1,15));
      if (i % 5 < 4 && i+6 < n) addEdgeRaw(ids[i], ids[i+6], rng(1,20));
    }
    state.source = ids[0];
    state.target = ids[n-1];
    document.getElementById('src-select').value = ids[0];
    document.getElementById('dst-select').value = ids[n-1];
    fitGraph();
    log('Loaded: Large 20-node grid network', 'ok');
    notify('Loaded: Large 20-node graph', 'ok');
  }

  else if (name === 'failure') {
    // Network with a primary path + backup routes
    state.directed = false;
    document.getElementById('graph-type').value = 'undirected';
    const labels = ['R1','R2','R3','R4','R5','R6'];
    const positions = [
      [cx-220, cy], [cx-80, cy-100], [cx+80, cy-100],
      [cx+220, cy], [cx-80, cy+100], [cx+80, cy+100],
    ];
    const ids = [];
    for (let i = 0; i < 6; i++) {
      const id = mkNodeId();
      state.nodes.set(id, { x: positions[i][0]/state.zoom - state.panX/state.zoom, y: positions[i][1]/state.zoom - state.panY/state.zoom, label: labels[i] });
      ids.push(id);
    }
    // Primary path: R1-R2-R3-R4 (low cost)
    addEdgeRaw(ids[0], ids[1], 2);
    addEdgeRaw(ids[1], ids[2], 2);
    addEdgeRaw(ids[2], ids[3], 2);
    // Backup via bottom: R1-R5-R6-R4
    addEdgeRaw(ids[0], ids[4], 5);
    addEdgeRaw(ids[4], ids[5], 5);
    addEdgeRaw(ids[5], ids[3], 5);
    // Cross links
    addEdgeRaw(ids[1], ids[4], 8);
    addEdgeRaw(ids[2], ids[5], 8);
    state.source = ids[0];
    state.target = ids[3];
    document.getElementById('src-select').value = ids[0];
    document.getElementById('dst-select').value = ids[3];
    fitGraph();
    log('Loaded: Link failure demo (use delete tool to remove edge R2-R3 to simulate failure)', 'warn');
    notify('Tip: Delete R2-R3 edge to simulate link failure', 'warn');
  }

  updateNodeSelects();
  updateGraphInfo();
  drawAll();
}

function addEdgeRaw(fromId, toId, weight) {
  const id = mkEdgeId();
  state.edges.set(id, { from: fromId, to: toId, weight });
}

// ─────────────────────────────────────────────────────────
// INITIAL SETUP
// ─────────────────────────────────────────────────────────

function initNetRoute() {
  if (state.initialized) return;

  // Ensure canvas dimensions are established first.
  resizeCanvas();
  state.initialized = true;

  // Center pan
  state.panX = canvas.width  / 2;
  state.panY = canvas.height / 2;

  // Start with basic sample
  loadSample('basic');
  setTool('addnode');
  updateCursor();

  // Kick off render loop
  drawAll();
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const modalOpen = document.getElementById('modal-overlay').classList.contains('show');
  if (modalOpen) {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter') confirmModal();
    return;
  }
  const t = e.target.tagName;
  if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
  switch (e.key) {
    case 'n': setTool('addnode'); break;
    case 'e': setTool('addedge'); break;
    case 'm': setTool('move');    break;
    case 'd': setTool('delete'); break;
    case 'w': setTool('weight'); break;
    case 's': setTool('select'); break;
    case ' ':
      e.preventDefault();
      if (state.steps.length) togglePlay();
      else runAlgorithm();
      break;
    case 'ArrowRight': stepForward(); break;
    case 'ArrowLeft':  stepBack();    break;
    case 'Escape':     stopAlgo();    break;
    case 'f': fitGraph(); break;
  }
});

log('Keyboard: n=addnode e=addedge m=move d=delete w=weight s=select space=run/play ←→=step f=fit', 'info');

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNetRoute, { once: true });
} else {
  initNetRoute();
}
