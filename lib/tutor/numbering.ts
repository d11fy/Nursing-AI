// Pure helpers shared by document-structure detection and chapter-request parsing.
// Handles Latin/Arabic-Indic digits, English number words, Roman numerals and
// Arabic ordinals/cardinals (الرابع، رابع، اربعة، الحادي عشر ...).

const EASTERN_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => EASTERN_DIGITS[digit] ?? digit);
}

/** Arabic orthographic normalisation so spelling variants compare equal. */
export function normalizeArabic(value: string): string {
  return value
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ؤ]/g, "و")
    .replace(/[ئ]/g, "ي");
}

const BIDI_AND_SPACES = /[​-‏‪-‮⁦-⁩﻿]/g;

/** Lower-cased, digit- and Arabic-normalised text used for every comparison. */
export function normalizeForMatch(value: string): string {
  return normalizeArabic(normalizeDigits(value.normalize("NFKC").replace(BIDI_AND_SPACES, "").replace(/ /g, " "))).toLowerCase();
}

/** Letters, digits and (inside words) apostrophes; punctuation becomes a boundary. */
export function tokenize(value: string): string[] {
  return normalizeForMatch(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

const EN_UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
};
const EN_TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50,
};

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
/** Roman numerals up to 99. Returns null for anything that is not a canonical numeral. */
export function parseRoman(token: string): number | null {
  const lower = token.toLowerCase();
  if (!/^[ivxlc]+$/.test(lower)) return null;
  let total = 0;
  for (let i = 0; i < lower.length; i++) {
    const value = ROMAN_VALUES[lower[i]], next = ROMAN_VALUES[lower[i + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  if (total < 1 || total > 99) return null;
  // Canonical check: formatting the value back must reproduce the input.
  return formatRoman(total) === lower ? total : null;
}
export function formatRoman(value: number): string {
  const table: Array<[number, string]> = [[90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let remaining = value, out = "";
  for (const [amount, symbol] of table) while (remaining >= amount) { out += symbol; remaining -= amount; }
  return out;
}

// Arabic keys are stored in normalizeArabic() form without the definite article.
const AR_ORDINALS: Record<string, number> = {
  اول: 1, اولي: 1, ثاني: 2, ثانيه: 2, ثالث: 3, ثالثه: 3, رابع: 4, رابعه: 4, خامس: 5, خامسه: 5,
  سادس: 6, سادسه: 6, سابع: 7, سابعه: 7, ثامن: 8, ثامنه: 8, تاسع: 9, تاسعه: 9, عاشر: 10, عاشره: 10,
  حادي: 1, حاديه: 1,
};
const AR_CARDINALS: Record<string, number> = {
  واحد: 1, واحده: 1, اثنان: 2, اثنين: 2, اتنين: 2, اثنتان: 2, اثنتين: 2, ثنتين: 2, ثلاثه: 3, ثلاث: 3, تلاته: 3, تلات: 3,
  اربعه: 4, اربع: 4, خمسه: 5, خمس: 5, سته: 6, ست: 6, سبعه: 7, سبع: 7, ثمانيه: 8, ثماني: 8, ثمان: 8, تمانيه: 8, تمان: 8,
  تسعه: 9, تسع: 9, عشره: 10, عشر: 10, عشرون: 20, عشرين: 20,
};
const AR_TEN_MARKERS = new Set(["عشر", "عشره"]);
const stripArticle = (token: string) => (token.startsWith("ال") && token.length > 3 ? token.slice(2) : token);

export type ParsedNumber = { value: number; consumed: number };

/**
 * Parses a number starting at tokens[start]. `tokens` must come from tokenize().
 * Accepts digits (4, 4th), English words/ordinals (four, fourth, twenty one),
 * Roman numerals (IV) and Arabic ordinals/cardinals (الرابع، اربعة، الحادي عشر).
 */
export function parseNumberAt(tokens: string[], start: number, options: { allowRoman?: boolean } = {}): ParsedNumber | null {
  const token = tokens[start];
  if (token === undefined) return null;
  const digits = token.match(/^(\d{1,3})(?:st|nd|rd|th)?$/);
  if (digits) return { value: Number(digits[1]), consumed: 1 };
  if (token in EN_TENS) {
    const unit = tokens[start + 1];
    if (unit && EN_UNITS[unit] !== undefined && EN_UNITS[unit] >= 1 && EN_UNITS[unit] <= 9) return { value: EN_TENS[token] + EN_UNITS[unit], consumed: 2 };
    return { value: EN_TENS[token], consumed: 1 };
  }
  if (token in EN_UNITS) return { value: EN_UNITS[token], consumed: 1 };
  const arabic = stripArticle(token);
  const next = stripArticle(tokens[start + 1] ?? "");
  if (arabic in AR_ORDINALS && AR_TEN_MARKERS.has(next)) {
    return { value: 10 + AR_ORDINALS[arabic], consumed: 2 };
  }
  if ((arabic === "احد" || arabic === "اثنا" || arabic === "اثني") && AR_TEN_MARKERS.has(next)) return { value: arabic === "احد" ? 11 : 12, consumed: 2 };
  if (arabic in AR_CARDINALS && AR_TEN_MARKERS.has(next) && AR_CARDINALS[arabic] >= 3 && AR_CARDINALS[arabic] <= 9) return { value: 10 + AR_CARDINALS[arabic], consumed: 2 };
  if (arabic in AR_ORDINALS) return { value: AR_ORDINALS[arabic], consumed: 1 };
  if (arabic in AR_CARDINALS) return { value: AR_CARDINALS[arabic], consumed: 1 };
  if (options.allowRoman) {
    const roman = parseRoman(token);
    if (roman !== null) return { value: roman, consumed: 1 };
  }
  return null;
}
