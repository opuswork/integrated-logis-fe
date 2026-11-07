import ExcelJS from "exceljs";

export type MemberExportRow = [
  username: string,
  fullname: string,
  churchName: string,
  memberType: string,
  phone: string,
];

/** 회원명단 엑셀 열. 다시 올릴 때(parseMembersWorkbook)도 이 머리글로 열을 찾는다. */
const HEADERS = ["아이디", "이름", "중앙", "직분", "연락처"] as const;
const COLUMN_WIDTHS = [18, 14, 14, 10, 16];
/** 아이디·연락처는 글자로 저장해 앞자리 0(010…)이 지워지지 않게 한다 */
const TEXT_COLUMNS = new Set([0, 4]);

/**
 * 회원명단(아이디 | 이름 | 중앙 | 직분 | 연락처) .xlsx 다운로드.
 * 고친 뒤 '엑셀 업로드'로 다시 올리면 아이디 기준으로 회원 정보가 수정된다.
 */
export async function exportMembersWorkbook({
  rows,
  filename,
}: {
  rows: MemberExportRow[];
  filename: string;
}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("회원명단", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = HEADERS.map((header, index) => ({
    header,
    width: COLUMN_WIDTHS[index],
    style: TEXT_COLUMNS.has(index) ? { numFmt: "@" } : {},
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };
  });

  sheet.addRows(rows);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export type MemberImportRow = {
  rowNumber: number;
  username: string;
  fullname: string;
  churchName: string;
  memberType: string;
  phone: string;
};

/** 셀 값을 글자로. 엑셀이 숫자로 바꾼 휴대폰 번호(1044631440)는 앞의 0을 되살린다. */
function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "number") {
    const text = String(value);
    return /^1[016789]\d{7,8}$/.test(text) ? `0${text}` : text;
  }
  return cell.text.trim();
}

/**
 * exportMembersWorkbook 으로 받은(그리고 고친) 엑셀을 읽는다.
 * 첫 시트에서 '아이디' 머리글이 있는 행을 찾고, 머리글 이름으로 열을 맞춘다(열 순서가 바뀌어도 됨).
 */
export async function parseMembersWorkbook(
  file: File,
): Promise<MemberImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("엑셀에 시트가 없습니다.");

  let headerRowNumber = 0;
  const columnOf: Partial<Record<(typeof HEADERS)[number], number>> = {};
  sheet.eachRow((row, rowNumber) => {
    if (headerRowNumber) return;
    const found: typeof columnOf = {};
    row.eachCell((cell, colNumber) => {
      const header = cell.text.trim() as (typeof HEADERS)[number];
      if (HEADERS.includes(header)) found[header] = colNumber;
    });
    if (found["아이디"]) {
      headerRowNumber = rowNumber;
      Object.assign(columnOf, found);
    }
  });
  if (!headerRowNumber) {
    throw new Error("'아이디' 머리글을 찾지 못했습니다. 다운로드한 회원명단 양식을 사용해 주세요.");
  }

  const read = (row: ExcelJS.Row, header: (typeof HEADERS)[number]) => {
    const col = columnOf[header];
    return col ? cellText(row.getCell(col)) : "";
  };

  const rows: MemberImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const item: MemberImportRow = {
      rowNumber,
      username: read(row, "아이디"),
      fullname: read(row, "이름"),
      churchName: read(row, "중앙"),
      memberType: read(row, "직분"),
      phone: read(row, "연락처"),
    };
    const isEmpty =
      !item.username &&
      !item.fullname &&
      !item.churchName &&
      !item.memberType &&
      !item.phone;
    if (!isEmpty) rows.push(item);
  });
  return rows;
}
