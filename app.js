// ─────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────
const EMPTY = 0;
const SHIP  = 1;
const HIT   = 2;
const MISS  = 3;

const ASSET_PATH = 'assets/';

let GRID = 10;
let COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const ALL_SHIPS = [
  { name:'Carrier',    sym:'CV', len:5 },
  { name:'Battleship', sym:'BB', len:4 },
  { name:'Cruiser',    sym:'CA', len:3 },
  { name:'Submarine',  sym:'SS', len:3 },
  { name:'Destroyer',  sym:'DD', len:2 },
];

let FLEET = [];

const DIFFICULTIES = {
  easy: {
    name: 'EASY',
    grid: 8,
    fleet: ['Cruiser', 'Submarine', 'Destroyer']
  },
  medium: {
    name: 'MEDIUM',
    grid: 10,
    fleet: ['Battleship', 'Cruiser', 'Submarine', 'Destroyer']
  },
  hard: {
    name: 'HARD',
    grid: 12,
    fleet: ['Carrier', 'Battleship', 'Cruiser', 'Submarine', 'Destroyer']
  }
};

let currentDifficulty = 'medium';

// ─────────────────────────────────────────────────────────
// GAME STATE
// ─────────────────────────────────────────────────────────
let phase       = 'PLACEMENT';
let orientation = 'H';
let currentShip = 0;

let playerBoard = [], aiBoard = [], playerView = [], aiView = [];
let playerShips = [], aiShips = [];
let playerAttacked = new Set(), aiAttacked = new Set();
let aiHitStack = [], aiRemaining = [];
let showHeatmap = false, currentPDM = null;
let turnCount = 0, playerHits = 0, aiHitsCount = 0;
let playerTurn = true, aiThinking = false;

// ─────────────────────────────────────────────────────────
// REPLAY STATE
// ─────────────────────────────────────────────────────────
let replayLog             = [];
let replayIdx             = 0;
let replayPlaying         = false;
let replayTimer           = null;
let replayPlayerShipCells = [];
let replayAiShipCells     = [];

// ─────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────
function mkBoard() {
  return Array.from({ length: GRID }, () => Array(GRID).fill(EMPTY));
}

function init() {
  phase = 'PLACEMENT';
  orientation = 'H';
  currentShip = 0;

  playerBoard = mkBoard();
  aiBoard = mkBoard();
  playerView = mkBoard();
  aiView = mkBoard();

  playerShips = FLEET.map(f => ({ ...f, cells: [], sunk: false }));
  aiShips = [];

  playerAttacked = new Set();
  aiAttacked = new Set();
  aiHitStack = [];
  aiRemaining = [];

  showHeatmap = false;
  currentPDM = null;
  turnCount = 0;
  playerHits = 0;
  aiHitsCount = 0;
  playerTurn = true;
  aiThinking = false;

  replayLog = [];
  replayIdx = 0;
  replayPlaying = false;
  clearTimeout(replayTimer);

  updatePhaseBadge('placement');
  document.getElementById('turn-counter').textContent = '—';
  document.getElementById('ai-mode-badge').className = 'ai-mode hunt';
  document.getElementById('ai-mode-badge').textContent = 'HUNT';

  document.getElementById('placement-phase').style.display = '';
  document.getElementById('battle-phase').style.display = 'none';
  document.getElementById('placement-controls-area').style.display = '';
  document.getElementById('battle-controls-area').style.display = 'none';

  document.getElementById('gameover-overlay').classList.remove('show');
  document.getElementById('replay-overlay').classList.remove('show');
  document.getElementById('heatmap-toggle').classList.remove('on');
  document.getElementById('toggle-sw').style = '';
  document.getElementById('replay-btn').style.display = 'none';
  document.getElementById('prob-label').textContent = 'Heat map: OFF';

  clearLog();
  buildPlacementGrid();
  buildFleetList();
  aiAutoPlace();
  log('system', 'Fleet Registry initialized.');
  log('system', 'Place your ships to begin.');
}

// ─────────────────────────────────────────────────────────
// IMAGE HELPER
// ─────────────────────────────────────────────────────────
function createShipImage(shipName, len, isH) {
  const img = document.createElement('img');
  img.src = `${ASSET_PATH}${shipName.toLowerCase()}.png`;
  img.className = 'ship-img';
  img.style.width = `calc((var(--cell) * ${len}) + ${len - 1}px)`;
  img.style.height = `var(--cell)`;

  if (!isH) {
    img.style.transformOrigin = `calc(var(--cell) / 2) calc(var(--cell) / 2)`;
    img.style.transform = `rotate(90deg)`;
  }
  return img;
}

// ─────────────────────────────────────────────────────────
// FLEET LIST
// ─────────────────────────────────────────────────────────
function buildFleetList() {
  const el = document.getElementById('fleet-list');
  el.innerHTML = '';

  FLEET.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'fleet-item' + (i === currentShip ? ' active' : '');
    div.id = `fleet-item-${i}`;
    div.innerHTML = `
      <span class="ship-symbol">${f.sym}</span>
      <span class="ship-name">${f.name}</span>
      <span class="ship-len">${'<div class="ship-seg"></div>'.repeat(f.len)}</span>
    `;
    el.appendChild(div);
  });
}

