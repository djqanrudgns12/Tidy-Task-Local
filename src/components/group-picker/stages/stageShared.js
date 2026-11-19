/** 3대 무대 공용 대기 타이틀 단일 생성자(담백·일관 규격).
 * @param {string} modeLabel @param {number} studentCount @param {number} groupCount */
export function idleTitle(modeLabel, studentCount, groupCount) {
  return `${modeLabel} · ${studentCount}명 · ${groupCount}모둠`;
}

/** 3대 무대 공용 호명 배너 체류/병합/물결 요약 및 OKLab 리컬러 조회 헬퍼(PRD §2.3, §4.1). */
import { fitFontSize } from '../../../lib/scoreboard/fitText.js';

/** 호명 배너 최소 체류(600ms)·최대 2명 병합·빙하 900ms 섬 요약 규칙 적용 상태기 생성. */
export function createBannerTracker() {
  /** @type {{ key:string, groupIndex:number, groupName:string, groupColorId?:string, groupColorHex:string, groupSymbol:string, names:string[], shownAtMs:number, minUntilMs:number, customSummary:string|null } | null} */
  let current = null;
  let lastSeenKey = '';
  let lastGlacierSummaryAt = -9999;

  return {
    reset() {
      current = null;
      lastSeenKey = '';
      lastGlacierSummaryAt = -9999;
    },

    /** @param {object} opts
     * @param {'train'|'glacier'|'elevator'} opts.mode
     * @param {number} opts.elapsed
     * @param {string} opts.idleText
     * @param {{ key:string, groupIndex:number, groupName:string, groupColorId?:string, groupColorHex:string, groupSymbol:string, studentName:string } | null} [opts.candidate]
     * @param {{ groupIndex:number, groupName:string, groupColorId?:string, groupColorHex:string, groupSymbol:string, text:string, force?:boolean } | null} [opts.summaryCandidate] */
    update({ mode, elapsed, idleText, candidate, summaryCandidate }) {
      if (mode === 'glacier' && summaryCandidate) {
        if (!summaryCandidate.force && current && current.groupIndex === summaryCandidate.groupIndex) {
          current = {
            ...current,
            customSummary: summaryCandidate.text,
          };
        } else if (summaryCandidate.force || elapsed - lastGlacierSummaryAt >= 900 || !current) {
          lastGlacierSummaryAt = elapsed;
          current = {
            key: `sum-${Math.floor(elapsed)}`,
            groupIndex: summaryCandidate.groupIndex,
            groupName: summaryCandidate.groupName,
            groupColorId: summaryCandidate.groupColorId,
            groupColorHex: summaryCandidate.groupColorHex,
            groupSymbol: summaryCandidate.groupSymbol,
            names: [],
            customSummary: summaryCandidate.text,
            shownAtMs: elapsed,
            minUntilMs: elapsed + 900,
          };
        }
        return current;
      }

      if (candidate && candidate.key !== lastSeenKey) {
        lastSeenKey = candidate.key;
        const canMerge =
          current &&
          !current.customSummary &&
          elapsed < current.minUntilMs + 160 &&
          current.groupIndex === candidate.groupIndex &&
          current.names.length < 2 &&
          !current.names.includes(candidate.studentName);

        if (canMerge && current) {
          current = {
            ...current,
            names: [...current.names, candidate.studentName],
            minUntilMs: Math.max(current.minUntilMs, elapsed + 600),
          };
        } else {
          current = {
            key: candidate.key,
            groupIndex: candidate.groupIndex,
            groupName: candidate.groupName,
            groupColorId: candidate.groupColorId,
            groupColorHex: candidate.groupColorHex,
            groupSymbol: candidate.groupSymbol,
            names: [candidate.studentName],
            customSummary: null,
            shownAtMs: elapsed,
            minUntilMs: elapsed + 600,
          };
        }
      }

      if (current && elapsed >= current.minUntilMs + 750 && !candidate) {
        current = null;
      }

      if (current) return current;
      return {
        key: 'idle-speech',
        groupIndex: -1,
        groupName: '',
        groupColorId: '',
        groupColorHex: '',
        groupSymbol: '',
        names: [],
        customSummary: idleText,
        shownAtMs: 0,
        minUntilMs: 0,
      };
    },
  };
}

/** 무대 이름표 폰트 크기 자동 축소 (잘림·slice 금지).
 * @param {string} label @param {number} maxW @param {number} maxPx @param {string} fontFamily @param {number} [minPx] */
export function fitStageLabelSize(label, maxW = 148, maxPx = 28, fontFamily = 'Pretendard, sans-serif', minPx = 14) {
  return fitFontSize(label, {
    family: fontFamily,
    weight: 800,
    avail: Math.max(72, maxW),
    max: maxPx,
    min: Math.min(minPx, maxPx),
  }).size;
}
