// Pandoc multiline tables use display columns rather than pipe delimiters.
const width = char => /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(char) ? 2 : 1;
function cells(line, starts) {
  const result = starts.map(() => '');
  let column = 0, index = 0;
  for (const char of line.replace(/^  /, '')) {
    while (index + 1 < starts.length && column >= starts[index + 1]) index++;
    result[index] += char;
    column += width(char);
  }
  return result.map(cell => cell.trim());
}
export function normalizePandocTables(text) {
  const lines = text.split('\n');
  const out = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      out.push(line); continue;
    }
    if (fence || !/^  -{5,}\s*$/.test(line)) { out.push(line); continue; }
    let separator = i + 1;
    while (separator < lines.length && separator <= i + 10 && !/^  -{3,}(?: +-{3,})+\s*$/.test(lines[separator])) separator++;
    if (separator >= lines.length || separator > i + 10) { out.push(line); continue; }
    let end = separator + 1;
    while (end < lines.length && !/^  -{5,}\s*$/.test(lines[end])) end++;
    if (end === lines.length || lines.slice(i + 1, end).some(row => row.trim() && !row.startsWith('  '))) { out.push(line); continue; }
    const starts = [...lines[separator].slice(2).matchAll(/-+/g)].map(match => match.index);
    const rows = [];
    let current = starts.map(() => []);
    const flush = () => { if (current.some(cell => cell.length)) rows.push(current.map(cell => cell.join(' '))); current = starts.map(() => []); };
    const add = row => cells(row, starts).forEach((cell, n) => { if (cell) current[n].push(cell); });
    for (let j = i + 1; j < separator; j++) add(lines[j]);
    flush();
    for (let j = separator + 1; j < end; j++) {
      if (!lines[j].trim()) flush(); else add(lines[j]);
    }
    flush();
    if (rows.length < 2) { out.push(line); continue; }
    const format = row => '| ' + row.map(cell => cell.replace(/\|/g, '\\|')).join(' | ') + ' |';
    out.push(format(rows[0]), format(starts.map(() => '---')), ...rows.slice(1).map(format));
    i = end;
  }
  return out.join('\n');
}