function updateFleetList() {
  FLEET.forEach((f, i) => {
    const el = document.getElementById(`fleet-item-${i}`);
    if (!el) return;

    const s = playerShips[i];
    if (s.sunk) el.className = 'fleet-item sunk-ship';
    else if (s.cells.length > 0) el.className = 'fleet-item placed';
    else el.className = 'fleet-item' + (i === currentShip ? ' active' : '');
  });
}

// ─────────────────────────────────────────────────────────
// PLACEMENT GRID
// ─────────────────────────────────────────────────────────
function buildPlacementGrid() {
  const grid = document.getElementById('placement-grid');
  grid.innerHTML = '';

  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  grid.appendChild(corner);

  for (let c = 0; c < GRID; c++) {
    const d = document.createElement('div');
    d.className = 'grid-coord';
    d.textContent = c + 1;
    grid.appendChild(d);
  }

  for (let r = 0; r < GRID; r++) {
    const rc = document.createElement('div');
    rc.className = 'grid-coord';
    rc.textContent = COLS[r];
    grid.appendChild(rc);

    for (let c = 0; c < GRID; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener('click', () => placeShipAt(r, c));
      cell.addEventListener('mouseenter', () => previewShip(r, c));
      cell.addEventListener('mouseleave', clearPreview);
      grid.appendChild(cell);
    }
  }

  refreshPlacementGrid();
}

function refreshPlacementGrid() {
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = placementCell(r, c);
      if (!cell) continue;
      cell.classList.remove('hover-valid', 'hover-invalid');
      Array.from(cell.children).forEach(ch => {
        if (ch.classList.contains('ship-img')) ch.remove();
      });
    }
  }

  playerShips.forEach((ship, idx) => {
    if (ship.cells.length > 0) {
      const [r, c] = ship.cells[0];
      const cell = placementCell(r, c);
      if (!cell) return;
      const isH = ship.cells.length > 1 ? ship.cells[0][0] === ship.cells[1][0] : true;
      cell.appendChild(createShipImage(FLEET[idx].name, ship.len, isH));
    }
  });
}

function placementCell(r, c) {
  return document.querySelector(`#placement-grid .cell[data-r="${r}"][data-c="${c}"]`);
}

function previewShip(r, c) {
  clearPreview();
  if (phase !== 'PLACEMENT' || currentShip >= FLEET.length) return;

  const shipDef = FLEET[currentShip];
  const cells = getShipCells(r, c, shipDef.len, orientation);
  const valid = canPlace(cells);

  cells.forEach(([rr, cc]) => {
    const el = placementCell(rr, cc);
    if (el) el.classList.add(valid ? 'hover-valid' : 'hover-invalid');
  });

  if (cells.length > 0) {
    const firstCell = placementCell(cells[0][0], cells[0][1]);
    if (firstCell) {
      const img = createShipImage(shipDef.name, shipDef.len, orientation === 'H');
      img.classList.add('preview');
      img.style.opacity = '0.6';
      if (!valid) img.style.filter = 'sepia(1) hue-rotate(-50deg) saturate(5)';
      firstCell.appendChild(img);
    }
  }
}

function clearPreview() {
  document.querySelectorAll('#placement-grid .hover-valid,#placement-grid .hover-invalid')
    .forEach(el => el.classList.remove('hover-valid', 'hover-invalid'));

  document.querySelectorAll('#placement-grid .preview').forEach(el => el.remove());
}

function getShipCells(r, c, len, dir) {
  const cells = [];
  for (let i = 0; i < len; i++) cells.push(dir === 'H' ? [r, c + i] : [r + i, c]);
  return cells;
}

function canPlace(cells) {
  return cells.every(([r, c]) =>
    r >= 0 && r < GRID &&
    c >= 0 && c < GRID &&
    playerBoard[r][c] === EMPTY
  );
}

function placeShipAt(r, c) {
  if (phase !== 'PLACEMENT' || currentShip >= FLEET.length) return;

  const len = FLEET[currentShip].len;
  const cells = getShipCells(r, c, len, orientation);
  if (!canPlace(cells)) return;

  cells.forEach(([rr, cc]) => { playerBoard[rr][cc] = SHIP; });
  playerShips[currentShip].cells = cells;
  currentShip++;

  refreshPlacementGrid();
  clearPreview();
  updateFleetList();

  if (currentShip >= FLEET.length) {
    document.getElementById('start-btn').disabled = false;
    log('system', 'All ships placed. Ready to battle!');
  } else {
    log('system', `${FLEET[currentShip - 1].name} placed. Place ${FLEET[currentShip].name} (${FLEET[currentShip].len}).`);
  }
}

function toggleOrient() {
  orientation = orientation === 'H' ? 'V' : 'H';
  document.getElementById('orient-icon').textContent = orientation === 'H' ? '↔' : '↕';
  document.getElementById('orient-label').textContent = orientation === 'H' ? 'HORIZONTAL' : 'VERTICAL';
}

function randomPlacement() {
  resetPlacement();

  for (let i = 0; i < FLEET.length; i++) {
    let placed = false;
    let tries = 0;

    while (!placed && tries < 500) {
      tries++;
      const dir = Math.random() < .5 ? 'H' : 'V';
      const r = Math.floor(Math.random() * GRID);
      const c = Math.floor(Math.random() * GRID);
      const cells = getShipCells(r, c, FLEET[i].len, dir);

      if (canPlace(cells)) {
        cells.forEach(([rr, cc]) => { playerBoard[rr][cc] = SHIP; });
        playerShips[i].cells = cells;
        placed = true;
      }
    }
  }

  currentShip = FLEET.length;
  refreshPlacementGrid();
  updateFleetList();
  document.getElementById('start-btn').disabled = false;
  log('system', 'Fleet randomly placed. Ready to battle!');
}

