const ACCOUNTS_KEY = "mi_credito_cuentas_v1";
const SESSION_KEY = "mi_credito_sesion_v1";
const legacyKey = "clientes_creditos_v2";
let currentUser = null, KEY = "", clientes = [], clienteActivo = null, clienteEditando = null, authMode = null;
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(n) || 0);
const esc = t => String(t ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) };
const formatDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatLongDate = (date = new Date()) => date.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const getAccounts = () => JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
const setAccounts = a => localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a));
const normalizeUser = u => u.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
const metaKey = () => KEY + "_meta";
function getMeta() { const raw = localStorage.getItem(metaKey()); let m; try { m = JSON.parse(raw) || {} } catch { m = {} }; m.portfolios = Array.isArray(m.portfolios) && m.portfolios.length ? m.portfolios : ["yeison"]; m.activePortfolio = m.activePortfolio && m.portfolios.includes(m.activePortfolio) ? m.activePortfolio : m.portfolios[0]; m.expenses = Array.isArray(m.expenses) ? m.expenses : []; m.incomes = Array.isArray(m.incomes) ? m.incomes : []; m.liquidaciones = Array.isArray(m.liquidaciones) ? m.liquidaciones : []; return m }
function saveMeta(m) { localStorage.setItem(metaKey(), JSON.stringify(m)) }
function save() { if (currentUser) localStorage.setItem(KEY, JSON.stringify(clientes)); }
function getActivePortfolio() { return getMeta().activePortfolio }
async function hashPassword(value) { if (window.crypto?.subtle) { const data = new TextEncoder().encode(value), buf = await crypto.subtle.digest("SHA-256", data); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("") } return btoa(unescape(encodeURIComponent(value))) }
function setAuthMessage(msg, ok = false) { const el = $("authMessage"); if (el) { el.textContent = msg; el.style.color = ok ? "#159567" : "#b5222b" } }
function elegirAcceso(role) { authMode = role; $('authChoices').style.display = 'none'; $('registerForm').style.display = 'none'; $('loginForm').style.display = 'grid'; $('loginModeBadge').textContent = role === 'admin' ? '🛡️ Acceso de administrador' : '👤 Acceso de usuario'; $('authSubtitle').textContent = role === 'admin' ? 'Solo el administrador puede gestionar las cuentas registradas.' : 'Inicia sesión en tu propia plataforma.'; $('registerLink').style.display = role === 'admin' ? 'none' : 'block'; $('loginUser').focus(); setAuthMessage('') }
function volverEleccionAcceso() { authMode = null; $('authChoices').style.display = 'grid'; $('loginForm').style.display = 'none'; $('registerForm').style.display = 'none'; $('authSubtitle').textContent = 'Elige cómo quieres ingresar.'; setAuthMessage('') }
function mostrarRegistro() { if (authMode !== 'user') return; $('loginForm').style.display = 'none'; $('registerForm').style.display = 'grid'; $('authSubtitle').textContent = 'Crea tu cuenta personal para guardar tu cartera.'; setAuthMessage('') }
function mostrarLogin() { $('registerForm').style.display = 'none'; $('loginForm').style.display = 'grid'; $('authSubtitle').textContent = authMode === 'admin' ? 'Solo el administrador puede gestionar las cuentas registradas.' : 'Inicia sesión en tu propia plataforma.'; setAuthMessage('') }
function accountKey(user) { return `clientes_creditos_${user.id}` }
function cargarCuenta(user) {
  currentUser = user; KEY = accountKey(user); clientes = JSON.parse(localStorage.getItem(KEY) || "[]"); if (!clientes.length && localStorage.getItem(legacyKey) && getAccounts().length === 1) { try { clientes = JSON.parse(localStorage.getItem(legacyKey)) || []; clientes.forEach(c => { c.cartera = c.cartera || "yeison"; c.historial = c.historial || [] }); save(); localStorage.removeItem(legacyKey) } catch { } }
  const m = getMeta(); if (!m.portfolios.includes("yeison")) m.portfolios.unshift("yeison"); saveMeta(m); document.body.classList.add("authenticated"); $('authScreen').style.display = 'none'; $('adminDashboard').style.display = 'none'; document.querySelector('.app').style.display = 'block'; actualizarUsuarioUI(); actualizarCarteraUI(); render(); preview(); actualizarInicio();
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); $('returnAdminBtn').style.display = session?.impersonatedBy ? 'block' : 'none';
}
function actualizarUsuarioUI() { const badge = document.querySelector('.admin-badge'), name = document.querySelector('.admin-user'), adminBtn = $('adminMenuBtn'); if (badge) badge.textContent = currentUser?.role === 'admin' ? 'Administrador' : 'Usuario'; if (name) name.textContent = currentUser?.name || currentUser?.username || ''; if (adminBtn) adminBtn.style.display = currentUser?.role === 'admin' ? 'block' : 'none'; const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); if ($('returnAdminBtn')) $('returnAdminBtn').style.display = session?.impersonatedBy ? 'block' : 'none'; document.body.classList.toggle('is-admin', currentUser?.role === 'admin'); }
function actualizarCarteraUI() { const m = getMeta(); const btn = document.querySelector('.portfolio-select b'); if (btn) btn.textContent = m.activePortfolio; const tile = document.querySelector('.home-grid .home-tile b'); if (tile) tile.textContent = m.activePortfolio }
function iniciarSesion() { const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); if (!session) return false; const user = getAccounts().find(a => a.id === session.userId); if (!user) { localStorage.removeItem(SESSION_KEY); return false } if (user.role === 'admin') { mostrarAdminDashboard(); } else if (user.status !== 'blocked') cargarCuenta(user); else { localStorage.removeItem(SESSION_KEY); return false } return true }
async function handleLogin(e) { e.preventDefault(); const username = normalizeUser($('loginUser').value), pass = $('loginPass').value, account = getAccounts().find(a => a.username === username); if (!account || account.role !== authMode) return setAuthMessage("Usuario o contraseña incorrectos."); if (await hashPassword(pass) !== account.passwordHash) return setAuthMessage("Usuario o contraseña incorrectos."); if (account.status === 'blocked') return setAuthMessage("Esta plataforma está bloqueada. Comunícate con el administrador."); localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: account.id })); $('loginForm').reset(); if (account.role === 'admin') mostrarAdminDashboard(); else cargarCuenta(account) }
async function handleRegister(e) { e.preventDefault(); const name = $('registerName').value.trim(), username = normalizeUser($('registerUser').value), pass = $('registerPass').value, pass2 = $('registerPass2').value; if (!name || username.length < 3) return setAuthMessage("Escribe un nombre y un usuario válido."); if (pass.length < 6) return setAuthMessage("La contraseña debe tener mínimo 6 caracteres."); if (pass !== pass2) return setAuthMessage("Las contraseñas no coinciden."); const accounts = getAccounts(); if (accounts.some(a => a.username === username)) return setAuthMessage("Ese usuario ya existe."); const account = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name, username, role:'user', status:'active', createdAt: new Date().toISOString() }; account.passwordHash = await hashPassword(pass); accounts.push(account); setAccounts(accounts); localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: account.id })); $('registerForm').reset(); cargarCuenta(account); }
function mostrarAdminDashboard() { const admin = getAccounts().find(a => a.id === JSON.parse(localStorage.getItem(SESSION_KEY)||'{}').userId && a.role === 'admin'); if (!admin) return; currentUser = admin; KEY = accountKey(admin); clientes = []; document.body.classList.add('authenticated'); $('authScreen').style.display='none'; document.querySelector('.app').style.display='none'; $('adminDashboard').style.display='block'; renderAdminDashboard(); }
function cerrarSesion() { if (!confirm("¿Quieres cerrar sesión?")) return; localStorage.removeItem(SESSION_KEY); currentUser = null; KEY = ""; clientes = []; document.body.classList.remove("authenticated", "showing-clients"); hide("menuModal"); $('adminDashboard').style.display='none'; document.querySelector('.app').style.display='none'; $('authScreen').style.display='flex'; volverEleccionAcceso(); }
function volverAdmin() { const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); if (!session?.impersonatedBy) return; const admin = getAccounts().find(a => a.id === session.impersonatedBy && a.role === 'admin'); if (!admin) return cerrarSesion(); localStorage.setItem(SESSION_KEY, JSON.stringify({userId:admin.id})); currentUser=admin; KEY=accountKey(admin); clientes=[]; document.querySelector('.app').style.display='none'; $('adminDashboard').style.display='block'; renderAdminDashboard(); }
function calc(prestamo, interes, cuotas) { const interesValor = prestamo * interes / 100, total = prestamo + interesValor; return { interesValor, total, cuota: cuotas ? total / cuotas : 0 } }
function addPeriod(date, frequency, n) { const d = new Date(date + "T12:00:00"); if (frequency === "Diario") d.setDate(d.getDate() + n); else if (frequency === "Semanal") d.setDate(d.getDate() + n * 7); else if (frequency === "Quincenal") d.setDate(d.getDate() + n * 15); else d.setMonth(d.getMonth() + n); return d }
function daysLeft(date) { return Math.ceil((new Date(date + "T23:59:59") - new Date()) / 86400000) }
function daysText(date) { const diff = daysLeft(date); if (diff < 0) return `Venció hace ${Math.abs(diff)} días`; if (diff === 0) return "Vence hoy"; if (diff === 1) return "Vence mañana"; return `Vence en ${diff} días` }
function paymentCount(c) { return Math.min(c.cuotas, Math.floor((Number(c.pagado || 0) + 0.0001) / (Number(c.cuota) || 1))) }
function preview() { const r = calc(+$('prestamo').value || 0, +$('interes').value || 0, +$('cuotas').value || 0); $('previewTotal').textContent = money(r.total); $('previewCuota').textContent = money(r.cuota) }
["prestamo", "interes", "cuotas"].forEach(id => $(id)?.addEventListener("input", preview));
$('fechaInicio').value = todayISO(); $('cuotas').value = 24; $('frecuencia').value = 'Diario';
$('clienteForm').addEventListener('submit', e => { e.preventDefault(); const nombre = $('nombre').value.trim(), telefono = $('telefono').value.replace(/\D/g, ""), direccion = $('direccion').value.trim(), prestamo = +$('prestamo').value, interes = +$('interes').value, cuotas = +$('cuotas').value, frecuencia = $('frecuencia').value, fechaInicio = $('fechaInicio').value || todayISO(); if (!nombre || telefono.length < 7 || prestamo <= 0 || interes < 0 || cuotas < 1) return alert("Completa correctamente los datos del cliente."); const r = calc(prestamo, interes, cuotas), vencimiento = addPeriod(fechaInicio, frecuencia, cuotas).toISOString().slice(0, 10); const c = { id: Date.now(), numero: clientes.length ? Math.max(...clientes.map(c => c.numero || 0)) + 1 : 1, nombre, telefono, direccion, prestamo, interes, cuotas, frecuencia, fechaInicio, vencimiento, total: r.total, cuota: r.cuota, pagado: 0, cartera: getActivePortfolio(), historial: [{ tipo: 'prestamo', fecha: new Date().toISOString(), valor: prestamo }] }; clientes.push(c); save(); e.target.reset(); $('fechaInicio').value = todayISO(); $('cuotas').value = 24; $('frecuencia').value = 'Diario'; preview(); cerrarFormulario(); render(); actualizarInicio(); });
function render() { const f = $('buscar').value.toLowerCase().trim(), cartera = getActivePortfolio(); const lista = clientes.filter(c => (c.cartera || 'yeison') === cartera).filter(c => `${c.nombre} ${c.telefono} ${c.direccion}`.toLowerCase().includes(f)); $('clientes').innerHTML = lista.map(cardList).join(''); $('sinClientes').style.display = lista.length ? 'none' : 'block'; actualizarInicio() }
function pagoHoy(c) { const hoy = todayISO(); return (c.historial || []).some(h => h.tipo === 'abono' && String(h.fecha).slice(0,10) === hoy && Number(h.valor || 0) > 0); }
function cardList(c) { const saldo = Math.max(c.total - c.pagado, 0), terminado = saldo <= 0, pagadoHoy = pagoHoy(c); return `<article class="client-row ${terminado ? 'completed' : ''}" onclick="abrirCliente(${c.id})"><div class="client-name">${c.numero || ''}) ${esc(c.nombre)}</div><div class="client-check ${pagadoHoy ? 'paid-today' : ''}">${pagadoHoy ? '✓' : '○'}</div>${terminado ? `<div class="client-pill">Crédito terminado · ${money(c.total)}</div><div class="client-due renewal-hint">Toca para renovar</div>` : `<div class="client-main">Credito ${money(c.prestamo)} Saldo ${money(saldo)}</div><div class="client-due">${daysText(c.vencimiento)}</div>`}<div class="client-address">${esc(c.direccion || '')}</div></article>` }
$('buscar').addEventListener('input', render); $('menuBtn').onclick = () => abrirMenu();
function abrirFormulario() { $('nuevoModal').classList.add('show'); $('nombre').focus() } function cerrarFormulario() { $('nuevoModal').classList.remove('show') }
function abrirCliente(id) { clienteActivo = id; const c = clientes.find(x => x.id === id); if (!c) return; renderCliente(c); show('clienteModal') }
function terminadoText(c) { const saldo = Math.max(c.total - c.pagado, 0); if (saldo <= 0) return "🟢 Crédito terminado · listo para renovar"; const d = daysLeft(c.vencimiento); return d < 0 ? `🔴 Venció hace ${Math.abs(d)} días` : `🟢 ${d} días para pagar` }
function renderCliente(c) { const saldo = Math.max(c.total - c.pagado, 0), pagadas = paymentCount(c), terminado = saldo <= 0; $('clienteCard').innerHTML = `<div class="card-head"><h2>${c.numero || ''}) ${esc(c.nombre)}</h2><div class="card-icons"><span title="Llamar" onclick="llamar(event,${c.id})">☎</span><span title="Ubicación" onclick="ubicacion(event,${c.id})">●</span><span title="WhatsApp" onclick="whatsapp(event,${c.id})">▣</span></div></div><div class="card-body"><div class="card-top"><div class="quick-pay"><span>$</span><input class="amount-input" id="montoAbono" type="number" min="1" max="${Math.max(saldo, 1)}" value="${Math.min(Math.round(c.cuota), Math.max(saldo, 1))}" ${terminado ? 'disabled' : ''}></div><div class="card-buttons">${terminado ? `<button class="renew-btn" onclick="renovarCliente(event,${c.id})">Renovar</button>` : `<button class="green-btn" onclick="abrirPagoDesdeCard(event,${c.id})">Abonar</button><button class="red-btn" onclick="noPagoDesdeCard(event,${c.id})">No pago</button>`}</div></div><div class="info-grid"><div class="info-item"><span class="info-icon">$</span><span>Credito<small>${money(c.prestamo)}</small></span></div><div class="info-item"><span class="info-icon">$</span><span>Saldo<small>${money(saldo)}</small></span></div><div class="info-item"><span class="info-icon">◐</span><span>Interés<small>${c.interes}%</small></span></div><div class="info-item"><span class="info-icon">◆</span><span>${c.frecuencia} <small>${money(c.cuota)}</small></span></div><div class="info-item"><span class="info-icon">☑</span><span>Inicio<small>${formatDate(c.fechaInicio)}</small></span></div><div class="info-item"><span class="info-icon">☒</span><span>Vence<small>${formatDate(c.vencimiento)}</small></span></div><div class="info-item"><span class="info-icon">✓</span><span>Pagos<small>${pagadas}/${c.cuotas} · ${money(c.pagado)}</small></span></div><div class="info-item"><span class="info-icon">▣</span><span>Cartera<small>${esc(c.cartera || 'yeison')}</small></span></div></div><div class="due-status"><span class="dot ${saldo <= 0 ? 'done' : ''}"></span>${terminadoText(c)}</div>${c.telefono ? `<div class="phone-line">📱 ${esc(c.telefono)}</div>` : ''}<div class="card-actions"><button onclick="abrirHistorial(event,${c.id})">Historial</button><button onclick="editarCliente(event,${c.id})">Editar</button><button onclick="moverCliente(event,${c.id})">Mover</button><button class="round-menu" onclick="accionesCliente(event,${c.id})">⋮</button></div></div>` }
function abrirPagoDesdeCard(e, id) { e.stopPropagation(); clienteActivo = id; const c = clientes.find(x => x.id === id); if (!c || c.total - c.pagado <= 0) return; const input = $('valorPago'); input.value = Math.min(Math.round(c.cuota), Math.max(c.total - c.pagado, 1)); $('clientePago').textContent = `${c.nombre} · saldo ${money(c.total - c.pagado)}`; show('pagoModal'); setTimeout(() => input.focus(), 50) }
function noPagoDesdeCard(e, id) { e.stopPropagation(); registrarNoPagoDirecto(id); }
function cerrarPago() { hide('pagoModal') }
function registrarPago() { const c = clientes.find(x => x.id === clienteActivo), v = +$('valorPago').value; if (!c || v <= 0) return; if (v > c.total - c.pagado) return alert(`El abono no puede superar el saldo de ${money(c.total - c.pagado)}.`); c.pagado = Number(c.pagado || 0) + v; c.historial = c.historial || []; c.historial.push({ tipo: 'abono', fecha: new Date().toISOString(), valor: v }); save(); cerrarPago(); render(); renderCliente(c); window.ultimoAbono = v; mostrarExito(c, v) }
function registrarNoPagoDirecto(id) { const c = clientes.find(x => x.id === id); if (!c) return; c.historial = c.historial || []; c.historial.push({ tipo: 'no_pago', fecha: new Date().toISOString(), valor: 0 }); save(); render(); renderCliente(c); alert(`No pago registrado para ${c.nombre}.`) }
function construirMensajeAbono(c, v) { const saldo = Math.max(c.total - c.pagado, 0), pagadas = paymentCount(c); return `Abono Exitoso ✅\n\nHas abonado: ${money(v)}\nNombre: ${c.nombre}\nCredito: ${money(c.prestamo)}\nSaldo restante: ${money(saldo)}\nValor cuota: ${money(c.cuota)}\nCuotas Pagas: ${pagadas} / ${c.cuotas}\n${formatLongDate()}` }
function mostrarExito(c, v) { const saldo = Math.max(c.total - c.pagado, 0), pagadas = paymentCount(c); $('historialContenido').innerHTML = `<div class="success-receipt"><div class="success-title">Abono Exitoso <span>✓</span></div><div class="receipt-row"><strong>Has abonado</strong><span>${money(v)}</span></div><div class="receipt-row"><strong>Nombre</strong><span>${esc(c.nombre).slice(0, 22)}${c.nombre.length > 22 ? '...' : ''}</span></div><div class="receipt-row"><strong>Credito</strong><span>${money(c.prestamo)}</span></div><div class="receipt-row"><strong>Saldo restante</strong><span>${money(saldo)}</span></div><div class="receipt-row"><strong>Valor cuota</strong><span>${money(c.cuota)}</span></div><div class="receipt-row"><strong>Cuotas Pagas</strong><span>${pagadas} / ${c.cuotas}</span></div><div class="receipt-date">${formatLongDate()}</div><div class="receipt-actions"><button class="whatsapp-send" onclick="whatsappAbono(${c.id},${v})">💬 Enviar por WhatsApp</button><button class="copy-send" onclick="copiarMensajeAbono(${c.id},${v})">Copiar mensaje</button><button class="close-receipt" onclick="cerrarHistorial()">Cerrar</button></div></div>`; show('historialModal') }
function whatsappAbono(id, v) { const c = clientes.find(x => x.id === id); if (!c) return; let tel = c.telefono; if (tel.length === 10 && tel.startsWith('3')) tel = '57' + tel; window.open(`https://wa.me/${tel}?text=${encodeURIComponent(construirMensajeAbono(c, v))}`, '_blank') }
function copiarMensajeAbono(id, v) { const c = clientes.find(x => x.id === id); if (!c) return; navigator.clipboard?.writeText(construirMensajeAbono(c, v)).then(() => alert('Mensaje copiado.')).catch(() => alert('No se pudo copiar automáticamente.')) }
function whatsapp(e, id) { if (e) e.stopPropagation(); const c = clientes.find(x => x.id === id); if (!c) return; let tel = c.telefono; if (tel.length === 10 && tel.startsWith('3')) tel = '57' + tel; const msg = c.pagado > 0 ? construirMensajeAbono(c, c.historial?.filter(h => h.tipo === 'abono').at(-1)?.valor || 0) : `Hola ${c.nombre}. Tu saldo actual es ${money(Math.max(c.total - c.pagado, 0))}. Cuota: ${money(c.cuota)}.`; window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank') }
function llamar(e, id) { e.stopPropagation(); const c = clientes.find(x => x.id === id); location.href = `tel:${c.telefono}` }
function ubicacion(e, id) { e.stopPropagation(); const c = clientes.find(x => x.id === id); if (!c.direccion) return alert('Este cliente no tiene dirección registrada.'); window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.direccion)}`, '_blank') }
function cargarPuestosEdicion(c) { const carteraActual = c.cartera || 'yeison'; const maxPuesto = Math.max(clientes.filter(x => (x.cartera || 'yeison') === carteraActual).reduce((m, x) => Math.max(m, Number(x.numero) || 0), 0), Number(c.numero) || 0) + 1; const puestos = []; for (let i = 1; i <= maxPuesto; i++) puestos.push(i); $('editNumero').innerHTML = puestos.map(n => `<option value="${n}">Puesto ${n}${n === Number(c.numero) ? ' (actual)' : ''}</option>`).join(''); $('editNumero').value = String(c.numero || 1); }
function editarCliente(e, id) { e.stopPropagation(); const c = clientes.find(x => x.id === id); if (!c) return; clienteEditando = id; cargarPuestosEdicion(c); $('editNombre').value = c.nombre; $('editTelefono').value = c.telefono; $('editDireccion').value = c.direccion || ''; $('editPrestamo').value = c.prestamo; $('editInteres').value = c.interes; $('editCuotas').value = c.cuotas; $('editFrecuencia').value = c.frecuencia; $('editFechaInicio').value = c.fechaInicio; $('editSaldo').textContent = money(Math.max(c.total - c.pagado, 0)); hide('clienteModal'); show('editarModal') }
function cerrarEdicion() { hide('editarModal'); clienteEditando = null }
$('editarForm').addEventListener('submit', e => { e.preventDefault(); const c = clientes.find(x => x.id === clienteEditando); if (!c) return; const numero = +$('editNumero').value, nombre = $('editNombre').value.trim(), telefono = $('editTelefono').value.replace(/\D/g, ''), direccion = $('editDireccion').value.trim(), prestamo = +$('editPrestamo').value, interes = +$('editInteres').value, cuotas = +$('editCuotas').value, frecuencia = $('editFrecuencia').value, fechaInicio = $('editFechaInicio').value || todayISO(); if (!Number.isInteger(numero) || numero < 1 || !nombre || telefono.length < 7 || prestamo <= 0 || interes < 0 || cuotas < 1) return alert('Completa correctamente los datos del cliente.'); const carteraActual = c.cartera || 'yeison';
  const clienteEnDestino = clientes.find(x => x.id !== c.id && (x.cartera || 'yeison') === carteraActual && Number(x.numero) === numero);
  const numeroAnterior = Number(c.numero);

  // Si el número destino ya está ocupado, intercambiamos las posiciones.
  // Así, por ejemplo, 3 ↔ 5 mueve ambos clientes sin perder ningún dato.
  if (clienteEnDestino && numeroAnterior !== numero) {
    clienteEnDestino.numero = numeroAnterior;
  }

  const r = calc(prestamo, interes, cuotas); c.numero = numero; c.nombre = nombre; c.telefono = telefono; c.direccion = direccion; c.prestamo = prestamo; c.interes = interes; c.cuotas = cuotas; c.frecuencia = frecuencia; c.fechaInicio = fechaInicio; c.vencimiento = addPeriod(fechaInicio, frecuencia, cuotas).toISOString().slice(0, 10); c.total = r.total; c.cuota = r.cuota; c.pagado = Math.min(c.pagado, c.total); save(); cerrarEdicion(); render(); renderCliente(c); show('clienteModal') });
['editPrestamo', 'editInteres', 'editCuotas'].forEach(id => $(id).addEventListener('input', () => { const c = clientes.find(x => x.id === clienteEditando); if (c) $('editSaldo').textContent = money(Math.max(calc(+$('editPrestamo').value || 0, +$('editInteres').value || 0, +$('editCuotas').value || 0).total - c.pagado, 0)) }));
function renovarCliente(e, id) { e.stopPropagation(); const c = clientes.find(x => x.id === id); if (!c) return; if (Math.max(c.total - c.pagado, 0) > 0) return alert('Este crédito todavía tiene saldo pendiente.'); $('renovNombre').value = c.nombre; $('renovTelefono').value = c.telefono; $('renovDireccion').value = c.direccion || ''; $('renovPrestamo').value = c.prestamo; $('renovInteres').value = c.interes; $('renovCuotas').value = c.cuotas; $('renovFrecuencia').value = c.frecuencia; $('renovFecha').value = todayISO(); $('renovClienteId').value = id; hide('clienteModal'); show('renovarModal'); }
$('renovarForm').addEventListener('submit', e => { e.preventDefault(); const old = clientes.find(x => x.id === +$('renovClienteId').value); if (!old) return; const prestamo = +$('renovPrestamo').value, interes = +$('renovInteres').value, cuotas = +$('renovCuotas').value, frecuencia = $('renovFrecuencia').value, fecha = $('renovFecha').value || todayISO(); const r = calc(prestamo, interes, cuotas); const nuevo = { ...old, id: Date.now(), numero: clientes.length ? Math.max(...clientes.map(c => c.numero || 0)) + 1 : 1, prestamo, interes, cuotas, frecuencia, fechaInicio: fecha, vencimiento: addPeriod(fecha, frecuencia, cuotas).toISOString().slice(0, 10), total: r.total, cuota: r.cuota, pagado: 0, cartera: getActivePortfolio(), historial: [{ tipo: 'prestamo', fecha: new Date().toISOString(), valor: prestamo }, { tipo: 'renovacion', fecha: new Date().toISOString(), valor: prestamo, anteriorId: old.id }] }; clientes.push(nuevo); save(); hide('renovarModal'); render(); abrirCliente(nuevo.id) });
function accionesCliente(e, id) { e.stopPropagation(); const c = clientes.find(x => x.id === id); if (confirm(`¿Eliminar a ${c.nombre}?`)) { clientes = clientes.filter(x => x.id !== id); save(); hide('clienteModal'); render() } }
function moverCliente(e, id) { e.stopPropagation(); const c = clientes.find(x => x.id === id); if (!c) return; const m = getMeta(); $('moverClienteId').value = id; $('moverDestino').innerHTML = m.portfolios.map(p => `<option value="${esc(p)}" ${p === (c.cartera || 'yeison') ? 'selected' : ''}>${esc(p)}</option>`).join(''); hide('clienteModal'); show('moverModal') }
$('moverForm').addEventListener('submit', e => { e.preventDefault(); const c = clientes.find(x => x.id === +$('moverClienteId').value); if (!c) return; c.cartera = $('moverDestino').value; save(); hide('moverModal'); render(); abrirCliente(c.id) });
function abrirHistorial(e, id) { e.stopPropagation(); const c = clientes.find(x => x.id === id); if (!c) return; let html = `<h2>Historial de ${esc(c.nombre)}</h2><p class="sub">Movimientos del cliente</p>`; html += c.historial?.length ? c.historial.slice().reverse().map(h => `<div class="history-item"><span>${tipoNombre(h.tipo)}<small>${new Date(h.fecha).toLocaleString('es-CO')}</small></span><b>${h.valor ? money(h.valor) : '—'}</b></div>`).join('') : '<p>No hay movimientos registrados.</p>'; $('historialContenido').innerHTML = html; show('historialModal') }
function tipoNombre(t) { return t === 'abono' ? 'Cobro / Abono' : t === 'prestamo' ? 'Préstamo' : t === 'renovacion' ? 'Renovación' : t === 'gasto' ? 'Gasto' : 'No pago' }
function cerrarHistorial() { hide('historialModal') }
function currentWeekRange() { const now = new Date(), day = (now.getDay() + 6) % 7, start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(now.getDate() - day); const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999); return { start, end } }
function allMovements() { const m = getMeta(); const arr = []; clientes.forEach(c => (c.historial || []).forEach(h => arr.push({ ...h, nombre: c.nombre, cartera: c.cartera || 'yeison' }))); m.expenses.forEach(g => arr.push({ ...g, tipo: 'gasto', nombre: g.descripcion, cartera: g.cartera || m.activePortfolio })); return arr.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)) }
function weeklyStats() { const { start, end } = currentWeekRange(); const mov = allMovements().filter(x => { const d = new Date(x.fecha); return d >= start && d <= end }); return { mov, cobrado: mov.filter(x => x.tipo === 'abono').reduce((s, x) => s + Number(x.valor || 0), 0), prestado: mov.filter(x => x.tipo === 'prestamo' || x.tipo === 'renovacion').reduce((s, x) => s + Number(x.valor || 0), 0), gastos: mov.filter(x => x.tipo === 'gasto').reduce((s, x) => s + Number(x.valor || 0), 0) } }
function inicioSemana(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); const day = (x.getDay()+6)%7; x.setDate(x.getDate()-day); return x }
function fechaISODate(d) { return new Date(d).toISOString().slice(0,10) }
function diasSemana() { const start = inicioSemana(); return ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map((nombre,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return {nombre, fecha:fechaISODate(d)} }) }
function guardarDiaIngresos(fecha) { const m=getMeta(); m.diasGuardados=Array.isArray(m.diasGuardados)?m.diasGuardados:[]; if(!m.diasGuardados.includes(fecha)) m.diasGuardados.push(fecha); saveMeta(m); verIngresos(); alert(`Trabajo del ${new Date(fecha+'T12:00:00').toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'})} guardado.`) }
function verIngresos() {
  const cartera=getActivePortfolio(), dias=diasSemana();
  const mov=allMovements();
  const cards=dias.map(d=>{
    const abonos=mov.filter(x=>x.tipo==='abono' && x.cartera===cartera && String(x.fecha).slice(0,10)===d.fecha);
    const prestamos=mov.filter(x=>(x.tipo==='prestamo'||x.tipo==='renovacion') && x.cartera===cartera && String(x.fecha).slice(0,10)===d.fecha);
    const cobro=abonos.reduce((s,x)=>s+Number(x.valor||0),0), prestesto=prestamos.reduce((s,x)=>s+Number(x.valor||0),0);
    const guardados=(getMeta().diasGuardados||[]).includes(d.fecha);
    return `<div class="day-income"><div class="day-head"><div><h3>${d.nombre}</h3><small>${formatDate(d.fecha)}</small></div><span class="day-saved">${guardados?'✓ Guardado':'Sin guardar'}</span></div><div class="day-values"><div><span>💰 Cobro</span><b>${money(cobro)}</b></div><div><span>💸 Préstamo</span><b>${money(prestesto)}</b></div></div><div class="finance-list">${abonos.map(x=>`<div class="history-item"><span><span class="payment-mark">✓</span> ${esc(x.nombre)}<small>${money(x.valor)}</small></span><b>${money(x.valor)}</b></div>`).join('') || '<p>No hay pagos registrados este día.</p>'}</div><button class="green-btn full" onclick="guardarDiaIngresos('${d.fecha}')">💾 Guardar día</button></div>`;
  }).join('');
  const week=mov.filter(x=>x.tipo==='abono'&&x.cartera===cartera&&dias.some(d=>d.fecha===String(x.fecha).slice(0,10))).reduce((s,x)=>s+Number(x.valor||0),0);
  $('finanzasContenido').innerHTML=`<h2>Ingresos</h2><p class="sub">Control diario de cobros · lunes a sábado</p><div class="finance-cards"><div><small>Total cobrado semana</small><b>${money(week)}</b></div><div><small>Cartera</small><b>${esc(cartera)}</b></div></div><div class="days-income-grid">${cards}</div>`;
  show('finanzasModal');
}
function verEgresos() { const { mov, prestado, gastos } = weeklyStats(); const totalGastos = getMeta().expenses.reduce((s, x) => s + Number(x.valor || 0), 0); $('finanzasContenido').innerHTML = `<h2>Egresos</h2><p class="sub">Préstamos entregados y gastos registrados</p><div class="finance-cards"><div><small>Prestado esta semana</small><b>${money(prestado)}</b></div><div><small>Gastos esta semana</small><b>${money(gastos)}</b></div></div><button class="green-btn full finance-add" onclick="abrirGasto()">＋ Registrar gasto</button><div class="finance-list">${mov.filter(x => x.tipo === 'prestamo' || x.tipo === 'renovacion' || x.tipo === 'gasto').map(x => `<div class="history-item"><span>${x.tipo === 'gasto' ? '🧾' : '💸'} ${esc(x.nombre)}<small>${x.tipo === 'gasto' ? 'Gasto' : 'Préstamo'} · ${new Date(x.fecha).toLocaleDateString('es-CO')}</small></span><b>${money(x.valor)}</b></div>`).join('') || '<p>No hay egresos esta semana.</p>'}</div><p class="sub">Gastos acumulados: ${money(totalGastos)}</p>`; show('finanzasModal') }
function abrirGasto() { hide('finanzasModal'); $('gastoFecha').value = todayISO(); $('gastoDescripcion').value = ''; $('gastoValor').value = ''; $('gastoCartera').innerHTML = getMeta().portfolios.map(p => `<option>${esc(p)}</option>`).join(''); show('gastoModal') }
$('gastoForm').addEventListener('submit', e => { e.preventDefault(); const descripcion = $('gastoDescripcion').value.trim(), valor = +$('gastoValor').value, fecha = $('gastoFecha').value || todayISO(), cartera = $('gastoCartera').value; if (!descripcion || valor <= 0) return alert('Completa la descripción y el valor del gasto.'); const m = getMeta(); m.expenses.push({ id: Date.now(), descripcion, valor, fecha: new Date(fecha + 'T12:00:00').toISOString(), cartera }); saveMeta(m); hide('gastoModal'); verEgresos(); actualizarInicio() });
function verHistorialGeneral() { const { mov, cobrado, prestado, gastos } = weeklyStats(); const totalPrestado = allMovements().filter(x => x.tipo === 'prestamo' || x.tipo === 'renovacion').reduce((s, x) => s + Number(x.valor || 0), 0); const totalCobrado = allMovements().filter(x => x.tipo === 'abono').reduce((s, x) => s + Number(x.valor || 0), 0); let html = `<h2>Historial semanal</h2><p class="sub">Lunes a domingo · ${formatDate(todayISO())}</p><div class="week-summary"><div><b>${money(cobrado)}</b><span>Cobrado esta semana</span></div><div><b>${money(prestado)}</b><span>Prestado esta semana</span></div><div><b>${money(gastos)}</b><span>Gastos esta semana</span></div></div><div class="history-total"><b>Acumulado</b><span>Cobrado ${money(totalCobrado)} · Prestado ${money(totalPrestado)}</span></div>`; html += mov.length ? mov.map(h => `<div class="history-item"><span>${tipoNombre(h.tipo)} · ${esc(h.nombre)}<small>${new Date(h.fecha).toLocaleString('es-CO')} · ${esc(h.cartera || '')}</small></span><b>${h.valor ? money(h.valor) : '—'}</b></div>`).join('') : '<p>No hay movimientos esta semana.</p>'; $('historialContenido').innerHTML = html; show('historialModal') }
function irInicio() { document.body.classList.remove('showing-clients'); window.scrollTo({ top: 0, behavior: 'smooth' }); actualizarInicio() }
function irClientes() { document.body.classList.add('showing-clients'); window.scrollTo({ top: 0, behavior: 'smooth' }); render() }
function abrirMenu() { show('menuModal') }
function actualizarInicio() { const base = clientes.filter(c => (c.cartera || 'yeison') === getActivePortfolio()).reduce((s, c) => s + Number(c.prestamo || 0), 0), saldo = clientes.filter(c => (c.cartera || 'yeison') === getActivePortfolio()).reduce((s, c) => s + Math.max(Number(c.total || 0) - Number(c.pagado || 0), 0), 0); $('homeBase').textContent = money(base); $('homeDate').textContent = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric' }); if ($('infoClientes')) { $('infoClientes').textContent = clientes.filter(c => (c.cartera || 'yeison') === getActivePortfolio()).length; $('infoPrestado').textContent = money(base); $('infoSaldo').textContent = money(saldo) } }
function verInfo() { actualizarInicio(); show('infoModal') }
function abrirCarteras() { renderCarteras(); show('carterasModal') }
function renderCarteras() { const m = getMeta(); $('carterasLista').innerHTML = m.portfolios.map(p => `<div class="portfolio-row ${p === m.activePortfolio ? 'active' : ''}"><button onclick="seleccionarCartera('${esc(p)}')">📁 ${esc(p)}</button><span>${clientes.filter(c => (c.cartera || 'yeison') === p).length}</span></div>`).join(''); }
function seleccionarCartera(p) { const m = getMeta(); if (!m.portfolios.includes(p)) return; m.activePortfolio = p; saveMeta(m); actualizarCarteraUI(); hide('carterasModal'); irInicio() }
function crearCartera() { const nombre = $('nuevaCartera').value.trim(); if (!nombre) return; if (getMeta().portfolios.some(p => p.toLowerCase() === nombre.toLowerCase())) return alert('Esa cartera ya existe.'); const m = getMeta(); m.portfolios.push(nombre); m.activePortfolio = nombre; saveMeta(m); $('nuevaCartera').value = ''; renderCarteras(); actualizarCarteraUI(); alert(`Cartera "${nombre}" creada.`) }
function guardarDatos() { exportarDatos(); alert('Copia de seguridad descargada correctamente.') }

function weekRange() { const d = new Date(); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day; const start = new Date(d); start.setDate(d.getDate()+diff); start.setHours(0,0,0,0); const end = new Date(start); end.setDate(start.getDate()+6); end.setHours(23,59,59,999); return {start,end}; }
function liquidar() { const {start,end}=weekRange(), cartera=getActivePortfolio(), meta=getMeta(), movimientos=allMovements().filter(x=>x.cartera===cartera), dentro=movimientos.filter(x=>{const d=new Date(x.fecha); return d>=start&&d<=end;}), cobrado=dentro.filter(x=>x.tipo==='abono').reduce((s,x)=>s+Number(x.valor||0),0), prestado=dentro.filter(x=>['prestamo','renovacion'].includes(x.tipo)).reduce((s,x)=>s+Number(x.valor||0),0), gastos=dentro.filter(x=>x.tipo==='gasto').reduce((s,x)=>s+Number(x.valor||0),0), saldo=clientes.filter(c=>(c.cartera||'yeison')===cartera).reduce((s,c)=>s+Math.max(Number(c.total||0)-Number(c.pagado||0),0),0); const periodo=`${start.toLocaleDateString('es-CO')} - ${end.toLocaleDateString('es-CO')}`; const existente=meta.liquidaciones.find(x=>x.cartera===cartera&&x.inicio===start.toISOString().slice(0,10)); if(existente && !confirm('Ya existe una liquidación guardada para esta semana. ¿Quieres reemplazarla?')) return; const reg={id:Date.now(),cartera,inicio:start.toISOString().slice(0,10),fin:end.toISOString().slice(0,10),periodo,cobrado,prestado,gastos,saldoPendiente:saldo,guardadaEn:new Date().toISOString()}; meta.liquidaciones=meta.liquidaciones.filter(x=>!(x.cartera===cartera&&x.inicio===reg.inicio)); meta.liquidaciones.unshift(reg); saveMeta(meta); const historial=meta.liquidaciones.slice(0,12).map(x=>`<div class="history-item"><span><b>${esc(x.cartera)}</b><small>${esc(x.periodo)}</small></span><b>${money(x.cobrado)}</b></div>`).join(''); alert(`Liquidación guardada.
Semana: ${periodo}
Cobrado: ${money(cobrado)}
Prestado: ${money(prestado)}
Gastos: ${money(gastos)}
Saldo pendiente: ${money(saldo)}`); }
function abrirAdminPanel(){ if(currentUser?.role!=='admin') return alert('Acceso restringido al administrador.'); mostrarAdminDashboard(); }
function cerrarAdminPanel(){ $('adminDashboard').style.display='none'; }
function renderAdminDashboard(){ const accounts=getAccounts(), users=accounts.filter(a=>a.role==='user'); $('adminTotalUsers').textContent=users.length; $('adminActiveUsers').textContent=users.filter(a=>a.status!=='blocked').length; $('adminBlockedUsers').textContent=users.filter(a=>a.status==='blocked').length; $('adminUsersList').innerHTML=users.map(a=>{ const data=JSON.parse(localStorage.getItem(accountKey(a))||'[]'); const clientesCount=data.length; const saldo=data.reduce((s,c)=>s+Math.max(Number(c.total||0)-Number(c.pagado||0),0),0); return `<div class="admin-user-row"><div class="admin-user-main"><div class="admin-avatar">${esc((a.name||a.username).slice(0,1).toUpperCase())}</div><div><b>${esc(a.name)}</b><small>@${esc(a.username)} · ${clientesCount} clientes · Saldo ${money(saldo)}</small><span class="status ${a.status==='blocked'?'blocked':'active'}">${a.status==='blocked'?'🔒 Plataforma bloqueada':'🟢 Plataforma activa'}</span></div></div><div class="admin-user-actions"><button class="green-btn" onclick="adminEntrarUsuario('${a.id}')" ${a.status==='blocked'?'disabled':''}>Entrar a su plataforma</button><button class="${a.status==='blocked'?'green-btn':'red-btn'}" onclick="adminToggleBloqueo('${a.id}')">${a.status==='blocked'?'Desbloquear':'Bloquear'}</button></div></div>` }).join('') || '<div class="admin-empty">Todavía no hay usuarios registrados.</div>'; }
function adminToggleBloqueo(id){ if(currentUser?.role!=='admin')return; const accounts=getAccounts(), u=accounts.find(x=>x.id===id && x.role==='user'); if(!u)return; u.status=u.status==='blocked'?'active':'blocked'; setAccounts(accounts); renderAdminDashboard(); }
function adminEntrarUsuario(id){ if(currentUser?.role!=='admin')return; const u=getAccounts().find(x=>x.id===id && x.role==='user'); if(!u||u.status==='blocked')return alert('La cuenta está bloqueada. Desbloquéala primero.'); const adminId=currentUser.id; localStorage.setItem(SESSION_KEY,JSON.stringify({userId:u.id,impersonatedBy:adminId})); cargarCuenta(u); }
function borrarTodo() { if (confirm('¿Seguro que quieres borrar todos los clientes de esta cuenta?')) { clientes = []; save(); render(); cerrarMenu() } }
function show(id) { $(id)?.classList.add('show') } function hide(id) { $(id)?.classList.remove('show') }
window.addEventListener('click', e => { ['nuevoModal', 'clienteModal', 'pagoModal', 'editarModal', 'historialModal', 'menuModal', 'infoModal', 'carterasModal', 'finanzasModal', 'gastoModal', 'moverModal', 'renovarModal', 'adminModal'].forEach(id => { if (e.target === $(id)) hide(id) }) });
function cerrarMenu() { hide('menuModal') }
function cerrarHistorial() { hide('historialModal') }
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
});

