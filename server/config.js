// TileGrow server: pengaturan dari environment + aturan game bersama (js/data.js lewat econ.js)
'use strict';
const path = require('path');
const {loadEcon} = require('./econ');
const PORT = +process.env.PORT || 8080;
const VERSION = 'v1.14';
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const COLS = 100, ROWS = 60, N = COLS * ROWS;
const MAX_MSG = 2 * 1024 * 1024;
const REG_MAX = Math.max(1, +process.env.REG_MAX || 35);   // akun baru per IP per jam (PC server tidak dibatasi)
const TEST = process.env.TILEGROW_TEST === '1';          // khusus tes otomatis: world dari klien diterima + /testgive
const econ = loadEcon(ROOT);

const {D} = econ;
const TS = D.TS;
module.exports = {PORT, VERSION, HOST, ROOT, DATA, COLS, ROWS, N, MAX_MSG, TEST, REG_MAX, econ, D, TS};