function resetPlacement() {
  playerBoard = mkBoard();
  playerShips = FLEET.map(f => ({ ...f, cells: [], sunk: false }));
  currentShip = 0;
  refreshPlacementGrid();
  updateFleetList();
  document.getElementById('start-btn').disabled = true;
}

// ─────────────────────────────────────────────────────────
// AI PLACEMENT
// ─────────────────────────────────────────────────────────
function aiAutoPlace() {
  aiBoard = mkBoard();
  aiShips = [];

  FLEET.forEach(f => {
    let placed = false;
    let tries = 0;

    while (!placed && tries < 1000) {
      tries++;
      const dir = Math.random() < .5 ? 'H' : 'V';
      const r = Math.floor(Math.random() * GRID);
      const c = Math.floor(Math.random() * GRID);
      const cells = getShipCells(r, c, f.len, dir);

      if (cells.every(([rr, cc]) =>
        rr >= 0 && rr < GRID &&
        cc >= 0 && cc < GRID &&
        aiBoard[rr][cc] === EMPTY
      )) {
        cells.forEach(([rr, cc]) => { aiBoard[rr][cc] = SHIP; });
        aiShips.push({ ...f, cells, sunk: false });
        placed = true;
      }
    }
  });

  aiRemaining = aiShips.map(s => ({ ...s }));
}

// ─────────────────────────────────────────────────────────
// START BATTLE
// ─────────────────────────────────────────────────────────
function startBattle() {
  phase = 'BATTLE';
  playerTurn = true;
  replayLog = [];

  replayPlayerShipCells = playerShips.map(s => ({
    name: s.name,
    len: s.len,
    cells: s.cells.map(c => [...c])
  }));

  replayAiShipCells = aiShips.map(s => ({
    name: s.name,
    len: s.len,
    cells: s.cells.map(c => [...c])
  }));

  document.getElementById('placement-phase').style.display = 'none';
  document.getElementById('battle-phase').style.display = '';
  document.getElementById('placement-controls-area').style.display = 'none';
  document.getElementById('battle-controls-area').style.display = '';

  updatePhaseBadge('battle');
  buildPlayerGrid();
  buildAiGrid();
  updateTurnUI();
  updateShipCounters();

  log('system', '═══ BATTLE COMMENCED ═══');
  log('player', 'Your move. Select target on enemy waters.');
}

// ─────────────────────────────────────────────────────────
// PLAYER GRID
// ─────────────────────────────────────────────────────────
function buildPlayerGrid() {
  const grid = document.getElementById('player-grid');
  grid.innerHTML = '';

  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  grid.appendChild(corner);

  for (let c = 0; c < GRID; c++) {
    const d = document.createElement('div');
    d.className = 'grid-coord';
    d.textContent = c + 1;
    grid.appendChild(d);
  }

  for (let r = 0; r < GRID; r++) {
    const rc = document.createElement('div');
    rc.className = 'grid-coord';
    rc.textContent = COLS[r];
    grid.appendChild(rc);

    for (let c = 0; c < GRID; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.id = `pc-${r}-${c}`;
      grid.appendChild(cell);
    }
  }

  playerShips.forEach((ship, idx) => {
    if (ship.cells.length > 0) {
      const [r, c] = ship.cells[0];
      const cell = document.getElementById(`pc-${r}-${c}`);
      if (!cell) return;
      const isH = ship.cells.length > 1 ? ship.cells[0][0] === ship.cells[1][0] : true;
      cell.appendChild(createShipImage(FLEET[idx].name, ship.len, isH));
    }
  });
}

function refreshPlayerCell(r, c) {
  const cell = document.getElementById(`pc-${r}-${c}`);
  if (!cell) return;

  cell.classList.remove('hit', 'miss', 'sunk');

  Array.from(cell.children).forEach(ch => {
    if (ch.classList.contains('hit-marker') || ch.classList.contains('miss-marker')) ch.remove();
  });

  const v = aiView[r][c];
  if (v === HIT) {
    cell.classList.add(isPlayerCellSunk(r, c) ? 'sunk' : 'hit');
    const m = document.createElement('div');
    m.className = 'hit-marker';
    cell.appendChild(m);
  } else if (v === MISS) {
    cell.classList.add('miss');
    const m = document.createElement('div');
    m.className = 'miss-marker';
    cell.appendChild(m);
  }
}

function isPlayerCellSunk(r, c) {
  return playerShips.some(s => s.sunk && s.cells.some(([rr, cc]) => rr === r && cc === c));
}

// ─────────────────────────────────────────────────────────
// AI GRID
// ─────────────────────────────────────────────────────────
function buildAiGrid() {
  const grid = document.getElementById('ai-grid');
  grid.innerHTML = '';

  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  grid.appendChild(corner);

  for (let c = 0; c < GRID; c++) {
    const d = document.createElement('div');
    d.className = 'grid-coord';
    d.textContent = c + 1;
    grid.appendChild(d);
  }

  for (let r = 0; r < GRID; r++) {
    const rc = document.createElement('div');
    rc.className = 'grid-coord';
    rc.textContent = COLS[r];
    grid.appendChild(rc);

    for (let c = 0; c < GRID; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.id = `ac-${r}-${c}`;
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener('click', () => playerFire(r, c));
      grid.appendChild(cell);
    }
  }
}

