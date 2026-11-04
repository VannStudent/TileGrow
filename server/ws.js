// TileGrow server: WebSocket minimal (RFC 6455) tanpa paket npm
'use strict';
const crypto = require('crypto');
const {MAX_MSG} = require('./config');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function wsFrame(str){
  const p = Buffer.from(str), n = p.length;
  let h;
  if (n < 126){ h = Buffer.alloc(2); h[1] = n; }
  else if (n < 65536){ h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  h[0] = 0x81; return Buffer.concat([h, p]);
}
function wsControl(op, payload){ const p = payload || Buffer.alloc(0); return Buffer.concat([Buffer.from([0x80 | op, p.length]), p]); }
let nextId = 1;
// IP asli pemain. Lewat tunnel (ngrok) semua koneksi datang dari 127.0.0.1, jadi pakai X-Forwarded-For,
// tapi HANYA kalau koneksinya memang dari PC ini (tunnel). Dari luar, header itu bisa dipalsukan, jadi diabaikan.
function clientIp(req, sock){
  const raw = String(sock.remoteAddress || '').replace(/^::ffff:/, '');
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim().replace(/^::ffff:/, '');
  if ((raw === '127.0.0.1' || raw === '::1') && fwd && /^[0-9a-f.:]{3,45}$/i.test(fwd)) return fwd;
  return raw;
}
class Client {
  constructor(sock, ip, hooks){
    this.hooks = hooks;
    this.sock = sock; this.buf = Buffer.alloc(0); this.frag = [];
    this.id = nextId++; this.user = null; this.flag = 'ID'; this.world = null; this.state = null;
    this.rate = {t: Date.now(), n: 0}; this.alive = true; this.authBusy = false;
    this.noclip = false; this.fullzoom = false; this.invis = false; this.frozen = false; this.lastPos = null;
    this.ip = ip || String(sock.remoteAddress || '').replace(/^::ffff:/, '');
    sock.on('data', d => this.onData(d));
    sock.on('close', () => this.onClose());
    sock.on('error', () => {});
  }
  send(obj){ if (this.alive) try { this.sock.write(wsFrame(JSON.stringify(obj))); } catch(e){} }
  close(){ if (!this.alive) return; try { this.sock.write(wsControl(8)); this.sock.end(); } catch(e){} }
  onData(d){
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length > MAX_MSG + 16) return this.sock.destroy();
    for (;;){
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1], fin = b0 & 0x80, op = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (len === 126){ if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127){ if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_MSG) return this.sock.destroy();
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked){ const k = this.buf.subarray(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= k[i & 3]; }
      this.buf = this.buf.subarray(need);
      if (op === 8){ this.close(); return; }
      if (op === 9){ try { this.sock.write(wsControl(10, payload)); } catch(e){} continue; }
      if (op === 10) continue;
      if (op === 1 || op === 0){
        this.frag.push(payload);
        if (!fin) continue;
        const text = Buffer.concat(this.frag).toString('utf8'); this.frag = [];
        let msg; try { msg = JSON.parse(text); } catch(e){ continue; }
        if (!this.limit()) continue;
        try { this.hooks.onMessage(this, msg); } catch(e){ console.error('handler error', e); }
      }
    }
  }
  limit(){ const now = Date.now(); if (now - this.rate.t > 1000){ this.rate = {t: now, n: 0}; } return ++this.rate.n <= 300; }
  onClose(){ if (!this.alive) return; this.alive = false; this.hooks.onClose(this); }
}
// jawaban handshake HTTP -> WebSocket
function acceptKey(key){ return crypto.createHash('sha1').update(key + GUID).digest('base64'); }

module.exports = {wsFrame, wsControl, clientIp, Client, acceptKey};
