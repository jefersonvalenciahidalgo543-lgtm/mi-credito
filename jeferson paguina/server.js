const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, 'data.json');
const sessions = new Map();

function loadDB(){
  if(!fs.existsSync(DB_FILE)){
    const admin = {id:'admin-jeferson',name:'Jeferson',username:'jeferson',role:'admin',status:'active',createdAt:new Date().toISOString(),passwordHash:hashPassword('admin123')};
    const db={users:[admin],data:{}}; fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2)); return db;
  }
  try { return JSON.parse(fs.readFileSync(DB_FILE,'utf8')); } catch { return {users:[],data:{}}; }
}
let db=loadDB();
function persist(){fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2));}
function hashPassword(p){const salt='mi-credito-v2'; return crypto.scryptSync(p,salt,64).toString('hex');}
function verifyPassword(p,h){return crypto.timingSafeEqual(Buffer.from(hashPassword(p),'hex'),Buffer.from(h,'hex'));}
function json(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'same-origin'});res.end(body);}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});});}
function token(){return crypto.randomBytes(32).toString('hex');}
function auth(req){const m=(req.headers.cookie||'').match(/mi_credito_session=([^;]+)/); if(!m)return null; const u=sessions.get(m[1]); if(!u)return null; return db.users.find(x=>x.id===u.userId)||null;}
function safeUser(u){const {passwordHash,...safe}=u; return safe;}
function requireAuth(req,res){const u=auth(req); if(!u){json(res,401,{error:'No autenticado'});return null} if(u.status==='blocked'){json(res,403,{error:'Esta plataforma está bloqueada.'});return null} return u;}
function accountData(id){if(!db.data[id])db.data[id]={clientes:[],meta:{portfolios:['yeison'],activePortfolio:'yeison',expenses:[],incomes:[],liquidaciones:[]}};return db.data[id];}

async function route(req,res){
  const u=new URL(req.url,'http://localhost'); const p=u.pathname;
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'same-origin','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT'});return res.end();}
  try{
    if(p==='/api/register'&&req.method==='POST'){
      const b=await body(req); const name=String(b.name||'').trim(); const username=String(b.username||'').trim().toLowerCase(); const pass=String(b.password||'');
      if(name.length<1||username.length<3||pass.length<6)return json(res,400,{error:'Datos de registro inválidos.'});
      if(db.users.some(x=>x.username===username))return json(res,409,{error:'Ese usuario ya existe.'});
      const id=crypto.randomUUID(); const user={id,name,username,role:'user',status:'active',createdAt:new Date().toISOString(),platformStartedAt:new Date().toISOString(),passwordHash:hashPassword(pass)}; db.users.push(user); accountData(id); persist();
      const t=token();sessions.set(t,{userId:id});res.setHeader('Set-Cookie',`mi_credito_session=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`); return json(res,200,{user:safeUser(user),data:accountData(id)});
    }
    if(p==='/api/login'&&req.method==='POST'){
      const b=await body(req); const username=String(b.username||'').trim().toLowerCase(); const pass=String(b.password||''); const user=db.users.find(x=>x.username===username);
      if(!user||!verifyPassword(pass,user.passwordHash)||user.role!==b.role)return json(res,401,{error:'Usuario o contraseña incorrectos.'});
      if(user.status==='blocked')return json(res,403,{error:'Esta plataforma está bloqueada. Comunícate con el administrador.'});
      const t=token();sessions.set(t,{userId:user.id});res.setHeader('Set-Cookie',`mi_credito_session=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`); return json(res,200,{user:safeUser(user),data:user.role==='user'?accountData(user.id):null});
    }
    if(p==='/api/logout'&&req.method==='POST'){const m=(req.headers.cookie||'').match(/mi_credito_session=([^;]+)/);if(m)sessions.delete(m[1]);res.setHeader('Set-Cookie','mi_credito_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true});}
    if(p==='/api/me'&&req.method==='GET'){const user=auth(req);if(!user)return json(res,401,{error:'No autenticado'});return json(res,200,{user:safeUser(user),data:user.role==='user'?accountData(user.id):null});}
    if(p==='/api/users'&&req.method==='GET'){
      const a=requireAuth(req,res); if(!a)return; if(a.role!=='admin')return json(res,403,{error:'Acceso restringido.'});
      const users=db.users.filter(x=>x.role==='user').map(x=>{const d=accountData(x.id);const saldo=d.clientes.reduce((s,c)=>s+Math.max(Number(c.total||0)-Number(c.pagado||0),0),0);return {...safeUser(x),clientesCount:d.clientes.length,saldo};});return json(res,200,{users});
    }
    const dm=p.match(/^\/api\/users\/([^/]+)\/data$/);
    if(dm&&(req.method==='GET'||req.method==='PUT')){
      const a=requireAuth(req,res);if(!a)return;const id=dm[1];const target=db.users.find(x=>x.id===id&&x.role==='user');if(!target)return json(res,404,{error:'Usuario no encontrado.'});if(a.role!=='admin'&&a.id!==id)return json(res,403,{error:'Acceso restringido.'});
      if(req.method==='GET')return json(res,200,{data:accountData(id)});const b=await body(req);db.data[id]={clientes:Array.isArray(b.clientes)?b.clientes:[],meta:b.meta||accountData(id).meta};persist();return json(res,200,{ok:true,data:db.data[id]});
    }
    const bm=p.match(/^\/api\/users\/([^/]+)\/block$/);
    if(bm&&req.method==='POST'){const a=requireAuth(req,res);if(!a)return;if(a.role!=='admin')return json(res,403,{error:'Acceso restringido.'});const target=db.users.find(x=>x.id===bm[1]&&x.role==='user');if(!target)return json(res,404,{error:'Usuario no encontrado.'});target.status=target.status==='blocked'?'active':'blocked';persist();return json(res,200,{user:safeUser(target)});}
    if(p==='/api/admin/me'&&req.method==='GET'){const a=requireAuth(req,res);if(!a||a.role!=='admin')return json(res,403,{error:'Acceso restringido.'});return json(res,200,{user:safeUser(a)});}
    if(p.startsWith('/api/'))return json(res,404,{error:'Ruta no encontrada'});

    let file=p==='/'?'/index.html':p; file=path.normalize(file).replace(/^([.][.][\\/])+/, ''); const fp=path.join(ROOT,file); if(!fp.startsWith(ROOT))return json(res,403,{error:'Forbidden'});
    if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory())return json(res,404,{error:'No encontrado'});
    const ext=path.extname(fp);const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});fs.createReadStream(fp).pipe(res);
  }catch(e){console.error(e);json(res,500,{error:'Error interno del servidor.'});}
}
http.createServer(route).listen(PORT,()=>console.log(`Mi Crédito funcionando en http://localhost:${PORT}`));