function refreshAiCell(r, c) {
  const cell = document.getElementById(`ac-${r}-${c}`);
  if (!cell) return;

  cell.classList.remove('hit', 'miss', 'sunk', 'attacked');

  Array.from(cell.children).forEach(ch => {
    if (ch.classList.contains('hit-marker') || ch.classList.contains('miss-marker') || ch.classList.contains('heat-cell')) ch.remove();
  });

  const v = playerView[r][c];

  if (v === HIT) {
    cell.classList.add(isAiCellSunk(r, c) ? 'sunk' : 'hit', 'attacked');
    const m = document.createElement('div');
    m.className = 'hit-marker';
    cell.appendChild(m);
  } else if (v === MISS) {
    cell.classList.add('miss', 'attacked');
    const m = document.createElement('div');
    m.className = 'miss-marker';
    cell.appendChild(m);
  }

  if (showHeatmap && currentPDM && v === EMPTY) applyHeatToCell(cell, r, c);

  if (isAiCellSunk(r, c)) {
    const ship = aiShips.find(s => s.sunk && s.cells.some(([rr, cc]) => rr === r && cc === c));
    if (ship && ship.cells[0][0] === r && ship.cells[0][1] === c && !cell.querySelector('.ship-img')) {
      const isH = ship.cells.length > 1 ? ship.cells[0][0] === ship.cells[1][0] : true;
      const img = createShipImage(ship.name, ship.len, isH);
      img.style.opacity = '0.8';
      img.style.filter = 'grayscale(1) sepia(1) hue-rotate(-50deg) saturate(3)';
      cell.appendChild(img);
    }
  }
}

function isAiCellSunk(r, c) {
  return aiShips.some(s => s.sunk && s.cells.some(([rr, cc]) => rr === r && cc === c));
}

// ─────────────────────────────────────────────────────────
// PLAYER FIRES
// ─────────────────────────────────────────────────────────
function playerFire(r, c) {
  if (!playerTurn || aiThinking || phase !== 'BATTLE') return;
  if (playerAttacked.has(`${r},${c}`)) return;

  playerAttacked.add(`${r},${c}`);
  turnCount++;
  document.getElementById('turn-counter').textContent = turnCount;

  const isHit = aiBoard[r][c] === SHIP;
  playerView[r][c] = isHit ? HIT : MISS;
  refreshAiCell(r, c);

  if (isHit) {
    playerHits++;
    shakeCell(`ac-${r}-${c}`);

    const ship = aiShips.find(s => !s.sunk && s.cells.some(([rr, cc]) => rr === r && cc === c));
    if (ship && ship.cells.every(([rr, cc]) => playerView[rr][cc] === HIT)) {
      ship.sunk = true;
      aiRemaining = aiRemaining.filter(s => s.name !== ship.name);

      const idx = FLEET.findIndex(f => f.name === ship.name);
      if (idx >= 0) {
        const fi = document.getElementById(`fleet-item-${idx}`);
        if (fi) fi.className = 'fleet-item sunk-ship';
      }

      ship.cells.forEach(([rr, cc]) => refreshAiCell(rr, cc));
      log('sunk', `▣ ${ship.name} (${ship.sym}) SUNK!`);
      updateShipCounters();
      recordMove('player', r, c, 'sunk', ship.name);

      if (checkWin()) return;
    } else {
      log('player', `→ HIT at ${COLS[r]}${c + 1}!`);
      recordMove('player', r, c, 'hit', null);
    }
  } else {
    log('player', `→ MISS at ${COLS[r]}${c + 1}.`);
    recordMove('player', r, c, 'miss', null);
  }

  updateShipCounters();
  playerTurn = false;
  updateTurnUI();

  if (showHeatmap) computeAndRenderHeatmap();
  setTimeout(aiTurn, 900);
}

// ─────────────────────────────────────────────────────────
// AI TURN
// ─────────────────────────────────────────────────────────
function aiTurn() {
  if (phase !== 'BATTLE') return;

  aiThinking = true;
  document.getElementById('ai-thinking').classList.add('show');
  document.getElementById('ai-board-label').textContent = 'ENEMY WATERS — AI Computing…';

  setTimeout(() => {
    aiThinking = false;
    document.getElementById('ai-thinking').classList.remove('show');
    document.getElementById('ai-board-label').textContent = 'ENEMY WATERS — Click to Fire';
    executeAiMove();
  }, 600 + Math.random() * 600);
}

