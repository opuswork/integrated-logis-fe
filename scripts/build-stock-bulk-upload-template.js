/**
 * Build fe/public/templates/stock-bulk-upload.xlsx — 재고관리 대량 엑셀업로드 양식.
 * 헤더 문자열은 be/src/stock-inventory/stock-import-row.ts 의 mapExcelRow 별칭과 맞춰야 한다.
 * Run: node scripts/build-stock-bulk-upload-template.js
 */
const ExcelJS = require("exceljs");
const path = require("path");

const DEST = path.join(__dirname, "../public/templates/stock-bulk-upload.xlsx");
// 백엔드는 첫 번째 시트만 읽는다. 안내문은 반드시 두 번째 시트에 둘 것
// (첫 시트에 두면 안내문 줄이 데이터 행으로 읽혀 오류로 잡힌다).
const SHEET = "재고업로드";
const GUIDE_SHEET = "작성안내";

/** [헤더, 열 너비, 필수 여부, 안내] */
const COLUMNS = [
  ["코드", 14, true, "상품 고유 코드 (중복 시 기존 상품 수정)"],
  [
    "사진",
    14,
    false,
    "셀 안에 사진을 직접 넣으세요. 비우면 기존 사진 유지, '-' 입력 시 사진 삭제",
  ],
  ["품명", 22, true, "상품명"],
  ["규격", 16, false, "예: 500ml x 2"],
  ["단위", 8, true, "1세트에 들어가는 수량 (1 이상)"],
  ["재고", 10, false, "실사 정정용 절대값. 비우면 기존 재고 유지"],
  ["입고수량", 10, false, "이번에 추가 입고한 수량 (현재 재고에 가산)"],
  ["적용일자", 14, true, "YYYY-MM-DD"],
  ["전체500만원이상주문시할인가격", 24, false, "숫자만"],
  ["전체100만원이상주문시할인가격", 24, false, "숫자만"],
  ["도매(기본적용가격)", 18, false, "숫자만"],
  ["준회원", 12, false, "숫자만"],
  ["구분", 12, true, "선물세트 / 일반품"],
];

const SAMPLE_NEW = [
  "A-001",
  null, // 사진: 예시 이미지를 넣으면 양식 용량만 커진다
  "감사1호",
  "500ml x 2",
  2,
  10000,
  null,
  "2026-01-01",
  45000,
  47000,
  50000,
  52000,
  "선물세트",
];

// 재입고 예시는 넣지 않는다. '코드 + 입고수량'만 있는 행은 그 코드가 이미
// 등록돼 있어야 유효한데, 양식의 예시 코드는 어느 DB에도 없어서 미리보기에
// 항상 오류로 뜬다. 재입고 방법은 '작성안내' 시트에서 설명한다.

/** 사진을 넣기 편하도록 높여 둘 데이터 행 (2행부터) */
const PREPARED_ROWS = 30;
const PHOTO_ROW_HEIGHT = 60;

const PRICE_COLUMNS = [
  "전체500만원이상주문시할인가격",
  "전체100만원이상주문시할인가격",
  "도매(기본적용가격)",
  "준회원",
];

