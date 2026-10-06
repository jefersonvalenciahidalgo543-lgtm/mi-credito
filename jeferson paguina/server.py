import http.server, socketserver, sqlite3, json, os, secrets, hashlib, hmac, urllib.parse, mimetypes
from http import cookies
from datetime import datetime

ROOT=os.path.dirname(os.path.abspath(__file__))
DB=os.path.join(ROOT,'mi_credito.db')
PORT=int(os.environ.get('PORT','8080'))
SESSIONS={}

def now(): return datetime.utcnow().isoformat(timespec='seconds')+'Z'
def conn():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; return c

def init_db():
    c=conn(); c.executescript('''
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,username TEXT UNIQUE NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS states(user_id TEXT PRIMARY KEY,clients_json TEXT NOT NULL DEFAULT '[]',meta_json TEXT NOT NULL DEFAULT '{}',FOREIGN KEY(user_id) REFERENCES users(id));
    ''')
    row=c.execute("SELECT id FROM users WHERE username='jeferson'").fetchone()
    salt=secrets.token_bytes(16); dk=hashlib.pbkdf2_hmac('sha256',b'admin123',salt,240000); ph=f'pbkdf2_sha256$240000${salt.hex()}${dk.hex()}'
    if not row:
        c.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?)',('admin-jeferson','Jeferson','jeferson','admin','active',ph,now()))
    else:
        c.execute("UPDATE users SET name='Jeferson', role='admin', status='active', password_hash=? WHERE username='jeferson'",(ph,))
    c.commit(); c.close()

def hash_pw(p):
    salt=secrets.token_bytes(16); dk=hashlib.pbkdf2_hmac('sha256',p.encode(),salt,240000); return f'pbkdf2_sha256$240000${salt.hex()}${dk.hex()}'
def check_pw(p,ph):
    try:
        _,it,s,d=ph.split('$'); got=hashlib.pbkdf2_hmac('sha256',p.encode(),bytes.fromhex(s),int(it)).hex(); return hmac.compare_digest(got,d)
    except: return False

def user_dict(r): return {'id':r['id'],'name':r['name'],'username':r['username'],'role':r['role'],'status':r['status'],'createdAt':r['created_at'],'membershipDays':30}
def get_user(uid):
    c=conn(); r=c.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone(); c.close(); return r

def state_for(uid):
    c=conn(); r=c.execute('SELECT clients_json,meta_json FROM states WHERE user_id=?',(uid,)).fetchone(); c.close()
    if not r: return {'clientes':[],'meta':{'portfolios':['yeison'],'activePortfolio':'yeison','expenses':[],'incomes':[],'liquidaciones':[]}}
    try: clients=json.loads(r['clients_json'])
    except: clients=[]
    try: meta=json.loads(r['meta_json'])
    except: meta={}
    return {'clientes':clients,'meta':meta}

def save_state(uid,data):
    clients=data.get('clientes',[]); meta=data.get('meta',{})
    if not isinstance(clients,list): clients=[]
    if not isinstance(meta,dict): meta={}
    meta.setdefault('portfolios',['yeison']); meta.setdefault('activePortfolio',meta['portfolios'][0] if meta['portfolios'] else 'yeison')
    c=conn(); c.execute('INSERT INTO states(user_id,clients_json,meta_json) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET clients_json=excluded.clients_json,meta_json=excluded.meta_json',(uid,json.dumps(clients,ensure_ascii=False),json.dumps(meta,ensure_ascii=False))); c.commit(); c.close()

def session_user(handler):
    raw=handler.headers.get('Cookie',''); jar=cookies.SimpleCookie(); jar.load(raw); tok=jar['mc_session'].value if 'mc_session' in jar else None
    s=SESSIONS.get(tok); 
    if not s: return None,None
    admin=get_user(s['admin_id']); target=get_user(s['target_id']) if s.get('target_id') else admin
    if not admin or not target: return None,None
    return admin,target

def send(handler,code,obj=None,headers=None):
    body=b'' if obj is None else json.dumps(obj,ensure_ascii=False).encode(); handler.send_response(code); handler.send_header('Content-Type','application/json; charset=utf-8'); handler.send_header('Content-Length',str(len(body))); handler.send_header('Cache-Control','no-store')
    for k,v in (headers or {}).items(): handler.send_header(k,v)
    handler.end_headers(); handler.wfile.write(body)
def read_json(handler):
    n=int(handler.headers.get('Content-Length','0') or 0); return json.loads(handler.rfile.read(n) or b'{}')

