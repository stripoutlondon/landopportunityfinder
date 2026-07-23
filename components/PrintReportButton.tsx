"use client";

export default function PrintReportButton() {
  return <button className="button-link report-print-button" type="button" onClick={() => window.print()}>
    Print or save as PDF
  </button>;
}
