<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Mini Pac-Man</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root{
      --cell: 28px; /* change this to scale the whole game */
    }
    body {
      margin: 0;
      background: #001f3f; /* navy-ish */
      color: #fff;
      display: flex;
      height: 100vh;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    }
    #ui {
      position: absolute;
      top: 12px;
      left: 12px;
      font-weight: 600;
      letter-spacing: .5px;
    }
    canvas {
      background: #000; /* game background */
      image-rendering: crisp-edges;
      border-radius: 8px;
      box-shadow: 0 6px 20px rgba(0,0,0,.6);
    }
    .hint { position: absolute; bottom: 14px; left: 14px; opacity: .9; font-size: 13px; }
  </style>
</head>
<body>
  <div id="ui">Score: <span id="score">0</span></div>
  <canvas id="c"></canvas>
  <div class="hint">Controls: Arrow keys or WASD — eat all pellets to win.</div>

<script>
/*
  Mini Pac-Man
  - grid-based map
  - one player (Pac-Man) drawn as an arc
  - pellets
  - one ghost with very simple random AI
  - collision via cell occupancy checks
*/

/* CONFIG */
const CELL = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 28;
const ROWS = 21;
const COLS = 19;
const CANVAS_W = COLS * CELL;
const CANVAS_H = ROWS * CELL;
const PLAYER_SPEED = 3; // pixels per frame
const GHOST_SPEED = 2.2;
const PELLET_RADIUS = 3;

/* MAP LEGEND:
  0 - empty
  1 - wall
  2 - pellet
*/
const level = [
  // 19 columns per row
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,1,2,1,1,2,1,2,1,1,2,1,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,1,1,1,1,1,1,1,1,2,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,1,2,2,2,1,2,2,2,2,2,2,1],
  [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,0,2,2,2,2,2,2,2,2,1], // center row with gap (0) to add variety
  [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
  [1,2,2,2,2,2,2,1,2,2,2,1,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,1,1,1,1,1,1,1,1,2,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,1,2,1,1,2,1,2,1,1,2,1,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  // extra rows to reach 21
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

/* Canvas setup */
const canvas = document.getElementById('c');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');
ctx.lineWidth = 2;

/* Game state */
let score = 0;
const scoreEl = document.getElementById('score');

/* Player (starts near top-left open area) */
const player = {
  x: CELL * 9 + CELL/2, // start roughly center horizontally
  y: CELL * 9 + CELL/2,
  radius: CELL * 0.4,
  dir: {x:0,y:0},     // current velocity direction unit vector
  desiredDir: {x:0,y:0}, // queue for smoother turning
  speed: PLAYER_SPEED,
  mouth: 0, // for animation
};

/* Single ghost */
const ghost = {
  x: CELL * 9 + CELL/2 + CELL*2,
  y: CELL * 7 + CELL/2,
  radius: CELL * 0.4,
  dir: {x:0,y:0},
  speed: GHOST_SPEED,
  color: '#FF2D55',
  moveTimer: 0
};

/* Helpers */
function cellAt(x,y){
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  if (row<0 || row>=ROWS || col<0 || col>=COLS) return 1; // treat out of bounds as wall
  return level[row][col];
}

function isWallCell(row,col){
  if(row<0||row>=ROWS||col<0||col>=COLS) return true;
  return level[row][col] === 1;
}

function worldToCellCenter(col,row){
  return { x: col*CELL + CELL/2, y: row*CELL + CELL/2 };
}

/* Initialize pellet count & place pellets where '2' is */
let totalPellets = 0;
for(let r=0; r<ROWS; r++){
  for(let c=0; c<COLS; c++){
    if(level[r][c] === 2) totalPellets++;
  }
}

/* Input */
const keys = {};
window.addEventListener('keydow
