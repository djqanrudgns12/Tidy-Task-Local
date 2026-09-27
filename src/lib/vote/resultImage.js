// 화면과 PNG가 같은 판을 그립니다. 버튼·결선 제안·축하 입자는 저장 이미지에 포함하지 않습니다.
import { paletteOf } from './palette.js';
import { dateLabel, typeLabel } from './model.js';
import { resultNote, resultVisibilityLabel } from './result.js';

export const IMAGE_W = 1600;
export const IMAGE_H = 900;
const INK = '#293F39', MUTED = '#697A73', LINE = '#DAE3DC', PAPER = '#F7F8F2';
const NOTE = '#4D5359', SCORE_INK = '#36434F', SCORE_MUTED = '#59636E';
/** @typedef {ReturnType<typeof import('./result.js').resultModel>} Model */
/** @typedef {import('./model.js').Item} Item */
/** @typedef {Record<string, HTMLImageElement>} Images */

/** @param {Model} m */
export function fileNameFor(m) {
  const safe = m.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || '학급투표';
  return `${safe}_${m.date || 'result'}_${resultVisibilityLabel(m.visibility, m.type).replace(/ /g, '')}.png`;
}

/** @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {number} w @param {number} h @param {number} [r] */
function round(g, x, y, w, h, r = 18) {
  g.beginPath(); g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.min(r, w / 2, h / 2));
}
/** @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {number} w @param {number} h @param {string} color @param {number} [r] */
function box(g, x, y, w, h, color, r = 18) {
  g.fillStyle = color; round(g, x, y, w, h, r); g.fill();
}
/** 글꼴 실측으로 한 줄을 유지합니다. @param {CanvasRenderingContext2D} g @param {string|number} value @param {number} x @param {number} y @param {number} size @param {string} font @param {number} max @param {string} [color] @param {CanvasTextAlign} [align] */
function text(g, value, x, y, size, font, max, color = INK, align = 'left') {
  const label = String(value);
  g.font = `700 ${size}px ${font}`;
  const measured = g.measureText(label).width;
  if (measured > max) g.font = `700 ${size * max / measured}px ${font}`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(label, x, y);
}

/** 안건은 실제 글꼴로 줄을 계산하며 문장을 생략하지 않습니다.
 * @param {CanvasRenderingContext2D} g @param {string} value @param {string} font
 * @param {number} width @param {number} height @param {number} [preferredSize] */
export function fitAgendaText(g, value, font, width, height, preferredSize = 34) {
  const label = String(value).trim();
  g.font = `700 ${preferredSize}px ${font}`;
  const measured = g.measureText(label).width;
  // 작은 폭 차이는 글씨를 최대 10%만 조절해 한 줄을 유지합니다.
  // 읽기 어려울 만큼 줄여야 하면 전체 가용 폭을 쓰는 줄바꿈으로 전환합니다.
  const singleSize = Math.floor(Math.min(preferredSize, preferredSize * width / Math.max(1, measured), height / 1.28));
  if (label && singleSize >= preferredSize * .9) return { lines: [label], size: singleSize, lineHeight: singleSize * 1.28 };
  for (let size = preferredSize; size >= 1; size--) {
    g.font = `700 ${size}px ${font}`;
    /** @param {number} lineWidth */
    const wrap = (lineWidth) => {
      /** @type {string[]} */ const lines = [];
      let line = '';
      // 먼저 어절을 유지하고, 칸보다 긴 어절만 글자 단위로 나눕니다.
      for (const word of label.split(/\s+/)) {
        const joined = line ? `${line} ${word}` : word;
        if (g.measureText(joined).width <= lineWidth) { line = joined; continue; }
        if (line) { lines.push(line); line = ''; }
        for (const char of word) {
          if (line && g.measureText(line + char).width > lineWidth) { lines.push(line); line = ''; }
          line += char;
        }
      }
      if (line) lines.push(line);
      return lines;
    };
    const lines = wrap(width);
    const lineHeight = size * 1.28;
    if (lines.length * lineHeight <= height) return { lines, size, lineHeight };
  }
  return { lines: [label], size: 1, lineHeight: 1.28 };
}

