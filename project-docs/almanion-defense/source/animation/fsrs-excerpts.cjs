/* Verbatim excerpts from the pinned source that runs in this presentation. */
const fs = require('fs'), path = require('path');
const file = 'knowledge-check.js';
const source = fs.readFileSync(path.join(__dirname, '../reference', file), 'utf8').replace(/\r\n/g, '\n');
const quotes = {
  selection: ['extractCards()', 'const selected = new Set(kinds);\n        return cards.filter(card => selected.has(card.kind));'],
  extraction: ['extractTopicCards()', 'const backHTML = answerHTML(box, type.kind);\n                const sourceId = sourceIdFor(box);'],
  rating: ['grade(G)', 'if (!revealed || !session || session.queue.length === 0) return;'],
  state: ['toFsrsCard()', 'stability: normalized.stability,\n            difficulty: normalized.difficulty,\n            elapsed_days: normalized.elapsedDays,'],
  retention: ['настройка планировщика', 'const TARGET_RETENTION = 0.90;'],
  schedule: ['projectBase()', 'scheduler.next(toFsrsCard(state, now), new Date(now), G).card'],
  save: ['grade(G)', 'session = transition.session;\n        const persisted = persistState(item.card.id, transition.state);\n        persistSession();'],
  confirmations: ['pendingSuccessesAfterGrade()', 'if (G === 1) return Math.max(pending, 2);\n        if (G === 2) return Math.max(pending, 1);\n        return Math.max(0, pending - 1);']
};
module.exports = Object.fromEntries(Object.entries(quotes).map(([key, [fn, code]]) => {
  const index = source.indexOf(code);
  if (index < 0) throw new Error('Presentation excerpt no longer matches source: ' + key);
  const startLine = source.slice(0, index).split('\n').length;
  const lines = code.split('\n'), indent = Math.min(...lines.slice(1).filter(s => s.trim()).map(s => s.match(/^ */)[0].length));
  return [key, {file, fn, startLine, endLine: startLine + lines.length - 1,
    code: lines.map((s, i) => i ? s.slice(Number.isFinite(indent) ? indent : 0) : s).join('\n')}];
}));
