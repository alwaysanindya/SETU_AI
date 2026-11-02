/** Reads a worksheet into plain rows of trimmed strings, keeping the spreadsheet row number. */
import ExcelJS from "exceljs";

export interface SheetRow {
  /** 1-based row number as shown in Excel. */
  row: number;
  cells: string[];
}

export interface Workbook {
  sheets: { name: string; rows: SheetRow[] }[];
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return String(value.result ?? "");
    if (value instanceof Date) return value.toISOString().slice(0, 10);
  }
  return String(value);
}

export async function readWorkbook(path: string): Promise<Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return {
    sheets: wb.worksheets.map((ws) => {
      const rows: SheetRow[] = [];
      ws.eachRow({ includeEmpty: false }, (r, rowNumber) => {
        const cells: string[] = [];
        for (let c = 1; c <= Math.max(r.cellCount, 7); c++) {
          const cell = r.getCell(c);
          // In a merged range only the top-left cell holds the value; the others read as empty,
          // exactly as they look in Excel (otherwise "Headache" would repeat on every row).
          const isCopy = cell.isMerged && cell.master.address !== cell.address;
          cells.push(isCopy ? "" : cellText(cell.value).replace(/\s+/g, " ").trim());
        }
        if (cells.some((x) => x !== "")) rows.push({ row: rowNumber, cells });
      });
      return { name: ws.name, rows };
    }),
  };
}
