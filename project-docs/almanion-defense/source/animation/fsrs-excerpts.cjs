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
  confirmations: ['pendingSuccessesAfterGrade()', 'if (G === 1) return Math.max(pending, 2);\n        if (G === 2) return Math.max(pending, 1);\n        return Math.max(0, pending - 1);'],
  identity: ['stableCardId()', "const identity = sourceId || normalizeTitle(input.term || '') || hashString(input.answerText || 'card');"],
  queue: ['buildRecommendation()', 'if (confirmationReady || normalized.due <= now) {'],
  recall: ['next_recall_stability()', 's * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hard_penalty * easy_bound),', 'ts-fsrs.umd.js'],
  difficulty: ['next_difficulty()', 'const delta_d = -this.param.w[6] * (g - 3);\n      const next_d = d + this.linear_damping(delta_d, d);', 'ts-fsrs.umd.js'],
  forgetting: ['next_forget_stability()', 'w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]),', 'ts-fsrs.umd.js']
};
module.exports = Object.fromEntries(Object.entries(quotes).map(([key, [fn, code, sourceFile=file]]) => {
  const text=sourceFile===file?source:fs.readFileSync(path.join(__dirname,'../reference',sourceFile),'utf8').replace(/\r\n/g,'\n');
  const index = text.indexOf(code);
  if (index < 0) throw new Error('Presentation excerpt no longer matches source: ' + key);
  const startLine = text.slice(0, index).split('\n').length;
  const lines = code.split('\n'), indent = Math.min(...lines.slice(1).filter(s => s.trim()).map(s => s.match(/^ */)[0].length));
  return [key, {file:sourceFile, fn, startLine, endLine: startLine + lines.length - 1,
    code: lines.map((s, i) => i ? s.slice(Number.isFinite(indent) ? indent : 0) : s).join('\n')}];
}));
