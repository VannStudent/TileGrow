// Tes keamanan server TileGrow v1.0.1 (24 kasus). Jalankan server dengan data kosong dulu:
//   HOST=127.0.0.1 PORT=8095 DATA_DIR=/tmp/tg-test node server/server.js
//   node tests/server-security.test.mjs
const U='ws://127.0.0.1:8095/ws'; let pass=0, fail=0;
const ok=(name,cond,extra='')=>{ cond?pass++:fail++; console.log((cond?'PASS ':'FAIL ')+name+(extra?'  '+extra:'')); };
const open=()=>new Promise(r=>{const w=new WebSocket(U);w.q=[];w.onmessage=e=>w.q.push(JSON.parse(e.data));w.onopen=()=>r(w);});
const wait=(w,t,ms=2500)=>new Promise(res=>{const s=Date.now();const i=setInterval(()=>{const k=w.q.findIndex(m=>m.t===t);if(k>=0){clearInterval(i);res(w.q.splice(k,1)[0]);}else if(Date.now()-s>ms){clearInterval(i);res(null);}},15);});
const S=(w,o)=>w.send(JSON.stringify(o));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// 1. URL rusak
let r=await fetch('http://127.0.0.1:8095/%E0%A4%A'); ok('URL rusak -> 400', r.status===400, r.status);
r=await fetch('http://127.0.0.1:8095/'); ok('server masih hidup', r.status===200);

const a=await open(), b=await open();
S(a,{t:'register',user:'alice1',pass:'secret12',flag:'ID'}); ok('register A',(await wait(a,'auth')).ok);
S(b,{t:'register',user:'bob1',pass:'secret12',flag:'MY'}); ok('register B',(await wait(b,'auth')).ok);
const N=6000, fgArr=Array(N).fill(0); for(let i=3000;i<N;i++) fgArr[i]=1; fgArr[2950]=23; for(let i=5900;i<N;i++) fgArr[i]=7;
fgArr[2900]=30; // world lock milik A, ditulis A sendiri saat create
const world={fg:fgArr,bgw:Array(N).fill(0),trees:[],meta:[[2900,{lock:{type:'world',owner:'alice1',access:[],public:false,ignoreAir:false,tiles:null}}]],spawn:{x:50,y:29}};
S(a,{t:'join',name:'TEST'}); await wait(a,'needWorld');
S(a,{t:'create',name:'TEST',world}); const aw=await wait(a,'world'); ok('A create world + WL tersimpan', aw && aw.data.meta.length===1);
S(b,{t:'join',name:'TEST'}); await wait(b,'world'); await wait(a,'pjoin');

