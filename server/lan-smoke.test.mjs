import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
const url='ws://127.0.0.1:8098';
function client() { return new Promise((resolve,reject)=>{const ws=new WebSocket(url); ws.on('error',reject); ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')resolve({ws,id:m.id});});}); }
function until(ws,predicate) {return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',handler);reject(new Error('snapshot timeout'));},4000); const handler=raw=>{const m=JSON.parse(raw);if(predicate(m)){clearTimeout(timer);ws.off('message',handler);resolve(m);}};ws.on('message',handler);});}
const a=await client(),b=await client();
try {
 assert.notEqual(a.id,b.id);
 a.ws.send('{bad');
 a.ws.send(JSON.stringify({type:'state',x:2,y:0,z:5,yaw:1,action:'Run',shot:2}));
 b.ws.send(JSON.stringify({type:'state',x:3,y:0,z:6,yaw:0,action:'Reload',shot:0}));
 const m=await until(b.ws,m=>m.type==='state'&&m.players.length===2);
 assert.equal(m.players.find(p=>p.id===a.id).action,'Run');
 assert.equal(m.players.find(p=>p.id===a.id).shot,2);
 assert(!JSON.stringify(m).includes('"ws"'));
 a.ws.close(); await until(b.ws,m=>m.type==='state'&&m.players.length===1);
 const page=await fetch('http://127.0.0.1:8098/'); assert.equal(page.status,200);
 const range=await fetch('http://127.0.0.1:8098/religious_center_L2_P/meta.lcc2',{headers:{Range:'bytes=0-63'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,64);
 assert.equal((await fetch('http://127.0.0.1:8098/.git/config')).status,403);
 console.log('PASS: two clients, identity, transforms/actions/shots, malformed input, disconnect, HTTP, scene range, private path blocked');
} finally {a.ws.close();b.ws.close();}
