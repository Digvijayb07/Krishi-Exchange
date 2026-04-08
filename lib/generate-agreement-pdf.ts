import jsPDF from "jspdf";

export interface AgreementData {
  exchangeId: string;
  requestedAt: string;
  acceptedAt: string;
  // Listing
  cropName: string;
  listingType: "crop" | "tool";
  quantityRequested: number;
  unit: string;
  pricePerKg: number;
  qualityGrade: string | null;
  location: string;
  // Offer
  offerType: "crop" | "tool";
  offerCropName: string | null;
  offerQuantity: number | null;
  offerUnit: string | null;
  // Seller
  sellerName: string;
  sellerPhone: string | null;
  sellerVillage: string | null;
  sellerDistrict: string | null;
  sellerState: string | null;
  // Buyer
  buyerName: string;
  buyerPhone: string | null;
  buyerRole: string | null;
}

const G: [number, number, number] = [21, 101, 52];
const LG: [number, number, number] = [220, 252, 231];
const AM: [number, number, number] = [180, 83, 9];
const WH: [number, number, number] = [255, 255, 255];
const DK: [number, number, number] = [17, 24, 39];
const GR: [number, number, number] = [107, 114, 128];
const BL: [number, number, number] = [30, 64, 175];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function shortId(id: string) {
  return `KE-${id.slice(0, 8).toUpperCase()}`;
}

function sectionHeader(
  doc: jsPDF, label: string, x: number, y: number, w: number, h: number,
  color: [number, number, number]
) {
  doc.setFillColor(...color);
  doc.rect(x, y, w, h, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...WH);
  doc.text(label, x + 4, y + h - 2);
}

function infoRow(
  doc: jsPDF,
  label: string, value: string,
  labelX: number, valueX: number, y: number
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...GR);
  doc.text(label, labelX, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DK);
  doc.text(value || "—", valueX, y);
}

