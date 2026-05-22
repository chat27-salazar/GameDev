// ─────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────
const GRID  = 10;
const COLS  = ['A','B','C','D','E','F','G','H','I','J'];
const EMPTY = 0, SHIP = 1, HIT = 2, MISS = 3;

const FLEET = [
  { name:'Carrier',    sym:'CV', len:5 },
  { name:'Battleship', sym:'BB', len:4 },
  { name:'Cruiser',    sym:'CA', len:3 },
  { name:'Submarine',  sym:'SS', len:3 },
  { name:'Destroyer',  sym:'DD', len:2 },
];

// ─────────────────────────────────────────────────────────
//  GAME STATE
// ─────────────────────────────────────────────────────────
let phase       = 'PLACEMENT';  // PLACEMENT | BATTLE | GAMEOVER
let orientation = 'H';
let currentShip = 0;

let playerBoard = [];   // What's on player's water
let aiBoard     = [];   // AI's actual ship positions
let playerView  = [];   // Player's knowledge of AI board (EMPTY/HIT/MISS)
let aiView      = [];   // AI's knowledge of player board

let playerShips = [];   // { name, sym, len, cells, sunk }
let aiShips     = [];   // same structure

let playerAttacked = new Set();
let aiAttacked     = new Set();

let aiHitStack    = [];   // confirmed hits not yet sunk
let aiRemaining   = [];   // ships not yet sunk (for PDM)

let showHeatmap  = false;
let currentPDM   = null;

let turnCount    = 0;
let playerHits   = 0;
let aiHitsCount  = 0;
let playerTurn   = true;
let aiThinking   = false;

// ─────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────
function mkBoard(){ return Array.from({length:GRID},()=>Array(GRID).fill(EMPTY)); }

function init(){
  phase         = 'PLACEMENT';
  orientation   = 'H';
  currentShip   = 0;
  playerBoard   = mkBoard();
  aiBoard       = mkBoard();
  playerView    = mkBoard();
  aiView        = mkBoard();
  playerShips   = FLEET.map(f=>({...f, cells:[], sunk:false}));
  aiShips       = [];
  playerAttacked = new Set();
  aiAttacked    = new Set();
  aiHitStack    = [];
  aiRemaining   = [];
  showHeatmap   = false;
  currentPDM    = null;
  turnCount     = 0;
  playerHits    = 0;
  aiHitsCount   = 0;
  playerTurn    = true;
  aiThinking    = false;

  updatePhaseBadge('placement');
  document.getElementById('turn-counter').textContent = '—';
  document.getElementById('ai-mode-badge').className = 'ai-mode hunt';
  document.getElementById('ai-mode-badge').textContent = 'HUNT';
  document.getElementById('placement-phase').style.display = '';
  document.getElementById('battle-phase').style.display   = 'none';
  document.getElementById('placement-controls-area').style.display = '';
  document.getElementById('battle-controls-area').style.display   = 'none';
  document.getElementById('gameover-overlay').classList.remove('show');
  document.getElementById('heatmap-toggle').classList.remove('on');
  document.getElementById('toggle-sw').style = '';

  clearLog();
  buildPlacementGrid();
  buildFleetList();
  aiAutoPlace();
  log('system','Fleet Registry initialized.');
  log('system','Place your ships to begin.');
}

// ─────────────────────────────────────────────────────────
//  FLEET LIST
// ─────────────────────────────────────────────────────────
function buildFleetList(){
  const el = document.getElementById('fleet-list');
  el.innerHTML = '';
  FLEET.forEach((f,i)=>{
    const div = document.createElement('div');
    div.className = 'fleet-item' + (i===currentShip?' active':'');
    div.id = `fleet-item-${i}`;
    div.innerHTML = `
      <span class="ship-symbol">${f.sym}</span>
      <span class="ship-name">${f.name}</span>
      <span class="ship-len">${'<div class="ship-seg"></div>'.repeat(f.len)}</span>`;
    el.appendChild(div);
  });
}