/** @param {CanvasRenderingContext2D} g @param {string} label @param {number} x @param {number} y
 * @param {number} w @param {number} h @param {string} font @param {number} size */
function agendaText(g, label, x, y, w, h, font, size) {
  const fitted = fitAgendaText(g, label, font, w, h, size);
  g.font = `700 ${fitted.size}px ${font}`;
  g.fillStyle = INK; g.textAlign = 'left'; g.textBaseline = 'middle';
  const top = y + (h - fitted.lines.length * fitted.lineHeight) / 2;
  fitted.lines.forEach((line, i) => g.fillText(line, x, top + (i + .5) * fitted.lineHeight));
}

/** 최다 득표는 통과 기준에 따른 판정과 구분합니다. @param {CanvasRenderingContext2D} g
 * @param {number} x @param {number} y @param {string} color @param {string} font */
function voteStamp(g, x, y, color, font) {
  g.save(); g.translate(x + 34, y + 24); g.rotate(-.09);
  g.strokeStyle = color; g.lineWidth = 2;
  round(g, -34, -24, 68, 48, 7); g.stroke();
  g.lineWidth = .8; round(g, -30, -20, 60, 40, 4); g.stroke();
  text(g, '최다 득표', 0, 0, 14, font, 54, color, 'center');
  g.restore();
}
/** @param {CanvasRenderingContext2D} g @param {number} elapsed @param {number} delay @param {() => void} draw */
function enter(g, elapsed, delay, draw) {
  const t = Math.max(0, Math.min(1, (elapsed - delay) / 420));
  const ease = 1 - (1 - t) ** 3;
  g.save(); g.globalAlpha = ease; g.translate(0, 20 * (1 - ease)); draw(); g.restore();
}

/** 화면 스티커와 같은 무늬를 사용합니다. @param {CanvasRenderingContext2D} g @param {Item} item @param {number} x @param {number} y @param {number} size @param {string} font @param {Images} images @param {string} type */
function sticker(g, item, x, y, size, font, images, type) {
  const c = paletteOf(item.color), opinion = type === 'opinion';
  const radius = opinion ? size * .25 : size / 2;
  box(g, x - 4, y - 4, size + 8, size + 8, '#FFFFFF', radius + 4);
  g.save(); round(g, x, y, size, size, radius); g.clip();
  box(g, x, y, size, size, c.bg, radius);
  const img = !opinion && item.character ? images[item.character] : null;
  if (img?.naturalWidth) {
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    g.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
  } else {
    if (opinion) {
      g.save(); g.translate(x, y); g.scale(size / 100, size / 100);
      g.fillStyle = c.ink; g.strokeStyle = c.ink; g.globalAlpha = .14; g.lineWidth = 2;
      if (item.pattern === 'stripes' || item.pattern === 'gingham') {
        g.translate(50, 50); g.rotate(.61); g.translate(-50, -50);
        for (let i = -100; i < 200; i += 14) {
          g.fillRect(i, -100, item.pattern === 'gingham' ? 7 : 4.5, 300);
          if (item.pattern === 'gingham') g.fillRect(-100, i, 300, 7);
        }
      } else for (let a = 0; a < 100; a += 14) for (let b = 0; b < 100; b += 14) {
        g.save(); g.translate(a + 7, b + 7); g.beginPath();
        switch (item.pattern) {
          case 'dots': g.arc(0, 0, 2.6, 0, Math.PI * 2); g.fill(); break;
          case 'grid': g.moveTo(-7, -6); g.lineTo(7, -6); g.moveTo(-6, -7); g.lineTo(-6, 7); g.stroke(); break;
          case 'hearts': g.moveTo(0, 4); g.bezierCurveTo(-10, -2, -3, -8, 0, -3); g.bezierCurveTo(3, -8, 10, -2, 0, 4); g.fill(); break;
          case 'stars': for (let k = 0; k < 10; k++) { const r = k % 2 ? 2 : 5, t = k * Math.PI / 5 - Math.PI / 2; g.lineTo(Math.cos(t) * r, Math.sin(t) * r); } g.closePath(); g.fill(); break;
          case 'petals': g.ellipse(0, 0, 2, 5, 0, 0, Math.PI * 2); g.ellipse(0, 0, 5, 2, 0, 0, Math.PI * 2); g.fill(); break;
          case 'waves': g.moveTo(-7, 0); g.bezierCurveTo(-3, -5, 3, 5, 7, 0); g.stroke(); break;
          default: g.moveTo(-7, 3); g.lineTo(-3, -3); g.lineTo(0, 3); g.lineTo(4, -3); g.lineTo(7, 3); g.stroke();
        }
        g.restore();
      }
      g.restore();
    }
    text(g, item.number, x + size / 2, y + size * .53, size * .48, font, size * .8, c.ink, 'center');
  }
  g.restore();
}