function executeAiMove() {
  currentPDM = computePDM(aiView, playerShips.filter(s => !s.sunk));

  const [r, c] = huntTarget();
  aiAttacked.add(`${r},${c}`);

  const isHit = playerBoard[r][c] === SHIP;
  aiView[r][c] = isHit ? HIT : MISS;
  refreshPlayerCell(r, c);

  if (isHit) {
    aiHitsCount++;
    aiHitStack.push([r, c]);
    shakeCell(`pc-${r}-${c}`);

    const ship = playerShips.find(s => !s.sunk && s.cells.some(([rr, cc]) => rr === r && cc === c));
    if (ship && ship.cells.every(([rr, cc]) => aiView[rr][cc] === HIT)) {
      ship.sunk = true;
      aiHitStack = aiHitStack.filter(([hr, hc]) => !ship.cells.some(([sr, sc]) => sr === hr && sc === hc));
      ship.cells.forEach(([rr, cc]) => refreshPlayerCell(rr, cc));
      updateFleetList();
      log('sunk', `⚠ AI sunk your ${ship.name} (${ship.sym})!`);
      updateShipCounters();
      recordMove('ai', r, c, 'sunk', ship.name);

      if (checkLoss()) return;
    } else {
      log('ai', `⚡ AI HIT at ${COLS[r]}${c + 1}!`);
      recordMove('ai', r, c, 'hit', null);
    }
  } else {
    log('ai', `AI MISS at ${COLS[r]}${c + 1}.`);
    recordMove('ai', r, c, 'miss', null);
  }

  const modeEl = document.getElementById('ai-mode-badge');
  if (aiHitStack.length > 0) {
    modeEl.className = 'ai-mode target';
    modeEl.textContent = 'TARGET';
  } else {
    modeEl.className = 'ai-mode hunt';
    modeEl.textContent = 'HUNT';
  }

  updateShipCounters();
  playerTurn = true;
  updateTurnUI();

  if (showHeatmap) computeAndRenderHeatmap();
}

// ─────────────────────────────────────────────────────────
// AI ALGORITHMS
// ─────────────────────────────────────────────────────────
function computePDM(boardView, remaining) {
  const map = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  if (!remaining || remaining.length === 0) return map;

  for (const ship of remaining) {
    const len = ship.len || ship.length;

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c <= GRID - len; c++) {
        let ok = true;
        for (let k = 0; k < len; k++) {
          if (boardView[r][c + k] === MISS) { ok = false; break; }
          if (aiAttacked.has(`${r},${c + k}`) && boardView[r][c + k] !== HIT) { ok = false; break; }
        }
        if (ok) for (let k = 0; k < len; k++) map[r][c + k]++;
      }
    }

    for (let r = 0; r <= GRID - len; r++) {
      for (let c = 0; c < GRID; c++) {
        let ok = true;
        for (let k = 0; k < len; k++) {
          if (boardView[r + k][c] === MISS) { ok = false; break; }
          if (aiAttacked.has(`${r + k},${c}`) && boardView[r + k][c] !== HIT) { ok = false; break; }
        }
        if (ok) for (let k = 0; k < len; k++) map[r + k][c]++;
      }
    }
  }

  return map;
}

function selectBest(map, excludeAttacked = true) {
  let best = -1, br = -1, bc = -1;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (excludeAttacked && aiAttacked.has(`${r},${c}`)) continue;
      if (map[r][c] > best) {
        best = map[r][c];
        br = r;
        bc = c;
      }
    }
  }
  return [br, bc];
}

function huntTarget() {
  if (aiHitStack.length > 0) {
    const tMap = Array.from({ length: GRID }, () => Array(GRID).fill(0));
    const HIGH = 1000;

    if (aiHitStack.length === 1) {
      const [hr, hc] = aiHitStack[0];
      [[hr - 1, hc], [hr + 1, hc], [hr, hc - 1], [hr, hc + 1]].forEach(([nr, nc]) => {
        if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && !aiAttacked.has(`${nr},${nc}`)) tMap[nr][nc] = HIGH;
      });
    } else {
      const rows = aiHitStack.map(h => h[0]);
      const cols = aiHitStack.map(h => h[1]);
      const horiz = rows.every(r2 => r2 === rows[0]);

      if (horiz) {
        const r = rows[0], minC = Math.min(...cols), maxC = Math.max(...cols);
        if (minC - 1 >= 0 && !aiAttacked.has(`${r},${minC - 1}`)) tMap[r][minC - 1] = HIGH;
        if (maxC + 1 < GRID && !aiAttacked.has(`${r},${maxC + 1}`)) tMap[r][maxC + 1] = HIGH;
      } else {
        const c = cols[0], minR = Math.min(...rows), maxR = Math.max(...rows);
        if (minR - 1 >= 0 && !aiAttacked.has(`${minR - 1},${c}`)) tMap[minR - 1][c] = HIGH;
        if (maxR + 1 < GRID && !aiAttacked.has(`${maxR + 1},${c}`)) tMap[maxR + 1][c] = HIGH;
      }
    }

    const [br, bc] = selectBest(tMap);
    if (br !== -1) return [br, bc];
    aiHitStack = [];
  }

  const remaining = playerShips.filter(s => !s.sunk);
  const pdm = computePDM(aiView, remaining);
  const minLen = remaining.length > 0 ? Math.min(...remaining.map(s => s.len)) : 1;

  if (minLen >= 2) {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if ((r + c) % 2 !== 0) pdm[r][c] = 0;
      }
    }
  }

  for (const key of aiAttacked) {
    const [ar, ac] = key.split(',').map(Number);
    pdm[ar][ac] = 0;
  }

  return selectBest(pdm);
}