def cookie_header(tok): return f'mc_session={tok}; Path=/; HttpOnly; SameSite=Lax'
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def translate_path(self,path): return os.path.join(ROOT,urllib.parse.unquote(path.split('?',1)[0].lstrip('/'))) if not path.startswith('/api/') else ''
    def do_GET(self):
        if self.path.startswith('/api/'):
            self.api('GET'); return
        if self.path=='/' or self.path=='': self.path='/index.html'
        return super().do_GET()
    def do_POST(self): self.api('POST')
    def do_PUT(self): self.api('PUT')
    def api(self,method):
        p=urllib.parse.urlparse(self.path).path
        if method=='GET' and p=='/api/me':
            admin,target=session_user(self)
            if not target: return send(self,401,{'error':'No hay sesión'})
            return send(self,200,{'user':user_dict(target),'admin':user_dict(admin),'impersonating':admin['id']!=target['id'],'state':state_for(target['id'])})
        if method=='POST' and p=='/api/register':
            d=read_json(self); name=str(d.get('name','')).strip(); username=str(d.get('username','')).strip().lower(); pw=str(d.get('password',''))
            if not name or len(username)<3 or len(pw)<6: return send(self,400,{'error':'Datos de registro inválidos'})
            c=conn()
            if c.execute('SELECT 1 FROM users WHERE username=?',(username,)).fetchone(): c.close(); return send(self,409,{'error':'Ese usuario ya existe.'})
            uid=secrets.token_urlsafe(10); c.execute('INSERT INTO users VALUES(?,?,?,?,?,?,?)',(uid,name,username,'user','active',hash_pw(pw),now())); c.commit(); c.close(); save_state(uid,{'clientes':[],'meta':{'portfolios':['yeison'],'activePortfolio':'yeison','expenses':[],'incomes':[],'liquidaciones':[]}})
            tok=secrets.token_urlsafe(32); SESSIONS[tok]={'admin_id':uid,'target_id':uid}; return send(self,200,{'user':user_dict(get_user(uid))},{'Set-Cookie':cookie_header(tok)})
        if method=='POST' and p=='/api/login':
            d=read_json(self); username=str(d.get('username','')).strip().lower(); pw=str(d.get('password','')); c=conn(); r=c.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone(); c.close()
            if not r or not check_pw(pw,r['password_hash']) or (r['role']!=d.get('role') and not (r['username']=='jeferson' and r['role']=='admin')): return send(self,401,{'error':'Usuario o contraseña incorrectos.'})
            if r['status']=='blocked': return send(self,403,{'error':'Esta plataforma está bloqueada. Comunícate con el administrador.'})
            tok=secrets.token_urlsafe(32); SESSIONS[tok]={'admin_id':r['id'],'target_id':r['id']}; return send(self,200,{'user':user_dict(r)},{'Set-Cookie':cookie_header(tok)})
        if method=='POST' and p=='/api/logout':
            admin,target=session_user(self); raw=self.headers.get('Cookie',''); jar=cookies.SimpleCookie(); jar.load(raw); tok=jar['mc_session'].value if 'mc_session' in jar else None; SESSIONS.pop(tok,None); return send(self,200,{}, {'Set-Cookie':'mc_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'})
        admin,target=session_user(self)
        if p=='/api/state' and method=='GET':
            if not target: return send(self,401,{'error':'No hay sesión'})
            return send(self,200,{'user':user_dict(target),'state':state_for(target['id']),'impersonating':admin['id']!=target['id']})
        if p=='/api/state' and method=='PUT':
            if not target or target['status']=='blocked': return send(self,403,{'error':'Acceso denegado'})
            save_state(target['id'],read_json(self)); return send(self,200,{'ok':True})
        if p=='/api/admin/users' and method=='GET':
            if not admin or admin['role']!='admin': return send(self,403,{'error':'Acceso restringido'})
            c=conn(); rows=c.execute("SELECT * FROM users WHERE role='user' ORDER BY created_at DESC").fetchall(); c.close(); out=[]
            for r in rows:
                st=state_for(r['id']); saldo=sum(max(float(x.get('total',0))-float(x.get('pagado',0)),0) for x in st['clientes']); out.append({**user_dict(r),'clientesCount':len(st['clientes']),'saldo':saldo})
            return send(self,200,{'users':out})
        if p.startswith('/api/admin/users/') and p.endswith('/toggle') and method=='POST':
            if not admin or admin['role']!='admin': return send(self,403,{'error':'Acceso restringido'})
            uid=p.split('/')[4]; c=conn(); r=c.execute("SELECT * FROM users WHERE id=? AND role='user'",(uid,)).fetchone();
            if not r: c.close(); return send(self,404,{'error':'Usuario no encontrado'})
            ns='blocked' if r['status']!='blocked' else 'active'; c.execute('UPDATE users SET status=? WHERE id=?',(ns,uid)); c.commit(); c.close(); return send(self,200,{'status':ns})
        if p.startswith('/api/admin/impersonate/') and method=='POST':
            if not admin or admin['role']!='admin': return send(self,403,{'error':'Acceso restringido'})
            uid=p.rsplit('/',1)[-1]; r=get_user(uid)
            if not r or r['role']!='user' or r['status']=='blocked': return send(self,403,{'error':'La cuenta está bloqueada o no existe.'})
            raw=self.headers.get('Cookie',''); jar=cookies.SimpleCookie(); jar.load(raw); tok=jar['mc_session'].value if 'mc_session' in jar else secrets.token_urlsafe(32); SESSIONS[tok]={'admin_id':admin['id'],'target_id':uid}; return send(self,200,{'user':user_dict(r)},{'Set-Cookie':cookie_header(tok)})
        if p=='/api/admin/return' and method=='POST':
            if not admin or admin['role']!='admin': return send(self,403,{'error':'Acceso restringido'})
            raw=self.headers.get('Cookie',''); jar=cookies.SimpleCookie(); jar.load(raw); tok=jar['mc_session'].value if 'mc_session' in jar else secrets.token_urlsafe(32); SESSIONS[tok]={'admin_id':admin['id'],'target_id':admin['id']}; return send(self,200,{'user':user_dict(admin)},{'Set-Cookie':cookie_header(tok)})
        return send(self,404,{'error':'Ruta no encontrada'})

if __name__=='__main__':
    init_db(); os.chdir(ROOT)
    class Reuse(socketserver.ThreadingTCPServer): allow_reuse_address=True
    with Reuse(('0.0.0.0',PORT),Handler) as httpd:
        print(f'Mi Crédito V3 activo en http://localhost:{PORT}')
        print(f'En la red local: http://<IP-DE-ESTE-PC>:{PORT}')
        httpd.serve_forever()