/** @param {Model} m */
export function resultHighlights(m) {
  return [...m.winners.map(item => ({ item, label: m.type === 'opinion' ? '선정' : '당선', tied: false })),
    ...m.pendingTie.map(item => ({ item, label: '동점', tied: true }))];
}

/** @param {HTMLCanvasElement} canvas @param {Model} m @param {{font:string, images:Images, elapsed?:number, scale?:number}} o */
export function drawResult(canvas, m, o) {
  const scale = o.scale ?? 1;
  if (canvas.width !== IMAGE_W * scale) canvas.width = IMAGE_W * scale;
  if (canvas.height !== IMAGE_H * scale) canvas.height = IMAGE_H * scale;
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const font = o.font || '"Malgun Gothic", sans-serif', elapsed = o.elapsed ?? Infinity;
  g.fillStyle = PAPER; g.fillRect(0, 0, IMAGE_W, IMAGE_H);
  drawHeader(g, m, font);
  if (m.type === 'yesno') drawAgendas(g, m, font, elapsed);
  else drawItems(g, m, font, o.images, elapsed);
  drawFooter(g, m, font);
}

/** 제목과 날짜가 각각의 영역에서 한 줄을 유지합니다. @param {CanvasRenderingContext2D} g @param {Model} m @param {string} font */
function drawHeader(g, m, font) {
  box(g, 36, 30, 1528, 158, '#FFFFFF', 24);
  g.strokeStyle = LINE; g.lineWidth = 1;
  round(g, 36, 30, 1528, 158, 24); g.stroke();
  box(g, 76, 54, 114, 32, '#E6EFE7', 9);
  text(g, typeLabel(m.type), 133, 70, 19, font, 98, '#32634D', 'center');
  text(g, `개표 결과${m.round ? `  ·  결선 ${m.round}회` : ''}`, 206, 70, 20, font, 980, MUTED);
  text(g, m.title, 76, 128, 46, font, 1116);
  g.beginPath(); g.moveTo(1232, 62); g.lineTo(1232, 156); g.stroke();
  text(g, '투표일', 1272, 78, 18, font, 252, MUTED);
  text(g, dateLabel(m.date), 1272, 122, 23, font, 252);
}

/** 기권 수는 공개 설정을 따르며 총 투표자는 실제 참여한 사람 수입니다. @param {CanvasRenderingContext2D} g @param {Model} m @param {string} font */
function drawFooter(g, m, font) {
  g.strokeStyle = LINE; g.lineWidth = 1;
  g.beginPath(); g.moveTo(48, 818); g.lineTo(1552, 818); g.stroke();
  const note = resultNote(m);
  const showCounts = m.showCounts && m.validVotes != null && m.abstain != null;
  const multipleAgendas = m.type === 'yesno' && m.agendas.length > 1;
  const stats = [
    { label: '총 투표자', value: `${m.participants}명` },
    ...(showCounts ? [
      { label: multipleAgendas ? '유효표 합계' : '유효표', value: `${m.validVotes}표` },
      { label: multipleAgendas ? '기권 합계' : '기권', value: `${m.abstain}표` },
    ] : []),
  ];
  const x = showCounts ? 874 : 1280, w = 1552 - x, cell = w / stats.length;
  text(g, note, 50, 858, 19, font, x - 80, NOTE);
  box(g, x, 830, w, 58, '#FFFFFF', 16);
  round(g, x, 830, w, 58, 16); g.stroke();
  stats.forEach((stat, i) => {
    const left = x + i * cell;
    if (i) { g.beginPath(); g.moveTo(left, 844); g.lineTo(left, 874); g.stroke(); }
    text(g, stat.label, left + 20, 859, 18, font, cell - 110, SCORE_MUTED);
    text(g, stat.value, left + cell - 20, 859, 27, font, 80, SCORE_INK, 'right');
  });
}