async function instalarApp() {
  // Android/Chrome: abre el instalador nativo cuando el navegador lo permite.
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch { }
    deferredInstallPrompt = null;
    return;
  }

  // iPhone/iPad: iOS no permite abrir el instalador desde JavaScript.
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    alert("Para instalar en iPhone: toca Compartir (□↑) → Agregar a pantalla de inicio → Agregar.");
    return;
  }

  alert("Para instalar: abre el menú del navegador y elige “Instalar aplicación” o “Agregar a pantalla de inicio”.");
}

async function exportarDatos() {
  const data = {
    usuario: currentUser?.username || "",
    clientes,
    meta: getMeta(),
    fecha: new Date().toISOString()
  };

  const json = JSON.stringify(data, null, 2);
  const fileName = "mi-credito-respaldo.json";
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const file = new File([blob], fileName, { type: "application/json" });

  // Android/iPhone modernos: usa el selector nativo de compartir/guardar.
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({
        title: "Copia de seguridad - Mi Crédito",
        text: "Guarda esta copia de seguridad de Mi Crédito.",
        files: [file]
      });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }

  // Navegadores que no soportan compartir archivos: descarga normal.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Algunos iPhone antiguos bloquean el atributo download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      window.open("data:application/json;charset=utf-8," + encodeURIComponent(json), "_blank");
    }
  }, 1200);
}
(function seedAdmin(){ const a=getAccounts(); if(!a.some(x=>x.username==='jeferson')){ hashPassword('admin123').then(passwordHash=>{ const latest=getAccounts(); if(!latest.some(x=>x.username==='jeferson')){ latest.push({id:'admin-jeferson',name:'Jeferson',username:'jeferson',role:'admin',status:'active',passwordHash,createdAt:new Date().toISOString()}); setAccounts(latest); }}); } })();
$('loginForm').addEventListener('submit', handleLogin); $('registerForm').addEventListener('submit', handleRegister);
if (!iniciarSesion()) { document.body.classList.remove('authenticated'); mostrarLogin() }

setInterval(() => { if (document.body.classList.contains('showing-clients')) render() }, 60000);