export function downloadAgreementPdf(data: AgreementData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210, M = 14, CW = 210 - 2 * M;
  let y = 0;

  // ═══ HEADER ═══════════════════════════════════════════
  doc.setFillColor(...G);
  doc.rect(0, 0, PW, 36, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(...WH);
  doc.text("KRISHI EXCHANGE", PW / 2, 12, { align: "center" });

  doc.setDrawColor(...AM);
  doc.setLineWidth(0.8);
  doc.line(M, 16.5, PW - M, 16.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Agricultural Trade Agreement  ·  Proof of Consent", PW / 2, 23, { align: "center" });

  doc.setFontSize(7.5);
  doc.text(
    "This document confirms a digitally accepted exchange between two parties on Krishi Exchange.",
    PW / 2, 30, { align: "center" }
  );

  y = 42;

  // ═══ AGREEMENT META BAND ══════════════════════════════
  doc.setFillColor(...LG);
  doc.rect(M, y, CW, 11, "F");
  doc.setDrawColor(...G);
  doc.setLineWidth(0.3);
  doc.rect(M, y, CW, 11, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...G);
  doc.text(`Agreement ID:  ${shortId(data.exchangeId)}`, M + 4, y + 7);
  doc.text(`Date:  ${fmtDate(data.acceptedAt)}`, PW - M - 4, y + 7, { align: "right" });

  y += 16;

  // ═══ PARTIES ══════════════════════════════════════════
  sectionHeader(doc, "PARTIES INVOLVED", M, y, CW, 8, G);
  y += 10;

  const halfW = CW / 2 - 2;
  const boxH = 36;

  // Seller box
  doc.setFillColor(245, 255, 248);
  doc.rect(M, y, halfW, boxH, "F");
  doc.setDrawColor(...G);
  doc.setLineWidth(0.4);
  doc.rect(M, y, halfW, boxH, "S");

  doc.setFillColor(...G);
  doc.rect(M, y, halfW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...WH);
  doc.text("PARTY A  —  SELLER / FARMER", M + 3, y + 5);

  let sy = y + 11;
  const sellerLoc = [data.sellerVillage, data.sellerDistrict, data.sellerState]
    .filter(Boolean).join(", ") || "—";
  infoRow(doc, "Name:", data.sellerName, M + 3, M + 18, sy); sy += 5.5;
  if (data.sellerPhone) { infoRow(doc, "Phone:", data.sellerPhone, M + 3, M + 18, sy); sy += 5.5; }
  infoRow(doc, "Location:", sellerLoc, M + 3, M + 21, sy);

  // Buyer box
  const bx = M + halfW + 4;
  doc.setFillColor(239, 246, 255);
  doc.rect(bx, y, halfW, boxH, "F");
  doc.setDrawColor(...BL);
  doc.setLineWidth(0.4);
  doc.rect(bx, y, halfW, boxH, "S");

  doc.setFillColor(...BL);
  doc.rect(bx, y, halfW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...WH);
  doc.text("PARTY B  —  BUYER", bx + 3, y + 5);

  let by2 = y + 11;
  infoRow(doc, "Name:", data.buyerName, bx + 3, bx + 18, by2); by2 += 5.5;
  if (data.buyerPhone) { infoRow(doc, "Phone:", data.buyerPhone, bx + 3, bx + 18, by2); by2 += 5.5; }
  if (data.buyerRole) {
    infoRow(doc, "Role:", data.buyerRole.charAt(0).toUpperCase() + data.buyerRole.slice(1), bx + 3, bx + 15, by2);
  }

  y += boxH + 8;

  // ═══ ITEM BEING EXCHANGED ═════════════════════════════
  sectionHeader(doc, "ITEM BEING SOLD / EXCHANGED", M, y, CW, 8, G);
  y += 10;

  doc.setFillColor(250, 250, 250);
  doc.rect(M, y, CW, 30, "F");
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.3);
  doc.rect(M, y, CW, 30, "S");

  const vx = M + 55;
  let iy = y + 7;
  infoRow(doc, "Item / Crop / Tool:", data.cropName, M + 4, vx, iy); iy += 5.5;
  infoRow(doc, "Type:", data.listingType === "tool" ? "Agricultural Tool" : "Crop / Produce", M + 4, vx, iy); iy += 5.5;
  infoRow(doc, "Quantity Agreed:", `${data.quantityRequested} ${data.unit}`, M + 4, vx, iy); iy += 5.5;
  infoRow(doc, "Price / Unit:", `Rs. ${data.pricePerKg} per ${data.unit}`, M + 4, vx, iy); iy += 5.5;
  if (data.qualityGrade) { infoRow(doc, "Quality Grade:", data.qualityGrade, M + 4, vx, iy); }

  y += 34;

  // ═══ BUYER'S OFFER ════════════════════════════════════
  sectionHeader(doc, "BUYER'S OFFER IN EXCHANGE", M, y, CW, 8, AM);
  y += 10;

  doc.setFillColor(255, 251, 235);
  doc.rect(M, y, CW, 22, "F");
  doc.setDrawColor(180, 140, 60);
  doc.setLineWidth(0.3);
  doc.rect(M, y, CW, 22, "S");

  let oy = y + 7;
  infoRow(doc, "Offer Type:", data.offerType === "tool" ? "Agricultural Tool" : "Crop / Produce", M + 4, vx, oy); oy += 5.5;
  infoRow(doc, "Item Name:", data.offerCropName || "—", M + 4, vx, oy); oy += 5.5;
  if (data.offerType === "crop" && data.offerQuantity) {
    infoRow(doc, "Quantity Offered:", `${data.offerQuantity} ${data.offerUnit || "kg"}`, M + 4, vx, oy);
  }

  y += 26;

  // ═══ TERMS & CONDITIONS ═══════════════════════════════
  sectionHeader(doc, "TERMS & CONDITIONS", M, y, CW, 8, [30, 41, 59]);
  y += 11;

  const terms = [
    "Both parties mutually agree to the exchange terms as described in this contract.",
    "The Seller guarantees the quality, quantity, and authenticity of the listed item.",
    "The Buyer agrees to deliver the offered exchange item as described above.",
    "Logistics, transport, and delivery arrangements must be mutually agreed upon by both parties.",
    "Any breach of these terms may be reported via the Krishi Exchange Disputes module.",
    "This agreement serves as digital proof of consent and may be referenced in dispute resolution.",
    "Krishi Exchange is a platform facilitator and is not responsible for physical delivery of goods.",
  ];

  doc.setFontSize(7.5);
  terms.forEach((term, i) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...G);
    doc.text(`${i + 1}.`, M + 3, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DK);
    const lines = doc.splitTextToSize(term, CW - 10);
    doc.text(lines, M + 9, y);
    y += lines.length * 4.2 + 2;
  });

  y += 3;

  // ═══ DIGITAL ACCEPTANCE BOX ═══════════════════════════
  doc.setFillColor(...LG);
  doc.rect(M, y, CW, 20, "F");
  doc.setDrawColor(...G);
  doc.setLineWidth(0.4);
  doc.rect(M, y, CW, 20, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...G);
  doc.text("DIGITAL ACCEPTANCE", M + 4, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...DK);
  doc.text(
    `This agreement was digitally accepted by ${data.sellerName} on ${fmtDateTime(data.acceptedAt)}.`,
    M + 4, y + 13
  );
  doc.text(
    "Acceptance on the Krishi Exchange platform constitutes a binding trade agreement between both parties.",
    M + 4, y + 18
  );

  y += 24;

  // ═══ SIGNATURE LINES ══════════════════════════════════
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  const sigY = y + 12;
  // Seller sig
  doc.line(M, sigY, M + halfW, sigY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...GR);
  doc.text(`Seller: ${data.sellerName}`, M, sigY + 4);
  // Buyer sig
  doc.line(bx, sigY, bx + halfW, sigY);
  doc.text(`Buyer: ${data.buyerName}`, bx, sigY + 4);

  // ═══ FOOTER ═══════════════════════════════════════════
  const footerY = 277;
  doc.setFillColor(...G);
  doc.rect(0, footerY, PW, 20, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...WH);
  doc.text("Krishi Exchange  —  Trusted Agricultural Marketplace", PW / 2, footerY + 7, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    `Contract ID: ${shortId(data.exchangeId)}  |  Generated: ${new Date().toLocaleString("en-IN")}`,
    PW / 2, footerY + 14, { align: "center" }
  );

  doc.save(`KrishiExchange_Agreement_${shortId(data.exchangeId)}.pdf`);
}
