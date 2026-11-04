import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Standard PDF fonts only cover Latin-1 (WinAnsi); other characters are replaced until an Ethiopic font is embedded.
const clean = (s: string) => s.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "?");

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([595, 842]);
    this.y = 800;
  }
  ensure(h: number) {
    if (this.y - h < 50) this.newPage();
  }
  text(x: number, s: string, size = 10, opts: { bold?: boolean; color?: [number, number, number]; right?: boolean } = {}) {
    const f = opts.bold ? this.bold : this.font;
    const t = clean(s);
    const dx = opts.right ? f.widthOfTextAtSize(t, size) : 0;
    this.page.drawText(t, { x: x - dx, y: this.y, size, font: f, color: rgb(...(opts.color ?? [0.1, 0.1, 0.15])) });
  }
  line() {
    this.page.drawLine({ start: { x: 50, y: this.y }, end: { x: 545, y: this.y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85) });
  }
  down(h: number) {
    this.y -= h;
  }
  pair(label: string, value: string) {
    this.ensure(18);
    this.text(50, label, 10, { color: [0.4, 0.4, 0.45] });
    this.text(200, value, 10);
    this.down(18);
  }
  /** cols: [x, header, rightAligned] */
  table(cols: [number, string, boolean?][], rows: string[][]) {
    this.ensure(30);
    cols.forEach(([x, h, r]) => this.text(x, h, 9, { bold: true, right: r }));
    this.down(6);
    this.line();
    this.down(14);
    for (const row of rows) {
      this.ensure(16);
      cols.forEach(([x, , r], i) => this.text(x, row[i] ?? "", 9, { right: r }));
      this.down(15);
    }
  }
}

async function start() {
  const doc = await PDFDocument.create();
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  return { doc, w };
}

function header(w: Writer, company: string, title: string, sub: string) {
  w.text(50, company, 16, { bold: true });
  w.text(545, title, 14, { bold: true, right: true });
  w.down(18);
  w.text(545, sub, 10, { right: true, color: [0.4, 0.4, 0.45] });
  w.down(16);
  w.line();
  w.down(24);
}

export type ReceiptData = {
  company: string;
  receiptNo: number;
  date: string;
  buyer: string;
  phone: string;
  amount: string;
  method: string;
  reference: string;
  unit: string;
  contractNo: string;
  confirmedBy: string;
  balanceAfter: string;
};

export async function receiptPdf(d: ReceiptData) {
  const { doc, w } = await start();
  header(w, d.company, "PAYMENT RECEIPT", `No. ${d.receiptNo} · ${d.date}`);
  w.pair("Received from", d.buyer);
  w.pair("Phone", d.phone);
  w.pair("Amount", d.amount);
  w.pair("Method", d.method);
  w.pair("Reference", d.reference || "-");
  w.pair("For", `${d.unit} (contract ${d.contractNo})`);
  w.pair("Balance after this payment", d.balanceAfter);
  w.down(20);
  w.pair("Confirmed by", d.confirmedBy);
  w.down(40);
  w.text(50, "This receipt was issued after the payment was confirmed against the bank / wallet record.", 8, { color: [0.4, 0.4, 0.45] });
  return doc.save();
}

export type StatementData = {
  company: string;
  date: string;
  buyer: string;
  phone: string;
  unit: string;
  contractNo: string;
  plan: string;
  totals: [string, string][];
  schedule: string[][];
  payments: string[][];
};

export async function statementPdf(d: StatementData) {
  const { doc, w } = await start();
  header(w, d.company, "CLIENT STATEMENT", d.date);
  w.pair("Client", `${d.buyer} · ${d.phone}`);
  w.pair("Unit", d.unit);
  w.pair("Contract", d.contractNo);
  w.pair("Payment plan", d.plan);
  w.down(6);
  for (const [k, v] of d.totals) w.pair(k, v);
  w.down(14);
  w.text(50, "Schedule", 12, { bold: true });
  w.down(18);
  w.table([[50, "#"], [70, "Item"], [200, "Due"], [380, "Amount", true], [460, "Paid", true], [545, "Remaining", true]], d.schedule);
  w.down(14);
  w.ensure(40);
  w.text(50, "Confirmed payments", 12, { bold: true });
  w.down(18);
  w.table([[50, "Date"], [150, "Method"], [260, "Reference"], [400, "Receipt"], [545, "Amount", true]], d.payments);
  return doc.save();
}
