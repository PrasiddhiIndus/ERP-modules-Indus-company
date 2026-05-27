import { parseFormula, extractDependencies } from './parser';
import { buildVariableMap } from './variables';

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function truthy(n) {
  return toNumber(n) !== 0;
}

function evalNode(node, vars) {
  if (!node) return 0;
  switch (node.type) {
    case 'number':
      return node.value;
    case 'var': {
      const key = node.name;
      if (Object.prototype.hasOwnProperty.call(vars, key)) return toNumber(vars[key]);
      const alt = Object.keys(vars).find((k) => k.toLowerCase() === key.toLowerCase());
      return alt ? toNumber(vars[alt]) : 0;
    }
    case 'unary':
      return node.op === '-' ? -toNumber(evalNode(node.arg, vars)) : toNumber(evalNode(node.arg, vars));
    case 'binary': {
      const l = evalNode(node.left, vars);
      const r = evalNode(node.right, vars);
      if (node.op === '+') return l + r;
      if (node.op === '-') return l - r;
      if (node.op === '*') return l * r;
      if (node.op === '/') return r === 0 ? 0 : l / r;
      return 0;
    }
    case 'compare': {
      const l = evalNode(node.left, vars);
      const r = evalNode(node.right, vars);
      if (node.op === '<') return truthy(l < r);
      if (node.op === '>') return truthy(l > r);
      if (node.op === '<=') return truthy(l <= r);
      if (node.op === '>=') return truthy(l >= r);
      if (node.op === '==') return truthy(l === r);
      return 0;
    }
    case 'call': {
      const args = node.args.map((a) => evalNode(a, vars));
      switch (node.name) {
        case 'round':
          return Number(toNumber(args[0]).toFixed(Math.max(0, toNumber(args[1]))));
        case 'min':
          return Math.min(toNumber(args[0]), toNumber(args[1]));
        case 'max':
          return Math.max(toNumber(args[0]), toNumber(args[1]));
        case 'prorate': {
          const monthly = toNumber(args[0]);
          const md = toNumber(args[1]);
          const pd = toNumber(args[2]);
          if (md <= 0) return 0;
          return (monthly / md) * pd;
        }
        case 'if':
          return truthy(args[0]) ? toNumber(args[1]) : toNumber(args[2]);
        default:
          throw new Error(`Unknown function: ${node.name}`);
      }
    }
    default:
      return 0;
  }
}

export function evaluateFormula(formulaText, ctx, componentValues = {}) {
  const trimmed = String(formulaText || '').trim();
  if (!trimmed) return 0;
  const ast = parseFormula(trimmed);
  const vars = buildVariableMap(ctx, componentValues);
  return evalNode(ast, vars);
}

export function validateFormula(formulaText, knownComponentCodes = []) {
  const trimmed = String(formulaText || '').trim();
  if (!trimmed) return { ok: true, deps: [], ast: null };
  try {
    const ast = parseFormula(trimmed);
    const deps = extractDependencies(ast);
    const reserved = new Set(['Gross', 'CTC', 'PresentDays', 'MonthDays', 'PaidDays', 'FixedAmount', 'Basic']);
    const unknown = deps.filter(
      (d) => !reserved.has(d) && !knownComponentCodes.some((c) => c.toLowerCase() === d.toLowerCase())
    );
    if (unknown.length) {
      return { ok: false, error: `Unknown variables: ${unknown.join(', ')}`, deps };
    }
    return { ok: true, deps, ast };
  } catch (e) {
    return { ok: false, error: e.message || String(e), deps: [] };
  }
}

export function resolveComponentOrder(formulasByCode) {
  const codes = Object.keys(formulasByCode);
  const graph = new Map(codes.map((c) => [c, new Set()]));
  codes.forEach((code) => {
    const v = validateFormula(formulasByCode[code], codes);
    (v.deps || []).forEach((dep) => {
      const match = codes.find((c) => c.toLowerCase() === dep.toLowerCase());
      if (match && match !== code) graph.get(code).add(match);
    });
  });
  const sorted = [];
  const temp = new Set();
  const perm = new Set();
  const visit = (n) => {
    if (perm.has(n)) return;
    if (temp.has(n)) throw new Error(`Circular formula dependency involving ${n}`);
    temp.add(n);
    graph.get(n)?.forEach(visit);
    temp.delete(n);
    perm.add(n);
    sorted.push(n);
  };
  codes.forEach(visit);
  return sorted;
}

export { parseFormula, extractDependencies, buildVariableMap };
