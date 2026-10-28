import crypto from 'crypto';
import { db } from './store.js';

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';

export function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}

export function checkPw(pw, stored) {
  try {
    const [salt, h] = String(stored || '').split(':');
    if (!salt || !h || !/^[0-9a-f]+$/i.test(h)) return false;
    const a = Buffer.from(h, 'hex');
    const b = crypto.scryptSync(String(pw), salt, 64);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function sign(v) {
  return v + '.' + crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
}
function unsign(s) {
  s = String(s || '');
  const i = s.lastIndexOf('.');
  if (i < 0) return null;
  const v = s.slice(0, i);
  const expected = sign(v);
  const A = Buffer.from(expected);
  const B = Buffer.from(s);
  if (A.length !== B.length || !crypto.timingSafeEqual(A, B)) return null;
  return v;
}
function parseCookies(h) {
  const o = {};
  String(h || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return o;
}

export function setSession(res, userId) {
  const exp = Date.now() + 30 * 864e5;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${encodeURIComponent(sign(userId + '|' + exp))}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 86400}${secure}`);
}
export function clearSession(res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}

export function currentUser(req) {
  const raw = parseCookies(req.headers.cookie).sid;
  if (!raw) return null;
  const v = unsign(raw);
  if (!v) return null;
  const bar = v.lastIndexOf('|');
  if (bar < 0) return null;
  const id = v.slice(0, bar);
  const exp = Number(v.slice(bar + 1));
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return db.users.find(u => u.id === id) || null;
}

export function publicUser(u) {
  if (!u) return null;
  if (u.role === 'client') {
    const diet = db.users.find(x => x.id === u.dietitianId);
    return {
      id: u.id, email: u.email, name: u.name, role: 'client',
      clientId: u.clientId, dietitianName: diet?.name || diet?.practiceName || 'Διαιτολόγος',
    };
  }
  return {
    id: u.id, email: u.email, name: u.name, role: 'dietitian',
    practiceName: u.practiceName || '', phone: u.phone || '',
    logoUrl: u.logoUrl || '', printFooter: u.printFooter || '',
  };
}

export function auth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Απαιτείται σύνδεση.' });
  req.user = u;
  next();
}
export function authDiet(req, res, next) {
  auth(req, res, () => {
    if (req.user.role === 'client') return res.status(403).json({ error: 'Μόνο για λογαριασμό διαιτολόγου.' });
    next();
  });
}
export function authClient(req, res, next) {
  auth(req, res, () => {
    if (req.user.role !== 'client') return res.status(403).json({ error: 'Μόνο για πύλη πελάτη.' });
    next();
  });
}

const fails = new Map();
export function tooMany(ip) {
  const now = Date.now();
  const rec = fails.get(ip) || [];
  const recent = rec.filter(t => now - t < 15 * 60 * 1000);
  fails.set(ip, recent);
  return recent.length >= 30;
}
export function markFail(ip) {
  const rec = fails.get(ip) || [];
  rec.push(Date.now());
  fails.set(ip, rec);
}
