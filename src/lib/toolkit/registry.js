import { TIMER_KINDS, TIMER_NAMES } from './preferences.js';
// Only implemented tools enter the registry. Future tools add metadata and a native role.
export const TIMER_TOOLS = Object.freeze(
  TIMER_KINDS.map((kind) => Object.freeze({ id: kind, label: TIMER_NAMES[kind] })),
);
export const TOOL_REGISTRY = Object.freeze([
  { id: 'timer', label: '타이머', entries: TIMER_TOOLS },
]);