function updateFleetList(phase2){
  const ships = phase2==='placement' ? playerShips : playerShips;
  FLEET.forEach((f,i)=>{
    const el = document.getElementById(`fleet-item-${i}`);
    if(!el) return;
    const s = playerShips[i];
    if(s.sunk){
      el.className = 'fleet-item sunk-ship';
    } else if(s.cells.length>0){
      el.className = 'fleet-item placed';
    } else {
      el.className = 'fleet-item' + (i===currentShip?' active':'');
    }
  });
}

// ─────────────────────────────────────────────────────────
//  PLACEMENT GRID
// ─────────────────────────────────────────────────────────
function buildPlacementGrid(){
  const grid = document.getElementById('placement-grid');
  grid.innerHTML = '';
  // Corner
  const corner = document.createElement('div');
  corner.className = 'grid-corner';
  grid.appendChild(corner);
  // Column headers
  for(let c=0;c<GRID;c++){
    const d = document.createElement('div');
    d.className='grid-coord'; d.textContent=c+1;
    grid.appendChild(d);
  }
  // Rows
  for(let r=0;r<GRID;r++){
    const rc = document.createElement('div');
    rc.className='grid-coord'; rc.textContent=COLS[r];
    grid.appendChild(rc);
    for(let c=0;c<GRID;c++){
      const cell = document.createElement('div');
      cell.className='cell';
      cell.dataset.r=r; cell.dataset.c=c;
      cell.addEventListener('click',()=>placeShipAt(r,c));
      cell.addEventListener('mouseenter',()=>previewShip(r,c));
      cell.addEventListener('mouseleave',clearPreview);
      grid.appendChild(cell);
    }
  }
  refreshPlacementGrid();
}

function refreshPlacementGrid(){
  for(let r=0;r<GRID;r++){
    for(let c=0;c<GRID;c++){
      const cell = placementCell(r,c);
      cell.classList.remove('ship','hover-valid','hover-invalid');
      cell.innerHTML='';
      if(playerBoard[r][c]===SHIP){
        cell.classList.add('ship');
      }
    }
  }
}

function placementCell(r,c){
  return document.querySelector(`#placement-grid .cell[data-r="${r}"][data-c="${c}"]`);
}

function previewShip(r,c){
  clearPreview();
  if(phase!=='PLACEMENT') return;
  if(currentShip>=FLEET.length) return;
  const len = FLEET[currentShip].len;
  const cells = getShipCells(r,c,len,orientation);
  const valid = canPlace(cells);
  cells.forEach(([rr,cc])=>{
    const el = placementCell(rr,cc);
    if(!el) return;
    el.classList.add(valid?'hover-valid':'hover-invalid');
    const blk = document.createElement('div');
    blk.className='ship-block';
    el.appendChild(blk);
  });
}

function clearPreview(){
  document.querySelectorAll('#placement-grid .hover-valid, #placement-grid .hover-invalid').forEach(el=>{
    el.classList.remove('hover-valid','hover-invalid');
    el.innerHTML='';
    const r=parseInt(el.dataset.r), c=parseInt(el.dataset.c);
    if(playerBoard[r][c]===SHIP) el.classList.add('ship');
  });
}

function getShipCells(r,c,len,dir){
  const cells=[];
  for(let i=0;i<len;i++){
    cells.push(dir==='H'?[r,c+i]:[r+i,c]);
  }
  return cells;
}

function canPlace(cells){
  return cells.every(([r,c])=>r>=0&&r<GRID&&c>=0&&c<GRID&&playerBoard[r][c]===EMPTY);
}

function placeShipAt(r,c){
  if(phase!=='PLACEMENT') return;
  if(currentShip>=FLEET.length) return;
  const len = FLEET[currentShip].len;
  const cells = getShipCells(r,c,len,orientation);
  if(!canPlace(cells)) return;
  cells.forEach(([rr,cc])=>{ playerBoard[rr][cc]=SHIP; });
  playerShips[currentShip].cells=cells;
  currentShip++;
  refreshPlacementGrid();
  clearPreview();
  updateFleetList('placement');
  if(currentShip>=FLEET.length){
    document.getElementById('start-btn').disabled=false;
    log('system','All ships placed. Ready to battle!');
  } else {
    log('system',`${FLEET[currentShip-1].name} placed. Place ${FLEET[currentShip].name} (${FLEET[currentShip].len}).`);
  }
}

