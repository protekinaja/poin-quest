(function(){
'use strict';

/* ================= LOGIC (pure, no DOM) ================= */
var WIB = 7 * 3600e3, DAY = 864e5, XP_PER_LEVEL = 100;
var HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
var BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
var BLN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
var WD_SHORT = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];

function wibDate(ms){ return new Date(ms + WIB).toISOString().slice(0,10); }
function wibTime(ms){ return new Date(ms + WIB).toISOString().slice(11,16); }
function addDays(d,n){ return new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0,10); }
function isoDow(d){ var g = new Date(d + 'T00:00:00Z').getUTCDay(); return g === 0 ? 7 : g; }
function fmtLong(d){ var x = new Date(d + 'T00:00:00Z'); return HARI[x.getUTCDay()] + ', ' + x.getUTCDate() + ' ' + BULAN[x.getUTCMonth()] + ' ' + x.getUTCFullYear(); }
function fmtShort(d){ var x = new Date(d + 'T00:00:00Z'); return HARI[x.getUTCDay()] + ', ' + x.getUTCDate() + ' ' + BLN[x.getUTCMonth()] + ' ' + x.getUTCFullYear(); }
function monthLabel(ym){ var p = ym.split('-'); return BULAN[Number(p[1]) - 1] + ' ' + p[0]; }
function monthStart(ym){ return ym.slice(0,7) + '-01'; }
function monthEnd(ym){ var p = ym.slice(0,7).split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).toISOString().slice(0,10); }
function shiftMonth(ym, n){ var p = ym.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1 + n, 1)).toISOString().slice(0,7); }
function weekStart(d){ return addDays(d, 1 - isoDow(d)); }

function liveEntries(day){
  if (!day || !day.entries) return [];
  var out = [];
  Object.keys(day.entries).forEach(function(id){
    var e = day.entries[id];
    if (e && !e.d && e.a) out.push({ id: id, a: e.a, p: Number(e.p) || 0, t: Number(e.t) || 0, n: e.n || '', b: !!e.b });
  });
  return out.sort(function(x,y){ return x.t - y.t; });
}
function dayTotal(day){ return liveEntries(day).reduce(function(s,e){ return s + e.p; }, 0); }
/* Past days keep the targets they were played with; today always follows the current settings. */
function targetsFor(day, cfg){
  var past = day && day.date && day.date !== wibDate(Date.now());
  return { min: (past && Number(day.minTarget)) || cfg.minTarget, ideal: (past && Number(day.idealTarget)) || cfg.idealTarget };
}
function statusOf(total, t){ if (total <= 0) return 'none'; if (total >= t.ideal) return 'ideal'; if (total >= t.min) return 'met'; return 'short'; }
function countFor(day, aid){ return liveEntries(day).filter(function(e){ return e.a === aid; }).length; }
function canAdd(day, act){ return !act.cap || countFor(day, act.id) < act.cap; }
function isWork(cfg, d){ return cfg.workdays.indexOf(isoDow(d)) !== -1; }

/* Combo: consecutive days at or above the minimum. A workday below it breaks the combo;
   a day off below it is skipped; today still in progress never breaks it. */