/** @param {CanvasRenderingContext2D} g @param {Model} m @param {string} font @param {Images} images @param {number} elapsed */
function drawItems(g, m, font, images, elapsed) {
  const highlights = resultHighlights(m), hasRows = m.rows.length > 0;
  const leftW = hasRows ? 618 : 1504, leftX = 48;
  text(g, m.pendingTie.length ? '이번 투표의 결과' : m.type === 'opinion' ? '우리 반의 선택' : '당선자', leftX + 4, 223, 25, font, leftW);
  const n = highlights.length;
  if (!n) {
    box(g, leftX, 258, leftW, 544, '#FFFFFF', 24);
    text(g, m.type === 'opinion' ? '선정된 항목이 없습니다' : '당선자가 없습니다', leftX + leftW / 2, 470, 34, font, leftW - 60, INK, 'center');
    text(g, m.participants ? '유효한 선택이 없습니다' : '참여한 투표가 없습니다', leftX + leftW / 2, 523, 22, font, leftW - 60, MUTED, 'center');
  } else {
    const cols = n <= 3 ? n : n <= 6 ? (hasRows ? 2 : 3) : 3;
    const rowN = Math.ceil(n / cols), gap = 16;
    const w = Math.min(hasRows ? 618 : 470, (leftW - gap * (cols - 1)) / cols);
    const h = Math.min(456, (544 - gap * (rowN - 1)) / rowN);
    const top = 258 + (544 - (h * rowN + gap * (rowN - 1))) / 2;
    const startX = leftX + (leftW - (w * cols + gap * (cols - 1))) / 2;
    highlights.forEach((hero, i) => enter(g, elapsed, 70 + Math.min(i * 40, 280), () => {
      const { item, tied } = hero, c = paletteOf(item.color), x = startX + i % cols * (w + gap), y = top + Math.floor(i / cols) * (h + gap);
      box(g, x, y + 5, w, h, LINE, 22); box(g, x, y, w, h, '#FFFFFF', 22);
      box(g, x + 2, y + 2, w - 4, h - 4, c.bg, 20);
      box(g, x + 14, y + 12, 78, 34, '#FFFFFF', 10);
      text(g, `기호 ${item.number}`, x + 53, y + 30, 19, font, 70, c.ink, 'center');
      box(g, x + w - 76, y + 14, 60, 30, tied ? '#FFF4CC' : '#315F4B', 10);
      text(g, hero.label, x + w - 46, y + 30, 17, font, 52, tied ? '#795A16' : '#FFFFFF', 'center');
      const dense = h < 240;
      const art = Math.min(w * .64, h - (dense ? 110 : 135), 228);
      const row = m.rows.find(r => r.item.id === item.id);
      if (art >= 48) sticker(g, item, x + (w - art) / 2, y + (dense ? 52 : 60) + Math.max(0, (h - (dense ? 120 : 150) - art) / 2), art, font, images, m.type);
      text(g, item.name, x + w / 2, y + h - (dense ? 44 : 70), Math.min(dense ? 26 : 40, w / 5), font, w - 28, INK, 'center');
      text(g, row?.count != null ? `${row.count}표  ·  ${row.percent}%` : row ? `${row.rank}위` : hero.label, x + w / 2, y + h - (dense ? 18 : 30), 24, font, w - 26, c.ink, 'center');
    }));
  }
  if (!hasRows) return;
  const x = 704, w = 848;
  text(g, m.round ? `결선 ${m.round}회 득표 현황` : '전체 결과', x + 4, 223, 25, font, 570);
  if (m.showCounts) {
    box(g, x + 548, 204, 200, 38, '#ECEFF2', 8);
    text(g, '득표수 / 득표율', x + 648, 223, 18, font, 176, SCORE_MUTED, 'center');
  } else text(g, '순위', x + w - 8, 223, 18, font, 250, MUTED, 'right');
  const h = Math.min(104, 544 / Math.max(1, m.rows.length));
  m.rows.forEach((r, i) => enter(g, elapsed, 180 + Math.min(i * 30, 240), () => {
    const y = 258 + i * h, c = paletteOf(r.item.color), tall = h >= 78;
    const leading = r.rank === 1 && !m.noneVoted && (r.count == null || r.count > 0);
    const centerY = y + (h - 8) / 2;
    box(g, x, y, w, h - 8, leading ? '#FFF3CD' : '#FFFFFF', 15);
    if (leading) { g.strokeStyle = '#DCC38C'; g.lineWidth = 1.5; round(g, x, y, w, h - 8, 15); g.stroke(); }
    box(g, x, y + 12, 4, h - 32, leading ? '#B68A2D' : r.winner || r.tied ? c.ink : LINE, 2);
    text(g, `${r.rank}위`, x + 24, centerY, 23, font, 56, leading ? '#806019' : MUTED);
    sticker(g, r.item, x + 90, y + (h - 8 - 36) / 2, 36, font, images, m.type);
    text(g, `${r.item.number}`, x + 154, y + (h - 8) / 2, 23, font, 30, c.ink, 'center');
    text(g, r.item.name, x + 186, y + (tall ? 29 : (h - 8) / 2), 28, font, 334);
    if (r.count != null) {
      if (tall) {
        box(g, x + 186, y + h - 29, 334, 8, '#EDF0E9', 4);
        if (r.percent) box(g, x + 186, y + h - 29, 334 * r.percent / 100, 8, c.line, 4);
      }
      const scoreH = Math.min(52, h - 20), scoreY = centerY - scoreH / 2;
      box(g, x + 548, scoreY, 200, scoreH, leading ? '#FFFCF4' : '#F3F5F7', 8);
      g.strokeStyle = leading ? '#E4D5B2' : '#DFE4E8'; g.lineWidth = 1;
      round(g, x + 548, scoreY, 200, scoreH, 8); g.stroke();
      g.beginPath(); g.moveTo(x + 660, scoreY + 10); g.lineTo(x + 660, scoreY + scoreH - 10); g.stroke();
      text(g, `${r.count}표`, x + 604, centerY, 27, font, 92, SCORE_INK, 'center');
      text(g, `${r.percent}%`, x + 704, centerY, 20, font, 70, SCORE_MUTED, 'center');
    }
    if (r.winner || r.tied) {
      box(g, x + 762, y + (h - 38) / 2, 68, 30, r.tied ? '#FFF1C5' : '#E2EEE6', 10);
      text(g, r.tied ? '동점' : m.type === 'opinion' ? '선정' : '당선', x + 796, y + (h - 8) / 2, 17, font, 62, r.tied ? '#795A16' : '#32634D', 'center');
    }
  }));
}

