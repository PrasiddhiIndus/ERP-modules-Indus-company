/**
 * Marketing internal quotation PDF — Indus letterhead style
 * (centered/right brand header, yellow terms boxes, company footer + red bar).
 * Data always comes from the quotation / costing / form the user saved.
 */
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatDateDdMmYyyy } from '../../../utils/dateDisplay';
import { sanitizePdfText } from './pdfTextSanitize';

const PAGE_W = 210;
const PAGE_H = 297;

const COLORS = {
  red: [196, 30, 58],
  redBar: [220, 50, 50],
  brandRed: [180, 30, 40],
  grey: [90, 90, 90],
  muted: [110, 110, 110],
  yellow: [255, 242, 0],
  tableHead: [210, 220, 230],
  tableTotal: [230, 238, 245],
  black: [0, 0, 0],
};

const BRAND = {
  companyLine1: 'INDUS FIRE SAFETY',
  companyLine2: 'PVT. LTD.',
  tagline: '...We Fight what You Fear',
  iso: 'ISO 9001:2015, ISO 14001:2015 & ISO 45001:2018',
  footer: [
    'Regd. Office : Indus House, Block No. 501, Opp. GSFC Main Gate, Dashrath, Vadodara, Gujarat-391740',
    'Tel. : +91 265 2343441, +91 265 2343442   CIN : U29193GJ2012PTC070236, GSTIN : 24AADCI2182H1ZS',
    'Email : firesafetyin@yahoo.com, info@indusfiresafety.com, www.indusfiresafety.com',
  ],
};

/** Space reserved for letterhead + footer on every page (mm). */
export const PDF_CHROME = {
  marginLeft: 14,
  marginRight: 14,
  contentTop: 48,
  // Sit just above the red bar (3 lines × ~3.2mm + small gap)
  footerTop: PAGE_H - 16,
  footerReserve: 30,
  redBarHeight: 3.2,
};

