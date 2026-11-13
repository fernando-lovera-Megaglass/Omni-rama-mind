// Filter operators by property type, as in the original: a text property offers "es igual a cualquiera de",
// "contiene exactamente"…, a number "es mayor que", "está entre"…, a date "es anterior a", "este mes"…,
// a list "es cualquiera de" / "no es ninguno de". `evalCondition` applies one condition to one record's values.
import { TODAY, strip } from './data.js';

export const OP_SETS = {
  text: [
    ['in', 'es igual a cualquiera de'], ['nin', 'no es igual a ninguno de'], ['contains', 'contiene exactamente'], ['ncontains', 'no contiene exactamente'],
    ['starts', 'comienza con'], ['ends', 'termina con'], ['filled', 'es conocido'], ['empty', 'es desconocido'],
  ],
  number: [
    ['eq', 'es igual a'], ['neq', 'no es igual a'], ['gt', 'es mayor que'], ['gte', 'es mayor o igual que'], ['lt', 'es menor que'], ['lte', 'es menor o igual que'],
    ['between', 'está entre'], ['nbetween', 'no está entre'], ['filled', 'es conocido'], ['empty', 'es desconocido'],
  ],
  date: [
    ['on', 'es igual a'], ['before', 'es anterior a'], ['after', 'es posterior a'], ['between', 'está entre'], ['lastdays', 'es de hace menos de (días)'], ['olderdays', 'es de hace más de (días)'],
    ['today', 'es hoy'], ['yesterday', 'es ayer'], ['thisweek', 'es esta semana'], ['lastweek', 'es la semana pasada'], ['thismonth', 'es este mes'], ['lastmonth', 'es el mes pasado'],
    ['thisquarter', 'es este trimestre'], ['thisyear', 'es este año'], ['lastyear', 'es el año pasado'], ['filled', 'es conocido'], ['empty', 'es desconocido'],
  ],
  enum: [['anyof', 'es cualquiera de'], ['noneof', 'no es ninguno de'], ['filled', 'es conocido'], ['empty', 'es desconocido']],
  bool: [['anyof', 'es igual a'], ['filled', 'es conocido'], ['empty', 'es desconocido']],
};
export const NO_VALUE_OPS = new Set(['filled', 'empty', 'today', 'yesterday', 'thisweek', 'lastweek', 'thismonth', 'lastmonth', 'thisquarter', 'thisyear', 'lastyear']);
export const TWO_VALUE_OPS = new Set(['between', 'nbetween']);
export const MULTI_OPS = new Set(['in', 'nin', 'anyof', 'noneof']);
export const DAYS_OPS = new Set(['lastdays', 'olderdays']);

// Which operator family a property kind belongs to.
export function kindGroup(kind) {
  if (['number', 'currency', 'percent', 'id'].includes(kind)) return 'number';
  if (kind === 'date' || kind === 'datetime') return 'date';
  if (['enum', 'user', 'stage', 'status', 'priority'].includes(kind)) return 'enum';
  if (kind === 'bool') return 'bool';
  return 'text';
}
export const opsFor = (group) => OP_SETS[group] || OP_SETS.text;
export function opLabel(op) {
  for (const set of Object.values(OP_SETS)) {
    const hit = set.find((o) => o[0] === op);
    if (hit) return hit[1];
  }
  return op;
}
// Operators saved by earlier versions (is/not/contains/gt/lt) are mapped onto the family of the property.
export function normalizeOp(op, group) {
  const set = opsFor(group);
  if (set.some((o) => o[0] === op)) return op;
  const legacy = {
    text: { is: 'in', not: 'nin', contains: 'contains', gt: 'in', lt: 'in' },
    number: { is: 'eq', not: 'neq', contains: 'eq', gt: 'gt', lt: 'lt' },
    date: { is: 'on', not: 'on', contains: 'on', gt: 'after', lt: 'before' },
    enum: { is: 'anyof', not: 'noneof', contains: 'anyof', gt: 'anyof', lt: 'anyof' },
    bool: { is: 'anyof', not: 'anyof', contains: 'anyof', gt: 'anyof', lt: 'anyof' },
  };
  return (legacy[group] || legacy.text)[op] || set[0][0];
}

// The wanted values of a condition as a list of comparable strings ("a, b" or ["a", "b"]).
// Several values may be typed separated by ";" (Boston; Chicago), by "," or one per line.
export const wantedList = (value) =>
  (Array.isArray(value) ? value : String(value ?? '').split(/[;,\n]/)).map((v) => strip(String(v).trim())).filter(Boolean);