// ─────────────────────────────────────────────────────────
// HEATMAP
// ─────────────────────────────────────────────────────────
function computeAndRenderHeatmap() {
  if (!showHeatmap) return;

  const remaining = aiShips.filter(s => !s.sunk);
  const pdm = Array.from({ length: GRID }, () => Array(GRID).fill(0));

  for (const ship of remaining) {
    const len = ship.len || ship.length;

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c <= GRID - len; c++) {
        let ok = true;
        for (let k = 0; k < len; k++) {
          if (playerView[r][c + k] === MISS) { ok = false; break; }
          if (playerAttacked.has(`${r},${c + k}`) && playerView[r][c + k] !== HIT) { ok = false; break; }
        }
        if (ok) for (let k = 0; k < len; k++) pdm[r][c + k]++;
      }
    }

    for (let r = 0; r <= GRID - len; r++) {
      for (let c = 0; c < GRID; c++) {
        let ok = true;
        for (let k = 0; k < len; k++) {
          if (playerView[r + k][c] === MISS) { ok = false; break; }
          if (playerAttacked.has(`${r + k},${c}`) && playerView[r + k][c] !== HIT) { ok = false; break; }
        }
        if (ok) for (let k = 0; k < len; k++) pdm[r + k][c]++;
      }
    }
  }

  currentPDM = pdm;

  let maxVal = 0;
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (pdm[r][c] > maxVal) maxVal = pdm[r][c];
    }
  }

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = document.getElementById(`ac-${r}-${c}`);
      if (!cell) continue;

      const old = cell.querySelector('.heat-cell');
      if (old) old.remove();

      if (playerView[r][c] !== EMPTY || maxVal === 0) continue;

      const norm = pdm[r][c] / maxVal;
      if (norm < 0.01) continue;

      applyHeatToCell(cell, r, c, norm);
    }
  }
}

function applyHeatToCell(cell, r, c, norm) {
  if (norm === undefined) {
    if (!currentPDM) return;
    let maxVal = 0;
    for (let rr = 0; rr < GRID; rr++) {
      for (let cc = 0; cc < GRID; cc++) {
        if (currentPDM[rr][cc] > maxVal) maxVal = currentPDM[rr][cc];
      }
    }
    norm = maxVal > 0 ? currentPDM[r][c] / maxVal : 0;
  }

  const heat = document.createElement('div');
  heat.className = 'heat-cell';

  const rv = Math.round(norm * 200);
  const g = Math.round(norm < .5 ? norm * 2 * 150 : 150 * (1 - norm * 2 + 1));
  const b = Math.round((1 - norm) * 100);

  heat.style.background = `rgba(${rv},${Math.max(0, g)},${b},${0.15 + norm * 0.5})`;
  cell.appendChild(heat);
}

function clearHeatmap() {
  document.querySelectorAll('#ai-grid .heat-cell').forEach(e => e.remove());
}

function toggleHeatmap() {
  showHeatmap = !showHeatmap;
  const tog = document.getElementById('heatmap-toggle');
  const lbl = document.getElementById('prob-label');

  if (showHeatmap) {
    tog.classList.add('on');
    lbl.textContent = 'Heat map: ON (amber=likely)';
    computeAndRenderHeatmap();
  } else {
    tog.classList.remove('on');
    lbl.textContent = 'Heat map: OFF';
    clearHeatmap();
  }
}

// ─────────────────────────────────────────────────────────
// WIN / LOSS
// ─────────────────────────────────────────────────────────
function checkWin() {
  if (aiShips.every(s => s.sunk)) {
    endGame(true);
    return true;
  }
  return false;
}

function checkLoss() {
  if (playerShips.every(s => s.sunk)) {
    endGame(false);
    return true;
  }
  return false;
}

function endGame(win) {
  phase = 'GAMEOVER';
  updatePhaseBadge('gameover');

  const overlay = document.getElementById('gameover-overlay');
  overlay.classList.add('show');

  document.getElementById('go-result').textContent = win ? 'VICTORY' : 'DEFEATED';
  document.getElementById('go-result').className = 'gameover-result ' + (win ? 'win' : 'loss');
  document.getElementById('go-sub').textContent = win ? 'All enemy ships have been sunk.' : 'Your fleet has been destroyed.';
  document.getElementById('go-turns').textContent = turnCount;
  document.getElementById('go-phits').textContent = playerHits;
  document.getElementById('go-aihits').textContent = aiHitsCount;
  document.getElementById('replay-btn').style.display = '';

  log('system', '═══ ' + (win ? 'VICTORY — ENEMY FLEET DESTROYED' : 'DEFEAT — YOUR FLEET DESTROYED') + ' ═══');
}

// ─────────────────────────────────────────────────────────
// RECORD MOVE
// ─────────────────────────────────────────────────────────
function recordMove(who, r, c, result, shipName) {
  replayLog.push({ who, r, c, result, shipName, turn: replayLog.length + 1 });
}

// ─────────────────────────────────────────────────────────
// REPLAY SYSTEM
// ─────────────────────────────────────────────────────────
function openReplay() {
  if (replayLog.length === 0) {
    log('system', 'No moves to replay yet.');
    return;
  }

  document.getElementById('gameover-overlay').classList.remove('show');
  replayIdx = 0;
  replayPlaying = false;

  document.getElementById('replay-play-btn').textContent = '▶ PLAY';
  document.getElementById('replay-play-btn').classList.remove('playing');

  const scrubber = document.getElementById('replay-scrubber');
  scrubber.max = replayLog.length;
  scrubber.value = 0;

  document.getElementById('replay-total').textContent = replayLog.length;

  buildReplayGrids();
  renderReplayState();
  document.getElementById('replay-overlay').classList.add('show');
}

