// Lezer owns context and incremental parsing, including arbitrarily long code fences.
export const mathMarkdown = {
  defineNodes: [{ name: 'BlockMath', block: true }, 'InlineMath'],
  parseBlock: [{
    name: 'BlockMath', after: 'FencedCode',
    parse(cx, line) {
      if (line.text.slice(line.pos).trim() !== '$$') return false;
      const from = cx.lineStart + line.pos;
      let to = cx.lineStart + line.text.length;
      while (cx.nextLine()) {
        to = cx.lineStart + line.text.length;
        if (line.text.slice(line.pos).trim() === '$$') {
          cx.addElement(cx.elt('BlockMath', from, to));
          cx.nextLine();
          return true;
        }
      }
      // Keep unfinished math as source; a later closing delimiter reparses this block.
      cx.addElement(cx.elt('BlockMath', from, to));
      return true;
    },
    endLeaf: (_cx, line) => line.text.slice(line.pos).trim() === '$$'
  }],
  parseInline: [{
    name: 'InlineMath', after: 'InlineCode',
    parse(cx, next, pos) {
      if (next !== 36 || cx.char(pos - 1) === 92 || cx.char(pos - 1) === 36) return -1;
      const size = cx.char(pos + 1) === 36 ? 2 : 1;
      for (let end = pos + size; end < cx.end; end++) {
        if (cx.char(end) === 10) return -1;
        if (cx.char(end) === 36 && cx.char(end - 1) !== 92 &&
            (size === 1 ? cx.char(end + 1) !== 36 : cx.char(end + 1) === 36)) {
          if (end === pos + size) return -1;
          return cx.addElement(cx.elt('InlineMath', pos, end + size));
        }
      }
      return -1;
    }
  }]
};