function currentStreak(days, cfg, today){
  var n = 0, d = today;
  if (dayTotal(days.get(today)) < targetsFor(days.get(today), cfg).min) d = addDays(today, -1);
  for (var i = 0; i < 1000; i++){
    var day = days.get(d), tot = dayTotal(day);
    if (tot >= targetsFor(day, cfg).min) n++;
    else if (isWork(cfg, d)) break;
    d = addDays(d, -1);
    if (!days.size) break;
  }
  return n;
}
function bestStreak(days, cfg, today){
  var dates = Array.from(days.keys()).filter(function(d){ return d <= today; }).sort();
  if (!dates.length) return 0;
  var best = 0, run = 0;
  for (var d = dates[0]; d <= today; d = addDays(d, 1)){
    var day = days.get(d), tot = dayTotal(day);
    if (tot >= targetsFor(day, cfg).min){ run++; if (run > best) best = run; }
    else if (isWork(cfg, d) && d !== today) run = 0;
  }
  return best;
}
function period(days, cfg, from, to, today){
  var xp = 0, work = 0, clear = 0;
  for (var d = from; d <= to && d <= today; d = addDays(d, 1)){
    var day = days.get(d), tot = dayTotal(day);
    xp += tot;
    if (isWork(cfg, d)) work++;
    if (tot >= targetsFor(day, cfg).min) clear++;
  }
  return { xp: xp, work: work, clear: clear };
}
function weekWorkdays(cfg, ws){ var n = 0; for (var i = 0; i < 7; i++) if (isWork(cfg, addDays(ws, i))) n++; return n; }
function actCounts(days, from, to){
  var out = {};
  days.forEach(function(day, d){
    if (d < from || d > to) return;
    liveEntries(day).forEach(function(e){ var o = out[e.a] || (out[e.a] = { n: 0, xp: 0 }); o.n++; o.xp += e.p; });
  });
  return out;
}
var TITLES = [[50,'Legend'],[30,'Top Agent'],[20,'Rainmaker'],[10,'Closer'],[5,'Prospector'],[1,'Rookie']];
function titleFor(lv){ for (var i = 0; i < TITLES.length; i++) if (lv >= TITLES[i][0]) return TITLES[i][1]; return 'Rookie'; }
function nextTitle(lv){ for (var i = TITLES.length - 1; i >= 0; i--) if (TITLES[i][0] > lv) return { lv: TITLES[i][0], title: TITLES[i][1] }; return null; }
function levelInfo(xp){ var lv = Math.floor(xp / XP_PER_LEVEL) + 1; return { lv: lv, into: xp % XP_PER_LEVEL, need: XP_PER_LEVEL, title: titleFor(lv) }; }
function computeStats(days, cfg, today){
  var xp = 0, entries = 0, clearDays = 0, perfectDays = 0, count = {}, maxDay = {};
  days.forEach(function(day, d){
    if (d > today) return;
    var live = liveEntries(day); if (!live.length) return;
    var tot = live.reduce(function(s,e){ return s + e.p; }, 0), t = targetsFor(day, cfg), per = {};
    xp += tot; entries += live.length;
    if (tot >= t.min) clearDays++;
    if (tot >= t.ideal) perfectDays++;
    live.forEach(function(e){ count[e.a] = (count[e.a] || 0) + 1; per[e.a] = (per[e.a] || 0) + 1; });
    Object.keys(per).forEach(function(k){ maxDay[k] = Math.max(maxDay[k] || 0, per[k]); });
  });
  var L = levelInfo(xp);
  return { xp: xp, entries: entries, clearDays: clearDays, perfectDays: perfectDays, count: count, maxDay: maxDay,
    level: L.lv, L: L, streak: currentStreak(days, cfg, today), best: bestStreak(days, cfg, today) };
}
var BADGES = [
  { id:'first',    icon:'flag',         name:'Langkah Pertama',   desc:'Catat aksi pertama',              test:function(s){ return s.entries >= 1; } },
  { id:'clear1',   icon:'check',        name:'Misi Clear',        desc:'Capai target minimal dalam sehari', test:function(s){ return s.clearDays >= 1; } },
  { id:'perfect1', icon:'crown',        name:'Perfect Day',       desc:'Capai 25 XP dalam sehari',        test:function(s){ return s.perfectDays >= 1; } },
  { id:'blood',    icon:'handshake',    name:'First Blood',       desc:'Closing nasabah pertama',         test:function(s){ return (s.count.a3 || 0) >= 1; } },
  { id:'present5', icon:'presentation', name:'Mesin Presentasi',  desc:'5 presentasi dalam sehari',       test:function(s){ return (s.maxDay.a1 || 0) >= 5; } },
  { id:'combo3',   icon:'flame',        name:'Combo 3',           desc:'Clear 3 hari berturut-turut',     test:function(s){ return s.best >= 3; } },
  { id:'combo7',   icon:'flame',        name:'Combo 7',           desc:'Clear 7 hari berturut-turut',     test:function(s){ return s.best >= 7; } },
  { id:'combo30',  icon:'flame',        name:'Tak Terhentikan',   desc:'Clear 30 hari berturut-turut',    test:function(s){ return s.best >= 30; } },
  { id:'ref10',    icon:'user-plus',    name:'Penjala Referensi', desc:'Minta referensi 10 kali',         test:function(s){ return (s.count.a4 || 0) >= 10; } },
  { id:'train10',  icon:'grad',         name:'Rajin Latihan',     desc:'Ikut training 10 kali',           test:function(s){ return (s.count.a7 || 0) >= 10; } },
  { id:'close10',  icon:'trophy',       name:'Closer Sejati',     desc:'10 closing total',                test:function(s){ return (s.count.a3 || 0) >= 10; } },
  { id:'lv10',     icon:'star',         name:'Level 10',          desc:'Kumpulkan 900 XP',                test:function(s){ return s.level >= 10; } }
];
function unlockedSet(stats){ var s = {}; BADGES.forEach(function(b){ if (b.test(stats)) s[b.id] = true; }); return s; }
function applyOps(base, ops){
  var out = new Map(base);
  ops.forEach(function(op){
    var cur = out.get(op.date);
    var day = cur ? Object.assign({}, cur, { entries: Object.assign({}, cur.entries || {}) })
                  : { date: op.date, minTarget: op.minTarget, idealTarget: op.idealTarget, entries: {} };
    day.entries[op.eid] = Object.assign({}, day.entries[op.eid] || {}, op.data);
    out.set(op.date, day);
  });
  return out;
}
function actName(cfg, id){ var a = cfg.activities.find(function(x){ return x.id === id; }); return a ? a.name : 'Kegiatan lain'; }
function recapText(date, day, cfg, name){
  var t = targetsFor(day, cfg), live = liveEntries(day), tot = dayTotal(day), by = {};
  live.forEach(function(e){ var o = by[e.a] || (by[e.a] = { n: 0, xp: 0 }); o.n++; o.xp += e.p; });
  var order = cfg.activities.map(function(a){ return a.id; });
  Object.keys(by).forEach(function(k){ if (order.indexOf(k) === -1) order.push(k); });
  var lines = ['Laporan Kegiatan - ' + fmtShort(date)];
  if (name) lines.push(name);
  lines.push('');
  order.forEach(function(id){ var o = by[id]; if (o) lines.push(actName(cfg, id) + ': ' + o.n + 'x (' + o.xp + ')'); });
  if (!live.length) lines.push('Belum ada kegiatan tercatat.');
  lines.push('');
  var s = statusOf(tot, t);
  var label = s === 'ideal' ? 'PERFECT (target ' + t.min + ', ideal ' + t.ideal + ')'
            : s === 'met' ? 'TERCAPAI (target ' + t.min + ')'
            : 'KURANG ' + (t.min - tot) + ' POIN (target ' + t.min + ')';
  lines.push('Total: ' + tot + ' poin - ' + label);
  return lines.join('\n');
}
function csvCell(v){ v = String(v == null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function toCSV(days, cfg){
  var rows = [['tanggal','jam','kegiatan','poin','catatan','susulan']];
  Array.from(days.keys()).sort().forEach(function(d){
    liveEntries(days.get(d)).forEach(function(e){ rows.push([d, wibTime(e.t), actName(cfg, e.a), e.p, e.n, e.b ? 'ya' : '']); });
  });
  return '﻿' + rows.map(function(r){ return r.map(csvCell).join(','); }).join('\r\n');
}
var DEFAULT_CONFIG = {
  v: 1, minTarget: 15, idealTarget: 25, workdays: [1,2,3,4,5,6], recapName: '',
  activities: [
    { id:'a1', name:'Prospek / Presentasi',        points:2, cap:0, icon:'presentation', hint:'Nama nasabah' },
    { id:'a2', name:'Follow Up Nasabah',           points:2, cap:0, icon:'message',      hint:'Nama nasabah' },
    { id:'a3', name:'Closing Nasabah',             points:2, cap:0, icon:'handshake',    hint:'Nama nasabah' },
    { id:'a4', name:'Minta Referensi',             points:1, cap:0, icon:'user-plus',    hint:'Nama pemberi referensi' },
    { id:'a5', name:'Follow Up Referensi',         points:1, cap:0, icon:'users',        hint:'Nama referensi' },
    { id:'a6', name:'Telpon Nasabah, Bikin Janji', points:1, cap:0, icon:'phone',        hint:'Nama nasabah' },
    { id:'a7', name:'Ikut Training di Vision',     points:2, cap:1, icon:'grad',         hint:'Topik training' }
  ]
};
function normalizeConfig(c){
  var d = DEFAULT_CONFIG; c = c || {};
  var min = Math.round(Number(c.minTarget)); if (!(min >= 1 && min <= 100)) min = d.minTarget;
  var ideal = Math.round(Number(c.idealTarget)); if (!(ideal > min && ideal <= 200)) ideal = Math.max(min + 1, d.idealTarget);
  var wd = Array.isArray(c.workdays) ? c.workdays.map(Number).filter(function(x){ return x >= 1 && x <= 7; }) : d.workdays.slice();
  var acts = Array.isArray(c.activities) && c.activities.length ? c.activities : d.activities;
  acts = acts.filter(function(a){ return a && a.id && a.name; }).map(function(a){
    var p = Math.round(Number(a.points)); if (!(p >= 1 && p <= 10)) p = 1;
    var cap = Math.round(Number(a.cap)); if (!(cap >= 1)) cap = 0;
    return { id: String(a.id), name: String(a.name).slice(0,40), points: p, cap: cap, icon: a.icon || 'circle', hint: String(a.hint || 'Catatan').slice(0,40), archived: !!a.archived };
  });
  var per = Math.round(Number(c.namesPerDay)); if (!(per >= 0 && per <= 50)) per = 2;
  var nt = Math.round(Number(c.namesTarget)); if (!(nt >= 10 && nt <= 2000)) nt = 200;
  return { v: 1, minTarget: min, idealTarget: ideal, workdays: wd, recapName: String(c.recapName == null ? d.recapName : c.recapName).slice(0,60), activities: acts,
    namesPerDay: per, namesTarget: nt, leadXP: c.leadXP !== false };
}

/* Supabase rows <-> the day map the UI works with */
function applyRows(base, rows){
  var out = new Map(base);
  rows.forEach(function(r){
    var cur = out.get(r.entry_date);
    var day = cur ? Object.assign({}, cur, { entries: Object.assign({}, cur.entries || {}) })
                  : { date: r.entry_date, minTarget: r.min_target, idealTarget: r.ideal_target, entries: {} };
    day.entries[r.id] = { a: r.activity_id, an: r.activity_name, p: Number(r.points) || 0, t: Date.parse(r.created_at) || 0,
      n: r.note || '', b: !!r.is_backfill, d: !!r.deleted_at };
    out.set(r.entry_date, day);
  });
  return out;
}
function opToRow(op){
  return { id: op.eid, entry_date: op.date, activity_id: op.data.a, activity_name: String(op.data.an || op.data.a).slice(0,40),
    points: op.data.p, note: String(op.data.n || '').slice(0,120), is_backfill: !!op.data.b, min_target: op.minTarget, ideal_target: op.idealTarget,
    created_at: new Date(op.data.t).toISOString() };
}
function opToPatch(op){
  var p = {};
  if (op.data.d) p.deleted_at = new Date(op.at || Date.now()).toISOString();
  if (op.data.n != null) p.note = String(op.data.n).slice(0,120);
  return p;
}
/* Daftar Nama: "Nama, 0812..." per line. Returns [{name, phone}] (max 300). */
function parseBulk(text){
  var out = [];
  String(text || '').split(/\r?\n/).forEach(function(line){
    var l = line.trim(); if (!l || out.length >= 300) return;
    var name = l, phone = '', m = l.match(/^(.*?)[,;\t]\s*([+\d][\d\s\-().]{6,})\s*$/);
    if (m && m[2].replace(/\D/g, '').length >= 8){ name = m[1].trim(); phone = m[2].replace(/[^\d+]/g, ''); }
    name = name.replace(/^[-*\d.)\s]+(?=\S)/, function(x){ return /\d/.test(x) && /[.)]/.test(x) ? '' : x; }).trim().slice(0, 60);
    if (name) out.push({ name: name, phone: phone.slice(0, 20) });
  });
  return out;
}
function waLink(phone){
  var d = String(phone || '').replace(/\D/g, ''); if (d.length < 8) return '';
  if (d[0] === '0') d = '62' + d.slice(1); else if (d[0] === '8') d = '62' + d;
  return 'https://wa.me/' + d;
}
/* Tasks shown on a date: one-off on that date, or repeating on that weekday from the day it was made. */
function tasksForDay(tasks, date){
  var out = [];
  tasks.forEach(function(t){
    if (!t || t.deleted_at) return;
    var made = t.created_at ? wibDate(Date.parse(t.created_at)) : date;
    if (t.repeat_days && t.repeat_days.length){ if (date >= made && t.repeat_days.indexOf(isoDow(date)) !== -1) out.push(t); }
    else if (t.on_date === date) out.push(t);
  });
  return out.sort(function(a, b){ return (a.at_time || '99:99').localeCompare(b.at_time || '99:99') || String(a.title).localeCompare(String(b.title)); });
}
function hexToken(bytes){ var s = ''; for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16); return s; }
function sheetFormula(url, token){ return '=IMPORTDATA("' + String(url).replace(/\/+$/, '') + '/functions/v1/sheet?token=' + token + '")'; }
function authMessage(err){
  var m = String((err && (err.message || err.error_description)) || '');
  if (/invalid login credentials/i.test(m)) return 'Email atau kata sandi salah.';
  if (/already registered|already been registered|user_already_exists/i.test(m)) return 'Email ini sudah terdaftar. Pilih Masuk.';
  if (/signups? not allowed|signup.*disabled/i.test(m)) return 'Pendaftaran sedang ditutup. Minta admin tim membuatkan akun.';
  if (/email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Admin perlu mematikan "Confirm email" di Supabase (lihat panduan).';
  if (/password.*(at least|characters|short)/i.test(m)) return 'Kata sandi minimal 8 karakter.';
  if (/rate limit|too many/i.test(m)) return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.';
  if (/fetch|network|load failed/i.test(m) || !m) return 'Tidak ada koneksi ke server. Coba lagi saat online.';
  return 'Gagal: ' + m;
}
function isNetErr(err){ return !err || !err.code || err.status === 0 || /fetch|network|load failed/i.test(err.message || ''); }

/* expose for tests when run outside a browser */
if (typeof window === 'undefined' || !window.document){
  module.exports = { wibDate: wibDate, wibTime: wibTime, addDays: addDays, isoDow: isoDow, liveEntries: liveEntries, dayTotal: dayTotal,
    statusOf: statusOf, canAdd: canAdd, currentStreak: currentStreak, bestStreak: bestStreak, period: period, computeStats: computeStats,
    unlockedSet: unlockedSet, applyOps: applyOps, recapText: recapText, toCSV: toCSV, normalizeConfig: normalizeConfig, levelInfo: levelInfo,
    nextTitle: nextTitle, monthEnd: monthEnd, shiftMonth: shiftMonth, weekStart: weekStart, targetsFor: targetsFor, DEFAULT_CONFIG: DEFAULT_CONFIG,
    applyRows: applyRows, parseBulk: parseBulk, waLink: waLink, tasksForDay: tasksForDay, opToRow: opToRow, opToPatch: opToPatch, hexToken: hexToken, sheetFormula: sheetFormula, authMessage: authMessage, isNetErr: isNetErr };
  return;
}

/* ================= UI ================= */
var P = {
  plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus:'<path d="M5 12h14"/>',
  presentation:'<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
  message:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  handshake:'<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
  'user-plus':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><path d="M14.05 2a9 9 0 0 1 8 7.94"/><path d="M14.05 6A5 5 0 0 1 18 10"/>',
  grad:'<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/><path d="M22 10v6"/>',
  star:'<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  pen:'<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  circle:'<circle cx="12" cy="12" r="9"/>',
  target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  gamepad:'<path d="M6 11h4"/><path d="M8 9v4"/><path d="M15 12h.01"/><path d="M18 10h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.41.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.55-.6-6.58-.69-7.26A4 4 0 0 0 17.32 5z"/>',
  trophy:'<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  sliders:'<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  left:'<path d="m15 18-6-6 6-6"/>', right:'<path d="m9 18 6-6-6-6"/>', up:'<path d="m18 15-6-6-6 6"/>', down:'<path d="m6 9 6 6 6-6"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  calendar:'<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  crown:'<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 20h14"/>',
  flag:'<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  lock:'<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  copy:'<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'
};
var FLAME = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';
function ic(name, size, sw){ return '<svg viewBox="0 0 24 24" width="' + (size || 22) + '" height="' + (size || 22) + '" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.circle) + '</svg>'; }
function icFlame(){ return FLAME; }
var ICON_CHOICES = [['presentation','Presentasi'],['message','Pesan'],['handshake','Jabat tangan'],['user-plus','Tambah orang'],['users','Orang'],['phone','Telepon'],['grad','Training'],['pen','Pena'],['star','Bintang'],['target','Target'],['circle','Lingkaran']];
function hexSVG(big){ return '<svg viewBox="0 0 48 52" aria-hidden="true"><polygon points="24,2 46,14 46,38 24,50 2,38 2,14" fill="var(--gold)" stroke="var(--gold-deep)" stroke-width="3" stroke-linejoin="round"/><polygon points="24,8 40,17 40,24 8,24 8,17" fill="#fff" opacity=".22"/></svg>'; }

function $(s, r){ return (r || document).querySelector(s); }
function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
function uid(){ try { return crypto.randomUUID().replace(/-/g,'').slice(0,20); } catch(e){ return Date.now().toString(36) + Math.random().toString(36).slice(2,10); } }
function uuid(){
  try { return crypto.randomUUID(); } catch(e){}
  var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = hexToken(b); return h.slice(0,8) + '-' + h.slice(8,12) + '-' + h.slice(12,16) + '-' + h.slice(16,20) + '-' + h.slice(20);
}
function newToken(){ var b = new Uint8Array(16); crypto.getRandomValues(b); return hexToken(b); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function lsGet(k){ try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch(e){ return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
var reduceMotion = false;
try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}

var CFG = window.POIN_CONFIG || {};
var S = {
  user: null, uid: null,
  config: normalizeConfig(null),
  dbDays: new Map(), pending: [],
  view: 'today', today: wibDate(Date.now()),
  calMonth: wibDate(Date.now()).slice(0,7), selDate: wibDate(Date.now()),
  readOnly: false, sync: 'loading', flushing: false, retry: 0, retryTimer: null,
  lastPull: null, channel: null, pulling: false,
  journals: {}, jPending: {}, jState: {}, jTimers: {},
  contacts: new Map(), tasks: new Map(), checks: new Map(), nameFilter: 'all', nameQuery: '', planDate: wibDate(Date.now()),
  draft: null, dirty: false, draftErr: '',
  sheet: { state: 'idle', token: null },
  sound: lsGet('poinq.sound') !== false
};
function key(k){ return 'poinq.' + S.uid + '.' + k; }

function entryOps(){ return S.pending.filter(function(o){ return o.kind === 'add' || o.kind === 'patch'; }); }
function allDays(){ var ops = entryOps(); return ops.length ? applyOps(S.dbDays, ops) : S.dbDays; }
function applyUpsertOp(op){
  (Array.isArray(op.row) ? op.row : [op.row]).forEach(function(r){
    if (op.table === 'contacts') S.contacts.set(r.id, Object.assign({}, S.contacts.get(r.id) || {}, r));
    else if (op.table === 'tasks') S.tasks.set(r.id, Object.assign({}, S.tasks.get(r.id) || {}, r));
    else if (op.table === 'task_checks') S.checks.set(r.task_id + '|' + r.day, !!r.done);
  });
}
function activeActs(){ return S.config.activities.filter(function(a){ return !a.archived; }); }
function editable(date){ return !S.readOnly && date <= S.today && date >= addDays(S.today, -7); }

var cacheTimer = null;
function saveCache(){
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(function(){
    var cutoff = addDays(S.today, -120), days = {};
    if (!S.uid) return;
    S.dbDays.forEach(function(v, k){ if (k >= cutoff) days[k] = v; });
    var checks = {}, ccut = addDays(S.today, -60);
    S.checks.forEach(function(v, k){ if (k.slice(-10) >= ccut) checks[k] = v; });
    lsSet(key('cache'), { config: S.config, days: days, journals: S.journals,
      contacts: Array.from(S.contacts.values()), tasks: Array.from(S.tasks.values()), checks: checks });
  }, 800);
}
function savePending(){ if (S.uid) lsSet(key('pending'), S.pending); }

/* ---------- sound ---------- */
var actx = null;
function sfx(kind){
  if (!S.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    var seq = {
      tap:     [[988,0,.07],[1319,.06,.12]],
      undo:    [[523,0,.08],[392,.07,.12]],
      clear:   [[523,0,.1],[659,.09,.1],[784,.18,.1],[1047,.27,.3]],
      perfect: [[784,0,.09],[988,.08,.09],[1175,.16,.09],[1568,.24,.09],[1319,.34,.09],[1568,.42,.35]],
      level:   [[392,0,.12],[523,.12,.12],[659,.24,.12],[784,.36,.12],[1047,.48,.4]],
      badge:   [[1175,0,.08],[1568,.08,.2]]
    }[kind] || [];
    var now = actx.currentTime;
    seq.forEach(function(n){
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, now + n[1]);
      g.gain.exponentialRampToValueAtTime(0.045, now + n[1] + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + n[2]);
      o.connect(g); g.connect(actx.destination);
      o.start(now + n[1]); o.stop(now + n[1] + n[2] + 0.03);
    });
  } catch(e){}
  try { if (navigator.vibrate) navigator.vibrate(kind === 'tap' ? 8 : 25); } catch(e){}
}
function confettiBurst(big){
  if (reduceMotion || typeof window.confetti !== 'function') return;
  try {
    window.confetti({ particleCount: big ? 170 : 90, spread: big ? 110 : 70, startVelocity: big ? 48 : 38, origin: { y: 0.65 },
      colors: big ? ['#FFC23D','#F28C28','#FFFFFF','#0B2545'] : ['#16A34A','#4ADE80','#F28C28','#FFFFFF'], disableForReducedMotion: true });
  } catch(e){}
}
function floatXP(btn, text){
  if (reduceMotion || !btn) return;
  var r = btn.getBoundingClientRect(), el = document.createElement('span');
  el.className = 'xp-float'; el.textContent = text;
  el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = (r.top) + 'px';
  document.body.appendChild(el);
  setTimeout(function(){ el.remove(); }, 900);
}
function announce(msg){ var l = $('#live'); l.textContent = ''; setTimeout(function(){ l.textContent = msg; }, 30); }

/* ---------- toast, stamp, sheet ---------- */
var toastTimer = null;
function toast(html, actions, ms){
  var t = $('#toast');
  t.innerHTML = '<span>' + html + '</span>' + (actions || []).map(function(a, i){ return '<button type="button" data-ti="' + i + '">' + esc(a[0]) + '</button>'; }).join('');
  (actions || []).forEach(function(a, i){ $('[data-ti="' + i + '"]', t).addEventListener('click', function(){ hideToast(); a[1](); }); });
  t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, ms || 5000);
}
function hideToast(){ $('#toast').hidden = true; }
var stampTimer = null, stampQueue = [];
function stamp(kicker, title, sub, color){
  stampQueue.push([kicker, title, sub, color]);
  if (stampQueue.length === 1) showNextStamp();
}
function showNextStamp(){
  var s = stampQueue[0]; if (!s) return;
  var w = $('#stamp');
  w.innerHTML = '<div class="stamp k-' + s[3] + '"><p class="k">' + esc(s[0]) + '</p><h3>' + esc(s[1]) + '</h3><p>' + esc(s[2]) + '</p></div>';
  w.hidden = false;
  var done = function(){
    clearTimeout(stampTimer);
    var c = $('.stamp', w); if (c) c.classList.add('out');
    setTimeout(function(){ w.hidden = true; w.innerHTML = ''; stampQueue.shift(); showNextStamp(); }, reduceMotion ? 0 : 280);
  };
  stampTimer = setTimeout(done, 1800);
}
var lastFocus = null, sheetClose = null;
function openSheet(html, onMount, onClose){
  lastFocus = document.activeElement;
  var w = $('#sheet-wrap'), s = $('#sheet');
  s.innerHTML = html; w.hidden = false; sheetClose = onClose || null;
  if (onMount) onMount(s);
  var f = $('[autofocus]', s) || $('button, input, a', s); if (f) f.focus();
}
function closeSheet(){
  var w = $('#sheet-wrap'); if (w.hidden) return;
  w.hidden = true; $('#sheet').innerHTML = '';
  if (sheetClose) { var c = sheetClose; sheetClose = null; c(); }
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}
$('#sheet-wrap').addEventListener('click', function(e){ if (e.target.id === 'sheet-wrap') closeSheet(); });

/* ---------- data writes ---------- */
function enqueue(op){ op.id = uid(); op.at = Date.now(); S.pending.push(op); savePending(); flush(); }
function setSync(s){ S.sync = s; $$('.sync').forEach(paintSync); }
function paintSync(el){
  var n = S.pending.length, s = S.sync, txt;
  if (s === 'loading') { txt = 'Memuat data…'; }
  else if (s === 'offline') { txt = n ? n + ' menunggu sinyal' : 'Offline'; }
  else if (s === 'saving' || (n && s === 'ok')) { s = 'saving'; txt = 'Menyimpan…'; }
  else if (s === 'error') { txt = n ? n + ' antre sinkron' : 'Koneksi terputus'; }
  else { txt = 'Tersinkron'; }
  el.dataset.s = s; el.innerHTML = '<i></i><span>' + esc(txt) + '</span>'; el.title = txt;
}
async function writeOp(op){
  if (op.kind === 'upsert'){ var u = await api.upsert(op.table, op.row, op.conflict); if (u && u.error){ var ue = u.error; ue.status = u.status; throw ue; } return; }
  var res = op.kind === 'add' ? await api.insertEntry(opToRow(op)) : await api.patchEntry(op.eid, opToPatch(op));
  if (res && res.error){ var e = res.error; e.status = res.status; throw e; }
}
async function flush(){
  if (S.flushing || !S.uid || !S.pending.length) { $$('.sync').forEach(paintSync); return; }
  if (navigator.onLine === false) { setSync('offline'); return; }
  S.flushing = true; setSync('saving');
  while (S.pending.length){
    var op = S.pending[0];
    try {
      await writeOp(op);
      S.dbDays = applyOps(S.dbDays, [op]);   /* keep the confirmed change on screen once it leaves the queue */
      S.pending.shift(); savePending(); saveCache(); S.retry = 0;
    }
    catch(err){
      if (isNetErr(err) || err.status === 401 || err.code === 'PGRST301'){
        S.flushing = false; setSync(navigator.onLine === false ? 'offline' : 'error');
        clearTimeout(S.retryTimer);
        S.retryTimer = setTimeout(flush, [5000, 15000, 60000][Math.min(S.retry++, 2)]);
        return;
      }
      /* The server refused this change for good (for example a catch-up entry that sat offline for more than 7 days).
         Drop it so the rest of the queue keeps moving, and say so. */
      S.pending.shift(); savePending();
      showBanner(err.code === 'P0001' ? 'Satu entri tidak disimpan karena tanggalnya lebih dari 7 hari lalu.' : 'Satu perubahan ditolak server: ' + (err.message || 'galat tak dikenal') + '.');
      render();
    }
  }
  S.flushing = false; setSync('ok');
}
window.addEventListener('online', function(){ S.retry = 0; flush(); pull(); flushJournals(); });
window.addEventListener('offline', function(){ setSync('offline'); });

function addEntry(aid, opts){
  opts = opts || {};
  if (S.readOnly) { toast('Halaman ini hanya bisa dilihat.'); return; }
  var date = opts.date || S.today, act = S.config.activities.find(function(a){ return a.id === aid; });
  if (!act) return;
  if (!editable(date)) { toast('Hari itu sudah terkunci.'); return; }
  var days = allDays(), day = days.get(date);
  if (!canAdd(day, act)) { toast('Maksimal ' + act.cap + ' kali per hari.'); return; }
  var before = date === S.today ? computeStats(days, S.config, S.today) : null;
  var prevTot = dayTotal(day), t = targetsFor(day, S.config), eid = uuid();
  var entry = { a: aid, an: act.name, p: act.points, t: Date.now() };
  if (opts.backfill) entry.b = true;
  if (opts.note) entry.n = String(opts.note).slice(0,120);
  enqueue({ kind: 'add', date: date, eid: eid, data: entry, minTarget: t.min, idealTarget: t.ideal });
  var nowTot = prevTot + act.points;
  render();
  floatXP(opts.btn, '+' + act.points + ' XP');
  announce(act.name + ' ditambah, ' + nowTot + ' XP hari ini.');
  var milestone = false;
  if (date === S.today){
    var after = computeStats(allDays(), S.config, S.today);
    if (prevTot < t.ideal && nowTot >= t.ideal){ milestone = true; sfx('perfect'); confettiBurst(true); stamp('Misi harian', 'PERFECT!', nowTot + ' XP hari ini · standar Vision tembus', 'gold'); }
    else if (prevTot < t.min && nowTot >= t.min){ milestone = true; sfx('clear'); confettiBurst(false); stamp('Misi harian', 'CLEAR!', nowTot + ' XP · combo ' + after.streak + ' hari', 'clear'); }
    if (after.level > before.level){ milestone = true; setTimeout(function(){ sfx('level'); }, 500); confettiBurst(true); stamp('Level up', 'Lv ' + after.level, 'Gelar: ' + after.L.title, 'gold'); }
    var u0 = unlockedSet(before), u1 = unlockedSet(after);
    BADGES.forEach(function(b){ if (u1[b.id] && !u0[b.id]){ milestone = true; setTimeout(function(){ sfx('badge'); }, 300); stamp('Lencana baru', b.name, b.desc, 'xp'); } });
  }
  if (!milestone) sfx('tap');
  toast('<b>+' + act.points + ' XP</b> ' + esc(act.name), [['Catatan', function(){ openNote(date, eid); }], ['Urungkan', function(){ removeEntry(date, eid, true); }]]);
  if (opts.withNote) openNote(date, eid);
}
function removeEntry(date, eid, undo){
  if (!editable(date)) { toast('Hari itu sudah terkunci.'); return; }
  enqueue({ kind: 'patch', date: date, eid: eid, data: { d: true } });
  sfx('undo'); render();
  toast(undo ? 'Aksi dibatalkan' : 'Entri dihapus');
  announce(undo ? 'Aksi dibatalkan.' : 'Entri dihapus.');
}
function setNote(date, eid, text){ enqueue({ kind: 'patch', date: date, eid: eid, data: { n: text } }); render(); }
function lastEntryToday(aid){
  var live = liveEntries(allDays().get(S.today)).filter(function(e){ return !aid || e.a === aid; });
  return live[live.length - 1] || null;
}
function recentNotes(){
  var seen = {}, out = [], from = addDays(S.today, -90);
  Array.from(allDays().keys()).sort().reverse().forEach(function(d){
    if (d < from) return;
    liveEntries(allDays().get(d)).reverse().forEach(function(e){ var n = (e.n || '').trim(); if (n && !seen[n.toLowerCase()]){ seen[n.toLowerCase()] = 1; out.push(n); } });
  });
  return out.slice(0, 60);
}

/* ---------- sheets ---------- */
function openNote(date, eid){
  var day = allDays().get(date), e = day && day.entries && day.entries[eid];
  if (!e) return;
  var act = S.config.activities.find(function(a){ return a.id === e.a; }) || { name: 'Kegiatan', hint: 'Catatan' };
  var canEdit = editable(date);
  openSheet(
    '<div><h2 id="sheet-title">' + esc(act.name) + '</h2><p class="sub">' + esc(fmtShort(date)) + ' · ' + wibTime(Number(e.t) || Date.now()) + ' · +' + (Number(e.p) || 0) + ' XP' + (e.b ? ' · susulan' : '') + '</p></div>' +
    '<label class="field" for="note-input"><span>' + esc(act.hint || 'Catatan') + ' (opsional)</span>' +
    '<input type="text" id="note-input" maxlength="120" list="note-list" autocomplete="off" value="' + esc(e.n || '') + '" placeholder="' + esc(act.hint || 'Catatan') + '"' + (canEdit ? ' autofocus' : ' disabled') + '></label>' +
    '<datalist id="note-list">' + recentNotes().map(function(n){ return '<option value="' + esc(n) + '"></option>'; }).join('') + '</datalist>' +
    '<div class="sheet-actions">' + (canEdit ? '<button type="button" class="btn btn-danger" id="note-del">' + ic('trash', 18) + 'Hapus entri</button><span class="spacer"></span>' : '') +
    '<button type="button" class="btn btn-line" id="note-cancel">' + (canEdit ? 'Batal' : 'Tutup') + '</button>' +
    (canEdit ? '<button type="button" class="btn btn-primary" id="note-save">Simpan</button>' : '') + '</div>',
    function(s){
      $('#note-cancel', s).addEventListener('click', closeSheet);
      if (!canEdit) return;
      var save = function(){ var v = $('#note-input', s).value.trim().slice(0,120); if (v !== (e.n || '')) setNote(date, eid, v); closeSheet(); if (v) toast('Catatan tersimpan'); };
      $('#note-save', s).addEventListener('click', save);
      $('#note-input', s).addEventListener('keydown', function(ev){ if (ev.key === 'Enter'){ ev.preventDefault(); save(); } });
      $('#note-del', s).addEventListener('click', function(){ closeSheet(); removeEntry(date, eid, false); });
    });
}
function openRecap(date){
  var text = recapText(date, allDays().get(date), S.config, S.config.recapName);
  openSheet(
    '<div><h2 id="sheet-title">Rekap ' + esc(fmtShort(date)) + '</h2><p class="sub">Salin lalu kirim ke leader atau grup tim. Nama nasabah tidak ikut.</p></div>' +
    '<pre class="recap" id="recap-text">' + esc(text) + '</pre>' +
    '<div class="sheet-actions"><button type="button" class="btn btn-line" id="recap-close">Tutup</button>' +
    '<a class="btn btn-line" href="https://wa.me/?text=' + encodeURIComponent(text) + '" target="_blank" rel="noopener">Buka WhatsApp</a>' +
    '<button type="button" class="btn btn-primary" id="recap-copy">' + ic('copy', 18) + 'Salin teks</button></div>',
    function(s){
      $('#recap-close', s).addEventListener('click', closeSheet);
      $('#recap-copy', s).addEventListener('click', function(){
        var sel = function(){ var r = document.createRange(); r.selectNodeContents($('#recap-text', s)); var w = window.getSelection(); w.removeAllRanges(); w.addRange(r); toast('Teks sudah dipilih. Salin dengan menu atau Ctrl/⌘ C.'); };
        try { navigator.clipboard.writeText(text).then(function(){ toast('Rekap disalin'); }, sel); } catch(e){ sel(); }
      });
    });
}

/* ---------- navigation ---------- */
var VIEWS = ['today','schedule','names','progress','settings'];
var NAV = [['today','gamepad','Misi','Misi'],['schedule','calendar','Jadwal','Jadwal'],['names','users','Daftar Nama','Nama'],['progress','trophy','Progres','Progres'],['settings','sliders','Pengaturan','Atur']];
NAV.forEach(function(n){
  $('#nav-' + n[0]).innerHTML = ic(n[1], 22) + '<span>' + n[2] + '</span>';
  $('#tab-' + n[0]).innerHTML = ic(n[1], 22) + '<span>' + n[3] + '</span>';
  $('#tab-' + n[0]).setAttribute('aria-label', n[2]);
});
document.addEventListener('click', function(e){
  var b = e.target.closest('[data-nav]'); if (!b) return;
  go(b.dataset.nav);
});
function go(view){
  S.view = view;
  VIEWS.forEach(function(v){ $('#view-' + v).hidden = v !== view; });
  $$('[data-nav]').forEach(function(b){ if (b.dataset.nav === view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  render(); window.scrollTo(0, 0);
}
function showBanner(msg){ var b = $('#banner'); b.textContent = msg; b.hidden = !msg; }

/* ---------- render: today ---------- */
function topHUD(st){
  var L = st.L;
  return '<div class="lvl"><div class="hex">' + hexSVG() + '<b class="num">' + L.lv + '</b></div>' +
    '<div class="lvl-info"><p class="lvl-title">' + esc(L.title) + ' <span>Lv ' + L.lv + '</span></p>' +
    '<div class="xpbar" role="progressbar" aria-label="XP ke level berikutnya" aria-valuemin="0" aria-valuemax="' + L.need + '" aria-valuenow="' + L.into + '"><i style="width:' + (L.into / L.need * 100) + '%"></i></div>' +
    '<p class="lvl-xp num">' + L.into + ' / ' + L.need + ' XP ke Lv ' + (L.lv + 1) + '</p></div></div>' +
    '<div class="top-right"><span class="flame" data-on="' + (st.streak ? 1 : 0) + '" title="Combo: hari CLEAR berturut-turut">' + icFlame() + '<span class="num">' + st.streak + '</span><span class="sr-only"> hari combo</span></span><span class="sync"></span></div>';
}
function todayShell(acts, t){
  var segs = ''; for (var i = 0; i < t.ideal; i++) segs += '<i class="seg"></i>';
  return '<div class="board">' +
    '<header class="top" id="t-top"></header>' +
    '<section class="side-q panel" id="t-side" aria-label="Misi Daftar Nama dan jadwal hari ini"></section>' +
    '<section class="quest game-panel" aria-labelledby="q-title">' +
      '<div class="q-head"><p class="eyebrow" id="q-title">Misi harian · ' + esc(fmtShort(S.today).replace(/ \d{4}$/, '')) + '</p><span class="rank" id="q-rank"></span></div>' +
      '<p class="q-score"><b class="num" id="q-total">0</b><span>/ ' + t.min + ' XP</span><span class="bonus" id="q-bonus" hidden></span></p>' +
      '<div class="segbar" id="q-segs" style="--n:' + t.ideal + '" aria-hidden="true">' + segs + '</div>' +
      '<div class="seglabels" aria-hidden="true"><span class="m-min" id="q-mmin" style="left:' + (t.min / t.ideal * 100) + '%">' + ic('flag', 13, 2.5) + 'CLEAR ' + t.min + '</span><span class="m-max" id="q-mmax">' + ic('crown', 14, 2.5) + 'PERFECT ' + t.ideal + '</span></div>' +
      '<p class="q-msg" id="q-msg"></p>' +
      '<div class="q-actions"><button type="button" class="btn btn-line btn-sm" id="q-recap">' + ic('share', 18) + 'Bagikan rekap</button></div>' +
    '</section>' +
    '<section class="moves panel" aria-labelledby="m-title"><h2 class="panel-title" id="m-title">Aksi <span class="count" id="m-sum"></span></h2>' +
      '<ul class="list" id="m-list">' + acts.map(function(a){
        return '<li class="move" data-id="' + esc(a.id) + '"><span class="m-icon">' + ic(a.icon, 22, 2.25) + '</span>' +
          '<div><p class="m-name">' + esc(a.name) + '</p><p class="m-meta"><span class="xp-chip">+' + a.points + ' XP</span><span class="m-count"></span></p></div>' +
          '<button type="button" class="m-minus" data-minus="' + esc(a.id) + '" aria-label="Batalkan satu ' + esc(a.name) + '">' + ic('minus', 18, 2.5) + '</button>' +
          '<button type="button" class="m-plus" data-plus="' + esc(a.id) + '" data-key="plus-' + esc(a.id) + '">' + ic('plus', 26, 3) + '</button></li>';
      }).join('') + '</ul>' +
      '<p class="hint">Tekan lama tombol + untuk langsung menulis nama nasabah.<span class="kbd-hint"> Di keyboard: <kbd>1</kbd>–<kbd>' + Math.min(acts.length, 9) + '</kbd> menambah aksi, <kbd>Ctrl/⌘ Z</kbd> membatalkan.</span></p>' +
    '</section>' +
    '<section class="journal panel" aria-labelledby="j-title-' + S.today + '">' + journalHTML(S.today, 'Catatan hari ini') + '</section>' +
    '<section class="log panel" aria-labelledby="l-title"><h2 class="panel-title" id="l-title">Log hari ini <span class="count" id="l-count"></span></h2><ul class="list" id="l-list"></ul></section>' +
  '</div>';
}
function entryRow(e, date){
  var act = S.config.activities.find(function(a){ return a.id === e.a; });
  return '<li><button type="button" class="entry" data-entry="' + esc(e.id) + '" data-date="' + date + '">' +
    '<span class="e-time">' + wibTime(e.t) + '</span>' +
    '<span><span class="e-name">' + esc(act ? act.name : 'Kegiatan lain') + (e.b ? '<span class="e-tag">susulan</span>' : '') + '</span>' +
    (e.n ? '<span class="e-note">' + esc(e.n) + '</span>' : '') + '</span>' +
    '<span class="e-xp num">+' + e.p + '</span></button></li>';
}
function renderToday(){
  var root = $('#view-today'), cfg = S.config, days = allDays(), day = days.get(S.today), t = targetsFor(day, cfg);
  var acts = activeActs();
  var sig = S.today + '#' + t.min + '/' + t.ideal + '#' + acts.map(function(a){ return [a.id, a.name, a.icon, a.points, a.cap].join('|'); }).join(',');
  var fresh = root.dataset.sig !== sig;
  if (fresh){ root.innerHTML = todayShell(acts, t); root.dataset.sig = sig; root.dataset.total = '-1'; }
  var st = computeStats(days, cfg, S.today);
  $('#t-top').innerHTML = topHUD(st);
  $('#t-side').innerHTML = sideHTML();
  var total = dayTotal(day), s = statusOf(total, t), prev = Number(root.dataset.total);
  $('#q-total').textContent = total;
  var rank = $('#q-rank'); rank.dataset.s = s; rank.textContent = s === 'ideal' ? 'PERFECT' : s === 'met' ? 'CLEAR' : 'BERJALAN';
  var bonus = $('#q-bonus'); bonus.hidden = total <= t.ideal; bonus.textContent = '+' + (total - t.ideal) + ' bonus';
  $$('#q-segs .seg').forEach(function(el, i){
    var cls = 'seg';
    if (i < total) cls += total < t.min ? ' on' : (i < t.min ? ' clear' : ' gold');
    if (prev >= 0 && i >= prev && i < total && !reduceMotion) cls += ' pop';
    el.className = cls;
  });
  $('#q-mmin').classList.toggle('hit', total >= t.min);
  $('#q-mmax').classList.toggle('hit', total >= t.ideal);
  root.dataset.total = total;
  $('#q-msg').textContent = s === 'none' ? 'Belum ada XP. Ketuk + pada aksi pertamamu hari ini.'
    : s === 'short' ? 'Butuh ' + (t.min - total) + ' XP lagi untuk CLEAR.'
    : s === 'met' ? 'Misi CLEAR. ' + (t.ideal - total) + ' XP lagi untuk PERFECT.'
    : 'PERFECT! Standar Vision ' + t.ideal + ' XP tembus.';
  var counts = 0;
  acts.forEach(function(a){
    var li = $('.move[data-id="' + CSS.escape(a.id) + '"]', root); if (!li) return;
    var n = countFor(day, a.id); counts += n;
    $('.m-count', li).innerHTML = n ? '<b>' + n + '×</b> = ' + (n * a.points) + ' XP' + (a.cap ? ' · maks ' + a.cap : '') : (a.cap ? 'maks ' + a.cap + '× per hari' : 'belum hari ini');
    $('.m-minus', li).classList.toggle('off', !n);
    $('.m-minus', li).disabled = !n || S.readOnly;
    var plus = $('.m-plus', li), full = !canAdd(day, a);
    plus.disabled = full || S.readOnly;
    plus.innerHTML = full ? ic('check', 24, 3) : ic('plus', 26, 3);
    plus.setAttribute('aria-label', full ? a.name + ' sudah maksimal hari ini' : 'Tambah ' + a.name + ', ' + a.points + ' XP. Hari ini ' + n + ' kali.');
  });
  $('#m-sum').textContent = counts ? counts + ' aksi' : '';
  var live = liveEntries(day).reverse();
  $('#l-count').textContent = live.length ? live.length + ' entri' : '';
  $('#l-list').innerHTML = live.length ? live.map(function(e){ return entryRow(e, S.today); }).join('') : '<li class="empty">Log kosong. Setiap ketukan + muncul di sini, lengkap dengan jam dan catatan.</li>';
  $$('.sync', root).forEach(paintSync);
  paintJournals();
}

/* ---------- render: progress ---------- */
function renderProgress(){
  var root = $('#view-progress'), cfg = S.config, days = allDays(), today = S.today, st = computeStats(days, cfg, today), L = st.L;
  var nx = nextTitle(L.lv);
  var ws = weekStart(today), wk = period(days, cfg, ws, addDays(ws, 6), today), wkTarget = cfg.minTarget * weekWorkdays(cfg, ws);
  var mo = period(days, cfg, monthStart(today), monthEnd(today), today);
  var ym = S.calMonth, first = monthStart(ym), last = monthEnd(ym), lead = isoDow(first) - 1;
  var cells = WD_SHORT.map(function(w){ return '<span class="wd">' + w + '</span>'; }).join('');
  for (var i = 0; i < lead; i++) cells += '<span class="cell blank" aria-hidden="true"></span>';
  for (var d = first; d <= last; d = addDays(d, 1)){
    var day = days.get(d), tot = dayTotal(day), s = statusOf(tot, targetsFor(day, cfg)), future = d > today;
    var lab = fmtLong(d) + (future ? '' : ', ' + tot + ' XP' + (s === 'ideal' ? ', perfect' : s === 'met' ? ', clear' : ''));
    cells += '<button type="button" class="cell' + (d === today ? ' today' : '') + (d === S.selDate ? ' sel' : '') + '" data-day="' + d + '" data-s="' + (future ? 'none' : s) + '"' + (future ? ' disabled' : '') + ' aria-label="' + esc(lab) + '"' + (d === S.selDate ? ' aria-pressed="true"' : '') + '>' +
      ((s === 'met' || s === 'ideal') && !future ? '<span class="st">' + ic(s === 'ideal' ? 'crown' : 'star', 12, 2.5) + '</span>' : '') +
      '<span class="num">' + Number(d.slice(8)) + '</span>' + (tot && !future ? '<small>' + tot + '</small>' : '') + '</button>';
  }
  var sel = S.selDate, sday = days.get(sel), stot = dayTotal(sday), st2 = targetsFor(sday, cfg), ss = statusOf(stot, st2);
  var sLive = liveEntries(sday).reverse();
  var detail = '<div class="d-head"><p class="eyebrow">Detail hari</p><h2>' + esc(fmtLong(sel)) + '</h2>' +
    '<p class="d-status"><b>' + stot + ' XP</b> · ' + (ss === 'ideal' ? 'PERFECT' : ss === 'met' ? 'CLEAR' : stot ? 'belum clear, kurang ' + (st2.min - stot) : 'tidak ada aksi') + ' (target ' + st2.min + ')</p></div>';
  if (sel === today) detail += '<div class="backfill"><button type="button" class="chip-btn" data-nav="today">' + ic('gamepad', 18) + 'Main di layar Misi</button><button type="button" class="chip-btn" data-recap="' + sel + '">' + ic('share', 18) + 'Rekap</button></div>';
  else if (editable(sel)) {
    detail += '<p class="sec-label">Isi susulan (maks 7 hari ke belakang)</p><div class="backfill">' + activeActs().map(function(a){
      var full = !canAdd(sday, a);
      return '<button type="button" class="chip-btn" data-back="' + esc(a.id) + '"' + (full ? ' disabled' : '') + '>' + ic('plus', 16, 2.5) + esc(a.name) + ' <b>+' + a.points + '</b></button>';
    }).join('') + '</div><div class="backfill"><button type="button" class="chip-btn" data-recap="' + sel + '">' + ic('share', 18) + 'Rekap hari ini</button></div>';
  } else if (sel < today) detail += '<p class="sec-label">Lebih dari 7 hari lalu, log terkunci.</p><div class="backfill"><button type="button" class="chip-btn" data-recap="' + sel + '">' + ic('share', 18) + 'Rekap</button></div>';
  detail += '<div class="d-journal">' + (editable(sel) && sel !== today ? journalHTML(sel, 'Catatan harian')
    : '<h3 class="sec-label" style="margin-top:14px">Catatan harian</h3><p class="j-read">' + (S.journals[sel] ? esc(S.journals[sel]) : 'Tidak ada catatan.') + '</p>') + '</div>';
  detail += '<ul class="list" style="margin-top:10px">' + (sLive.length ? sLive.map(function(e){ return entryRow(e, sel); }).join('') : '<li class="empty">Tidak ada entri di hari ini.</li>') + '</ul>';

  var un = unlockedSet(st), nUn = Object.keys(un).length;
  var badges = BADGES.map(function(b){ var ok = !!un[b.id];
    return '<div class="badge' + (ok ? '' : ' locked') + '"><span class="medal">' + ic(ok ? b.icon : 'lock', 20, 2.25) + '</span><b>' + esc(b.name) + '</b><span>' + esc(b.desc) + '</span><span class="sr-only">' + (ok ? 'terbuka' : 'terkunci') + '</span></div>'; }).join('');

  var cur = actCounts(days, first, last), pm = shiftMonth(ym, -1), prv = actCounts(days, monthStart(pm), monthEnd(pm));
  var rows = cfg.activities.filter(function(a){ return !a.archived || cur[a.id] || prv[a.id]; }).map(function(a){ return { a: a, c: cur[a.id] || { n: 0, xp: 0 }, p: prv[a.id] || { n: 0, xp: 0 } }; })
    .sort(function(x, y){ return y.c.n - x.c.n; });
  var table = '<div class="tbl-wrap"><table><thead><tr><th>Aksi</th><th class="n">' + BLN[Number(ym.slice(5)) - 1] + '</th><th class="n">XP</th><th class="n">' + BLN[Number(pm.slice(5)) - 1] + '</th></tr></thead><tbody>' +
    rows.map(function(r){ var dlt = r.c.n - r.p.n;
      return '<tr><td>' + esc(r.a.name) + '</td><td class="n">' + r.c.n + '× ' + (dlt > 0 ? '<span class="delta-up">+' + dlt + '</span>' : dlt < 0 ? '<span class="delta-dn">' + dlt + '</span>' : '') + '</td><td class="n">' + r.c.xp + '</td><td class="n">' + r.p.n + '×</td></tr>'; }).join('') + '</tbody></table></div>';
  var pres = (cur.a1 || { n: 0 }).n, clos = (cur.a3 || { n: 0 }).n;
  var ratio = clos ? '1 closing tiap <b>' + (Math.round(pres / clos * 10) / 10).toString().replace('.', ',') + '</b> presentasi' : pres ? 'Belum ada closing dari <b>' + pres + '</b> presentasi bulan ini' : 'Belum ada presentasi bulan ini';

  root.innerHTML = '<div class="prog">' +
    '<section class="p-profile game-panel"><div class="profile"><div class="hex big">' + hexSVG(true) + '<b class="num">' + L.lv + '</b></div>' +
      '<div class="pi"><p class="eyebrow">Profil agen</p><h2>' + esc(L.title) + ' · Lv ' + L.lv + '</h2><p class="tot num">' + st.xp + ' XP total · ' + st.entries + ' aksi tercatat</p>' +
      '<div class="xpbar" role="progressbar" aria-label="XP ke level berikutnya" aria-valuemin="0" aria-valuemax="' + L.need + '" aria-valuenow="' + L.into + '"><i style="width:' + (L.into / L.need * 100) + '%"></i></div>' +
      '<p class="nx num">' + (L.need - L.into) + ' XP lagi ke Lv ' + (L.lv + 1) + (nx ? ' · gelar ' + esc(nx.title) + ' di Lv ' + nx.lv : '') + '</p></div>' +
      '</div></section>' +
    '<section class="p-stats stats" aria-label="Statistik">' +
      '<div class="stat"><p class="eyebrow">Combo</p><p class="v num">' + st.streak + '<small>hari</small></p><p class="s">Terbaik ' + st.best + ' hari</p></div>' +
      '<div class="stat"><p class="eyebrow">Boss minggu ini</p><p class="v num">' + wk.xp + '<small>/ ' + wkTarget + '</small></p><div class="minibar"><i class="' + (wk.xp >= wkTarget ? 'done' : '') + '" style="width:' + Math.min(100, wkTarget ? wk.xp / wkTarget * 100 : 0) + '%"></i></div></div>' +
      '<div class="stat"><p class="eyebrow">' + BULAN[Number(today.slice(5,7)) - 1] + '</p><p class="v num">' + mo.xp + '<small>XP</small></p><p class="s">' + mo.clear + ' hari clear dari ' + mo.work + ' hari kerja</p></div>' +
      '<div class="stat"><p class="eyebrow">Hari PERFECT</p><p class="v num">' + st.perfectDays + '<small>kali</small></p><p class="s">' + st.clearDays + ' hari clear sepanjang waktu</p></div>' +
    '</section>' +
    '<section class="p-cal panel" aria-label="Peta misi"><div class="cal-head"><button type="button" class="icon-btn" id="c-prev" aria-label="Bulan sebelumnya">' + ic('left', 20) + '</button><h2>' + esc(monthLabel(ym)) + '</h2><button type="button" class="icon-btn" id="c-next" aria-label="Bulan berikutnya"' + (ym >= today.slice(0,7) ? ' disabled' : '') + '>' + ic('right', 20) + '</button></div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="legend"><span><i class="short"></i>Berjalan</span><span><i class="met"></i>CLEAR ' + cfg.minTarget + '+</span><span><i class="ideal"></i>PERFECT ' + cfg.idealTarget + '+</span></div></section>' +
    '<section class="p-detail panel" aria-label="Detail hari">' + detail + '</section>' +
    '<section class="p-badges panel" aria-labelledby="b-title"><h2 class="panel-title" id="b-title">Lencana <span class="count">' + nUn + ' / ' + BADGES.length + '</span></h2><div class="badges">' + badges + '</div></section>' +
    '<section class="p-acts panel" aria-labelledby="a-title"><h2 class="panel-title" id="a-title">Statistik aksi · ' + esc(monthLabel(ym)) + '</h2>' + table + '<p class="ratio">' + ratio + '</p></section>' +
  '</div>';
  $$('.sync', root).forEach(paintSync);
  paintJournals();
  $('#c-prev').addEventListener('click', function(){ S.calMonth = shiftMonth(S.calMonth, -1); renderProgress(); $('#c-prev').focus(); });
  $('#c-next').addEventListener('click', function(){ if (S.calMonth < S.today.slice(0,7)){ S.calMonth = shiftMonth(S.calMonth, 1); renderProgress(); var n = $('#c-next'); (n.disabled ? $('#c-prev') : n).focus(); } });
}

/* ---------- render: settings ---------- */
function renderSettings(){
  var root = $('#view-settings');
  if (!S.draft || !S.dirty) { S.draft = clone(S.config); S.dirty = false; S.draftErr = ''; }
  var c = S.draft;
  var wd = [1,2,3,4,5,6,7].map(function(n){ return '<label class="daychip"><input type="checkbox" id="wd-' + n + '" data-wd="' + n + '"' + (c.workdays.indexOf(n) !== -1 ? ' checked' : '') + '><span>' + WD_SHORT[n - 1] + '</span></label>'; }).join('');
  var acts = c.activities.map(function(a, i){
    var id = esc(a.id);
    return '<div class="ea' + (a.archived ? ' archived' : '') + '" data-ea="' + id + '">' +
      '<div class="ea-1"><label class="field" for="ea-name-' + id + '"><span>Nama aksi' + (a.archived ? ' (diarsipkan)' : '') + '</span><input type="text" id="ea-name-' + id + '" data-f="name" maxlength="40" value="' + esc(a.name) + '"></label>' +
      '<button type="button" class="icon-btn" data-move="-1" data-key="up-' + id + '" aria-label="Naikkan ' + esc(a.name) + '"' + (i === 0 ? ' disabled' : '') + '>' + ic('up', 20) + '</button>' +
      '<button type="button" class="icon-btn" data-move="1" data-key="down-' + id + '" aria-label="Turunkan ' + esc(a.name) + '"' + (i === c.activities.length - 1 ? ' disabled' : '') + '>' + ic('down', 20) + '</button></div>' +
      '<div class="ea-2"><label class="field" for="ea-pts-' + id + '"><span>XP per kali</span><select id="ea-pts-' + id + '" data-f="points">' + [1,2,3,4,5].map(function(p){ return '<option value="' + p + '"' + (a.points === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></label>' +
      '<label class="field" for="ea-cap-' + id + '"><span>Batas per hari</span><input type="number" inputmode="numeric" min="0" max="20" id="ea-cap-' + id + '" data-f="cap" value="' + (a.cap || '') + '" placeholder="Tanpa batas"></label></div>' +
      '<div class="ea-3"><label class="field" for="ea-hint-' + id + '"><span>Petunjuk catatan</span><input type="text" id="ea-hint-' + id + '" data-f="hint" maxlength="40" value="' + esc(a.hint) + '"></label>' +
      '<label class="field" for="ea-icon-' + id + '"><span>Ikon</span><select id="ea-icon-' + id + '" data-f="icon">' + ICON_CHOICES.map(function(o){ return '<option value="' + o[0] + '"' + (a.icon === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<div><button type="button" class="btn btn-line" data-arch data-key="arch-' + id + '">' + (a.archived ? 'Aktifkan lagi' : 'Arsipkan') + '</button></div></div>';
  }).join('');
  root.innerHTML = '<header><p class="eyebrow">Pengaturan</p><h1 style="font-family:var(--font-game);font-size:26px;font-weight:800;line-height:1.2">Aturan main</h1></header>' +
    '<div class="set-grid">' +
    '<section class="panel"><h2 class="panel-title">Target harian</h2><div class="row2">' +
      '<label class="field" for="set-min"><span>CLEAR (minimal)</span><input type="number" inputmode="numeric" id="set-min" min="1" max="100" value="' + c.minTarget + '"></label>' +
      '<label class="field" for="set-ideal"><span>PERFECT (ideal)</span><input type="number" inputmode="numeric" id="set-ideal" min="2" max="200" value="' + c.idealTarget + '"></label></div>' +
      '<div class="row2"><label class="field" for="set-names"><span>Hubungi dari Daftar Nama per hari</span><input type="number" inputmode="numeric" id="set-names" min="0" max="50" value="' + c.namesPerDay + '"></label>' +
      '<label class="field" for="set-ntarget"><span>Target Daftar Nama</span><input type="number" inputmode="numeric" id="set-ntarget" min="10" max="2000" value="' + c.namesTarget + '"></label></div>' +
      '<p class="help">Standar Vision 25 XP per hari. Target baru berlaku mulai hari ini; hari yang lewat tetap dinilai dengan target lamanya.</p>' +
      '<p class="field-err" id="set-err">' + esc(S.draftErr) + '</p></section>' +
    '<section class="panel set-acts"><h2 class="panel-title">Daftar aksi</h2><p class="help">Mengubah XP hanya berlaku untuk ketukan berikutnya. Aksi yang diarsipkan tetap tercatat di riwayat.</p><div class="edit-acts">' + acts + '</div>' +
      '<div style="margin-top:10px"><button type="button" class="btn btn-line" id="ea-add" data-key="ea-add">' + ic('plus', 18, 2.5) + 'Tambah aksi</button></div></section>' +
    '<section class="panel"><h2 class="panel-title">Hari kerja</h2><p class="help">Hari kerja yang tidak CLEAR memutus combo. Hari libur tidak.</p><div class="daychips">' + wd + '</div></section>' +
    '<section class="panel"><h2 class="panel-title">Rekap dan suara</h2><label class="field" for="set-name" style="margin-top:8px"><span>Nama di rekap WhatsApp</span><input type="text" id="set-name" maxlength="60" value="' + esc(c.recapName) + '"></label>' +
      '<div class="toggle"><span><b>Efek suara game</b><br><span class="help" style="margin:0">Hanya di perangkat ini</span></span><label class="switch"><input type="checkbox" id="set-sound"' + (S.sound ? ' checked' : '') + ' aria-label="Efek suara game"><span></span></label></div>' +
      '<div class="toggle"><span><b>XP otomatis dari Leads</b><br><span class="help" style="margin:0">Status naik ke Dihubungi atau Janji +1, Presentasi, Follow up, atau Closing +2</span></span><label class="switch"><input type="checkbox" id="set-leadxp"' + (c.leadXP ? ' checked' : '') + ' aria-label="XP otomatis dari Leads"><span></span></label></div></section>' +
    '<section class="panel"><h2 class="panel-title">Akun</h2><p class="help" style="margin-top:0">Masuk sebagai <b>' + esc(S.user ? S.user.email : '') + '</b>. XP dan catatanmu hanya bisa dilihat akun ini, di setiap perangkat tempat kamu masuk.</p>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-line" id="set-csv">' + ic('download', 18) + 'Unduh CSV</button>' +
      '<button type="button" class="btn btn-danger" id="set-logout">Keluar</button></div></section>' +
    '<section class="panel"><h2 class="panel-title">Pasang di perangkat</h2><ol class="steps">' +
      '<li><b>iPhone / iPad:</b> buka alamat aplikasi ini di Safari, ketuk Bagikan, lalu Tambah ke Layar Utama.</li>' +
      '<li><b>MacBook:</b> di Safari pilih File, lalu Tambahkan ke Dock. Di Chrome, pakai ikon pasang di address bar.</li>' +
      '<li><b>PC Windows:</b> di Edge atau Chrome, pakai ikon pasang di address bar, lalu sematkan ke taskbar.</li>' +
      '<li>Masuk dengan email dan kata sandi yang sama di setiap perangkat.</li></ol></section>' +
    '</div>' +
    '<div class="savebar" id="savebar"' + (S.dirty ? '' : ' hidden') + '><span>Ada perubahan aturan main</span><span style="display:flex;gap:8px"><button type="button" class="btn btn-line" id="set-reset">Batalkan</button><button type="button" class="btn btn-primary" id="set-save">Simpan</button></span></div>';
}
function markDirty(){ S.dirty = true; var b = $('#savebar'); if (b) b.hidden = false; }
(function bindSettings(){
  var root = $('#view-settings');
  root.addEventListener('input', onSetInput);
  root.addEventListener('change', onSetInput);
  function onSetInput(e){
    var el = e.target, c = S.draft;
    if (!c) return;
    if (el.id === 'set-sound'){ S.sound = el.checked; lsSet('poinq.sound', S.sound); if (S.sound) sfx('tap'); return; }
    if (el.id === 'set-min') c.minTarget = Math.round(Number(el.value));
    else if (el.id === 'set-ideal') c.idealTarget = Math.round(Number(el.value));
    else if (el.id === 'set-name') c.recapName = el.value;
    else if (el.id === 'set-names') c.namesPerDay = Math.round(Number(el.value));
    else if (el.id === 'set-ntarget') c.namesTarget = Math.round(Number(el.value));
    else if (el.id === 'set-leadxp') c.leadXP = el.checked;
    else if (el.dataset.wd){ var n = Number(el.dataset.wd); c.workdays = c.workdays.filter(function(x){ return x !== n; }); if (el.checked) c.workdays.push(n); c.workdays.sort(); }
    else if (el.dataset.f){ var box = el.closest('[data-ea]'), a = c.activities.find(function(x){ return x.id === box.dataset.ea; }); if (!a) return;
      var f = el.dataset.f; a[f] = (f === 'points' || f === 'cap') ? Math.max(0, Math.round(Number(el.value) || 0)) : el.value; }
    else return;
    markDirty();
  }
  root.addEventListener('click', function(e){
    var b = e.target.closest('button'), c = S.draft; if (!b || !c) return;
    var box = b.closest('[data-ea]');
    if (b.dataset.move && box){ var i = c.activities.findIndex(function(x){ return x.id === box.dataset.ea; }), j = i + Number(b.dataset.move);
      if (j < 0 || j >= c.activities.length) return; var t = c.activities[i]; c.activities[i] = c.activities[j]; c.activities[j] = t; markDirty(); rerenderSettings(b.dataset.key); return; }
    if (b.hasAttribute('data-arch') && box){ var a = c.activities.find(function(x){ return x.id === box.dataset.ea; }); a.archived = !a.archived; markDirty(); rerenderSettings(b.dataset.key); return; }
    if (b.id === 'ea-add'){ var nid = 'a' + uid().slice(0,8); c.activities.push({ id: nid, name: 'Aksi baru', points: 1, cap: 0, icon: 'star', hint: 'Catatan', archived: false }); markDirty(); rerenderSettings(); var inp = $('#ea-name-' + CSS.escape(nid)); if (inp){ inp.focus(); inp.select(); } return; }
    if (b.id === 'set-reset'){ S.draft = null; S.dirty = false; S.draftErr = ''; renderSettings(); return; }
    if (b.id === 'set-save'){ saveSettings(); return; }
    if (b.id === 'set-csv'){ exportCSV(); return; }
    if (b.id === 'set-logout'){ askLogout(); return; }
    if (b.id === 'sheet-copy'){ copyFormula(); return; }
    if (b.id === 'sheet-retry'){ loadSheetToken(true); return; }
    if (b.id === 'sheet-rotate'){ askRotate(); return; }
  });
})();
function rerenderSettings(key){ var y = window.scrollY; renderSettings(); window.scrollTo(0, y); if (key){ var el = $('[data-key="' + key + '"]'); if (el && !el.disabled) el.focus(); } }
async function saveSettings(){
  var c = S.draft, err = '';
  c.activities.forEach(function(a){ a.name = String(a.name || '').trim(); a.hint = String(a.hint || '').trim() || 'Catatan'; });
  if (!(c.minTarget >= 1 && c.minTarget <= 100)) err = 'Target CLEAR harus antara 1 dan 100.';
  else if (!(c.idealTarget > c.minTarget)) err = 'Target PERFECT harus lebih besar dari target CLEAR.';
  else if (c.activities.some(function(a){ return !a.name; })) err = 'Setiap aksi perlu nama.';
  else if (!c.activities.some(function(a){ return !a.archived; })) err = 'Sisakan minimal satu aksi aktif.';
  if (err){ S.draftErr = err; var e = $('#set-err'); if (e) { e.textContent = err; e.scrollIntoView({ block: 'center' }); } return; }
  var next = normalizeConfig(c); next.updatedAt = Date.now();
  S.config = next; S.draft = null; S.dirty = false; S.draftErr = ''; saveCache(); render();
  var res;
  try { res = await api.saveSettings(next); } catch(e){ res = { error: e }; }
  if (res && res.error) toast('Tersimpan di perangkat ini, tapi belum ke akun. Simpan lagi saat online.');
  else toast('Aturan main tersimpan');
}
function exportCSV(){
  var blob = new Blob([toCSV(allDays(), S.config)], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'poin-quest-' + S.today + '.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast('CSV 400 hari terakhir diunduh');
}

/* ---------- Google Sheets link ---------- */
function sheetPanelHTML(){
  var st = S.sheet, body;
  if (st.state === 'ready'){
    var f = sheetFormula(CFG.supabaseUrl, st.token);
    body = '<ol class="steps">' +
      '<li>Buka Google Sheets, buat spreadsheet baru.</li>' +
      '<li>Klik sel <b>A1</b>, tempel rumus di bawah, tekan Enter.</li>' +
      '<li>Sheets mengisi sendiri: tanggal, jam, aksi, poin, catatan. Isinya diperbarui otomatis sekitar tiap jam.</li></ol>' +
      '<label class="field" for="sheet-formula" style="margin-top:10px"><span>Rumus Google Sheets</span>' +
      '<input type="text" id="sheet-formula" readonly value="' + esc(f) + '"></label>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="sheet-copy">' + ic('copy', 18) + 'Salin rumus</button>' +
      '<button type="button" class="btn btn-line" id="sheet-rotate">Buat link baru</button></div>' +
      '<p class="help">Siapa pun yang memegang rumus ini bisa membaca catatanmu, termasuk nama nasabah. Simpan spreadsheet-nya privat. Kalau rumus tersebar, buat link baru.</p>';
  } else if (st.state === 'error'){
    body = '<p class="help">Link belum bisa dibuat. Periksa koneksi lalu coba lagi.</p><div style="margin-top:10px"><button type="button" class="btn btn-line" id="sheet-retry">Coba lagi</button></div>';
  } else {
    body = '<p class="help">Menyiapkan link Google Sheets…</p>';
  }
  return '<h2 class="panel-title">Salin ke Google Sheets</h2>' + body;
}
function paintSheet(){ var p = $('#sheet-panel'); if (p) p.innerHTML = sheetPanelHTML(); }
async function loadSheetToken(force){
  if (!S.uid || (S.sheet.state === 'ready' && !force) || S.sheet.state === 'loading') return;
  S.sheet = { state: 'loading', token: null }; paintSheet();
  try {
    var res = await api.getToken();
    if (res.error) throw res.error;
    var token = res.data && res.data.token;
    if (!token){ token = newToken(); var w = await api.setToken(token); if (w.error) throw w.error; }
    S.sheet = { state: 'ready', token: token };
  } catch(e){ S.sheet = { state: 'error', token: null }; }
  paintSheet();
}
function copyFormula(){
  var inp = $('#sheet-formula'); if (!inp) return;
  var fallback = function(){ inp.focus(); inp.select(); toast('Rumus sudah dipilih. Salin dengan Ctrl/⌘ C atau menu Salin.'); };
  try { navigator.clipboard.writeText(inp.value).then(function(){ toast('Rumus disalin. Tempel di sel A1 Google Sheets.'); }, fallback); } catch(e){ fallback(); }
}
function askRotate(){
  openSheet('<div><h2 id="sheet-title">Buat link baru?</h2><p class="sub">Rumus lama langsung berhenti bekerja. Spreadsheet yang memakai rumus lama perlu diganti dengan rumus baru.</p></div>' +
    '<div class="sheet-actions"><button type="button" class="btn btn-line" id="rot-cancel">Batal</button><button type="button" class="btn btn-primary" id="rot-ok">Buat link baru</button></div>',
    function(s){
      $('#rot-cancel', s).addEventListener('click', closeSheet);
      $('#rot-ok', s).addEventListener('click', async function(){
        closeSheet();
        var token = newToken(), w;
        try { w = await api.setToken(token); } catch(e){ w = { error: e }; }
        if (w.error){ toast('Link baru belum tersimpan. Coba lagi saat online.'); return; }
        S.sheet = { state: 'ready', token: token }; paintSheet(); toast('Link baru siap. Ganti rumus di spreadsheet-mu.');
      });
    });
}
function askLogout(){
  var n = S.pending.length;
  openSheet('<div><h2 id="sheet-title">Keluar dari akun?</h2><p class="sub">' +
      (n ? n + ' aksi belum terkirim ke server dan akan hilang dari perangkat ini kalau kamu keluar sekarang. Tunggu sampai status Tersinkron dulu.' : 'Data di perangkat ini dihapus. Semua XP tetap aman di akunmu.') + '</p></div>' +
    '<div class="sheet-actions"><button type="button" class="btn btn-line" id="out-cancel">Batal</button><button type="button" class="btn btn-danger" id="out-ok">Keluar</button></div>',
    function(s){
      $('#out-cancel', s).addEventListener('click', closeSheet);
      $('#out-ok', s).addEventListener('click', function(){ closeSheet(); logout(); });
    });
}

/* ---------- daftar nama & leads ---------- */
var STAGES = [['nama','Belum dihubungi'],['chat','Sudah dihubungi'],['janji','Janji Zoom/temu'],['presentasi','Sudah presentasi'],['followup','Follow up'],['closing','Closing'],['ditolak','Ditolak']];
var STAGE_IDX = {}; STAGES.forEach(function(x, i){ STAGE_IDX[x[0]] = i; });
var STAGE_XP = { chat: 'a6', janji: 'a6', presentasi: 'a1', followup: 'a2', closing: 'a3' };
var ACTIVE = { chat: 1, janji: 1, presentasi: 1, followup: 1 };
var SOURCES = ['Keluarga','Teman','Rekan kerja','Komunitas','Referensi','Lainnya'];
var NAME_FILTERS = [['all','Semua'],['nama','Belum dihubungi'],['active','Leads aktif'],['stale','Perlu dihubungi lagi'],['closing','Closing'],['ditolak','Ditolak']];
function stageLabel(st){ var x = STAGES[STAGE_IDX[st]]; return x ? x[1] : st; }
function liveContacts(){ var out = []; S.contacts.forEach(function(c){ if (c && !c.deleted_at) out.push(c); }); return out; }
function isoDay(iso){ return iso ? wibDate(Date.parse(iso)) : ''; }
function daysSince(iso){ if (!iso) return 0; return Math.max(0, Math.round((Date.parse(S.today + 'T00:00:00Z') - Date.parse(isoDay(iso) + 'T00:00:00Z')) / DAY)); }
function needsFollow(c){ return !!ACTIVE[c.stage] && daysSince(c.stage_at) >= 7; }
function contactedToday(){ return liveContacts().filter(function(c){ return isoDay(c.contacted_at) === S.today; }).length; }
function matchFilter(c, f){ if (f === 'all') return true; if (f === 'active') return !!ACTIVE[c.stage]; if (f === 'stale') return needsFollow(c); return c.stage === f; }
function xpFor(stage){ var aid = STAGE_XP[stage], a = aid && S.config.activities.find(function(x){ return x.id === aid && !x.archived; }); return a ? a.points : 0; }
function contactRow(c){ return { id: c.id, name: c.name, phone: c.phone || '', source: c.source || '', note: c.note || '', stage: c.stage, contacted_at: c.contacted_at || null, stage_at: c.stage_at, created_at: c.created_at, deleted_at: c.deleted_at || null }; }
function putContacts(rows){
  rows.forEach(function(r){ S.contacts.set(r.id, r); });
  saveCache();
  for (var i = 0; i < rows.length; i += 100) enqueue({ kind: 'upsert', table: 'contacts', conflict: 'id', row: rows.slice(i, i + 100).map(contactRow) });
  render();
}
function saveContact(prev, f){
  var now = new Date().toISOString();
  var row = prev ? Object.assign({}, prev, f) : Object.assign({ id: uuid(), stage: 'nama', contacted_at: null, stage_at: now, created_at: now, deleted_at: null }, f);
  var changed = !!prev && prev.stage !== row.stage;
  if (changed){ row.stage_at = now; if (!row.contacted_at && row.stage !== 'nama') row.contacted_at = now; }
  putContacts([row]);
  if (!prev){ toast('<b>' + esc(row.name) + '</b> masuk Daftar Nama'); return; }
  if (!changed){ toast('Tersimpan'); return; }
  var aid = STAGE_XP[row.stage], forward = STAGE_IDX[row.stage] > STAGE_IDX[prev.stage];
  if (S.config.leadXP && forward && xpFor(row.stage)) addEntry(aid, { note: row.name });
  else { sfx('tap'); toast('<b>' + esc(row.name) + '</b>: ' + esc(stageLabel(row.stage))); }
}
function sideHTML(){
  var per = S.config.namesPerDay, done = contactedToday(), list = tasksForDay(S.tasks, S.today);
  var fin = list.filter(function(t){ return isDone(t, S.today); }).length, html = '';
  if (per) html += '<div class="side-row"><div><p class="eyebrow">Misi Daftar Nama</p><p class="side-big num">' + done + ' / ' + per + ' <span>dihubungi hari ini</span></p></div>' +
    (done >= per ? '<span class="rank" data-s="met">CLEAR</span>' : '<button type="button" class="btn btn-line btn-sm" data-pick-names>Pilih nama</button>') + '</div>';
  html += '<div class="side-plan"><div class="side-row"><p class="eyebrow">Jadwal hari ini · ' + fin + ' / ' + list.length + ' selesai</p><button type="button" class="btn btn-line btn-sm" data-nav="schedule">Atur jadwal</button></div>' +
    (list.length ? '<ul class="list">' + list.slice(0, 6).map(function(t){ return taskRow(t, S.today); }).join('') + '</ul>' + (list.length > 6 ? '<p class="help">' + (list.length - 6) + ' lagi di tab Jadwal</p>' : '')
                 : '<p class="help">Belum ada jadwal hari ini. Tambahkan gym, Zoom, atau janji temu di tab Jadwal.</p>') + '</div>';
  return html;
}
function renderNames(){
  var root = $('#view-names'), cs = liveContacts(), target = S.config.namesTarget, per = S.config.namesPerDay, done = contactedToday(), counts = {};
  NAME_FILTERS.forEach(function(f){ counts[f[0]] = cs.filter(function(c){ return matchFilter(c, f[0]); }).length; });
  root.innerHTML = '<header><p class="eyebrow">Daftar Nama</p><h1 class="h1g">Nama &amp; Leads</h1></header>' +
    '<section class="game-panel"><div class="nq-row">' +
      '<div><p class="eyebrow">Nama terkumpul</p><p class="nq-big num">' + cs.length + '<span> / ' + target + '</span></p></div>' +
      (per ? '<div><p class="eyebrow">Dihubungi hari ini</p><p class="nq-big num' + (done >= per ? ' ok' : '') + '">' + done + '<span> / ' + per + '</span></p></div>' : '') + '</div>' +
      '<div class="xpbar" role="progressbar" aria-label="Nama terkumpul" aria-valuemin="0" aria-valuemax="' + target + '" aria-valuenow="' + cs.length + '"><i style="width:' + Math.min(100, cs.length / target * 100) + '%"></i></div>' +
      '<div class="q-actions"><button type="button" class="btn btn-primary btn-sm" id="n-add">' + ic('plus', 18, 2.5) + 'Tambah nama</button>' +
      '<button type="button" class="btn btn-line btn-sm" id="n-bulk">Tambah banyak</button>' +
      (counts.nama ? '<button type="button" class="btn btn-line btn-sm" data-pick-names>Pilih nama untuk dihubungi</button>' : '') + '</div></section>' +
    '<section class="panel"><div class="chips" role="group" aria-label="Saring daftar">' + NAME_FILTERS.map(function(f){
        var on = S.nameFilter === f[0];
        return '<button type="button" class="chip-btn' + (on ? ' on' : '') + '" data-nfilter="' + f[0] + '" aria-pressed="' + on + '">' + f[1] + ' <b class="num">' + counts[f[0]] + '</b></button>'; }).join('') + '</div>' +
      '<label class="field" for="n-q" style="margin-top:12px"><span>Cari nama</span><input type="search" id="n-q" placeholder="Ketik nama" autocomplete="off" value="' + esc(S.nameQuery) + '"></label>' +
      '<ul class="list" id="n-list" style="margin-top:6px"></ul></section>';
  paintNameList();
}
function paintNameList(){
  var ul = $('#n-list'); if (!ul) return;
  var all = liveContacts(), q = S.nameQuery.trim().toLowerCase();
  if (!all.length){ ul.innerHTML = '<li class="empty">Daftar Nama masih kosong. Mulai dari 10 orang yang paling kamu kenal: keluarga, teman, rekan kerja. Tekan Tambah nama, atau Tambah banyak untuk menempel daftar sekaligus.</li>'; return; }
  var cs = all.filter(function(c){ return matchFilter(c, S.nameFilter) && (!q || c.name.toLowerCase().indexOf(q) !== -1); });
  cs.sort(function(a, b){ var x = needsFollow(a) ? 0 : 1, y = needsFollow(b) ? 0 : 1; return x - y || String(b.stage_at).localeCompare(String(a.stage_at)); });
  if (!cs.length){ ul.innerHTML = '<li class="empty">' + (q ? 'Tidak ada nama yang cocok dengan "' + esc(S.nameQuery.trim()) + '".' : 'Tidak ada nama di saringan ini.') + '</li>'; return; }
  ul.innerHTML = cs.map(function(c){
    var ds = daysSince(c.stage_at), stale = needsFollow(c);
    return '<li><button type="button" class="contact" data-contact="' + esc(c.id) + '">' +
      '<span class="c-main"><span class="c-name">' + esc(c.name) + '</span><span class="c-sub">' + esc([c.source, c.phone].filter(Boolean).join(' · ') || 'Belum ada detail') + '</span></span>' +
      '<span class="c-right"><span class="stage" data-st="' + c.stage + '">' + esc(stageLabel(c.stage)) + '</span>' +
      '<span class="c-when' + (stale ? ' stale' : '') + '">' + (stale ? 'Hubungi lagi · ' : '') + (ds === 0 ? 'hari ini' : ds + ' hari lalu') + '</span></span></button></li>';
  }).join('');
}
function sourceOptions(sel){ return '<option value="">Pilih sumber</option>' + SOURCES.map(function(x){ return '<option' + (sel === x ? ' selected' : '') + '>' + x + '</option>'; }).join(''); }
function armDelete(btn, run){
  btn.addEventListener('click', function(){
    if (btn.dataset.armed){ run(); return; }
    btn.dataset.armed = '1'; btn.textContent = 'Ketuk lagi untuk menghapus';
    setTimeout(function(){ if (document.contains(btn)){ delete btn.dataset.armed; btn.textContent = 'Hapus'; } }, 4000);
  });
}
function openContact(id){
  var c = id ? S.contacts.get(id) : null, isNew = !c, st = c ? c.stage : 'nama', wa = c ? waLink(c.phone) : '';
  openSheet('<div><h2 id="sheet-title">' + (isNew ? 'Tambah nama' : esc(c.name)) + '</h2><p class="sub">' +
      (isNew ? 'Masuk ke Daftar Nama dengan status Belum dihubungi.' : esc(stageLabel(c.stage)) + ' sejak ' + esc(fmtShort(isoDay(c.stage_at)))) + '</p></div>' +
    (c && c.phone ? '<div class="backfill" style="margin-top:0">' + (wa ? '<a class="chip-btn" href="' + wa + '" target="_blank" rel="noopener">Chat WhatsApp</a>' : '') +
      '<a class="chip-btn" href="tel:' + esc(c.phone.replace(/[^\d+]/g, '')) + '">Telepon ' + esc(c.phone) + '</a></div>' : '') +
    '<label class="field" for="c-name"><span>Nama</span><input type="text" id="c-name" maxlength="60" autocomplete="off" value="' + esc(c ? c.name : '') + '"' + (isNew ? ' autofocus' : '') + '></label>' +
    '<div class="row2" style="margin-top:0"><label class="field" for="c-phone"><span>No. HP / WA</span><input type="text" id="c-phone" inputmode="tel" maxlength="20" autocomplete="off" placeholder="0812..." value="' + esc(c ? c.phone : '') + '"></label>' +
    '<label class="field" for="c-source"><span>Sumber</span><select id="c-source">' + sourceOptions(c ? c.source : '') + '</select></label></div>' +
    (isNew ? '' : '<fieldset class="opts"><legend>Status</legend>' + STAGES.map(function(x){
        var xp = S.config.leadXP && STAGE_IDX[x[0]] > STAGE_IDX[st] ? xpFor(x[0]) : 0;
        return '<label class="opt"><input type="radio" name="c-stage" value="' + x[0] + '"' + (x[0] === st ? ' checked' : '') + '><span>' + x[1] + (xp ? ' <b>+' + xp + '</b>' : '') + '</span></label>'; }).join('') + '</fieldset>') +
    '<label class="field" for="c-note"><span>Catatan</span><textarea id="c-note" maxlength="500" rows="3" placeholder="Contoh: punya 2 anak, tertarik proteksi kesehatan">' + esc(c ? c.note : '') + '</textarea></label>' +
    '<p class="field-err" id="c-err" role="alert"></p>' +
    '<div class="sheet-actions">' + (isNew ? '' : '<button type="button" class="btn btn-danger" id="c-del">Hapus</button><span class="spacer"></span>') +
      '<button type="button" class="btn btn-line" id="c-cancel">Batal</button><button type="button" class="btn btn-primary" id="c-save">Simpan</button></div>',
    function(s){
      $('#c-cancel', s).addEventListener('click', closeSheet);
      $('#c-save', s).addEventListener('click', function(){
        var name = $('#c-name', s).value.trim();
        if (!name){ $('#c-err', s).textContent = 'Nama wajib diisi.'; $('#c-name', s).focus(); return; }
        var r = $('input[name="c-stage"]:checked', s);
        var f = { name: name, phone: $('#c-phone', s).value.trim(), source: $('#c-source', s).value, note: $('#c-note', s).value.trim(), stage: r ? r.value : st };
        closeSheet(); saveContact(c, f);
      });
      if (!isNew) armDelete($('#c-del', s), function(){
        closeSheet(); putContacts([Object.assign({}, c, { deleted_at: new Date().toISOString() })]); toast('<b>' + esc(c.name) + '</b> dihapus dari Daftar Nama');
      });
    });
}
function openBulk(){
  openSheet('<div><h2 id="sheet-title">Tambah banyak nama</h2><p class="sub">Satu nama per baris. Nomor HP boleh ditulis setelah koma.</p></div>' +
    '<label class="field" for="b-text"><span>Daftar nama</span><textarea id="b-text" rows="8" autofocus placeholder="Budi Santoso, 081234567890&#10;Siti Aminah&#10;Pak Joko"></textarea></label>' +
    '<label class="field" for="b-source"><span>Sumber untuk semua nama ini</span><select id="b-source">' + sourceOptions('') + '</select></label>' +
    '<p class="help" id="b-count">0 nama terbaca</p><p class="field-err" id="b-err" role="alert"></p>' +
    '<div class="sheet-actions"><button type="button" class="btn btn-line" id="b-cancel">Batal</button><button type="button" class="btn btn-primary" id="b-save">Tambahkan</button></div>',
    function(s){
      var ta = $('#b-text', s);
      ta.addEventListener('input', function(){ $('#b-count', s).textContent = parseBulk(ta.value).length + ' nama terbaca' + (ta.value.split(/\r?\n/).filter(function(l){ return l.trim(); }).length > 300 ? ' (maksimal 300 sekali tambah)' : ''); });
      $('#b-cancel', s).addEventListener('click', closeSheet);
      $('#b-save', s).addEventListener('click', function(){
        var list = parseBulk(ta.value), src = $('#b-source', s).value;
        if (!list.length){ $('#b-err', s).textContent = 'Belum ada nama. Tulis satu nama per baris.'; ta.focus(); return; }
        var t0 = Date.now();
        var rows = list.map(function(x, i){ var at = new Date(t0 + i).toISOString(); return { id: uuid(), name: x.name, phone: x.phone, source: src, note: '', stage: 'nama', contacted_at: null, stage_at: at, created_at: at, deleted_at: null }; });
        closeSheet(); putContacts(rows); sfx('badge'); toast('<b>' + rows.length + ' nama</b> masuk Daftar Nama');
      });
    });
}
function openPick(){
  var per = S.config.namesPerDay, done = contactedToday();
  var list = liveContacts().filter(function(c){ return c.stage === 'nama'; }).sort(function(a, b){ return String(a.created_at).localeCompare(String(b.created_at)); }).slice(0, 5);
  openSheet('<div><h2 id="sheet-title">Hubungi hari ini</h2><p class="sub">Target ' + per + ' nama per hari, sudah ' + done + '. Ini nama yang paling lama belum dihubungi.</p></div>' +
    (list.length ? '<ul class="list picks">' + list.map(function(c){
        var wa = waLink(c.phone);
        return '<li class="pick"><div><b>' + esc(c.name) + '</b><span class="c-sub">' + esc([c.source, c.phone].filter(Boolean).join(' · ') || 'Belum ada nomor') + '</span></div>' +
          '<div class="backfill" style="margin-top:6px">' + (wa ? '<a class="chip-btn" href="' + wa + '" target="_blank" rel="noopener">Chat WhatsApp</a>' : '') +
          '<button type="button" class="chip-btn" data-mark="' + esc(c.id) + '">' + ic('check', 16, 2.5) + 'Sudah dihubungi</button></div></li>'; }).join('') + '</ul>'
      : '<p class="empty">Semua nama di Daftar Nama sudah pernah dihubungi. Tambah nama baru untuk melanjutkan.</p>') +
    '<div class="sheet-actions">' + (list.length ? '' : '<button type="button" class="btn btn-line" id="pk-add">Tambah nama</button>') + '<button type="button" class="btn btn-primary" id="pk-close">Selesai</button></div>',
    function(s){
      $('#pk-close', s).addEventListener('click', closeSheet);
      var add = $('#pk-add', s); if (add) add.addEventListener('click', function(){ closeSheet(); go('names'); openContact(null); });
      $$('[data-mark]', s).forEach(function(b){ b.addEventListener('click', function(){
        var c = S.contacts.get(b.dataset.mark); if (!c || c.stage !== 'nama') return;
        saveContact(c, { stage: 'chat' });
        b.disabled = true; b.innerHTML = ic('check', 16, 2.5) + 'Tercatat';
      }); });
    });
}

/* ---------- jadwal ---------- */
function isDone(t, date){ return !!S.checks.get(t.id + '|' + date); }
function repeatLabel(t){ var r = t.repeat_days || []; if (!r.length) return 'Sekali'; if (r.length === 7) return 'Setiap hari'; return r.slice().sort().map(function(n){ return WD_SHORT[n - 1]; }).join(', '); }
function taskRow(t, date){
  var d = isDone(t, date);
  return '<li class="task' + (d ? ' done' : '') + '"><label class="tcheck"><input type="checkbox" data-check="' + esc(t.id) + '|' + date + '"' + (d ? ' checked' : '') + ' aria-label="Selesai: ' + esc(t.title) + '"><span aria-hidden="true">' + ic('check', 16, 3) + '</span></label>' +
    '<button type="button" class="t-body" data-task="' + esc(t.id) + '"><span class="t-time num">' + esc(t.at_time || 'Bebas') + '</span>' +
    '<span><span class="t-title">' + esc(t.title) + '</span><span class="t-rep">' + esc(repeatLabel(t)) + '</span></span></button></li>';
}
function renderSchedule(){
  var root = $('#view-schedule'), d = S.planDate, list = tasksForDay(S.tasks, d), fin = list.filter(function(t){ return isDone(t, d); }).length;
  root.innerHTML = '<header><p class="eyebrow">Jadwal' + (d === S.today ? ' hari ini' : '') + '</p><h1 class="h1g">' + esc(fmtLong(d)) + '</h1></header>' +
    '<section class="panel"><div class="cal-head"><button type="button" class="icon-btn" id="p-prev" aria-label="Hari sebelumnya">' + ic('left', 20) + '</button>' +
      '<button type="button" class="btn btn-line btn-sm" id="p-today"' + (d === S.today ? ' disabled' : '') + '>Hari ini</button>' +
      '<button type="button" class="icon-btn" id="p-next" aria-label="Hari berikutnya">' + ic('right', 20) + '</button></div>' +
      '<p class="d-status" style="margin-top:12px"><b>' + fin + ' / ' + list.length + '</b> selesai</p>' +
      '<ul class="list" style="margin-top:4px">' + (list.length ? list.map(function(t){ return taskRow(t, d); }).join('')
        : '<li class="empty">Belum ada jadwal di hari ini. Tambahkan gym, Zoom, atau janji temu dengan nasabah.</li>') + '</ul>' +
      '<div class="q-actions"><button type="button" class="btn btn-primary btn-sm" id="p-add">' + ic('plus', 18, 2.5) + 'Tambah jadwal</button></div></section>';
}
function openTask(id){
  var t = id ? S.tasks.get(id) : null, isNew = !t;
  var rep = !t ? 'once' : !t.repeat_days.length ? 'once' : t.repeat_days.length === 7 ? 'daily' : 'days';
  var days = t && t.repeat_days.length && t.repeat_days.length < 7 ? t.repeat_days : [isoDow(S.planDate)];
  openSheet('<div><h2 id="sheet-title">' + (isNew ? 'Tambah jadwal' : 'Ubah jadwal') + '</h2></div>' +
    '<label class="field" for="tk-title"><span>Kegiatan</span><input type="text" id="tk-title" maxlength="60" autocomplete="off" placeholder="Gym, Zoom dengan Pak Budi, meeting tim" value="' + esc(t ? t.title : '') + '"' + (isNew ? ' autofocus' : '') + '></label>' +
    '<label class="field" for="tk-time"><span>Jam (opsional)</span><input type="time" id="tk-time" value="' + esc(t ? t.at_time : '') + '"></label>' +
    '<fieldset class="opts"><legend>Ulangi</legend>' + [['once','Sekali'],['daily','Setiap hari'],['days','Hari tertentu']].map(function(o){
      return '<label class="opt"><input type="radio" name="tk-rep" value="' + o[0] + '"' + (rep === o[0] ? ' checked' : '') + '><span>' + o[1] + '</span></label>'; }).join('') + '</fieldset>' +
    '<label class="field" for="tk-date" id="tk-date-f"><span>Tanggal</span><input type="date" id="tk-date" value="' + esc(t && t.on_date ? t.on_date : S.planDate) + '"></label>' +
    '<fieldset class="opts" id="tk-days-f"><legend>Hari</legend><div class="daychips" style="margin-top:0">' + [1,2,3,4,5,6,7].map(function(n){
      return '<label class="daychip"><input type="checkbox" data-tkday="' + n + '"' + (days.indexOf(n) !== -1 ? ' checked' : '') + '><span>' + WD_SHORT[n - 1] + '</span></label>'; }).join('') + '</div></fieldset>' +
    '<p class="field-err" id="tk-err" role="alert"></p>' +
    '<div class="sheet-actions">' + (isNew ? '' : '<button type="button" class="btn btn-danger" id="tk-del">Hapus</button><span class="spacer"></span>') +
      '<button type="button" class="btn btn-line" id="tk-cancel">Batal</button><button type="button" class="btn btn-primary" id="tk-save">Simpan</button></div>',
    function(s){
      var sync = function(){ var v = $('input[name="tk-rep"]:checked', s).value; $('#tk-date-f', s).hidden = v !== 'once'; $('#tk-days-f', s).hidden = v !== 'days'; };
      $$('input[name="tk-rep"]', s).forEach(function(r){ r.addEventListener('change', sync); }); sync();
      $('#tk-cancel', s).addEventListener('click', closeSheet);
      $('#tk-save', s).addEventListener('click', function(){
        var title = $('#tk-title', s).value.trim(), v = $('input[name="tk-rep"]:checked', s).value, err = $('#tk-err', s);
        var picked = $$('[data-tkday]', s).filter(function(x){ return x.checked; }).map(function(x){ return Number(x.dataset.tkday); });
        var date = $('#tk-date', s).value;
        if (!title){ err.textContent = 'Tulis nama kegiatannya, misalnya Gym.'; $('#tk-title', s).focus(); return; }
        if (v === 'days' && !picked.length){ err.textContent = 'Pilih minimal satu hari.'; return; }
        if (v === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(date)){ err.textContent = 'Pilih tanggalnya.'; return; }
        var now = new Date().toISOString();
        var row = { id: t ? t.id : uuid(), title: title, at_time: $('#tk-time', s).value || '',
          repeat_days: v === 'once' ? [] : v === 'daily' ? [1,2,3,4,5,6,7] : picked, on_date: v === 'once' ? date : null,
          created_at: t ? t.created_at : (v === 'once' ? now : new Date(Date.parse(S.planDate + 'T00:00:00+07:00')).toISOString()), deleted_at: null };
        closeSheet(); putTask(row); toast(isNew ? 'Jadwal ditambahkan' : 'Jadwal diubah');
      });
      if (!isNew) armDelete($('#tk-del', s), function(){ closeSheet(); putTask(Object.assign({}, t, { deleted_at: new Date().toISOString() })); toast('Jadwal dihapus'); });
    });
}
function putTask(row){
  S.tasks.set(row.id, row); saveCache();
  enqueue({ kind: 'upsert', table: 'tasks', conflict: 'id', row: { id: row.id, title: row.title, at_time: row.at_time, repeat_days: row.repeat_days, on_date: row.on_date, created_at: row.created_at, deleted_at: row.deleted_at } });
  render();
}
function toggleCheck(keyv, done){
  var p = keyv.split('|'), task = p[0], day = p[1];
  S.checks.set(keyv, done); saveCache();
  enqueue({ kind: 'upsert', table: 'task_checks', conflict: 'task_id,day', row: { task_id: task, day: day, done: done } });
  if (done) sfx('tap');
  render();
}
document.addEventListener('change', function(e){
  var c = e.target.closest && e.target.closest('[data-check]'); if (c) toggleCheck(c.dataset.check, c.checked);
});
document.addEventListener('input', function(e){
  if (e.target.id === 'n-q'){ S.nameQuery = e.target.value; paintNameList(); }
});
document.addEventListener('click', function(e){
  var t = e.target;
  var ct = t.closest('[data-contact]'); if (ct){ openContact(ct.dataset.contact); return; }
  var nf = t.closest('[data-nfilter]'); if (nf){ S.nameFilter = nf.dataset.nfilter; renderNames(); var b = $('[data-nfilter="' + S.nameFilter + '"]'); if (b) b.focus(); return; }
  if (t.closest('#n-add')){ openContact(null); return; }
  if (t.closest('#n-bulk')){ openBulk(); return; }
  if (t.closest('[data-pick-names]')){ openPick(); return; }
  var tk = t.closest('[data-task]'); if (tk){ openTask(tk.dataset.task); return; }
  if (t.closest('#p-add')){ openTask(null); return; }
  if (t.closest('#p-prev')){ S.planDate = addDays(S.planDate, -1); renderSchedule(); $('#p-prev').focus(); return; }
  if (t.closest('#p-next')){ S.planDate = addDays(S.planDate, 1); renderSchedule(); $('#p-next').focus(); return; }
  if (t.closest('#p-today')){ S.planDate = S.today; renderSchedule(); $('#p-next').focus(); return; }
});

/* ---------- render root ---------- */
function render(){
  if (S.view === 'today') renderToday();
  else if (S.view === 'progress') renderProgress();
  else if (S.view === 'schedule') renderSchedule();
  else if (S.view === 'names'){ var fa = document.activeElement; if (fa && fa.id === 'n-q') paintNameList(); else renderNames(); }
  else if (S.view === 'settings' && !S.dirty){
    var ae = document.activeElement;
    if (!(ae && $('#view-settings').contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName))) renderSettings();
  }
}

/* ---------- input: taps, long press, keys ---------- */
var lp = { timer: null, fired: false };
document.addEventListener('pointerdown', function(e){
  var b = e.target.closest('.m-plus'); if (!b || b.disabled || e.button !== 0) return;
  lp.fired = false; clearTimeout(lp.timer);
  lp.timer = setTimeout(function(){ lp.fired = true; addEntry(b.dataset.plus, { withNote: true, btn: b }); }, 520);
});
['pointerup','pointercancel'].forEach(function(t){ document.addEventListener(t, function(){ clearTimeout(lp.timer); }, true); });
document.addEventListener('contextmenu', function(e){
  var b = e.target.closest('.m-plus'); if (!b) return;
  e.preventDefault(); clearTimeout(lp.timer);
  if (!lp.fired && !b.disabled){ lp.fired = true; addEntry(b.dataset.plus, { withNote: true, btn: b }); }
});
document.addEventListener('click', function(e){
  var t = e.target;
  var plus = t.closest('.m-plus');
  if (plus){ if (lp.fired){ lp.fired = false; if (e.detail !== 0) return; } addEntry(plus.dataset.plus, { btn: plus }); return; }
  var minus = t.closest('.m-minus');
  if (minus){ var le = lastEntryToday(minus.dataset.minus); if (le) removeEntry(S.today, le.id, false); return; }
  var ent = t.closest('[data-entry]');
  if (ent){ openNote(ent.dataset.date, ent.dataset.entry); return; }
  if (t.closest('#q-recap')){ openRecap(S.today); return; }
  var rc = t.closest('[data-recap]'); if (rc){ openRecap(rc.dataset.recap); return; }
  var cell = t.closest('[data-day]'); if (cell){ S.selDate = cell.dataset.day; renderProgress(); var nc = $('[data-day="' + S.selDate + '"]'); if (nc) nc.focus(); return; }
  var back = t.closest('[data-back]'); if (back){ addEntry(back.dataset.back, { date: S.selDate, backfill: true }); return; }
});
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape' && !$('#sheet-wrap').hidden){ closeSheet(); return; }
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || !$('#sheet-wrap').hidden) return;
  if (S.view !== 'today') return;
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')){ var le = lastEntryToday(); if (le){ e.preventDefault(); removeEntry(S.today, le.id, true); } return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  var n = Number(e.key);
  if (n >= 1 && n <= 9){ var a = activeActs()[n - 1]; if (a){ e.preventDefault(); addEntry(a.id, { btn: $('.m-plus[data-plus="' + CSS.escape(a.id) + '"]') }); } }
});

/* ---------- day rollover ---------- */
function tick(){
  var t = wibDate(Date.now());
  if (t !== S.today){
    var old = S.today; S.today = t;
    if (S.selDate === old) S.selDate = t;
    if (S.planDate === old) S.planDate = t;
    if (S.calMonth === old.slice(0,7) && t.slice(0,7) !== old.slice(0,7)) S.calMonth = t.slice(0,7);
    render();
  }
}
setInterval(tick, 30000);
document.addEventListener('visibilitychange', function(){ if (!document.hidden){ tick(); flush(); pull(); } });

/* ---------- catatan harian (autosave) ---------- */
function journalHTML(day, title){
  var id = 'j-' + day;
  return '<h2 class="panel-title" id="j-title-' + day + '"><label for="' + id + '">' + esc(title) + '</label><span class="count j-status" data-jstatus="' + day + '"></span></h2>' +
    '<textarea class="j-text" id="' + id + '" data-journal="' + day + '" maxlength="2000" rows="4" placeholder="Hari ini ngapain aja? Contoh: ketemu 2 nasabah di Galaxy, follow up lewat WA, ikut training sore."></textarea>' +
    '<p class="help">Tersimpan otomatis ke akunmu saat kamu berhenti mengetik.</p>';
}
function jStatusText(day){
  var st = S.jState[day];
  if (st === 'saving') return 'Menyimpan…';
  if (st === 'error') return 'Belum tersimpan, dicoba lagi otomatis';
  if (st === 'typing') return 'Mengetik…';
  if (st && st.indexOf('ok:') === 0) return 'Tersimpan ' + st.slice(3);
  return '';
}
function paintJournals(onlyDay){
  $$('[data-journal]').forEach(function(t){
    var d = t.dataset.journal; if (onlyDay && d !== onlyDay) return;
    var v = S.journals[d] || '';
    if (document.activeElement !== t && t.value !== v) t.value = v;
  });
  $$('[data-jstatus]').forEach(function(el){ if (!onlyDay || el.dataset.jstatus === onlyDay) el.textContent = jStatusText(el.dataset.jstatus); });
}
function setJState(day, st){ S.jState[day] = st; $$('[data-jstatus="' + day + '"]').forEach(function(el){ el.textContent = jStatusText(day); }); }
function onJournalInput(t){
  var day = t.dataset.journal;
  S.journals[day] = t.value; S.jPending[day] = t.value; lsSet(key('jpending'), S.jPending);
  setJState(day, 'typing');
  clearTimeout(S.jTimers[day]);
  S.jTimers[day] = setTimeout(function(){ saveJournalDay(day); }, 1200);
}
async function saveJournalDay(day){
  if (!(day in S.jPending) || !S.uid) return;
  var body = S.jPending[day];
  setJState(day, 'saving');
  var res;
  try { res = await api.saveJournal(day, body); } catch(e){ res = { error: e }; }
  if (res && res.error){ setJState(day, 'error'); clearTimeout(S.jTimers[day]); S.jTimers[day] = setTimeout(function(){ saveJournalDay(day); }, 15000); return; }
  if (S.jPending[day] === body){ delete S.jPending[day]; lsSet(key('jpending'), S.jPending); }
  saveCache();
  setJState(day, 'ok:' + wibTime(Date.now()));
}
function flushJournals(){ Object.keys(S.jPending).forEach(function(d){ saveJournalDay(d); }); }
document.addEventListener('input', function(e){ if (e.target.matches && e.target.matches('[data-journal]')) onJournalInput(e.target); });
document.addEventListener('focusout', function(e){ if (e.target.matches && e.target.matches('[data-journal]')){ var d = e.target.dataset.journal; if (d in S.jPending){ clearTimeout(S.jTimers[d]); saveJournalDay(d); } } });

/* ---------- server (Supabase) ---------- */
function makeApi(sb){
  var page = 1000;
  return {
    getSession: function(){ return sb.auth.getSession().then(function(r){ return r.data && r.data.session; }); },
    onAuth: function(cb){ return sb.auth.onAuthStateChange(function(ev, session){ cb(ev, session); }); },
    signIn: function(email, pw){ return sb.auth.signInWithPassword({ email: email, password: pw }); },
    signUp: function(email, pw, name){ return sb.auth.signUp({ email: email, password: pw, options: { data: { name: name } } }); },
    signOut: function(){ return sb.auth.signOut({ scope: 'local' }); },
    loadSettings: function(){ return sb.from('settings').select('data').maybeSingle(); },
    loadJournals: function(fromDate){ return sb.from('journals').select('day,body').gte('day', fromDate).limit(1000); },
    fetchTable: async function(table, gteCol, gteVal){
      var all = [], offset = 0;
      for (;;){
        var q = sb.from(table).select('*'); if (gteCol) q = q.gte(gteCol, gteVal);
        var res = await q.order(table === 'task_checks' ? 'day' : 'created_at', { ascending: true }).range(offset, offset + page - 1);
        if (res.error) return { error: res.error };
        all = all.concat(res.data || []);
        if (!res.data || res.data.length < page) return { data: all };
        offset += page;
      }
    },
    upsert: function(table, rows, conflict){ return sb.from(table).upsert(rows, { onConflict: conflict }); },
    saveJournal: function(day, body){ return sb.from('journals').upsert({ user_id: S.uid, day: day, body: body }, { onConflict: 'user_id,day' }); },
    saveSettings: function(data){ return sb.from('settings').upsert({ user_id: S.uid, data: data }, { onConflict: 'user_id' }); },
    fetchEntries: async function(fromDate, since){
      var all = [], offset = 0;
      for (;;){
        var q = sb.from('entries').select('id,entry_date,activity_id,activity_name,points,note,is_backfill,min_target,ideal_target,created_at,updated_at,deleted_at');
        q = since ? q.gt('updated_at', since).order('updated_at', { ascending: true }) : q.gte('entry_date', fromDate).order('created_at', { ascending: true });
        var res = await q.range(offset, offset + page - 1);
        if (res.error) return { error: res.error };
        all = all.concat(res.data || []);
        if (!res.data || res.data.length < page) return { data: all };
        offset += page;
      }
    },
    insertEntry: function(row){ return sb.from('entries').upsert(row, { onConflict: 'id', ignoreDuplicates: true }); },
    patchEntry: function(id, patch){ return sb.from('entries').update(patch).eq('id', id); },
    getToken: function(){ return sb.from('sheet_tokens').select('token').maybeSingle(); },
    setToken: function(token){ return sb.from('sheet_tokens').upsert({ user_id: S.uid, token: token }, { onConflict: 'user_id' }); },
    subscribe: function(uidv, onEntry, onSettings, onJournal, onRow){
      return sb.channel('poin-' + uidv)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'entries', filter: 'user_id=eq.' + uidv }, function(p){ if (p.new && p.new.id) onEntry(p.new); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: 'user_id=eq.' + uidv }, function(p){ if (p.new && p.new.data) onSettings(p.new); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'journals', filter: 'user_id=eq.' + uidv }, function(p){ if (p.new && p.new.day) onJournal(p.new); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: 'user_id=eq.' + uidv }, function(p){ if (p.new && p.new.id) onRow('contacts', p.new); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: 'user_id=eq.' + uidv }, function(p){ if (p.new && p.new.id) onRow('tasks', p.new); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_checks', filter: 'user_id=eq.' + uidv }, function(p){ if (p.new && p.new.task_id) onRow('task_checks', p.new); })
        .subscribe();
    },
    unsubscribe: function(ch){ if (ch) sb.removeChannel(ch); }
  };
}
var api = null;

function maxUpdated(rows, cur){ rows.forEach(function(r){ if (r.updated_at && (!cur || r.updated_at > cur)) cur = r.updated_at; }); return cur; }
async function pull(){
  if (!S.uid || S.pulling || !S.lastPull) return;
  S.pulling = true;
  try {
    var res = await api.fetchEntries(null, S.lastPull);
    if (!res.error && res.data.length){ S.dbDays = applyRows(S.dbDays, res.data); S.lastPull = maxUpdated(res.data, S.lastPull); saveCache(); render(); }
  } catch(e){}
  S.pulling = false;
}

async function startSession(session){
  var u = session.user;
  if (S.uid === u.id) return;
  S.uid = u.id;
  S.user = { id: u.id, email: u.email || '', name: (u.user_metadata && u.user_metadata.name) || '' };
  var cache = lsGet(key('cache')) || {};
  S.config = normalizeConfig(cache.config || { recapName: S.user.name });
  S.dbDays = new Map(Object.entries(cache.days || {}));
  S.journals = Object.assign({}, cache.journals || {}, lsGet(key('jpending')) || {});
  S.jPending = lsGet(key('jpending')) || {}; S.jState = {};
  S.pending = lsGet(key('pending')) || [];
  S.contacts = new Map((cache.contacts || []).map(function(r){ return [r.id, r]; }));
  S.tasks = new Map((cache.tasks || []).map(function(r){ return [r.id, r]; }));
  S.checks = new Map(Object.entries(cache.checks || {}));
  S.pending.forEach(function(op){ if (op.kind === 'upsert') applyUpsertOp(op); });
  S.sheet = { state: 'idle', token: null };
  showScreen('app'); go('today'); setSync('loading');
  try {
    var st = await api.loadSettings();
    if (st.error) throw st.error;
    if (st.data && st.data.data) S.config = normalizeConfig(st.data.data);
    else if (!cache.config) S.config = normalizeConfig({ recapName: S.user.name || S.user.email.split('@')[0] });
    var res = await api.fetchEntries(addDays(S.today, -400), null);
    if (res.error) throw res.error;
    S.dbDays = applyRows(new Map(), res.data);
    S.lastPull = maxUpdated(res.data, null) || new Date(0).toISOString();
    var jr = await api.loadJournals(addDays(S.today, -400));
    if (!jr.error){ (jr.data || []).forEach(function(r){ if (!(r.day in S.jPending)) S.journals[r.day] = r.body || ''; }); }
    var cr = await api.fetchTable('contacts'), tr = await api.fetchTable('tasks'), kr = await api.fetchTable('task_checks', 'day', addDays(S.today, -60));
    if (!cr.error) S.contacts = new Map(cr.data.map(function(r){ return [r.id, r]; }));
    if (!tr.error) S.tasks = new Map(tr.data.map(function(r){ return [r.id, r]; }));
    if (!kr.error) S.checks = new Map(kr.data.map(function(r){ return [r.task_id + '|' + r.day, !!r.done]; }));
    S.pending.forEach(function(op){ if (op.kind === 'upsert') applyUpsertOp(op); });
    showBanner(''); saveCache(); setSync('ok'); render(); flushJournals();
    S.channel = api.subscribe(S.uid,
      function(row){ S.dbDays = applyRows(S.dbDays, [row]); S.lastPull = maxUpdated([row], S.lastPull); saveCache(); render(); },
      function(row){ if (!S.dirty){ S.config = normalizeConfig(row.data); saveCache(); render(); } },
      function(row){ if (row.day in S.jPending) return; S.journals[row.day] = row.body || ''; saveCache(); paintJournals(row.day); },
      function(table, row){ applyUpsertOp({ table: table, row: row }); saveCache(); if (S.view !== 'settings') render(); });
    flush();
  } catch(err){
    var off = navigator.onLine === false || isNetErr(err);
    setSync(off ? 'offline' : 'error');
    showBanner(off ? 'Sedang offline. XP yang tampil dari perangkat ini, dan aksi baru dikirim otomatis saat online.' : 'Data akun belum bisa dimuat: ' + (err.message || 'galat tak dikenal') + '. Coba muat ulang.');
    render();
    if (off) window.addEventListener('online', function retry(){ window.removeEventListener('online', retry); S.uid = null; startSession(session); });
  }
}
async function logout(){
  try { await api.signOut(); } catch(e){}
  endSession();
}
function endSession(){
  if (S.uid){ try { localStorage.removeItem(key('cache')); localStorage.removeItem(key('pending')); localStorage.removeItem(key('jpending')); } catch(e){} }
  api.unsubscribe(S.channel);
  S.channel = null; S.uid = null; S.user = null; S.dbDays = new Map(); S.pending = []; S.lastPull = null; S.journals = {}; S.jPending = {}; S.jState = {};
  S.contacts = new Map(); S.tasks = new Map(); S.checks = new Map(); S.nameFilter = 'all'; S.nameQuery = '';
  S.config = normalizeConfig(null); S.draft = null; S.dirty = false; S.sheet = { state: 'idle', token: null };
  VIEWS.forEach(function(v){ var r = $('#view-' + v); r.innerHTML = ''; delete r.dataset.sig; });
  showBanner(''); showScreen('auth');
}

/* ---------- sign in / sign up ---------- */
var authMode = 'in';
function showScreen(name){
  $('#boot').hidden = true;
  $('#setup').hidden = name !== 'setup';
  $('#auth').hidden = name !== 'auth';
  $('#shell').hidden = name !== 'app';
  $('.tabbar').hidden = name !== 'app';
  if (name === 'auth') setAuthMode(authMode, true);
}
function setAuthMode(mode, keepFocus){
  authMode = mode;
  var up = mode === 'up';
  $('#auth-tab-in').setAttribute('aria-selected', String(!up));
  $('#auth-tab-up').setAttribute('aria-selected', String(up));
  $('#f-name').hidden = !up;
  $('#auth-pass').setAttribute('autocomplete', up ? 'new-password' : 'current-password');
  $('#auth-submit').textContent = up ? 'Buat akun' : 'Masuk';
  $('#auth-help').textContent = up ? 'Kata sandi minimal 8 karakter. Simpan baik-baik: atur ulang kata sandi dilakukan oleh admin tim.' : 'Lupa kata sandi? Minta admin tim mengatur ulang dari Supabase.';
  $('#auth-err').textContent = '';
  if (!keepFocus) $(up ? '#auth-name' : '#auth-email').focus();
}
$('#auth-tab-in').addEventListener('click', function(){ setAuthMode('in'); });
$('#auth-tab-up').addEventListener('click', function(){ setAuthMode('up'); });
$('#auth-form').addEventListener('submit', async function(e){
  e.preventDefault();
  var email = $('#auth-email').value.trim(), pw = $('#auth-pass').value, name = $('#auth-name').value.trim();
  var err = $('#auth-err'), btn = $('#auth-submit');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ err.textContent = 'Tulis email yang benar, contoh: nama@gmail.com.'; $('#auth-email').focus(); return; }
  if (pw.length < 8){ err.textContent = 'Kata sandi minimal 8 karakter.'; $('#auth-pass').focus(); return; }
  err.textContent = ''; btn.disabled = true; btn.textContent = authMode === 'up' ? 'Membuat akun…' : 'Masuk…';
  try {
    var res = authMode === 'up' ? await api.signUp(email, pw, name) : await api.signIn(email, pw);
    if (res.error) throw res.error;
    if (!res.data || !res.data.session){
      err.textContent = 'Akun dibuat, tapi Supabase masih meminta konfirmasi email. Admin perlu mematikan "Confirm email", lalu pilih Masuk.';
    } else {
      $('#auth-pass').value = '';
      startSession(res.data.session);
    }
  } catch(ex){ err.textContent = authMessage(ex); }
  btn.disabled = false; btn.textContent = authMode === 'up' ? 'Buat akun' : 'Masuk';
});

/* ---------- boot ---------- */
(async function boot(){
  var ready = CFG.supabaseUrl && CFG.supabaseKey && !/ISI-/.test(CFG.supabaseUrl + CFG.supabaseKey);
  if (!ready || !window.supabase){ showScreen('setup'); return; }
  api = window.__POIN_TEST_API__ || makeApi(window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'poinq.auth' } }));
  api.onAuth(function(ev, session){
    if (ev === 'SIGNED_OUT'){ if (S.uid) endSession(); }
    else if (session && ev === 'SIGNED_IN' && !S.uid) startSession(session);
  });
  var session = null;
  try { session = await api.getSession(); } catch(e){}
  if (session) startSession(session); else showScreen('auth');
})();
if ('serviceWorker' in navigator && location.protocol === 'https:'){
  window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
}
})();