function toggleOrient(){
  orientation = orientation==='H'?'V':'H';
  const btn = document.getElementById('orient-btn');
  const icon = document.getElementById('orient-icon');
  const lbl  = document.getElementById('orient-label');
  icon.textContent = orientation==='H'?'↔':'↕';
  lbl.textContent  = orientation==='H'?'HORIZONTAL':'VERTICAL';
}

function randomPlacement(){
  resetPlacement();
  for(let i=0;i<FLEET.length;i++){
    let placed=false;
    let tries=0;
    while(!placed&&tries<500){
      tries++;
      const dir = Math.random()<.5?'H':'V';
      const r   = Math.floor(Math.random()*GRID);
      const c   = Math.floor(Math.random()*GRID);
      const cells = getShipCells(r,c,FLEET[i].len,dir);
      if(canPlace(cells)){
        cells.forEach(([rr,cc])=>{ playerBoard[rr][cc]=SHIP; });
        playerShips[i].cells=cells;
        placed=true;
      }
    }
  }
  currentShip = FLEET.length;
  refreshPlacementGrid();
  updateFleetList('placement');
  document.getElementById('start-btn').disabled=false;
  log('system','Fleet randomly placed. Ready to battle!');
}

function resetPlacement(){
  playerBoard = mkBoard();
  playerShips = FLEET.map(f=>({...f,cells:[],sunk:false}));
  currentShip = 0;
  refreshPlacementGrid();
  updateFleetList('placement');
  document.getElementById('start-btn').disabled=true;
}

// ─────────────────────────────────────────────────────────
//  AI PLACEMENT
// ─────────────────────────────────────────────────────────
function aiAutoPlace(){
  aiBoard = mkBoard();
  aiShips = [];
  FLEET.forEach(f=>{
    let placed=false;
    let tries=0;
    while(!placed&&tries<1000){
      tries++;
      const dir=Math.random()<.5?'H':'V';
      const r=Math.floor(Math.random()*GRID);
      const c=Math.floor(Math.random()*GRID);
      const cells=getShipCells(r,c,f.len,dir);
      if(cells.every(([rr,cc])=>rr>=0&&rr<GRID&&cc>=0&&cc<GRID&&aiBoard[rr][cc]===EMPTY)){
        cells.forEach(([rr,cc])=>{ aiBoard[rr][cc]=SHIP; });
        aiShips.push({...f,cells,sunk:false});
        placed=true;
      }
    }
  });
  aiRemaining = aiShips.map(s=>({...s}));
}

// ─────────────────────────────────────────────────────────
//  START BATTLE
// ─────────────────────────────────────────────────────────
function startBattle(){
  phase = 'BATTLE';
  playerTurn = true;

  document.getElementById('placement-phase').style.display='none';
  document.getElementById('battle-phase').style.display='';
  document.getElementById('placement-controls-area').style.display='none';
  document.getElementById('battle-controls-area').style.display='';

  updatePhaseBadge('battle');
  buildPlayerGrid();
  buildAiGrid();
  updateTurnUI();
  updateShipCounters();
  log('system','═══ BATTLE COMMENCED ═══');
  log('player','Your move. Select target on enemy waters.');
}

// ─────────────────────────────────────────────────────────
//  PLAYER GRID
// ─────────────────────────────────────────────────────────
function buildPlayerGrid(){
  const grid = document.getElementById('player-grid');
  grid.innerHTML='';
  const corner=document.createElement('div'); corner.className='grid-corner'; grid.appendChild(corner);
  for(let c=0;c<GRID;c++){const d=document.createElement('div');d.className='grid-coord';d.textContent=c+1;grid.appendChild(d);}
  for(let r=0;r<GRID;r++){
    const rc=document.createElement('div');rc.className='grid-coord';rc.textContent=COLS[r];grid.appendChild(rc);
    for(let c=0;c<GRID;c++){
      const cell=document.createElement('div');
      cell.className='cell';
      cell.id=`pc-${r}-${c}`;
      if(playerBoard[r][c]===SHIP) cell.classList.add('ship');
      grid.appendChild(cell);
    }
  }
}