function closeReplay() {
  replayStopPlay();
  document.getElementById('replay-overlay').classList.remove('show');
  if (phase === 'GAMEOVER') document.getElementById('gameover-overlay').classList.add('show');
}

function buildReplayGrids() {
  ['replay-player-grid', 'replay-ai-grid'].forEach(id => {
    const grid = document.getElementById(id);
    grid.innerHTML = '';
    grid.style.setProperty('--replay-grid-size', GRID);

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = document.createElement('div');
        cell.className = 'replay-cell';
        cell.id = `${id}-${r}-${c}`;
        grid.appendChild(cell);
      }
    }
  });

  replayPlayerShipCells.forEach(ship => {
    ship.cells.forEach(([r, c]) => {
      const cell = document.getElementById(`replay-player-grid-${r}-${c}`);
      if (cell) cell.classList.add('replay-ship');
    });
  });
}

function renderReplayState() {
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const hasShip = replayPlayerShipCells.some(s => s.cells.some(([sr, sc]) => sr === r && sc === c));
      document.getElementById(`replay-player-grid-${r}-${c}`).className = 'replay-cell' + (hasShip ? ' replay-ship' : '');
      document.getElementById(`replay-ai-grid-${r}-${c}`).className = 'replay-cell';
    }
  }

  const sunkAiShips = new Set();
  const sunkPlayerShips = new Set();

  for (let i = 0; i < replayIdx; i++) {
    const mv = replayLog[i];
    const isLast = (i === replayIdx - 1);

    if (mv.who === 'player') {
      const cell = document.getElementById(`replay-ai-grid-${mv.r}-${mv.c}`);
      if (cell) {
        cell.className = 'replay-cell';
        if (mv.result === 'miss') cell.classList.add('replay-miss');
        else if (mv.result === 'hit') cell.classList.add('replay-hit');
        else if (mv.result === 'sunk') {
          cell.classList.add('replay-sunk');
          if (mv.shipName) sunkAiShips.add(mv.shipName);
        }
        if (isLast) cell.classList.add('replay-latest');
      }
    } else {
      const cell = document.getElementById(`replay-player-grid-${mv.r}-${mv.c}`);
      if (cell) {
        const hasShip = replayPlayerShipCells.some(s => s.cells.some(([sr, sc]) => sr === mv.r && sc === mv.c));
        cell.className = 'replay-cell' + (hasShip ? ' replay-ship' : '');
        if (mv.result === 'miss') cell.classList.add('replay-miss');
        else if (mv.result === 'hit') cell.classList.add('replay-hit');
        else if (mv.result === 'sunk') {
          cell.classList.add('replay-hit');
          if (mv.shipName) sunkPlayerShips.add(mv.shipName);
        }
        if (isLast) cell.classList.add('replay-latest');
      }
    }
  }

  sunkAiShips.forEach(shipName => {
    const ship = replayAiShipCells.find(s => s.name === shipName);
    if (ship) {
      ship.cells.forEach(([r, c]) => {
        const cell = document.getElementById(`replay-ai-grid-${r}-${c}`);
        if (cell) cell.classList.add('replay-sunk');
      });
    }
  });

  sunkPlayerShips.forEach(shipName => {
    const ship = replayPlayerShipCells.find(s => s.name === shipName);
    if (ship) {
      ship.cells.forEach(([r, c]) => {
        const cell = document.getElementById(`replay-player-grid-${r}-${c}`);
        if (cell) {
          cell.classList.remove('replay-hit');
          cell.classList.add('replay-sunk');
        }
      });
    }
  });

  const descEl = document.getElementById('replay-desc');
  if (replayIdx === 0) {
    descEl.innerHTML = '<strong>Start of battle.</strong> Step forward to replay moves.';
  } else {
    const mv = replayLog[replayIdx - 1];
    const who = mv.who === 'player' ? 'YOU' : 'AI';
    const emoji = mv.result === 'miss' ? '💨' : mv.result === 'sunk' ? '💥' : '🎯';
    const coord = `${COLS[mv.r]}${mv.c + 1}`;
    const resultText = mv.result === 'miss' ? 'MISS' : mv.result === 'hit' ? 'HIT' : `SUNK ${mv.shipName}!`;
    descEl.innerHTML = `<strong>Turn ${mv.turn}:</strong> ${emoji} ${who} fired at <strong>${coord}</strong> — ${resultText}`;
  }

  document.getElementById('replay-pos').textContent = replayIdx;
  document.getElementById('replay-scrubber').value = replayIdx;
}

function replayStep(dir) {
  replayStopPlay();
  replayIdx = Math.max(0, Math.min(replayLog.length, replayIdx + dir));
  renderReplayState();
}

function replayGoStart() {
  replayStopPlay();
  replayIdx = 0;
  renderReplayState();
}

function replayGoEnd() {
  replayStopPlay();
  replayIdx = replayLog.length;
  renderReplayState();
}

function replayScrub(val) {
  replayStopPlay();
  replayIdx = parseInt(val, 10);
  renderReplayState();
}

