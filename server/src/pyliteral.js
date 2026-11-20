/**
 * Python sözlük gösterimini (repr) JavaScript değerine çevirir.
 * Bazı GenAI akışları JSON yerine Python dict'i metne çevirip döner:
 *   {'summary': 'x', 'ok': True, 'dup': None, "comment": "l'avion\\n..."}
 * Desteklenen: dict, list, tuple, '…' / "…" / '''…''' dizgeler (kaçışlarla), sayılar, True/False/None,
 * ayrıca JSON'un true/false/null'u. Desteklenmeyen bir şey görülürse null döner (yanlış veri üretmez).
 */
export function parsePyLiteral(text) {
  const s = String(text ?? '')
  let i = 0
  const fail = () => { throw new Error('py') }
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++ }
  const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', a: '\x07', '0': '\0', '\\': '\\', "'": "'", '"': '"', '\n': '' }
  function str() {
    let prefix = ''
    while (/[rRbBuU]/.test(s[i])) prefix += s[i++]
    const raw = /r/i.test(prefix)
    const q = s[i]
    if (q !== "'" && q !== '"') fail()
    const triple = s.startsWith(q.repeat(3), i)
    const end = triple ? q.repeat(3) : q
    i += end.length
    let out = ''
    while (i < s.length) {
      if (s.startsWith(end, i)) { i += end.length; return out }
      const c = s[i]
      if (c === '\\' && !raw) {
        const n = s[i + 1]
        if (n === 'x') { out += String.fromCharCode(parseInt(s.slice(i + 2, i + 4), 16)); i += 4; continue }
        if (n === 'u') { out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16)); i += 6; continue }
        if (n === 'U') { out += String.fromCodePoint(parseInt(s.slice(i + 2, i + 10), 16)); i += 10; continue }
        if (n in ESC) { out += ESC[n]; i += 2; continue }
        out += c + n; i += 2; continue
      }
      if (!triple && c === '\n') fail()
      out += c; i++
    }
    fail()
  }
  function seq(close) {
    const arr = []
    i++; ws()
    while (s[i] !== close) {
      arr.push(val()); ws()
      if (s[i] === ',') { i++; ws(); continue }
      if (s[i] !== close) fail()
    }
    i++
    return arr
  }
  function dict() {
    const o = {}
    i++; ws()
    while (s[i] !== '}') {
      const k = val(); ws()
      if (s[i] !== ':') fail()
      i++; ws()
      o[typeof k === 'string' ? k : JSON.stringify(k)] = val(); ws()
      if (s[i] === ',') { i++; ws(); continue }
      if (s[i] !== '}') fail()
    }
    i++
    return o
  }
  function val() {
    ws()
    const c = s[i]
    if (c === '{') return dict()
    if (c === '[') return seq(']')
    if (c === '(') return seq(')')
    if (c === "'" || c === '"' || (/[rRbBuU]/.test(c) && /['"rRbB]/.test(s[i + 1] ?? ''))) return str()
    const m = s.slice(i).match(/^(True|False|None|true|false|null|-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/)
    if (!m) fail()
    i += m[0].length
    const KW = { True: true, true: true, False: false, false: false, None: null, null: null }
    return Object.hasOwn(KW, m[0]) ? KW[m[0]] : Number(m[0])
  }
  try {
    ws()
    const v = val(); ws()
    return i === s.length ? v : null
  } catch { return null }
}