function refreshPlayerCell(r,c){
  const cell=document.getElementById(`pc-${r}-${c}`);
  if(!cell) return;
  cell.classList.remove('hit','miss','sunk','ship');
  cell.innerHTML='';
  const v=aiView[r][c];
  const hasShip=playerBoard[r][c]===SHIP;
  if(v===HIT){
    cell.classList.add(isPlayerCellSunk(r,c)?'sunk':'hit');
    const m=document.createElement('div'); m.className='hit-marker'; cell.appendChild(m);
  } else if(v===MISS){
    cell.classList.add('miss');
    const m=document.createElement('div'); m.className='miss-marker'; cell.appendChild(m);
  } else if(hasShip){
    cell.classList.add('ship');
  }
}

function isPlayerCellSunk(r,c){
  return playerShips.some(s=>s.sunk&&s.cells.some(([rr,cc])=>rr===r&&cc===c));
}

// ─────────────────────────────────────────────────────────
//  AI GRID
// ─────────────────────────────────────────────────────────
function buildAiGrid(){
  const grid=document.getElementById('ai-grid');
  grid.innerHTML='';
  const corner=document.createElement('div'); corner.className='grid-corner'; grid.appendChild(corner);
  for(let c=0;c<GRID;c++){const d=document.createElement('div');d.className='grid-coord';d.textContent=c+1;grid.appendChild(d);}
  for(let r=0;r<GRID;r++){
    const rc=document.createElement('div');rc.className='grid-coord';rc.textContent=COLS[r];grid.appendChild(rc);
    for(let c=0;c<GRID;c++){
      const cell=document.createElement('div');
      cell.className='cell';
      cell.id=`ac-${r}-${c}`;
      cell.dataset.r=r; cell.dataset.c=c;
      cell.addEventListener('click',()=>playerFire(r,c));
      grid.appendChild(cell);
    }
  }
}

function refreshAiCell(r,c){
  const cell=document.getElementById(`ac-${r}-${c}`);
  if(!cell) return;
  cell.classList.remove('hit','miss','sunk','attacked');
  cell.innerHTML='';
  const heat=cell.querySelector('.heat-cell');
  
  const v=playerView[r][c];
  if(v===HIT){
    cell.classList.add(isAiCellSunk(r,c)?'sunk':'hit');
    cell.classList.add('attacked');
    const m=document.createElement('div'); m.className='hit-marker'; cell.appendChild(m);
  } else if(v===MISS){
    cell.classList.add('miss','attacked');
    const m=document.createElement('div'); m.className='miss-marker'; cell.appendChild(m);
  }
  if(showHeatmap && currentPDM && v===EMPTY){
    applyHeatToCell(cell,r,c);
  }
}

function isAiCellSunk(r,c){
  return aiShips.some(s=>s.sunk&&s.cells.some(([rr,cc])=>rr===r&&cc===c));
}