const NOTES = [
  "※ 1행은 헤더입니다. 2행부터 데이터를 입력하세요. 2행의 회색 예시 1줄은 지우고 사용하세요.",
  "※ 신규 등록: 코드 · 품명 · 단위 · 적용일자 · 구분은 필수입니다 (헤더가 파란색인 열).",
  "※ 기존 코드 재고 추가: 이미 등록된 코드라면 '코드'와 '입고수량' 두 칸만 채우면 됩니다. 비워 둔 칸은 기존 상품 값이 그대로 유지됩니다.",
  "※ 단, 아직 등록되지 않은 새 코드는 '코드 + 입고수량'만으로는 등록할 수 없습니다 (품명·단위·적용일자·구분이 필요합니다).",
  "※ '재고'는 실사 정정용 절대값이고, '입고수량'은 현재 재고에 더해집니다. 둘 다 비우면 재고는 변경되지 않습니다.",
  "※ 업로드 화면의 '이미 등록된 코드도 반영'을 체크 해제하면 기존 코드는 건너뛰고 신규 품목만 등록됩니다.",
  "※ 한 번에 최대 1000행까지 업로드할 수 있습니다.",
  "",
  "[사진 넣는 방법] — 둘 중 아무 방법이나 쓰시면 됩니다.",
  "  1) 삽입 > 그림 > 이 디바이스 를 눌러 사진을 넣고, 해당 행의 '사진' 칸 안으로 끌어다 크기를 맞춥니다.",
  "  2) Excel 365 라면 넣은 그림을 우클릭 > '셀에 배치'를 누르면 사진이 셀 안에 들어갑니다.",
  "  · 사진은 반드시 그 상품 행의 '사진' 칸 위에 놓아야 합니다. 다른 열에 걸쳐 있으면 인식되지 않습니다.",
  "  · 사진 칸을 비워 두면 기존 사진이 그대로 유지됩니다. 사진을 지우려면 '-' 를 입력하세요.",
  "  · 이미 등록된 사진과 같은 사진이면 다시 올리지 않고 건너뜁니다(업로드가 빨라집니다).",
  "  · 사진 칸에 이미지 주소(https://...)를 텍스트로 적어도 됩니다.",
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sanc Logistics";
  wb.created = new Date();

  const ws = wb.addWorksheet(SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // 헤더 문자열은 백엔드 별칭과 정확히 같아야 하므로 * 같은 장식을 붙이지 않는다.
  // 필수 열은 배경색(파랑)과 셀 메모로 구분한다.
  ws.columns = COLUMNS.map(([header, width]) => ({ header, width }));

  const headerRow = ws.getRow(1);
  headerRow.height = 32;
  COLUMNS.forEach(([, , required, note], index) => {
    const cell = headerRow.getCell(index + 1);
    cell.font = { bold: true, size: 10, color: { argb: "FF1A202C" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: required ? "FFEBF4FD" : "FFF8FAFC" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
    cell.note = required ? `[필수] ${note}` : `[선택] ${note}`;
  });

  const sampleRow = ws.addRow(SAMPLE_NEW);
  sampleRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { size: 10, color: { argb: "FF94A3B8" }, italic: true };
    cell.alignment = { vertical: "middle" };
  });

  // 사진을 셀에 넣기 편하도록 데이터 행을 높인다.
  // (열 순서가 바뀌어도 깨지지 않게 헤더 이름으로 번호를 찾는다)
  const columnIndex = (header) =>
    COLUMNS.findIndex(([name]) => name === header) + 1;

  for (let r = 2; r <= PREPARED_ROWS; r += 1) {
    ws.getRow(r).height = PHOTO_ROW_HEIGHT;
  }

  // 숫자 / 날짜 서식
  ["재고", "입고수량", ...PRICE_COLUMNS].forEach((header) => {
    ws.getColumn(columnIndex(header)).numFmt = "#,##0";
  });
  ws.getColumn(columnIndex("적용일자")).numFmt = "yyyy-mm-dd";
  ws.getColumn(columnIndex("사진")).alignment = {
    vertical: "middle",
    horizontal: "center",
  };

  const guide = wb.addWorksheet(GUIDE_SHEET);
  guide.columns = [{ header: "작성 안내", width: 110 }];
  guide.getRow(1).font = { bold: true, size: 12, color: { argb: "FF1A202C" } };
  guide.getRow(1).height = 26;
  NOTES.forEach((text) => {
    const row = guide.addRow([text]);
    row.height = 20;
    row.getCell(1).font = { size: 10, color: { argb: "FFC05621" } };
    row.getCell(1).alignment = { vertical: "middle", wrapText: true };
  });

  guide.addRow([]);
  const legend = guide.addRow(["[열 설명]"]);
  legend.getCell(1).font = { bold: true, size: 11, color: { argb: "FF1A202C" } };
  COLUMNS.forEach(([header, , required, note]) => {
    const row = guide.addRow([
      `${header} — ${required ? "[필수]" : "[선택]"} ${note}`,
    ]);
    row.getCell(1).font = { size: 10, color: { argb: "FF64748B" } };
  });

  await wb.xlsx.writeFile(DEST);
  console.log(`Wrote ${DEST}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
