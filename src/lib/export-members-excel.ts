import ExcelJS from "exceljs";

export type MemberExportRow = [username: string, nameWithChurch: string, memberType: string];

const HEADERS = ["아이디", "이름-중앙", "직분"];
const COLUMN_WIDTHS = [18, 28, 12];

/**
 * Export 회원명단 rows (아이디 | 이름-중앙 | 직분) as a simple .xlsx download.
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
    // Keep 아이디 as text so leading zeros (010...) are preserved.
    style: index === 0 ? { numFmt: "@" } : {},
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