// ─────────────────────────────────────────────────────────
//  PLAYER FIRES
// ─────────────────────────────────────────────────────────
function playerFire(r,c){
  if(!playerTurn || aiThinking || phase!=='BATTLE') return;
  if(playerAttacked.has(`${r},${c}`)) return;

  playerAttacked.add(`${r},${c}`);
  turnCount++;
  document.getElementById('turn-counter').textContent=turnCount;

  const isHit = aiBoard[r][c]===SHIP;
  playerView[r][c] = isHit?HIT:MISS;
  refreshAiCell(r,c);

  if(isHit){
    playerHits++;
    shakeCell(`ac-${r}-${c}`);
    // Check if sunk
    const ship = aiShips.find(s=>!s.sunk&&s.cells.some(([rr,cc])=>rr===r&&cc===c));
    if(ship && ship.cells.every(([rr,cc])=>playerView[rr][cc]===HIT)){
      ship.sunk=true;
      aiRemaining = aiRemaining.filter(s=>s.name!==ship.name);
      // Mark sunk on fleet sidebar
      const idx=FLEET.findIndex(f=>f.name===ship.name);
      if(idx>=0){
        const fitem=document.getElementById(`fleet-item-${idx}`);
        if(fitem) fitem.className='fleet-item sunk-ship';
      }
      // Refresh cells
      ship.cells.forEach(([rr,cc])=>refreshAiCell(rr,cc));
      log('sunk',`▣ ${ship.name} (${ship.sym}) SUNK!`);
      updateShipCounters();
      if(checkWin()) return;
    } else {
      log('player',`→ ${COLS[r]}${r+1+1-1}... HIT at ${COLS[r]}${c+1}!`);
    }
  } else {
    log('player',`→ MISS at ${COLS[r]}${c+1}.`);
  }

  updateShipCounters();
  playerTurn = false;
  updateTurnUI();
  if(showHeatmap) computeAndRenderHeatmap();

  // AI turn after delay
  setTimeout(aiTurn, 900);
}

// ─────────────────────────────────────────────────────────
//  AI TURN
// ─────────────────────────────────────────────────────────
function aiTurn(){
  if(phase!=='BATTLE') return;
  aiThinking=true;
  document.getElementById('ai-thinking').classList.add('show');
  document.getElementById('ai-board-label').textContent='ENEMY WATERS — AI Computing…';

  // Show computing for dramatic effect
  const thinkTime = 600 + Math.random()*600;
  setTimeout(()=>{
    aiThinking=false;
    document.getElementById('ai-thinking').classList.remove('show');
    document.getElementById('ai-board-label').textContent='ENEMY WATERS — Click to Fire';
    executeAiMove();
  }, thinkTime);
}

function executeAiMove(){
  // Compute PDM
  const pdm = computePDM(aiView, aiHitStack.length>0 ? null : playerShips.filter(s=>!s.sunk));
  currentPDM = computePDM(aiView, playerShips.filter(s=>!s.sunk));

  // Determine move
  const [r,c] = huntTarget();
  aiAttacked.add(`${r},${c}`);

  const isHit = playerBoard[r][c]===SHIP;
  aiView[r][c] = isHit?HIT:MISS;
  refreshPlayerCell(r,c);

  if(isHit){
    aiHitsCount++;
    aiHitStack.push([r,c]);
    shakeCell(`pc-${r}-${c}`);

    // Check if AI sunk a ship
    const ship = playerShips.find(s=>!s.sunk&&s.cells.some(([rr,cc])=>rr===r&&cc===c));
    if(ship && ship.cells.every(([rr,cc])=>aiView[rr][cc]===HIT)){
      ship.sunk=true;
      // Remove from hitStack
      aiHitStack = aiHitStack.filter(([hr,hc])=>!ship.cells.some(([sr,sc])=>sr===hr&&sc===hc));
      ship.cells.forEach(([rr,cc])=>refreshPlayerCell(rr,cc));
      updateFleetList('battle');
      log('sunk',`⚠ AI sunk your ${ship.name} (${ship.sym})!`);
      updateShipCounters();
      if(checkLoss()) return;
    } else {
      log('ai',`⚡ AI HIT at ${COLS[r]}${c+1}!`);
    }
  } else {
    log('ai',`AI MISS at ${COLS[r]}${c+1}.`);
  }

  // Update AI mode badge
  const modeEl = document.getElementById('ai-mode-badge');
  if(aiHitStack.length>0){
    modeEl.className='ai-mode target'; modeEl.textContent='TARGET';
  } else {
    modeEl.className='ai-mode hunt'; modeEl.textContent='HUNT';
  }

  updateShipCounters();
  playerTurn=true;
  updateTurnUI();
  if(showHeatmap) computeAndRenderHeatmap();
}

