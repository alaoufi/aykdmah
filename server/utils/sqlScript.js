// Split SQL without treating delimiters inside strings, comments or PostgreSQL
// dollar-quoted function bodies as statement boundaries.
function splitSql(sql) {
  const statements = [];
  let buffer = '', quote = null, dollar = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i], next = sql[i + 1];
    if (dollar) {
      if (sql.startsWith(dollar, i)) { buffer += dollar; i += dollar.length - 1; dollar = null; }
      else buffer += ch;
      continue;
    }
    if (quote) {
      buffer += ch;
      if (ch === quote && next === quote) { buffer += next; i++; }
      else if (ch === quote) quote = null;
      else if (ch === '\\' && next) { buffer += next; i++; }
      continue;
    }
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      buffer += '\n'; continue;
    }
    if (ch === '/' && next === '*') {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      i--; buffer += ' '; continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; buffer += ch; continue; }
    if (ch === '$') {
      const tag = sql.slice(i).match(/^(\$\$|\$[A-Za-z_][A-Za-z_0-9]*\$)/)?.[0];
      if (tag) { dollar = tag; buffer += tag; i += tag.length - 1; continue; }
    }
    if (ch === ';') {
      if (buffer.trim()) statements.push(buffer.trim());
      buffer = '';
    } else buffer += ch;
  }
  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}
module.exports = { splitSql };
