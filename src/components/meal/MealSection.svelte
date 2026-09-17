<script>
  import {
    ChevronDown,
    HeartPulse,
    MapPin,
    Moon,
    Sunrise,
    TriangleAlert,
    UsersRound,
  } from "lucide-svelte";
  import MealIcon from "./MealIcon.svelte";
  import { allergenName, macroRatios } from "../../lib/meal/mealFormat.js";
  /** @type {{meal:ReturnType<typeof import('../../lib/meal/mealFormat').parseMeal>;settings:import('../../lib/meal/types').MealSettings;compact?:boolean;wide?:boolean}} */
  let { meal, settings, compact = false, wide = false } = $props();
  const ratios = $derived(macroRatios(meal.nutrients));
  const warnings = $derived(
    meal.dishes.filter((d) =>
      d.allergens.some((n) => settings.allergies.includes(n)),
    ).length,
  );
</script>

<section class="meal-section">
  <div class="section-heading">
    <span class="meal-symbol"
      >{#if meal.MMEAL_SC_CODE === "1"}<Sunrise
          size={18}
        />{:else if meal.MMEAL_SC_CODE === "3"}<Moon
          size={18}
        />{:else}<MealIcon size={20} />{/if}</span
    >
    <strong>{meal.MMEAL_SC_NM}</strong>
    {#if warnings}<span class="warning-count"
        ><TriangleAlert size={11} /> {warnings}개 주의</span
      >{/if}
    {#if settings.display.calories && meal.calories}<span class="calories"
        >{Math.round(meal.calories)} <span>kcal</span></span
      >{/if}
  </div>
  <div class="meal-columns">
    <div>
      <ul class="dish-list">
        {#each meal.dishes as dish, i (i)}
          {@const matched = dish.allergens.filter((n) =>
            settings.allergies.includes(n),
          )}
          <li class:has-warning={matched.length > 0}>
            <div class="dish-name">
              <span class="dot"></span><span
                >{settings.display.companions ? dish.plain : dish.name}</span
              >{#if matched.length}<span
                  class="warning-icon"
                  title={`주의: ${matched.map(allergenName).join(", ")}`}
                  aria-label={`주의: ${matched.map(allergenName).join(", ")}`}
                  ><TriangleAlert size={12} /></span
                >{/if}{#if settings.display.badges}{#each dish.badges as badge}<span
                    class="dish-badge">{badge}</span
                  >{/each}{/if}
            </div>
            {#if settings.display.allergens !== "off" && dish.allergens.length && !compact}<div
                class="allergen-list"
                aria-label="알레르기 유발 식품"
              >
                {#each dish.allergens as n}<span
                    class:matched={settings.allergies.includes(n)}
                    title={`${n} ${allergenName(n)}`}
                    >{settings.display.allergens === "names"
                      ? allergenName(n)
                      : n}</span
                  >{/each}
              </div>{/if}
          </li>
        {/each}
      </ul>
      {#if settings.display.macros && ratios.length && !compact}
        <div class="macros">
          <div
            class="macro-bar"
            role="img"
            aria-label={`에너지 비율: 탄수화물 ${ratios[0]}%, 단백질 ${ratios[1]}%, 지방 ${ratios[2]}%`}
          >
            {#each ratios as ratio, i}<span
                style:width={`${ratio}%`}
                style:opacity={1 - i * 0.28}
              ></span>{/each}
          </div>
          <div class="macro-legend">
            {#each ["탄수화물", "단백질", "지방"] as label, i}<span
                >{label} <b>{ratios[i]}%</b></span
              >{/each}
          </div>
        </div>
      {/if}
    </div>
    {#if !compact && (settings.display.nutrition || settings.display.origins || settings.display.people)}
      <details class="meal-detail" open={wide}>
        <summary>
          <span class="summary-icon"><HeartPulse size={14} /></span>
          <span>
            <strong>급식 정보</strong>
            <small>영양 · 원산지 · 급식 인원</small>
          </span>
          <span class="summary-chevron"><ChevronDown size={15} /></span>
        </summary>
        <div class="detail-body">
          {#if settings.display.nutrition}<section
              class="detail-section nutrition-section"
            >
              <div class="detail-heading">
                <span>영양 정보</span><small>한 끼 기준</small>
              </div>
              <dl>
                {#each meal.nutrients as n}<div>
                    <dt>{n.label}</dt>
                    <dd>{n.value}<small> {n.unit}</small></dd>
                  </div>{/each}
              </dl>
              {#if !meal.nutrients.length}<p class="muted">
                  등록된 영양 정보가 없어요.
                </p>{/if}
            </section>{/if}
          {#if settings.display.origins}<section
              class="detail-section origin-section"
            >
              <div class="detail-heading">
                <span><MapPin size={13} /> 식재료 원산지</span>
                {#if meal.origins.length}<small
                    >{meal.origins.length}개 분류</small
                  >{/if}
              </div>
              <div class="origin-list">
                {#each meal.origins as group}<div class="origin">
                    <strong>{group.origin}</strong>
                    <p>{group.foods.join(" · ")}</p>
                  </div>{/each}
              </div>
              {#if !meal.origins.length}<p class="muted">
                  등록된 원산지 정보가 없어요.
                </p>{/if}
            </section>{/if}
          {#if settings.display.people && meal.MLSV_FGR}<section
              class="people-card"
            >
              <span class="people-icon"><UsersRound size={13} /></span>
              <span class="people-copy">
                <small>급식 인원</small>
                <strong>{Number(meal.MLSV_FGR).toLocaleString()}명</strong>
              </span>
            </section>{/if}
        </div>
      </details>
    {/if}
  </div>
</section>

<style>
  .meal-section {
    min-width: 0;
  }
  .section-heading {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 12px;
    min-width: 0;
  }
  .section-heading strong {
    font-size: max(10px, 0.95em);
  }
  .meal-symbol {
    color: var(--meal-ink);
    display: flex;
  }
  .calories {
    margin-left: auto;
    white-space: nowrap;
    font-size: max(10px, 0.85em);
    font-variant-numeric: tabular-nums;
    color: var(--meal-ink);
    background: var(--meal-section);
    border-radius: 6px;
    padding: 3px 7px;
  }
  .calories span {
    font-size: 10px;
  }
  .warning-count {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: var(--meal-warn);
  }
  .dish-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .dish-list li {
    min-width: 0;
    border-radius: 6px;
  }
  .dish-name {
    display: flex;
    align-items: baseline;
    gap: 7px;
    line-height: 1.55;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }
  .dish-name > span:nth-child(2) {
    min-width: 0;
  }
  .dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--meal-accent);
    flex-shrink: 0;
    align-self: start;
    margin-top: 0.65em;
  }
  .dish-badge {
    font-size: 10px;
    color: var(--meal-muted);
    background: var(--meal-section);
    border-radius: 4px;
    padding: 0 4px;
    white-space: nowrap;
  }
  .warning-icon {
    color: var(--meal-warn);
    align-self: center;
    display: flex;
  }
  .allergen-list {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 3px 0 0 11px;
  }
  .allergen-list span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    min-height: 16px;
    padding: 0 3px;
    font-size: 10px;
    color: var(--meal-muted);
    font-variant-numeric: tabular-nums;
    border: 1px solid var(--meal-border);
    border-radius: 4px;
  }
  .allergen-list .matched {
    color: var(--meal-warn);
    background: var(--meal-warn-bg);
    border-color: var(--meal-warn);
    font-weight: bold;
  }
  .macros {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px dashed var(--meal-border);
  }
  .macro-bar {
    height: 5px;
    display: flex;
    gap: 2px;
    border-radius: 5px;
    overflow: hidden;
  }
  .macro-bar span {
    background: var(--meal-accent);
  }
  .macro-legend {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 7px;
    font-size: 10px;
    color: var(--meal-muted);
  }
  .macro-legend b {
    color: var(--meal-text);
    font-weight: 400;
  }
  .meal-detail {
    margin-top: 15px;
    border: 1px solid var(--meal-border);
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--meal-section) 50%,
      var(--meal-surface)
    );
    overflow: hidden;
    font-size: max(10px, 0.82em);
  }
  summary {
    cursor: pointer;
    min-height: 48px;
    padding: 9px 11px;
    color: var(--meal-text);
    display: flex;
    align-items: center;
    gap: 9px;
    list-style: none;
    user-select: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:hover {
    background: color-mix(in srgb, var(--meal-section) 78%, transparent);
  }
  .summary-icon,
  .people-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--meal-ink);
    background: var(--meal-section);
    border-radius: 7px;
  }
  .summary-icon {
    width: 28px;
    height: 28px;
  }
  summary > span:nth-child(2) {
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.35;
  }
  summary strong {
    font-size: 11px;
  }
  summary small {
    color: var(--meal-muted);
    font-size: 9px;
  }
  .summary-chevron {
    margin-left: auto;
    flex-shrink: 0;
    color: var(--meal-muted);
    transition: transform 160ms ease;
  }
  .meal-detail[open] .summary-chevron {
    transform: rotate(180deg);
  }
  .detail-body {
    padding: 0 10px 10px;
  }
  .detail-section {
    padding: 11px 0;
    border-top: 1px solid var(--meal-border);
  }
  .detail-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-weight: 700;
    margin: 0 0 8px;
    font-size: 12px;
  }
  .detail-heading > span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .detail-heading small {
    font-size: 9px;
    font-weight: 400;
    color: var(--meal-muted);
  }
  dl {
    margin: 0;
  }
  dl div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 1px;
    border-bottom: 1px solid var(--meal-border);
  }
  dl div:last-child {
    border-bottom: 0;
  }
  dt {
    color: var(--meal-muted);
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  dd small {
    font-size: 10px;
    color: var(--meal-muted);
  }
  .origin-list {
    display: grid;
    gap: 7px;
  }
  .origin {
    padding: 9px 10px;
    border: 1px solid var(--meal-border);
    border-radius: 8px;
    background: var(--meal-surface);
  }
  .origin strong {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 1px 7px;
    font-size: 10px;
    color: var(--meal-ink);
    background: var(--meal-section);
    border-radius: 999px;
  }
  .origin p {
    margin: 6px 0 0;
    color: var(--meal-text);
    word-break: keep-all;
    overflow-wrap: anywhere;
    line-height: 1.7;
  }
  .people-card {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 8px;
    padding: 8px 10px;
    border-top: 1px solid var(--meal-border);
  }
  .people-icon {
    width: 20px;
    height: 20px;
    background: transparent;
  }
  .people-copy {
    display: flex;
    flex: 1;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    line-height: 1.5;
  }
  .people-copy small {
    color: var(--meal-muted);
    font-size: 9px;
  }
  .people-copy strong {
    color: var(--meal-ink);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  :global([data-layout="mini"]) .section-heading,
  :global([data-layout="mini"]) .macros,
  :global([data-layout="mini"]) .meal-detail,
  :global([data-layout="mini"]) .allergen-list,
  :global([data-layout="compact"]) .allergen-list,
  :global([data-layout="compact"]) .macros {
    display: none;
  }
  :global([data-layout="mini"]) .dish-list {
    gap: 4px;
  }
  :global([data-layout="compact"]) .dish-list {
    gap: 7px;
  }
  :global([data-layout="wide"]) .meal-columns {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(155px, 1fr);
    gap: 24px;
  }
  :global([data-layout="wide"]) .meal-detail {
    margin: 0;
    align-self: start;
  }
  :global([data-layout="wide"]) .meal-detail::details-content {
    content-visibility: visible;
    display: block;
  }
  :global([data-layout="wide"]) summary {
    display: none;
  }
  :global([data-layout="wide"]) .detail-body {
    padding-top: 10px;
  }
  :global([data-layout="wide"]) .detail-section:first-child {
    border-top: 0;
  }
  .dish-list {
    gap: 9px;
  }
  .dish-list li {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    column-gap: 5px;
    row-gap: 2px;
  }
  .dish-name {
    flex: 1 1 155px;
  }
  .allergen-list {
    padding: 0;
    justify-content: flex-end;
    max-width: 100%;
    margin-left: auto;
    align-self: center;
  }
  .allergen-list span {
    border-color: transparent;
    background: color-mix(in srgb, var(--meal-section) 65%, transparent);
    min-width: 13px;
    padding: 0 2px;
    font-size: 10px;
  }
  .allergen-list .matched {
    border-color: var(--meal-warn);
  }
  :global([data-layout="weekly"]) .section-heading {
    display: grid;
    grid-template-columns: auto auto 1fr;
    grid-template-rows: 22px 22px;
    row-gap: 4px;
  }
  :global([data-layout="weekly"]) .dish-name {
    flex-basis: 100%;
  }
  :global([data-layout="weekly"]) .calories {
    grid-row: 2;
    grid-column: 1 / -1;
    justify-self: start;
    margin-left: 0;
    font-size: 10px;
  }
  :global([data-layout="weekly"]) .warning-count {
    font-size: 10px;
  }
</style>