/** @param {CanvasRenderingContext2D} g @param {Model} m @param {string} font @param {number} elapsed */
function drawAgendas(g, m, font, elapsed) {
  text(g, '안건별 투표 결과', 52, 223, 25, font, 900);
  const h = Math.min(240, 558 / Math.max(1, m.agendas.length));
  const roomyRows = h - 12 > 145;
  const scoreSize = roomyRows ? 54 : 38;
  g.font = `700 ${scoreSize}px ${font}`;
  const scoreWidth = Math.ceil(Math.max(0, ...m.agendas.flatMap(a => [g.measureText(`${a.yes}표`).width, g.measureText(`${a.no}표`).width])));
  // 숫자·도장에 필요한 실측 폭만 확보합니다. 남은 폭은 전부 안건에 줍니다.
  // 같은 결과판의 모든 행은 동일한 경계를 사용해 위아래 비교도 유지합니다.
  const panelCell = Math.max(roomyRows ? 250 : 212, scoreWidth + 126);
  const panelWidth = panelCell * 2;
  m.agendas.forEach((a, i) => enter(g, elapsed, 80 + i * 70, () => {
    const y = 258 + i * h, cardH = h - 12, roomy = cardH > 145;
    const blue = '#2868B5', red = '#BD404B';
    box(g, 48, y, 1504, cardH, '#FFFFFF', 22);
    g.strokeStyle = LINE; g.lineWidth = 1;
    round(g, 48, y, 1504, cardH, 22); g.stroke();
    box(g, 68, y + 16, 56, 40, '#EDF1F5', 11);
    text(g, String(i + 1).padStart(2, '0'), 96, y + 37, 24, font, 44, SCORE_INK, 'center');
    const verdict = a.passed === null ? '판정 없음' : a.passed ? '통과' : '부결';
    const showTie = m.showCounts && a.tie;
    text(g, showTie ? `동률 · ${verdict}` : verdict, 96, y + 68, a.passed === null || showTie ? 13 : 20, font, 64, a.passed ? '#32634D' : MUTED, 'center');
    if (!m.showCounts) {
      agendaText(g, a.text, 148, y + 14, 1078, cardH - 28, font, roomy ? 40 : 34);
      box(g, 1270, y + 16, 258, cardH - 32, a.passed ? '#E8F2ED' : '#F1F3F5', 14);
      text(g, verdict, 1399, y + cardH / 2, 34, font, 220, a.passed ? '#32634D' : MUTED, 'center');
      return;
    }
    // 제목에는 왼쪽의 넓은 공간을, 수치에는 오른쪽의 연결된 두 구획을 줍니다.
    const panelW = panelWidth, panelX = 1528 - panelW, panelY = y + 12, panelH = cardH - 24, cell = panelW / 2;
    const titleH = cardH - (roomy ? 54 : 16);
    agendaText(g, a.text, 148, y + (roomy ? 14 : 8), panelX - 148 - 26, titleH, font, roomy ? 40 : 34);
    if (roomy) text(g, `기권 ${a.abstain}표${a.tie ? '  ·  찬반 동률' : ''}`, 148, y + cardH - 24, 19, font, 760, MUTED);
    g.save(); round(g, panelX, panelY, panelW, panelH, 14); g.clip();
    box(g, panelX, panelY, cell, panelH, '#F0F5FF', 0);
    box(g, panelX + cell, panelY, cell, panelH, '#FFF2F3', 0);
    g.restore();
    g.strokeStyle = '#D7DFE9'; g.lineWidth = 1;
    round(g, panelX, panelY, panelW, panelH, 14); g.stroke();
    g.beginPath(); g.moveTo(panelX + cell, panelY + 12); g.lineTo(panelX + cell, panelY + panelH - 12); g.stroke();
    const leading = a.yes > a.no ? 'yes' : a.no > a.yes ? 'no' : null;
    for (const side of [
      { id: 'yes', label: '찬성', count: a.yes, percent: a.yesPercent, color: blue },
      { id: 'no', label: '반대', count: a.no, percent: a.noPercent, color: red },
    ]) {
      const x = panelX + (side.id === 'no' ? cell : 0);
      const labelY = panelY + (roomy ? 32 : 18), countY = panelY + (roomy ? 92 : 51);
      text(g, side.label, x + 20, labelY, roomy ? 26 : 20, font, 160, side.color);
      text(g, `${side.count}표`, x + 20, countY, scoreSize, font, cell - 126, side.color);
      text(g, `${side.percent}%`, x + (roomy ? 112 : 78), labelY, roomy ? 20 : 16, font, 62, side.color);
      if (leading === side.id) voteStamp(g, x + cell - 88, panelY + (roomy ? 70 : 22), side.color, font);
      if (roomy) {
        box(g, x + 20, panelY + panelH - 26, cell - 40, 7, '#FFFFFF', 4);
        if (side.percent) box(g, x + 20, panelY + panelH - 26, (cell - 40) * side.percent / 100, 7, side.color, 4);
      }
    }
    if (!roomy) {
      text(g, `기권 ${a.abstain}표`, 96, y + 88, 14, font, 68, MUTED, 'center');
    }
  }));
}

/** @param {HTMLCanvasElement} canvas @returns {Promise<Blob>} */
export function toPng(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('이미지를 만들지 못했어요')), 'image/png'));
}