// 2. B coba pecah block di world ber-WL milik A
S(b,{t:'ops',ops:[[3100,0,0,null,null]]}); let rb=await wait(b,'ops'); let ra=await wait(a,'ops',600);
ok('tamu pecah block di WL ditolak', rb && rb.denied===1 && rb.ops[0][1]===1, JSON.stringify(rb&&rb.ops[0]));
ok('A tidak menerima op tamu', ra===null);
// 3. B coba hapus/ambil alih WL
S(b,{t:'ops',ops:[[2900,30,0,{lock:{type:'world',owner:'bob1',access:[],public:false,ignoreAir:false,tiles:null}},null]]}); rb=await wait(b,'ops');
ok('ambil alih WL ditolak', rb && rb.denied===1);
// 4. A sendiri boleh pecah
S(a,{t:'ops',ops:[[3100,0,0,null,null]]}); ra=await wait(a,'ops'); rb=await wait(b,'ops');
ok('pemilik boleh pecah', ra && ra.denied===0 && rb && rb.ops[0][1]===0);
// 5. A beri akses ke bob1
S(a,{t:'ops',ops:[[2900,30,0,{lock:{type:'world',owner:'alice1',access:['bob1'],public:false,ignoreAir:false,tiles:null}},null]]}); ra=await wait(a,'ops'); await wait(b,'ops');
ok('pemilik ubah daftar akses', ra && ra.denied===0);
S(b,{t:'ops',ops:[[3101,0,0,null,null]]}); rb=await wait(b,'ops'); ok('B dengan akses boleh pecah', rb && rb.denied===0); await wait(a,'ops');
// 6. pintu utama & bedrock tidak bisa dihapus (bahkan pemilik)
S(a,{t:'ops',ops:[[2950,0,0,null,null],[5950,0,0,null,null]]}); ra=await wait(a,'ops'); ok('pintu utama & dasar dilindungi', ra && ra.denied===2);
// 7. meta rusak (sign tanpa text / lock pada block dirt) ditolak
S(a,{t:'ops',ops:[[2800,20,0,{sign:{text:123}},null],[2801,1,0,{lock:{type:'world',owner:'alice1',access:[],public:false}},null],[2802,99,0,null,null]]}); ra=await wait(a,'ops');
ok('meta rusak / block tak dikenal ditolak', ra && ra.denied===3);
// 8. sign valid diterima
S(a,{t:'ops',ops:[[2800,20,0,{sign:{text:'<img src=x onerror=alert(1)>'}},null]]}); ra=await wait(a,'ops'); ok('sign valid diterima', ra && ra.denied===0); await wait(b,'ops');
// 9. pohon valid / tidak valid
S(a,{t:'ops',ops:[[2803,8,0,null,{kind:1,t0:Date.now()}],[2804,8,0,null,{kind:999,t0:1}]]}); ra=await wait(a,'ops'); ok('pohon valid diterima, kind palsu ditolak', ra && ra.denied===1); await wait(b,'ops');
// 10. worn dibersihkan
S(a,{t:'pos',s:{x:1,y:2,worn:{hat:'h_cowboy',evil:{a:1},wings:{x:1}}}}); const pb=await wait(b,'pos'); ok('worn dibersihkan', pb && JSON.stringify(pb.s.worn)==='{"hat":"h_cowboy"}', JSON.stringify(pb&&pb.s.worn));
// 11. world tanpa WL: small lock milik B, A tak bisa pecah
const c=await open(); S(c,{t:'login',user:'bob1',pass:'secret12'}); ok('login B kedua',(await wait(c,'auth')).ok); ok('koneksi B lama di-kick', !!(await wait(b,'kicked')));
const w2={fg:fgArr.map((v,i)=>i===2900?0:v),bgw:Array(N).fill(0),trees:[],meta:[],spawn:{x:50,y:29}};
S(c,{t:'join',name:'FREE'}); await wait(c,'needWorld'); S(c,{t:'create',name:'FREE',world:w2}); await wait(c,'world');
S(c,{t:'ops',ops:[[2910,31,0,{lock:{type:'small',owner:'bob1',access:[],public:false,ignoreAir:false,tiles:[3010,3011,3009]}},null]]}); let rc=await wait(c,'ops'); ok('B pasang small lock', rc && rc.denied===0);
S(a,{t:'join',name:'FREE'}); await wait(a,'world'); await wait(c,'pjoin');
S(a,{t:'ops',ops:[[3010,0,0,null,null],[3200,0,0,null,null]]}); ra=await wait(a,'ops'); ok('A: tile ter-lock ditolak, tile bebas boleh', ra && ra.denied===1 && ra.ops[1][1]===0);
S(a,{t:'ops',ops:[[2930,30,0,{lock:{type:'world',owner:'alice1',access:[],public:false,ignoreAir:false,tiles:null}},null]]}); ra=await wait(a,'ops'); ok('A pasang WL di world yang ada lock B ditolak', ra && ra.denied===1);
// 12. brute force login
const d=await open(); let blocked=false;
for(let i=0;i<7;i++){ S(d,{t:'login',user:'alice1',pass:'wrong'+i}); const x=await wait(d,'auth'); if(x && /Terlalu banyak/.test(x.err)) blocked=true; }
ok('brute force diblokir setelah 5 gagal', blocked);
S(d,{t:'login',user:'alice1',pass:'secret12'}); const x=await wait(d,'auth'); ok('password benar pun ditahan selama blokir', x && !x.ok);
// 13. server tetap responsif saat banyak login (async scrypt)
const t0=Date.now(); const e=await open(); S(e,{t:'hello'}); const hi=await wait(e,'hi'); ok('hello dijawab cepat', hi && Date.now()-t0<500, (Date.now()-t0)+'ms');
console.log(`\n${pass} lulus, ${fail} gagal`); process.exit(fail?1:0);
