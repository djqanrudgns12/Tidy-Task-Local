/** UI colors are independent of illustration palettes and document formatting. */
export const TOOLKIT_THEMES = [
  { id: 'sage', label: '세이지 그린', swatch: '#39806b', light: ['#f3f7f3','#ffffff','#e5f0e9','#bdcec3','#203b32','#536b5e','#286950'], action: '#286950' },
  { id: 'ocean', label: '오션 블루', swatch: '#397eb0', light: ['#f2f6fb','#ffffff','#e4eff9','#bbccde','#21374d','#506780','#236698'], action: '#236698' },
  { id: 'lavender', label: '라벤더', swatch: '#8270b2', light: ['#f6f3fa','#ffffff','#eee8f7','#ccc1dc','#3b2e50','#6b5b7e','#72539b'], action: '#72539b' },
  { id: 'rose', label: '로즈', swatch: '#b56981', light: ['#fbf3f5','#ffffff','#f7e6ec','#dfbfca','#502e3a','#805968','#a04466'], action: '#a04466' },
  { id: 'amber', label: '앰버', swatch: '#af8030', light: ['#faf6ed','#ffffff','#f5ebd4','#d8c6a0','#443720','#746344','#8a601b'], action: '#8a601b' },
  { id: 'slate', label: '슬레이트', swatch: '#667b8a', light: ['#f3f5f7','#ffffff','#e7edf1','#c0ccd4','#2d3b45','#5b6b78','#4a6377'], action: '#4a6377' },
];

// Shared neutral charcoal/slate, following Tidy Task and Tiny Note dark surfaces.
export const TOOLKIT_DARK = ['#23272e','#2b3039','#334155','#64748b','#f1f5f9','#cbd5e1','#cbd5e1'];

/** @param {string} [id] @param {boolean} [dark] */
export function toolkitColors(id = 'sage', dark = false) {
  const theme = TOOLKIT_THEMES.find(t => t.id === id) || TOOLKIT_THEMES[0];
  const [bg, panel, soft, line, ink, muted, accent] = dark ? TOOLKIT_DARK : theme.light;
  return { bg, panel, soft, line, ink, muted, accent, action: dark ? '#475569' : theme.action,
    'on-action': '#ffffff', danger: dark ? '#ffb5ae' : '#a13229',
    'danger-soft': dark ? '#4a2b2b' : '#fbe9e6',
    gold: dark ? '#e8bd70' : '#ffcf73', peach: dark ? '#e7ad91' : '#ffd1bb',
    'display-bg': dark ? '#1e293b' : theme.action, 'display-ink': '#ffffff',
  };
}
