import { jsPDF } from "jspdf";

export interface ContractData {
  contractId: string;
  date: string;
  // Farmer (seller)
  farmerName: string;
  farmerPhone?: string | null;
  farmerLocation?: string | null;
  // Buyer
  buyerName: string;
  buyerPhone?: string | null;
  // Trade details
  cropName: string;
  quantityRequested: number;
  unit: string;
  pricePerKg: number;
  quality?: string | null;
  listingType: "crop" | "tool";
  // Offer (barter) details
  offerCropName?: string | null;
  offerQuantity?: number | null;
  offerUnit?: string | null;
  offerType?: "crop" | "tool" | null;
  // Status
  status: string;
}

function drawLine(doc: jsPDF, y: number, margin: number, pageWidth: number) {
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
}

function sectionHeader(doc: jsPDF, text: string, y: number, margin: number) {
  doc.setFillColor(34, 139, 34); // forest green
  doc.roundedRect(margin, y - 5, 170, 8, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(text.toUpperCase(), margin + 4, y + 0.5);
  doc.setTextColor(30, 30, 30);
  return y + 10;
}

function labelValue(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  labelWidth = 45
) {
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 100, 100);
  doc.text(label + ":", x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);
  doc.text(value || "—", x + labelWidth, y);
}

export function generateContractPDF(data: ContractData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const margin = 20;
  let y = 20;

  // ── Header banner ──────────────────────────────────────────────────────────
  doc.setFillColor(22, 101, 52); // dark green
  doc.rect(0, 0, pageWidth, 38, "F");

  // Logo placeholder circle
  doc.setFillColor(255, 255, 255, 0.15);
  doc.circle(pageWidth / 2, 19, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("🌾", pageWidth / 2 - 4, 21);

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("KRISHI EXCHANGE", pageWidth / 2, 13, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Agricultural Trade Contract", pageWidth / 2, 20, {
    align: "center",
  });
  doc.setFontSize(8);
  doc.text("Verified Agricultural Marketplace", pageWidth / 2, 26, {
    align: "center",
  });

  y = 48;

  // ── Contract meta box ─────────────────────────────────────────────────────
  doc.setFillColor(248, 255, 248);
  doc.setDrawColor(34, 139, 34);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y - 4, 170, 18, 3, 3, "FD");

  doc.setTextColor(22, 101, 52);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Contract No: ${data.contractId}`, margin + 4, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text(`Issue Date: ${data.date}`, margin + 4, y + 9);

  const statusColor: Record<string, [number, number, number]> = {
    accepted: [37, 99, 235],
    in_transit: [109, 40, 217],
    completed: [21, 128, 61],
  };
  const sc = statusColor[data.status] ?? [100, 100, 100];
  doc.setTextColor(...sc);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Status: ${data.status.replace("_", " ").toUpperCase()}`,
    pageWidth - margin - 4,
    y + 3,
    { align: "right" }
  );
  doc.setTextColor(30, 30, 30);

  y += 24;

  // ── Parties ────────────────────────────────────────────────────────────────
  y = sectionHeader(doc, "Parties Involved", y, margin);
  y += 4;

  // Two-column layout
  const col1 = margin;
  const col2 = pageWidth / 2 + 5;

  doc.setFillColor(240, 253, 244);
  doc.roundedRect(col1, y - 3, 80, 22, 2, 2, "F");
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(col2, y - 3, 80, 22, 2, 2, "F");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 101, 52);
  doc.text("SELLER (Farmer)", col1 + 3, y + 2);
  doc.setTextColor(37, 99, 235);
  doc.text("BUYER", col2 + 3, y + 2);
  doc.setTextColor(20, 20, 20);

  labelValue(doc, "Name", data.farmerName, col1 + 3, y + 8, 18);
  labelValue(
    doc,
    "Phone",
    data.farmerPhone ?? "—",
    col1 + 3,
    y + 13,
    18
  );

  labelValue(doc, "Name", data.buyerName, col2 + 3, y + 8, 18);
  labelValue(
    doc,
    "Phone",
    data.buyerPhone ?? "—",
    col2 + 3,
    y + 13,
    18
  );

  y += 30;

  // ── Trade Details ──────────────────────────────────────────────────────────
  y = sectionHeader(doc, "Trade Details", y, margin);
  y += 4;

  doc.setFillColor(252, 252, 252);
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y - 3, 170, 36, 2, 2, "FD");

  const totalValue = data.quantityRequested * data.pricePerKg;
  const rows: [string, string, string, string][] = [
    [
      "Item / Crop",
      data.cropName,
      "Listing Type",
      data.listingType === "tool" ? "Farm Tool / Equipment" : "Agricultural Produce",
    ],
    [
      "Quantity",
      `${data.quantityRequested} ${data.unit}`,
      "Quality Grade",
      data.quality ?? "—",
    ],
    [
      "Price / Unit",
      `Rs. ${data.pricePerKg.toFixed(2)} / ${data.unit}`,
      "Estimated Total",
      `Rs. ${totalValue.toLocaleString("en-IN")}`,
    ],
    [
      "Seller Location",
      data.farmerLocation ?? "—",
      "",
      "",
    ],
  ];

  rows.forEach(([l1, v1, l2, v2], i) => {
    const rowY = y + 3 + i * 8;
    if (i % 2 === 0) {
      doc.setFillColor(247, 254, 247);
      doc.rect(margin + 0.5, rowY - 3.5, 169, 7.5, "F");
    }
    labelValue(doc, l1, v1, margin + 4, rowY, 30);
    if (l2) labelValue(doc, l2, v2, pageWidth / 2 + 5, rowY, 35);
  });

  y += 40;

  // ── Barter Offer ──────────────────────────────────────────────────────────
  if (data.offerCropName) {
    y = sectionHeader(doc, "Barter / Exchange Offer", y, margin);
    y += 4;

    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y - 3, 170, 22, 2, 2, "FD");

    labelValue(
      doc,
      "Offered Item",
      data.offerCropName,
      margin + 4,
      y + 4,
      38
    );
    labelValue(
      doc,
      "Offer Type",
      data.offerType === "tool" ? "Farm Tool" : "Crop Produce",
      pageWidth / 2 + 5,
      y + 4,
      35
    );

    if (data.offerType !== "tool" && data.offerQuantity) {
      labelValue(
        doc,
        "Offer Quantity",
        `${data.offerQuantity} ${data.offerUnit ?? ""}`,
        margin + 4,
        y + 12,
        38
      );
    }

    y += 30;
  }

  // ── Terms & Conditions ────────────────────────────────────────────────────
  y = sectionHeader(doc, "Terms & Conditions", y, margin);
  y += 4;

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  const terms = [
    "1. Both parties agree to the quantities, quality grades, and prices as stated above.",
    "2. The seller shall ensure the goods are in the agreed quality before dispatch.",
    "3. The buyer shall inspect the goods upon receipt and report discrepancies within 24 hours.",
    "4. Disputes shall be resolved through the Krishi Exchange dispute resolution mechanism.",
    "5. This contract is legally binding upon acceptance by both parties on the platform.",
    "6. Krishi Exchange acts solely as a facilitator and is not liable for the quality of goods.",
    "7. Payment or barter exchange must be completed within the agreed timeline.",
  ];
  terms.forEach((t) => {
    doc.text(t, margin + 2, y);
    y += 5.5;
  });


  // ── Footer ──────────────────────────────────────────────────────────────
  drawLine(doc, y, margin, pageWidth);
  y += 5;
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.setFont("helvetica", "italic");
  doc.text(
    "This document is auto-generated by Krishi Exchange. It is a digital record of the agreed trade terms.",
    pageWidth / 2,
    y,
    { align: "center" }
  );
  doc.text(
    `Contract ID: ${data.contractId} | Generated: ${data.date}`,
    pageWidth / 2,
    y + 5,
    { align: "center" }
  );

  // ── Save ───────────────────────────────────────────────────────────────
  const filename = `Krishi-Contract-${data.contractId}.pdf`;
  doc.save(filename);
}
