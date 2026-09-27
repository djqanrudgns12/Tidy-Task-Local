import { TOOL_REGISTRY, PLATFORM_TOOLS } from './registry.js';

/** Derive the archive from current settings; never persist a second tool list.
 * @param {import('./preferences.js').Settings['toolkit']} config
 */
export function moreTools(config) {
  return config.toolOrderIds.flatMap((id) => {
    if (id === 'external') return PLATFORM_TOOLS
      .filter((tool) => !config.externalToolsEnabled || config.hiddenPlatformIds.includes(tool.id))
      .map((tool) => ({ ...tool, platform: true, entries: [] }));
    const tool = TOOL_REGISTRY.find((tool) => tool.id === id);
    return tool && !config.visibleToolIds.includes(id) ? [{ ...tool, platform: false }] : [];
  });
}
