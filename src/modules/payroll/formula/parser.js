/**
 * Safe payroll formula parser → AST.
 * Supports: numbers, identifiers, + - * /, parentheses, function calls.
 */

const TOKEN_TYPES = {
  NUMBER: 'NUMBER',
  IDENT: 'IDENT',
  OP: 'OP',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  EOF: 'EOF',
};

function tokenize(input) {
  const s = String(input || '').trim();
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j += 1;
      tokens.push({ type: TOKEN_TYPES.NUMBER, value: parseFloat(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j += 1;
      tokens.push({ type: TOKEN_TYPES.IDENT, value: s.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/'.includes(ch)) {
      tokens.push({ type: TOKEN_TYPES.OP, value: ch });
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: TOKEN_TYPES.LPAREN });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: TOKEN_TYPES.RPAREN });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: TOKEN_TYPES.COMMA });
      i += 1;
      continue;
    }
    if (ch === '<' || ch === '>' || ch === '=') {
      let j = i + 1;
      if (s[j] === '=') j += 1;
      tokens.push({ type: TOKEN_TYPES.OP, value: s.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" at position ${i + 1}`);
  }
  tokens.push({ type: TOKEN_TYPES.EOF });
  return tokens;
}

export function parseFormula(input) {
  const tokens = tokenize(input);
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = (type, value) => {
    const t = tokens[pos];
    if (type && t.type !== type) throw new Error(`Expected ${type}, got ${t.type}`);
    if (value !== undefined && t.value !== value) throw new Error(`Expected "${value}"`);
    pos += 1;
    return t;
  };

  function parseExpression() {
    return parseComparison();
  }

  function parseComparison() {
    let node = parseAdditive();
    const t = peek();
    if (t.type === TOKEN_TYPES.OP && (t.value === '<' || t.value === '>' || t.value === '<=' || t.value === '>=' || t.value === '==')) {
      const op = consume(TOKEN_TYPES.OP).value;
      const right = parseAdditive();
      return { type: 'compare', op, left: node, right };
    }
    return node;
  }

  function parseAdditive() {
    let node = parseMultiplicative();
    while (peek().type === TOKEN_TYPES.OP && (peek().value === '+' || peek().value === '-')) {
      const op = consume(TOKEN_TYPES.OP).value;
      const right = parseMultiplicative();
      node = { type: 'binary', op, left: node, right };
    }
    return node;
  }

  function parseMultiplicative() {
    let node = parseUnary();
    while (peek().type === TOKEN_TYPES.OP && (peek().value === '*' || peek().value === '/')) {
      const op = consume(TOKEN_TYPES.OP).value;
      const right = parseUnary();
      node = { type: 'binary', op, left: node, right };
    }
    return node;
  }

  function parseUnary() {
    if (peek().type === TOKEN_TYPES.OP && peek().value === '-') {
      consume(TOKEN_TYPES.OP, '-');
      return { type: 'unary', op: '-', arg: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (t.type === TOKEN_TYPES.NUMBER) {
      consume(TOKEN_TYPES.NUMBER);
      return { type: 'number', value: t.value };
    }
    if (t.type === TOKEN_TYPES.IDENT) {
      const name = consume(TOKEN_TYPES.IDENT).value;
      if (peek().type === TOKEN_TYPES.LPAREN) {
        consume(TOKEN_TYPES.LPAREN);
        const args = [];
        if (peek().type !== TOKEN_TYPES.RPAREN) {
          args.push(parseExpression());
          while (peek().type === TOKEN_TYPES.COMMA) {
            consume(TOKEN_TYPES.COMMA);
            args.push(parseExpression());
          }
        }
        consume(TOKEN_TYPES.RPAREN);
        return { type: 'call', name: name.toLowerCase(), args };
      }
      return { type: 'var', name };
    }
    if (t.type === TOKEN_TYPES.LPAREN) {
      consume(TOKEN_TYPES.LPAREN);
      const node = parseExpression();
      consume(TOKEN_TYPES.RPAREN);
      return node;
    }
    throw new Error(`Unexpected token ${t.type}`);
  }

  const ast = parseExpression();
  if (peek().type !== TOKEN_TYPES.EOF) throw new Error('Unexpected tokens after expression');
  return ast;
}

export function extractDependencies(ast) {
  const deps = new Set();
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'var') deps.add(node.name);
    if (node.type === 'binary' || node.type === 'compare') {
      walk(node.left);
      walk(node.right);
    }
    if (node.type === 'unary') walk(node.arg);
    if (node.type === 'call') node.args.forEach(walk);
  };
  walk(ast);
  return Array.from(deps);
}