function formatNum(num) {
  const formatted = parseFloat(num || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Rs. ${formatted}`;
}

function isBulletLine(line) {
  return /^([•\-\u2013\u2014*]|\(?[a-zA-Z0-9]+\)|[0-9]+\.)\s+/.test(line);
}

function stripBullet(line) {
  return line.replace(/^([•\-\u2013\u2014*]|\(?[a-zA-Z0-9]+\)|[0-9]+\.)\s+/, '').trim();
}

/**
 * Split terms text into titled sections (yellow-header boxes).
 * Section titles = non-bullet lines that look like headings.
 */
export function parseTermsSections(rawText) {
  const lines = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  const sections = [];
  let current = null;

  const isLikelyHeader = (line) => {
    if (isBulletLine(line)) return false;
    if (/^terms?\b/i.test(line) || /condition/i.test(line) || /^payment\s+terms/i.test(line)) {
      return true;
    }
    if (line.length <= 90 && !/[.!?]$/.test(line) && /^[A-Z]/.test(line)) return true;
    return false;
  };

  for (const line of lines) {
    if (isLikelyHeader(line)) {
      current = { title: sanitizePdfText(line), items: [], isPayment: /^payment\s+terms/i.test(line) };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: 'Terms & Conditions', items: [], isPayment: false };
      sections.push(current);
    }
    current.items.push(sanitizePdfText(stripBullet(line)));
  }

  return sections;
}

function drawBrandHeader(doc, logoBase64) {
  const right = PAGE_W - PDF_CHROME.marginRight;
  const logoSize = 22;
  const logoX = right - logoSize;
  const logoY = 6;

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
    } catch {
      /* logo optional */
    }
  }

  const textRight = logoX - 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.brandRed);
  doc.text(BRAND.companyLine1, textRight, 14, { align: 'right' });
  doc.setFontSize(10);
  doc.text(BRAND.companyLine2, textRight, 19.5, { align: 'right' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(BRAND.tagline, textRight, 25, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.grey);
  doc.text(BRAND.iso, textRight, 30, { align: 'right' });

  doc.setDrawColor(...COLORS.red);
  doc.setLineWidth(0.4);
  doc.line(PDF_CHROME.marginLeft, 34, PAGE_W - PDF_CHROME.marginRight, 34);

  doc.setTextColor(...COLORS.black);
}

function drawBrandFooter(doc) {
  const { marginLeft, marginRight, footerTop, redBarHeight } = PDF_CHROME;
  const usableW = PAGE_W - marginLeft - marginRight;
  const lineGap = 3.0;
  let y = footerTop;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(...COLORS.muted);
  BRAND.footer.forEach((line) => {
    doc.text(line, PAGE_W / 2, y, { align: 'center', maxWidth: usableW });
    y += lineGap;
  });

  doc.setFillColor(...COLORS.redBar);
  doc.rect(0, PAGE_H - redBarHeight, PAGE_W, redBarHeight, 'F');
  doc.setTextColor(...COLORS.black);
}

function drawPageChrome(doc, logoBase64, pageIndex, pageCount) {
  doc.setPage(pageIndex);
  drawBrandHeader(doc, logoBase64);
  drawBrandFooter(doc);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.black);
  doc.text(`Page ${pageIndex} of ${pageCount}`, PDF_CHROME.marginLeft, 40);
}

function applyChromeToAllPages(doc, logoBase64) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    drawPageChrome(doc, logoBase64, i, pageCount);
  }
}

function contentMaxY() {
  return PDF_CHROME.footerTop - 4;
}

/**
 * @param {object} opts
 * @returns {jsPDF}
 */
export function buildMarketingInternalQuotationPdf(opts) {
  const {
    quotation,
    client,
    formData,
    costingTableItems = [],
    costingData,
    getCostingValue,
    getProductSpecification,
    logoBase64,
    signatureBase64,
  } = opts;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { marginLeft, marginRight, contentTop, footerReserve } = PDF_CHROME;
  const contentW = PAGE_W - marginLeft - marginRight;
  const maxY = () => contentMaxY();

  const ensureSpace = (yPos, needed = 12) => {
    if (yPos + needed <= maxY()) return yPos;
    doc.addPage();
    return contentTop;
  };

  let yPos = contentTop;

  // --- Ref + Date ---
  const refNo = sanitizePdfText(quotation?.quotation_number || formData?.quotation_number || '');
  const dateStr = formatDateDdMmYyyy(quotation?.quotation_date || new Date());
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.black);
  doc.text(`Ref. Offer No.: ${refNo}`, marginLeft, yPos);
  doc.text(`Date: ${dateStr}`, PAGE_W - marginRight, yPos, { align: 'right' });
  yPos += 7;

  // --- To ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('To,', marginLeft, yPos);
  yPos += 4.5;

  const contactName = sanitizePdfText(client?.contact_person || client?.contact_name || '');
  if (contactName) {
    doc.setFont('helvetica', 'bold');
    doc.text(contactName, marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 4;
  }
  if (client?.client_name) {
    doc.setFont('helvetica', 'bold');
    doc.text(`M/s. ${sanitizePdfText(client.client_name)}`, marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 4;
  }
  const addrParts = [
    client?.street,
    client?.street2,
    [client?.city, client?.state, client?.zip].filter(Boolean).join(', '),
    client?.country,
  ]
    .filter(Boolean)
    .map((p) => sanitizePdfText(p));
  addrParts.forEach((part) => {
    doc.text(part, marginLeft, yPos);
    yPos += 4;
  });
  yPos += 4;

  // --- Subject ---
  if (formData?.subject_title) {
    yPos = ensureSpace(yPos, 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const subjectLine = `Subject: ${sanitizePdfText(formData.subject_title)}`;
    const subjectLines = doc.splitTextToSize(subjectLine, contentW);
    subjectLines.forEach((ln) => {
      doc.text(ln, marginLeft, yPos);
      const tw = doc.getTextWidth(ln);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, yPos + 1, marginLeft + tw, yPos + 1);
      yPos += 4.5;
    });
    yPos += 2;
  }

  // --- Greeting + body ---
  yPos = ensureSpace(yPos, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Dear Sir,', marginLeft, yPos);
  yPos += 5;

  if (formData?.subject) {
    doc.setFontSize(9);
    const bodyLines = doc.splitTextToSize(sanitizePdfText(formData.subject), contentW);
    bodyLines.forEach((ln) => {
      yPos = ensureSpace(yPos, 5);
      doc.text(ln, marginLeft, yPos);
      yPos += 4.2;
    });
    yPos += 4;
  }

  // --- Commercial offer heading ---
  yPos = ensureSpace(yPos, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('QUOTATION', PAGE_W / 2, yPos, { align: 'center' });
  const qW = doc.getTextWidth('QUOTATION');
  doc.setLineWidth(0.4);
  doc.line(PAGE_W / 2 - qW / 2, yPos + 1.2, PAGE_W / 2 + qW / 2, yPos + 1.2);
  yPos += 6;
  doc.setFontSize(9);
  doc.text('Part-1: Commercial offer', marginLeft, yPos);
  yPos += 4;

  // --- Items table ---
  const tableData = [];
  const pdfHeaders = [
    'Item Name',
    'Specification',
    'Quotation Rate Per Unit',
    'Grand Total (Excl GST)',
    'GST %',
    'GST Amount',
    'Grand Total With GST',
  ];

  const finalFallback = Number(formData?.final_amount) || 0;
  if (costingTableItems.length > 0 && costingData && typeof getCostingValue === 'function') {
    costingTableItems.forEach((item, index) => {
      const itemName = sanitizePdfText(item.productName || item.name || `Item ${index + 1}`);
      const specification = sanitizePdfText(
        item.productId
          ? item.specification || (getProductSpecification?.(item.productId) || '-') || '-'
          : '-'
      );
      const quotationRatePerUnit = parseFloat(getCostingValue(item.id, 'quotation_rate_per_unit') || 0);
      const grandExclGst = parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_excl_gst') || 0);
      const gstPct = getCostingValue(item.id, 'gst_pct');
      const gstAmount = parseFloat(getCostingValue(item.id, 'gst_amount') || 0);
      const grandWithGst = parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_with_gst') || 0);
      tableData.push([
        itemName,
        specification || '-',
        formatNum(quotationRatePerUnit),
        formatNum(grandExclGst),
        gstPct != null && gstPct !== '' ? String(parseFloat(gstPct)) : '-',
        formatNum(gstAmount),
        formatNum(grandWithGst),
      ]);
    });
  } else {
    tableData.push([
      'Total Amount',
      '-',
      formatNum(finalFallback),
      formatNum(finalFallback),
      '-',
      '-',
      formatNum(finalFallback),
    ]);
  }

  const grandExclGstTotal =
    costingTableItems.length > 0 && costingData && getCostingValue
      ? costingTableItems.reduce(
          (s, item) => s + parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_excl_gst') || 0),
          0
        )
      : finalFallback;
  const gstAmountTotal =
    costingTableItems.length > 0 && costingData && getCostingValue
      ? costingTableItems.reduce(
          (s, item) => s + parseFloat(getCostingValue(item.id, 'gst_amount') || 0),
          0
        )
      : 0;
  const grandWithGstTotal =
    costingTableItems.length > 0 && costingData && getCostingValue
      ? costingTableItems.reduce(
          (s, item) => s + parseFloat(getCostingValue(item.id, 'grand_total_supply_cost_with_gst') || 0),
          0
        )
      : finalFallback;

  tableData.push([
    '',
    'Grand Total',
    '',
    formatNum(grandExclGstTotal),
    '',
    formatNum(gstAmountTotal),
    formatNum(grandWithGstTotal),
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [pdfHeaders],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 1.6,
      lineWidth: 0.15,
      lineColor: [120, 120, 120],
      overflow: 'linebreak',
      minCellHeight: 6,
      halign: 'left',
      valign: 'top',
      textColor: COLORS.black,
    },
    headStyles: {
      fillColor: COLORS.tableHead,
      textColor: COLORS.black,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 6.5,
      cellPadding: 1.6,
    },
    columnStyles: {
      0: { cellWidth: 34, halign: 'left' },
      1: { cellWidth: 40, halign: 'left' },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 24, halign: 'right' },
    },
    pageBreak: 'auto',
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    margin: {
      left: marginLeft,
      right: marginRight,
      top: contentTop,
      bottom: footerReserve,
    },
    didParseCell: (data) => {
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = COLORS.tableTotal;
        if (data.column.index === 1) data.cell.styles.halign = 'right';
      }
    },
  });

  yPos = (doc.lastAutoTable?.finalY || yPos) + 8;

  // --- Part-2: Terms (yellow boxes) ---
  yPos = ensureSpace(yPos, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Terms and Conditions:', marginLeft, yPos);
  const tcW = doc.getTextWidth('Terms and Conditions:');
  doc.setLineWidth(0.35);
  doc.line(marginLeft, yPos + 1.2, marginLeft + tcW, yPos + 1.2);
  yPos += 6;

  const allSections = parseTermsSections(formData?.terms_and_conditions || '');
  const paymentSections = allSections.filter((s) => s.isPayment);
  const termSections = allSections.filter((s) => !s.isPayment);

  termSections.forEach((section) => {
    if (!section.items.length && !section.title) return;
    yPos = ensureSpace(yPos, 18);
    const bodyRows = (section.items.length ? section.items : ['-']).map((item) => [item]);
    autoTable(doc, {
      startY: yPos,
      head: [[section.title]],
      body: bodyRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineWidth: 0.2,
        lineColor: [80, 80, 80],
        overflow: 'linebreak',
        valign: 'top',
        halign: 'left',
        textColor: COLORS.black,
      },
      headStyles: {
        fillColor: COLORS.yellow,
        textColor: COLORS.black,
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 9,
        cellPadding: 2.2,
      },
      columnStyles: {
        0: { cellWidth: contentW },
      },
      pageBreak: 'auto',
      rowPageBreak: 'auto',
      margin: {
        left: marginLeft,
        right: marginRight,
        top: contentTop,
        bottom: footerReserve,
      },
    });
    yPos = (doc.lastAutoTable?.finalY || yPos) + 5;
  });

  // --- Payment terms (bullets, demo style) ---
  if (paymentSections.length) {
    yPos = ensureSpace(yPos, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Payment Terms:', marginLeft, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    paymentSections.forEach((sec) => {
      sec.items.forEach((item) => {
        yPos = ensureSpace(yPos, 10);
        const bullet = `- ${item}`;
        const wrapped = doc.splitTextToSize(bullet, contentW - 2);
        wrapped.forEach((ln) => {
          yPos = ensureSpace(yPos, 5);
          doc.text(ln, marginLeft, yPos);
          yPos += 4;
        });
        yPos += 1;
      });
    });
    yPos += 3;
  }

  // --- Closing ---
  yPos = ensureSpace(yPos, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const closing =
    'We look forward to the opportunity of being associated with your esteemed organization and assuring you of our qualitative and reliable services.';
  const closingLines = doc.splitTextToSize(closing, contentW);
  closingLines.forEach((ln) => {
    yPos = ensureSpace(yPos, 5);
    doc.text(ln, marginLeft, yPos);
    yPos += 4;
  });
  yPos += 4;
  doc.text('Thanking you.', marginLeft, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('For INDUS FIRE SAFETY PVT. LTD', marginLeft, yPos);
  yPos += 5;

  if (signatureBase64) {
    yPos = ensureSpace(yPos, 22);
    try {
      doc.addImage(signatureBase64, 'PNG', marginLeft, yPos, 42, 16);
    } catch {
      /* ignore */
    }
    yPos += 18;
  } else {
    yPos += 12;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(sanitizePdfText(formData?.signed_by || 'Authorized Signatory'), marginLeft, yPos);
  yPos += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Authorized Signatory', marginLeft, yPos);

  applyChromeToAllPages(doc, logoBase64);
  return doc;
}

/** Fetch logo as data URL for jsPDF. */
export function loadImageAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}
