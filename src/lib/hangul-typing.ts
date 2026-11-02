/**
 * 한/영 키가 영문인 채로 친 글자를 두벌식 자판 기준 한글로 바꾼다.
 * (웹페이지는 PC 의 한/영 상태를 바꿀 수 없어서, 입력된 글자를 고친다)
 *
 *   qwertyToHangul("ghdrlfehd") === "홍길동"
 *   qwertyToHangul("홍길ehd")   === "홍길동"  // 앞 한글과 이어서 조합
 *   qwertyToHangul("010-1234")  === "010-1234" // 숫자·기호는 그대로
 */

const KEY_TO_JAMO: Record<string, string> = {
  q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ",
  a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ",
  z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ",
  Q: "ㅃ", W: "ㅉ", E: "ㄸ", R: "ㄲ", T: "ㅆ", O: "ㅒ", P: "ㅖ",
};

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ",
  "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

const COMPOUND_VOWEL: Record<string, string> = {
  ㅗㅏ: "ㅘ", ㅗㅐ: "ㅙ", ㅗㅣ: "ㅚ", ㅜㅓ: "ㅝ", ㅜㅔ: "ㅞ", ㅜㅣ: "ㅟ", ㅡㅣ: "ㅢ",
};
const COMPOUND_FINAL: Record<string, string> = {
  ㄱㅅ: "ㄳ", ㄴㅈ: "ㄵ", ㄴㅎ: "ㄶ", ㄹㄱ: "ㄺ", ㄹㅁ: "ㄻ", ㄹㅂ: "ㄼ", ㄹㅅ: "ㄽ",
  ㄹㅌ: "ㄾ", ㄹㅍ: "ㄿ", ㄹㅎ: "ㅀ", ㅂㅅ: "ㅄ",
};
/** 겹모음·겹받침 → 낱자 (다시 조합할 때 쪼갠다) */
const SPLIT: Record<string, string> = Object.fromEntries(
  [...Object.entries(COMPOUND_VOWEL), ...Object.entries(COMPOUND_FINAL)].map(
    ([pair, joined]) => [joined, pair],
  ),
);
const JAMO_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(KEY_TO_JAMO).map(([key, jamo]) => [jamo, key]),
);

const isVowel = (jamo: string) => JUNG.includes(jamo);

function composeJamo(jamos: string[]): string {
  let out = "";
  let cho = "";
  let jung = "";
  let jong = "";

  const flush = () => {
    if (cho && jung) {
      out += String.fromCharCode(
        0xac00 +
          (CHO.indexOf(cho) * 21 + JUNG.indexOf(jung)) * 28 +
          JONG.indexOf(jong),
      );
    } else {
      out += cho + jung;
    }
    cho = "";
    jung = "";
    jong = "";
  };

  for (const jamo of jamos) {
    if (isVowel(jamo)) {
      if (cho && jung && jong) {
        // 받침이 다음 글자의 초성으로 넘어간다 (겹받침이면 뒤쪽만).
        const split = SPLIT[jong];
        const nextCho = split ? split[1] : jong;
        jong = split ? split[0] : "";
        flush();
        cho = nextCho;
        jung = jamo;
      } else if (jung) {
        const joined = COMPOUND_VOWEL[jung + jamo];
        if (joined) {
          jung = joined;
        } else {
          flush();
          jung = jamo;
        }
      } else {
        jung = jamo;
      }
      continue;
    }

    // 자음
    if (cho && jung) {
      if (!jong) {
        if (JONG.includes(jamo)) {
          jong = jamo;
        } else {
          flush();
          cho = jamo;
        }
      } else {
        const joined = COMPOUND_FINAL[jong + jamo];
        if (joined) {
          jong = joined;
        } else {
          flush();
          cho = jamo;
        }
      }
    } else {
      if (cho || jung) flush();
      cho = jamo;
    }
  }
  flush();
  return out;
}

/** 한글(완성형·자모)을 두벌식 키 입력 순서로 되돌린다 */
function hangulToKeys(text: string): string {
  let keys = "";
  const pushJamo = (jamo: string) => {
    for (const part of SPLIT[jamo] ?? jamo) {
      keys += JAMO_TO_KEY[part] ?? part;
    }
  };
  for (const char of text) {
    const code = char.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172) {
      pushJamo(CHO[Math.floor(code / 588)]);
      pushJamo(JUNG[Math.floor((code % 588) / 28)]);
      const jong = JONG[code % 28];
      if (jong) pushJamo(jong);
    } else if (/[A-Za-z]/.test(char)) {
      keys += char;
    } else {
      pushJamo(char);
    }
  }
  return keys;
}

function keyToJamo(key: string) {
  return KEY_TO_JAMO[key] ?? KEY_TO_JAMO[key.toLowerCase()] ?? key;
}

export type HangulConvertOptions = {
  /**
   * 완성된 글자만 나올 때만 바꾼다. 낱자(ㄱ, ㅣ, ㅢ …)가 남으면 영문 그대로 둔다.
   * 상품 검색처럼 영문(1.8L, 500mL)도 쳐야 하는 칸에 쓴다.
   */
  syllablesOnly?: boolean;
};

/**
 * 영문 글자가 섞인 한글/영문 덩어리만 두벌식으로 다시 조합한다.
 * 영문이 없는 부분(이미 한글, 숫자, 기호, 공백)은 건드리지 않는다.
 */
export function qwertyToHangul(
  text: string,
  options: HangulConvertOptions = {},
): string {
  return text.replace(/[A-Za-z가-힣ㄱ-ㅣ]+/g, (chunk) => {
    if (!/[A-Za-z]/.test(chunk)) {
      return chunk;
    }
    const composed = composeJamo([...hangulToKeys(chunk)].map(keyToJamo));
    return options.syllablesOnly && /[ㄱ-ㅣ]/.test(composed) ? chunk : composed;
  });
}

/** 영문이 들어 있는지 (검색어를 한글로도 찾아볼지 판단) */
export function hasLatinLetters(text: string) {
  return /[A-Za-z]/.test(text);
}

/**
 * 입력칸 onChange 에서 쓴다: 한글 IME 조합 중이 아니면 영문 입력을 한글로 바꾼 값을 돌려주고,
 * 커서가 끝이 아니면 바뀐 길이에 맞춰 커서 위치를 되돌린다.
 */
export function hangulInputValue(
  event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  options: HangulConvertOptions = {},
): string {
  const input = event.target;
  const raw = input.value;
  const native = event.nativeEvent as InputEvent;
  if (native.isComposing || !hasLatinLetters(raw)) {
    return raw;
  }
  const converted = qwertyToHangul(raw, options);
  const caret = input.selectionStart;
  if (caret !== null && caret < raw.length) {
    const nextCaret = qwertyToHangul(raw.slice(0, caret), options).length;
    requestAnimationFrame(() => input.setSelectionRange(nextCaret, nextCaret));
  }
  return converted;
}