// ─────────────────────────────────────────────────────────
//  AI ALGORITHMS
// ─────────────────────────────────────────────────────────
function computePDM(boardView, remaining){
  const map = Array.from({length:GRID},()=>Array(GRID).fill(0));
  if(!remaining||remaining.length===0) return map;

  for(const ship of remaining){
    const len=ship.len||ship.length;
    // Horizontal
    for(let r=0;r<GRID;r++){
      for(let c=0;c<=GRID-len;c++){
        let ok=true;
        for(let k=0;k<len;k++){
          if(boardView[r][c+k]===MISS){ ok=false; break; }
          if(aiAttacked.has(`${r},${c+k}`)&&boardView[r][c+k]!==HIT){ ok=false; break; }
        }
        if(ok) for(let k=0;k<len;k++) map[r][c+k]++;
      }
    }
    // Vertical
    for(let r=0;r<=GRID-len;r++){
      for(let c=0;c<GRID;c++){
        let ok=true;
        for(let k=0;k<len;k++){
          if(boardView[r+k][c]===MISS){ ok=false; break; }
          if(aiAttacked.has(`${r+k},${c}`)&&boardView[r+k][c]!==HIT){ ok=false; break; }
        }
        if(ok) for(let k=0;k<len;k++) map[r+k][c]++;
      }
    }
  }
  return map;
}

function selectBest(map, excludeAttacked=true){
  let best=-1, br=-1, bc=-1;
  for(let r=0;r<GRID;r++){
    for(let c=0;c<GRID;c++){
      if(excludeAttacked && aiAttacked.has(`${r},${c}`)) continue;
      if(map[r][c]>best){ best=map[r][c]; br=r; bc=c; }
    }
  }
  return [br,bc];
}

function huntTarget(){
  // ── TARGET MODE ──
  if(aiHitStack.length>0){
    const tMap=Array.from({length:GRID},()=>Array(GRID).fill(0));
    const HIGH=1000;

    if(aiHitStack.length===1){
      const [hr,hc]=aiHitStack[0];
      [[hr-1,hc],[hr+1,hc],[hr,hc-1],[hr,hc+1]].forEach(([nr,nc])=>{
        if(nr>=0&&nr<GRID&&nc>=0&&nc<GRID&&!aiAttacked.has(`${nr},${nc}`))
          tMap[nr][nc]=HIGH;
      });
    } else {
      const rows=aiHitStack.map(h=>h[0]);
      const cols=aiHitStack.map(h=>h[1]);
      const horiz=rows.every(r2=>r2===rows[0]);
      if(horiz){
        const r=rows[0], minC=Math.min(...cols), maxC=Math.max(...cols);
        if(minC-1>=0&&!aiAttacked.has(`${r},${minC-1}`)) tMap[r][minC-1]=HIGH;
        if(maxC+1<GRID&&!aiAttacked.has(`${r},${maxC+1}`)) tMap[r][maxC+1]=HIGH;
      } else {
        const c=cols[0], minR=Math.min(...rows), maxR=Math.max(...rows);
        if(minR-1>=0&&!aiAttacked.has(`${minR-1},${c}`)) tMap[minR-1][c]=HIGH;
        if(maxR+1<GRID&&!aiAttacked.has(`${maxR+1},${c}`)) tMap[maxR+1][c]=HIGH;
      }
    }

    const [br,bc]=selectBest(tMap);
    if(br!==-1) return [br,bc];
    // Fallback: clear corrupt hit stack and retry as hunt
    aiHitStack=[];
  }

  // ── HUNT MODE + PDM + PARITY SEARCH ──
  const remaining = playerShips.filter(s=>!s.sunk);
  const pdm = computePDM(aiView, remaining);

  // Parity Search: skip odd-parity cells if min ship ≥ 2
  const minLen = remaining.length>0 ? Math.min(...remaining.map(s=>s.len)) : 1;
  if(minLen>=2){
    for(let r=0;r<GRID;r++)
      for(let c=0;c<GRID;c++)
        if((r+c)%2!==0) pdm[r][c]=0;
  }

  // Zero out already attacked
  for(const key of aiAttacked){
    const [ar,ac]=key.split(',').map(Number);
    pdm[ar][ac]=0;
  }

  return selectBest(pdm);
}

