export type School = Record<string, string> & {
  ATPT_OFCDC_SC_CODE: string;
  SD_SCHUL_CODE: string;
  SCHUL_NM: string;
};
export type MealRow = Record<string, string> & {
  MLSV_YMD: string;
  MMEAL_SC_CODE: string;
  MMEAL_SC_NM: string;
  MLSV_FGR?: string;
};
export type ScheduleRow = Record<string, string>;
export type Nutrient = { label: string; unit: string; value: number };
export type CacheEntry = {
  rows: MealRow[];
  events: ScheduleRow[];
  updatedAt: number;
  scheduleAt: number;
  sample: boolean;
};
export type MainAppearance = {
  themeColor?: string;
  isDarkMode?: boolean;
  uiFontFamily?: string;
  letterSpacing?: number;
};
export type CustomFont = { name: string; path: string };
export type MealSettings = {
  school: School | null;
  display: { allergens: string; [key: string]: string | boolean };
  appearance: {
    theme: string;
    dark: string;
    font: string;
    scale: number;
    opacity: number;
  };
  behavior: {
    startup: boolean;
    pinned: boolean;
    tomorrow: boolean;
    meals: string[];
  };
  allergies: number[];
};
