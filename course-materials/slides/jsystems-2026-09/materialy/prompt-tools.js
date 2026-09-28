/* Course-local prompt search and lossless JSON / spreadsheet-safe CSV downloads. */
(() => {
  const audience = document.body.dataset.courseAudience;
  const nodes = [...document.querySelectorAll('pre[data-prompt-id]')];
  const bodies = nodes.length ? nodes : [...document.querySelectorAll('.pbox')];
  if (!bodies.length) return;
  const entries = bodies.map((node, i) => {
    const card = node.closest('.pcard, .ex, .tcard, .pl, .pbox') || node;
    const clone = node.cloneNode(true);
    clone.querySelectorAll('button').forEach(button => button.remove());
    const category = node.closest('.panel')?.id || audience;
    const id = node.dataset.promptId;
    if (!id) throw new Error('Prompt requires an authored stable ID before publication');
    if (!node.id) node.id = id;
    node.dataset.promptId = id;
    node.dataset.promptVersion ||= '1';
    return {node, card, record: {
      id, version: node.dataset.promptVersion, category,
      title: node.dataset.title || card.querySelector('h3,h2')?.textContent.trim() || id,
      prerequisites: node.dataset.prerequisites || 'Repozytorium warsztatowe i dane wskazane w pełnej treści promptu.',
      tool: node.dataset.tool || 'Agent programistyczny z dostępem do repozytorium; umiejętność wskazana w treści zadania.',
      provenance: node.dataset.provenance || 'Zaadaptowane ogólne prompty z kursów programistycznych; syntetyczny przypadek Hardware Service Decision Copilot.',
      body: clone.textContent,
      source: node.dataset.source || card.querySelector('a[href$=".md"]')?.getAttribute('href') || `${location.pathname.split('/').pop()}#${node.id}`
    }};
  });
  const toolbar = document.createElement('section');
  toolbar.className = 'prompt-tools';
  toolbar.setAttribute('aria-label', 'Wyszukiwanie i pobieranie promptów');
  toolbar.innerHTML = '<label>Szukaj w pełnych promptach<input type="search" placeholder="Temat, zadanie lub fragment promptu"></label><div><button type="button" data-export="json">Pobierz JSON</button> <button type="button" data-export="csv">Pobierz CSV</button></div><p role="status" aria-live="polite"></p><details><summary>Import do Excela i innych narzędzi</summary><p>CSV oznacza pola zabezpieczone apostrofem w kolumnie csv_escaped_fields. Przy imporcie usuń jeden dodany apostrof tylko z wymienionych pól. JSON zachowuje tekst bez kodowania.</p></details>';
  (document.querySelector('main') || document.body).prepend(toolbar);
  const style = document.createElement('style');
  style.textContent = '.prompt-tools{padding:1.25rem;margin:1.5rem 0 2rem;border:1px solid var(--line,#718096);border-radius:12px;display:flex;flex-wrap:wrap;gap:1rem;align-items:end}.prompt-tools label{flex:1;min-width:200px;font-weight:600}.prompt-tools input{display:block;width:100%;box-sizing:border-box;margin-top:.5rem;padding:.8rem;font:inherit;color:inherit;background:transparent;border:1px solid var(--line,#718096);border-radius:8px}.prompt-tools button{padding:.8rem;font:inherit;color:inherit;background:transparent;border:1px solid var(--line,#718096);border-radius:8px;cursor:pointer}.prompt-tools p,.prompt-tools details{flex-basis:100%;margin:0}.prompt-tools details{font-size:.85rem;line-height:1.6}.prompt-tools summary{cursor:pointer}.prompt-tools details p{margin-top:.5rem}.prompt-tools :focus-visible{outline:3px solid var(--accent,#4699c4);outline-offset:3px}.prompt-search-hidden{display:none!important}@media print{.prompt-tools{display:none}}';
  document.head.append(style);
  const query = toolbar.querySelector('input');
  const status = toolbar.querySelector('[role="status"]');
  const cards = [...new Set(entries.map(e => e.card))];
  function filter() {
    const term = query.value.toLocaleLowerCase('pl');
    const match = e => (e.record.title + '\n' + e.record.body).toLocaleLowerCase('pl').includes(term);
    for (const card of cards) card.classList.toggle('prompt-search-hidden', !entries.some(e => e.card === card && match(e)));
    for (const panel of document.querySelectorAll('.panel')) {
      if (term) panel.style.display = entries.some(e => panel.contains(e.node) && match(e)) ? 'block' : 'none';
      else panel.style.removeProperty('display');
    }
    status.textContent = `Prompty: ${entries.filter(match).length} / ${entries.length}`;
  }
  function download(name, type, body) {
    const url = URL.createObjectURL(new Blob([body], {type}));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const csvCell = value => '"' + String(value).replaceAll('"', '""') + '"';
  function csv(rows) {
    const cols = ['id','version','category','title','prerequisites','tool','provenance','body','source'];
    return '\ufeff' + [cols.concat('csv_escaped_fields').map(csvCell).join(','), ...rows.map(row => {
      const escaped = [];
      const values = cols.map(key => {const text = String(row[key]); if (/^\s*[=+@-]/.test(text)) {escaped.push(key);return "'"+text;}return text;});
      return values.concat(JSON.stringify(escaped)).map(csvCell).join(',');
    })].join('\r\n');
  }
  toolbar.querySelector('[data-export="json"]').addEventListener('click', () => download('prompty.json','application/json;charset=utf-8',JSON.stringify(entries.map(e=>e.record),null,2)));
  toolbar.querySelector('[data-export="csv"]').addEventListener('click', () => download('prompty.csv','text/csv;charset=utf-8',csv(entries.map(e=>e.record))));
  query.addEventListener('input', filter); filter();
})();