function replayTogglePlay() {
  if (replayPlaying) {
    replayStopPlay();
    return;
  }

  if (replayIdx >= replayLog.length) replayIdx = 0;
  replayPlaying = true;
  document.getElementById('replay-play-btn').textContent = '⏸ PAUSE';
  document.getElementById('replay-play-btn').classList.add('playing');
  replayAdvance();
}

function replayAdvance() {
  if (!replayPlaying) return;
  if (replayIdx >= replayLog.length) {
    replayStopPlay();
    return;
  }

  replayIdx++;
  renderReplayState();

  const speed = parseInt(document.getElementById('replay-speed').value, 10) || 700;
  replayTimer = setTimeout(replayAdvance, speed);
}

function replayStopPlay() {
  replayPlaying = false;
  clearTimeout(replayTimer);
  document.getElementById('replay-play-btn').textContent = '▶ PLAY';
  document.getElementById('replay-play-btn').classList.remove('playing');
}

// ─────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────
function updateTurnUI() {
  document.getElementById('pip-player').className = 'turn-pip ' + (playerTurn ? 'active' : 'inactive');
  document.getElementById('pip-ai').className = 'turn-pip ' + (playerTurn ? 'inactive' : 'active');

  const playerGrid = document.getElementById('player-grid');
  const aiGrid = document.getElementById('ai-grid');
  if (playerGrid) playerGrid.classList.toggle('active-turn', !playerTurn);
  if (aiGrid) aiGrid.classList.toggle('active-turn', playerTurn);

  const lbl = document.getElementById('ai-board-label');
  if (phase === 'BATTLE') {
    lbl.className = 'board-label ai-label' + (playerTurn ? ' your-turn' : '');
    lbl.textContent = playerTurn ? 'ENEMY WATERS — Click to Fire' : 'ENEMY WATERS — AI Thinking…';
  }
}

const _style = document.createElement('style');
_style.textContent = `
@keyframes hitShake {
  0% { transform:translate(0,0) }
  20% { transform:translate(-3px,2px) }
  40% { transform:translate(3px,-2px) }
  60% { transform:translate(-2px,3px) }
  80% { transform:translate(2px,-1px) }
  100% { transform:translate(0,0) }
}
`;
document.head.appendChild(_style);

function updateShipCounters() {
  document.getElementById('player-ships-left').textContent = playerShips.filter(s => !s.sunk).length;
  document.getElementById('ai-ships-left').textContent = aiShips.filter(s => !s.sunk).length;
}

function updatePhaseBadge(p) {
  const el = document.getElementById('phase-badge');
  const map = {
    placement: ['PLACEMENT', 'placement'],
    battle: ['BATTLE', 'battle'],
    gameover: ['GAME OVER', 'gameover']
  };
  const [txt, cls] = map[p] || ['—', 'placement'];
  el.textContent = txt;
  el.className = 'phase-badge ' + cls;
}

function shakeCell(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = 'hitShake .4s ease-out';
  el.addEventListener('animationend', () => el.style.animation = '', { once: true });
}

let logCount = 0;
function log(type, msg) {
  logCount++;
  document.getElementById('log-count').textContent = logCount;

  const body = document.getElementById('log-body');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;

  const now = new Date();
  const ts =
    now.getHours().toString().padStart(2, '0') + ':' +
    now.getMinutes().toString().padStart(2, '0') + ':' +
    now.getSeconds().toString().padStart(2, '0');

  entry.innerHTML = `<span class="log-time">[${ts}]</span>${msg}`;
  body.appendChild(entry);
  body.scrollTop = body.scrollHeight;
}

function clearLog() {
  document.getElementById('log-body').innerHTML = '';
  logCount = 0;
  document.getElementById('log-count').textContent = 0;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('replay-overlay').classList.contains('show')) {
    closeReplay();
    return;
  }

  if (phase === 'PLACEMENT') {
    if (e.key === 'r' || e.key === 'R') toggleOrient();
    if (e.key === ' ') {
      e.preventDefault();
      randomPlacement();
    }
  }
});

function resetGame() {
  init();
}

// ─────────────────────────────────────────────────────────
// START MENU / DIFFICULTY
// ─────────────────────────────────────────────────────────
function showStartMenu() {
  document.getElementById('start-menu').classList.add('show');
}

function hideStartMenu() {
  document.getElementById('start-menu').classList.remove('show');
}

function setDifficulty(level) {
  currentDifficulty = level;
  document.querySelectorAll('.diff-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`diff-${level}`).classList.add('active');
}

function applyDifficulty() {
  const cfg = DIFFICULTIES[currentDifficulty];
  GRID = cfg.grid;
  FLEET = cfg.fleet.map(name => ALL_SHIPS.find(s => s.name === name));

  const root = document.documentElement;

  if (GRID >= 12) root.style.setProperty('--cell', '32px');
  else if (GRID <= 8) root.style.setProperty('--cell', '48px');
  else root.style.setProperty('--cell', '42px');

  root.style.setProperty('--grid-size', GRID);
}

function menuNewGame() {
  applyDifficulty();
  hideStartMenu();
  init();
}

function openCredits() {
  document.getElementById('credits-overlay').classList.add('show');
}

function closeCredits() {
  document.getElementById('credits-overlay').classList.remove('show');
}

function menuExit() {
  window.close();
  alert('Exit is not supported in most browsers. You can close the tab manually.');
}

// ─────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────
applyDifficulty();
init();