// 급식창·메모창·컨트롤 패널·툴킷 모두 동일한 72종 내장 글꼴 단일 원천(fontCatalog.js)을 공유합니다.
import { flattenBuiltinFonts } from './fonts/fontCatalog.js';

export const BUILTIN_FONTS = flattenBuiltinFonts();