const DAY = 86400000;
const isNum = (n) => typeof n === 'number' && !Number.isNaN(n);
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const parseDay = (s) => {
  if (!s) return NaN;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? NaN : startOfDay(t);
};
const todayStart = () => startOfDay(TODAY.getTime());
const weekStart = (ms) => { const d = new Date(startOfDay(ms)); const dow = (d.getDay() + 6) % 7; return d.getTime() - dow * DAY; };
const inRange = (d, from, to) => isNum(d) && d >= from && d < to;
const EMPTY = (t) => !t || t === '—' || t === '--';

// v = { text, raw, num, date, group }: how the record's value reads, its raw value, as a number, as a timestamp.
export function evalCondition(cond, v) {
  const op = cond.op;
  const text = strip(v.text ?? '');
  const rawTxt = strip(v.raw ?? '');
  const wanted = wantedList(cond.value);
  const n1 = Number(cond.value);
  const n2 = Number(cond.value2);
  const num = v.num;
  const date = v.date;
  const T0 = todayStart();
  switch (op) {
    case 'filled': return !EMPTY(text);
    case 'empty': return EMPTY(text);
    case 'is': case 'in': case 'anyof': return wanted.length === 0 || wanted.some((w) => w === text || w === rawTxt);
    case 'not': case 'nin': case 'noneof': return !wanted.some((w) => w === text || w === rawTxt);
    case 'contains': return !EMPTY(text) && wanted.some((w) => text.includes(w));
    case 'ncontains': return !wanted.some((w) => text.includes(w));
    case 'starts': return !EMPTY(text) && wanted.some((w) => text.startsWith(w));
    case 'ends': return !EMPTY(text) && wanted.some((w) => text.endsWith(w));
    case 'eq': return isNum(num) && num === n1;
    case 'neq': return !(isNum(num) && num === n1);
    case 'gt': return isNum(num) && num > n1;
    case 'gte': return isNum(num) && num >= n1;
    case 'lt': return isNum(num) && num < n1;
    case 'lte': return isNum(num) && num <= n1;
    case 'between': {
      if (v.group === 'date') return inRange(date, parseDay(cond.value), parseDay(cond.value2) + DAY);
      return isNum(num) && num >= Math.min(n1, n2) && num <= Math.max(n1, n2);
    }
    case 'nbetween': return !(isNum(num) && num >= Math.min(n1, n2) && num <= Math.max(n1, n2));
    case 'on': return inRange(date, parseDay(cond.value), parseDay(cond.value) + DAY);
    case 'before': return isNum(date) && date < parseDay(cond.value);
    case 'after': return isNum(date) && date >= parseDay(cond.value) + DAY;
    case 'lastdays': return isNum(date) && date >= T0 - n1 * DAY;
    case 'olderdays': return isNum(date) && date < T0 - n1 * DAY;
    case 'today': return inRange(date, T0, T0 + DAY);
    case 'yesterday': return inRange(date, T0 - DAY, T0);
    case 'thisweek': return inRange(date, weekStart(T0), weekStart(T0) + 7 * DAY);
    case 'lastweek': return inRange(date, weekStart(T0) - 7 * DAY, weekStart(T0));
    case 'thismonth': { const d = new Date(T0); return inRange(date, new Date(d.getFullYear(), d.getMonth(), 1).getTime(), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()); }
    case 'lastmonth': { const d = new Date(T0); return inRange(date, new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), new Date(d.getFullYear(), d.getMonth(), 1).getTime()); }
    case 'thisquarter': { const d = new Date(T0); const q = Math.floor(d.getMonth() / 3) * 3; return inRange(date, new Date(d.getFullYear(), q, 1).getTime(), new Date(d.getFullYear(), q + 3, 1).getTime()); }
    case 'thisyear': { const y = new Date(T0).getFullYear(); return inRange(date, new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime()); }
    case 'lastyear': { const y = new Date(T0).getFullYear(); return inRange(date, new Date(y - 1, 0, 1).getTime(), new Date(y, 0, 1).getTime()); }
    default: return true;
  }
}

// Values of a raw record field for `evalCondition`, given how it reads on screen and its kind group.
export function conditionValues(raw, text, group, dateMs) {
  const empty = raw === undefined || raw === null || raw === '';
  const num = group === 'number' && !empty ? Number(String(raw).replace(/[^\d.-]/g, '')) : NaN;
  const date = group === 'date' && !empty ? (isNum(dateMs) ? dateMs : new Date(raw).getTime()) : NaN;
  return { text, raw: typeof raw === 'object' ? '' : raw, num, date, group };
}
