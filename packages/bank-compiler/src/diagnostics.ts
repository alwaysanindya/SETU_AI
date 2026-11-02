/** Problems found while compiling. Errors stop the build; warnings go to the review report. */
export type Severity = "error" | "warning" | "correction";

export interface Diagnostic {
  severity: Severity;
  /** Where in the content: "complaints.xlsx row 186" or "red-flags.yaml rule chest-pain-spreading". */
  where: string;
  message: string;
  /** Complaint id, when the problem belongs to one complaint (used to group the report). */
  complaintId?: string;
}

export class Diagnostics {
  readonly items: Diagnostic[] = [];
  error(where: string, message: string, complaintId?: string) {
    this.items.push({ severity: "error", where, message, complaintId });
  }
  warn(where: string, message: string, complaintId?: string) {
    this.items.push({ severity: "warning", where, message, complaintId });
  }
  corrected(where: string, message: string, complaintId?: string) {
    this.items.push({ severity: "correction", where, message, complaintId });
  }
  get errors() {
    return this.items.filter((d) => d.severity === "error");
  }
}