// Player PDM for heat map display
function computeAndRenderHeatmap(){
  if(!showHeatmap) return;
  const remaining = aiShips.filter(s=>!s.sunk);
  const pdm = Array.from({length:GRID},()=>Array(GRID).fill(0));
  for(const ship of remaining){
    const len=ship.len||ship.length;
    for(let r=0;r<GRID;r++){
      for(let c=0;c<=GRID-len;c++){
        let ok=true;
        for(let k=0;k<len;k++){
          if(playerView[r][c+k]===MISS){ok=false;break;}
          if(playerAttacked.has(`${r},${c+k}`)&&playerView[r][c+k]!==HIT){ok=false;break;}
        }
        if(ok) for(let k=0;k<len;k++) pdm[r][c+k]++;
      }
    }
    for(let r=0;r<=GRID-len;r++){
      for(let c=0;c<GRID;c++){
        let ok=true;
        for(let k=0;k<len;k++){
          if(playerView[r+k][c]===MISS){ok=false;break;}
          if(playerAttacked.has(`${r+k},${c}`)&&playerView[r+k][c]!==HIT){ok=false;break;}
        }
        if(ok) for(let k=0;k<len;k++) pdm[r+k][c]++;
      }
    }
  }
  currentPDM=pdm;
  // Find max for normalization
  let maxVal=0;
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++) if(pdm[r][c]>maxVal) maxVal=pdm[r][c];

  for(let r=0;r<GRID;r++){
    for(let c=0;c<GRID;c++){
      const cell=document.getElementById(`ac-${r}-${c}`);
      if(!cell) continue;
      // Remove old heat
      const old=cell.querySelector('.heat-cell');
      if(old) old.remove();
      if(playerView[r][c]!==EMPTY) continue;
      if(maxVal===0) continue;
      const norm=pdm[r][c]/maxVal;
      if(norm<0.01) continue;
      applyHeatToCell(cell,r,c,norm);
    }
  }
}

function applyHeatToCell(cell,r,c,norm){
  if(norm===undefined){
    if(!currentPDM) return;
    let maxVal=0;
    for(let rr=0;rr<GRID;rr++) for(let cc=0;cc<GRID;cc++) if(currentPDM[rr][cc]>maxVal) maxVal=currentPDM[rr][cc];
    norm=maxVal>0?currentPDM[r][c]/maxVal:0;
  }
  const heat=document.createElement('div');
  heat.className='heat-cell';
  // Color: low=dark blue, mid=amber, high=red
  const r2=Math.round(norm*200);
  const g=Math.round(norm<.5?norm*2*150:150*(1-norm*2+1));
  const b=Math.round((1-norm)*100);
  heat.style.background=`rgba(${r2},${Math.max(0,g)},${b},${0.15+norm*0.5})`;
  cell.appendChild(heat);
}

function clearHeatmap(){
  document.querySelectorAll('#ai-grid .heat-cell').forEach(e=>e.remove());
}

function toggleHeatmap(){
  showHeatmap=!showHeatmap;
  const tog=document.getElementById('heatmap-toggle');
  const lbl=document.getElementById('prob-label');
  if(showHeatmap){
    tog.classList.add('on');
    lbl.textContent='Heat map: ON (amber=likely)';
    computeAndRenderHeatmap();
  } else {
    tog.classList.remove('on');
    lbl.textContent='Heat map: OFF';
    clearHeatmap();
  }
}

