import { Fragment } from "react";

/** 규격 줄바꿈 표시: <br>, <br/>, <br />, <BR> 모두 허용 */
const SPEC_BR = /<br\s*\/?>/gi;

/** 규격을 <br/> 기준 줄로 나눈다 (빈 줄 제외) */
export function splitSpecLines(spec: string | null | undefined): string[] {
  if (!spec) return [];
  return spec
    .split(SPEC_BR)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 한 줄 문맥(요약·검색)용 평문: <br/> 를 구분자로 바꾼다 */
export function specToPlain(
  spec: string | null | undefined,
  sep = ", ",
): string {
  return splitSpecLines(spec).join(sep);
}

/**
 * 규격을 <br/> 자리에서 줄바꿈해 보여준다.
 * HTML 로 해석하지 않으므로 <br> 외 태그는 글자 그대로 보인다.
 */
export function SpecText({
  spec,
  fallback = "-",
}: {
  spec: string | null | undefined;
  fallback?: string;
}) {
  const lines = splitSpecLines(spec);
  if (lines.length === 0) return <>{fallback}</>;
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </>
  );
}
