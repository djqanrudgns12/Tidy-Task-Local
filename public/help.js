// This static guide also works without Tauri or a network connection.
const chapters = [...document.querySelectorAll('.chapter')];
const contents = document.querySelector('#contents');
const search = document.querySelector('#guide-search');
const clear = document.querySelector('#clear-search');
const results = document.querySelector('#search-results');
const resultList = document.querySelector('#result-list');
const pager = document.querySelector('.page-turn');
const narrow = window.matchMedia('(max-width: 850px)');
const entries = chapters.map((element) => ({
  element,
  id: element.id,
  title: element.querySelector('h2').textContent,
  label: element.getAttribute('aria-label'),
  text: [...element.querySelectorAll('h2, h3, p, dt, dd, summary')]
    .map((node) => node.textContent.trim()).join(' ').replace(/\s+/g, ' '),
  headings: [...element.querySelectorAll('h2, h3, dt, summary')]
    .map((node) => node.textContent).join(' ').toLocaleLowerCase(),
}));
let selected = entries.find((entry) => `#${entry.id}` === location.hash) || entries[0];

function showChapter(entry, focus = false) {
  selected = entry;
  search.value = '';
  clear.hidden = true;
  results.hidden = true;
  pager.hidden = false;
  chapters.forEach((chapter) => { chapter.hidden = chapter !== entry.element; });
  document.querySelectorAll('.contents a').forEach((link) => {
    if (link.hash === `#${entry.id}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelector('#current-chapter').textContent = `· ${entry.label}`;
  document.title = `${entry.label} · Tidy Task 사용 가이드`;
  const index = entries.indexOf(entry);
  for (const [id, neighbor] of [['previous', entries[index - 1]], ['next', entries[index + 1]]]) {
    const link = document.getElementById(id);
    link.hidden = !neighbor;
    if (neighbor) {
      link.href = `#${neighbor.id}`;
      link.querySelector('span').textContent = neighbor.label;
    }
  }
  if (narrow.matches) contents.open = false;
  if (focus) {
    entry.element.querySelector('.chapter-heading').focus({ preventScroll: true });
    entry.element.scrollIntoView({ block: 'start' });
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const entry = entries.find((item) => `#${item.id}` === link.hash);
  if (!entry) return;
  event.preventDefault();
  const term = search.value.trim().toLocaleLowerCase();
  if (term) entry.element.querySelectorAll('details.more').forEach((detail) => {
    if (detail.textContent.toLocaleLowerCase().includes(term)) detail.open = true;
  });
  if (location.hash !== link.hash) history.pushState(null, '', link.hash);
  showChapter(entry, true);
});

function restoreLocation() {
  const entry = entries.find((item) => `#${item.id}` === location.hash);
  if (entry || !location.hash) showChapter(entry || entries[0], true);
}
window.addEventListener('popstate', restoreLocation);
window.addEventListener('hashchange', restoreLocation);

function findChapters() {
  const query = search.value.trim().toLocaleLowerCase();
  if (!query) { showChapter(selected); return; }
  chapters.forEach((chapter) => { chapter.hidden = true; });
  pager.hidden = true;
  results.hidden = false;
  clear.hidden = false;
  const words = query.split(/\s+/);
  const relevance = (entry) => words.reduce((score, word) => score
    + (entry.label.toLocaleLowerCase().includes(word) ? 10 : 0)
    + (entry.headings.includes(word) ? 3 : 0), 0);
  const matches = entries.filter((entry) => entry.id !== 'start'
    && words.every((word) => entry.text.toLocaleLowerCase().includes(word)))
    .sort((a, b) => relevance(b) - relevance(a));
  document.querySelector('#result-count').textContent = matches.length
    ? `설명 ${matches.length}개를 찾았습니다. 제목을 누르면 해당 설명으로 이동합니다.`
    : '찾은 설명이 없습니다. ‘명단’, ‘알림’, ‘글꼴’처럼 짧은 말로 다시 찾아보세요.';
  resultList.replaceChildren(...matches.map((entry) => {
    const link = document.createElement('a');
    link.href = `#${entry.id}`;
    link.className = 'result-link';
    const title = document.createElement('strong');
    title.textContent = entry.label;
    const excerpt = document.createElement('small');
    const index = entry.text.toLocaleLowerCase().indexOf(words[0]);
    const start = Math.max(0, index - 25);
    excerpt.textContent = `${start ? '…' : ''}${entry.text.slice(start, start + 110)}${entry.text.length > start + 110 ? '…' : ''}`;
    link.append(title, excerpt);
    return link;
  }));
}
search.addEventListener('input', (event) => { if (!event.isComposing) findChapters(); });
search.addEventListener('compositionend', findChapters);
search.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !event.isComposing) { showChapter(selected); search.focus(); }
});
clear.addEventListener('click', () => { showChapter(selected); search.focus(); });

function setSize(size) {
  if (![18, 20, 22].includes(size)) size = 18;
  document.documentElement.style.fontSize = `${size}px`;
  document.querySelectorAll('[data-size]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.size) === size));
  });
  try { localStorage.setItem('tidy-guide-font-size', String(size)); } catch { /* Reading works even when storage is unavailable. */ }
}
document.querySelectorAll('[data-size]').forEach((button) => {
  button.addEventListener('click', () => setSize(Number(button.dataset.size)));
});
let savedSize = 18;
try { savedSize = Number(localStorage.getItem('tidy-guide-font-size')) || 18; } catch { /* Use the readable default. */ }
setSize(savedSize);
contents.open = !narrow.matches;
narrow.addEventListener('change', () => { contents.open = !narrow.matches; });
// A hidden desktop summary must never leave its navigation collapsed.
contents.addEventListener('toggle', () => { if (!narrow.matches && !contents.open) contents.open = true; });
document.documentElement.classList.add('enhanced');
showChapter(selected);