// ─────────────────────────────────────────────────────────
//  WIN / LOSS CHECK
// ─────────────────────────────────────────────────────────
function checkWin(){
  if(aiShips.every(s=>s.sunk)){
    endGame(true);
    return true;
  }
  return false;
}
function checkLoss(){
  if(playerShips.every(s=>s.sunk)){
    endGame(false);
    return true;
  }
  return false;
}
function endGame(win){
  phase='GAMEOVER';
  updatePhaseBadge('gameover');
  const overlay=document.getElementById('gameover-overlay');
  overlay.classList.add('show');
  document.getElementById('go-result').textContent=win?'VICTORY':'DEFEATED';
  document.getElementById('go-result').className='gameover-result '+(win?'win':'loss');
  document.getElementById('go-sub').textContent=win?'All enemy ships have been sunk.':'Your fleet has been destroyed.';
  document.getElementById('go-turns').textContent=turnCount;
  document.getElementById('go-phits').textContent=playerHits;
  document.getElementById('go-aihits').textContent=aiHitsCount;
  log('system','═══ '+(win?'VICTORY — ENEMY FLEET DESTROYED':'DEFEAT — YOUR FLEET DESTROYED')+' ═══');
}

// ─────────────────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────────────────
function updateTurnUI(){
  const pp=document.getElementById('pip-player');
  const pa=document.getElementById('pip-ai');
  pp.className='turn-pip '+(playerTurn?'active':'inactive');
  pa.className='turn-pip '+(playerTurn?'inactive':'active');
  const lbl=document.getElementById('ai-board-label');
  if(phase==='BATTLE'){
    lbl.className='board-label ai-label'+(playerTurn?' your-turn':'');
    lbl.textContent=playerTurn?'ENEMY WATERS — Click to Fire':'ENEMY WATERS — AI Thinking…';
  }
}

// ── CSS shake injection ──
const style=document.createElement('style');
style.textContent=`
@keyframes hitShake{\n  0%{transform:translate(0,0)}\n  20%{transform:translate(-3px,2px)}\n  40%{transform:translate(3px,-2px)}\n  60%{transform:translate(-2px,3px)}\n  80%{transform:translate(2px,-1px)}\n  100%{transform:translate(0,0)}\n}`;
document.head.appendChild(style);

function updateShipCounters(){
  const pl=playerShips.filter(s=>!s.sunk).length;
  const al=aiShips.filter(s=>!s.sunk).length;
  document.getElementById('player-ships-left').textContent=pl;
  document.getElementById('ai-ships-left').textContent=al;
}

function updatePhaseBadge(p){
  const el=document.getElementById('phase-badge');
  const map={placement:['PLACEMENT','placement'],battle:['BATTLE','battle'],gameover:['GAME OVER','gameover']};
  const [txt,cls]=map[p]||['—','placement'];
  el.textContent=txt; el.className='phase-badge '+cls;
}

function shakeCell(id){
  const el=document.getElementById(id);
  if(!el) return;
  el.style.animation='hitShake .4s ease-out';
  el.addEventListener('animationend',()=>el.style.animation='',{once:true});
}

// ─────────────────────────────────────────────────────────
//  LOG
// ─────────────────────────────────────────────────────────
let logCount=0;
function log(type,msg){
  logCount++;
  document.getElementById('log-count').textContent=logCount;
  const body=document.getElementById('log-body');
  const entry=document.createElement('div');
  entry.className=`log-entry ${type}`;
  const now=new Date(); const ts=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0')+':'+now.getSeconds().toString().padStart(2,'0');
  entry.innerHTML=`<span class="log-time">[${ts}]</span>${msg}`;
  body.appendChild(entry);
  body.scrollTop=body.scrollHeight;
}
function clearLog(){ document.getElementById('log-body').innerHTML=''; logCount=0; document.getElementById('log-count').textContent=0; }

// ─────────────────────────────────────────────────────────
//  KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────
document.addEventListener('keydown',e=>{
  if(phase==='PLACEMENT'){
    if(e.key==='r'||e.key==='R') toggleOrient();
    if(e.key===' '){ e.preventDefault(); randomPlacement(); }
  }
});

// ─────────────────────────────────────────────────────────
//  RESET
// ─────────────────────────────────────────────────────────
function resetGame(){ init(); }

// ─────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────
init();
