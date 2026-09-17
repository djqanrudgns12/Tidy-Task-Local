<script>
  import MealFrame from "./MealFrame.svelte";
  import MealWindow from "./MealWindow.svelte";
  import { normalizeMealSettings } from "../../lib/meal/mealSettings.js";
  import { previewSchool, previewRows } from "../../lib/meal/previewFixture.js";
  const sizes = [
    [180, 120],
    [260, 390],
    [340, 460],
    [560, 490],
    [880, 560],
  ];
  const scales = [0.85, 0.92, 1, 1.12, 1.25];
</script>

<div class="matrix">
  {#each scales as scale}<section>
      <h1>글자 배율 {scale}</h1>
      <div class="cases">
        {#each sizes as [width, height]}{@const settings =
            normalizeMealSettings({
              school: previewSchool,
              allergies: [2],
              appearance: { theme: "sea-glass", scale },
            })}
          <article data-scale={scale} data-width={width} data-height={height}>
            <h2>{width} × {height}</h2>
            <div
              class="case"
              style:width={`${width}px`}
              style:height={`${height}px`}
            >
              <MealFrame {settings}
                ><MealWindow {settings} {previewRows} /></MealFrame
              >
            </div>
          </article>{/each}
      </div>
    </section>{/each}
</div>

<style>
  :global(body:has(.matrix)) {
    overflow: auto;
    background: #eef1ef;
  }
  .matrix {
    padding: 25px;
  }
  .cases {
    display: flex;
    align-items: flex-start;
    gap: 20px;
  }
  .case :global(.meal-frame) {
    height: 100%;
  }
  h1 {
    font-size: 20px;
    margin: 30px 0 15px;
  }
  h2 {
    font-size: 13px;
    margin-bottom: 8px;
  }
  article {
    flex-shrink: 0;
  }
</style>
