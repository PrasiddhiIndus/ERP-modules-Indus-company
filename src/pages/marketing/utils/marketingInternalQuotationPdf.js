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
  yellow: [255, 255, 0],
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

function isPaymentHeading(line) {
  const t = stripBullet(String(line || '').trim());
  return /^payment\s+terms?\b/i.test(t);
}

/** Advance / balance / % payment lines (real Payment Terms bullets). */
function isPaymentItemLine(line) {
  const t = stripBullet(String(line || '').trim());
  if (!t) return false;
  if (isPaymentHeading(t)) return false;
  return (
    /\b\d+\s*%\s*(advance|balance)?\s*payment\b/i.test(t) ||
    /\b(advance|balance)\s+payment\b/i.test(t) ||
    /^\d+\s*%\b/.test(t)
  );
}

/** T&C points that must never appear under Payment Terms. */
function isNonPaymentTechnicalLine(line) {
  const t = stripBullet(String(line || '').trim());
  if (!t) return false;
  if (isPaymentItemLine(t) || isPaymentHeading(t)) return false;
  return /^(gst\b|warranty\b|delivery\b|installation\b|note\b|time\s*period\b|mobilization\b|scaffolding\b|electricity\b|boarding\b|lodging\b|security\b|storage\b|lift\b|company\s+will\b|site\s+cleaning\b|statutory\b)/i.test(
    t
  );
}

/** True when a string looks like payment-terms content (not costing remarks). */
function looksLikePaymentTermsContent(text) {
  const s = String(text || '');
  if (!s.trim()) return false;
  return (
    /payment\s+terms?\b/i.test(s) ||
    /\badvance\s+payment\b/i.test(s) ||
    /\bbalance\s+payment\b/i.test(s) ||
    /\b\d+\s*%\s*(advance|balance|payment)/i.test(s)
  );
}

/**
 * Resolve terms + payment text from this quotation only.
 * Prefer live form edits; fall back to DB fields on the same quotation.
 */
export function resolveQuotationTermsSources(formData = {}, quotation = {}) {
  const termsText =
    formData?.terms_and_conditions ||
    quotation?.terms_and_conditions ||
    '';

  // marketing_quotations.payment_terms is often used as costing description —
  // only treat it as Payment Terms when the content clearly is payment terms.
  const paymentCandidates = [formData?.payment_terms, quotation?.payment_terms];
  let extraPaymentText = '';
  for (const c of paymentCandidates) {
    if (looksLikePaymentTermsContent(c)) {
      extraPaymentText = String(c);
      break;
    }
  }

  return { termsText, extraPaymentText };
}

/**
 * Build payment bullets from the Payment Terms block only:
 * - keep advance/balance/% lines from this quotation
 * - merge wrapped continuations into the previous bullet
 * - drop Delivery Period / Warranty / etc. from that block
 */
function buildPaymentItemsFromBlock(paymentBody) {
  const lines = String(paymentBody || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  lines.forEach((line) => {
    const bare = stripBullet(line);
    if (!bare || isPaymentHeading(bare)) return;
    if (isNonPaymentTechnicalLine(bare)) return;

    const startsNew =
      isPaymentItemLine(bare) ||
      isBulletLine(line) ||
      /^\(?[a-z0-9]+\)[.\s]/i.test(line.trim());

    if (items.length && !startsNew) {
      items[items.length - 1] = `${items[items.length - 1]} ${sanitizePdfText(bare)}`.trim();
      return;
    }

    // Only start a new Payment Terms bullet when it is clearly a payment point
    if (!isPaymentItemLine(bare) && !looksLikePaymentTermsContent(bare)) return;
    const clean = sanitizePdfText(bare);
    if (clean && !items.includes(clean)) items.push(clean);
  });

  return items.filter((item) => looksLikePaymentTermsContent(item) || isPaymentItemLine(item));
}

/**
 * Split THIS quotation's terms into yellow T&C boxes + Payment Terms bullets.
 * Only points present in the quotation text are shown.
 */
export function parseTermsSections(rawText, extraPaymentText = '') {
  const fullText = String(rawText || '').replace(/\r\n/g, '\n');

  // Cut out only the "Payment Terms" block from this quotation's terms
  const paymentHeadingRe =
    /(^|\n)\s*(?:[•\-\u2013\u2014*]|\(?[a-zA-Z0-9]+\)|[0-9]+\.)?\s*payment\s+terms?\s*:?\s*/i;
  const payMatch = fullText.match(paymentHeadingRe);

  let beforeText = fullText;
  let paymentBody = '';

  if (payMatch) {
    const headingStart = payMatch.index + (payMatch[1] === '\n' ? 1 : 0);
    const bodyStart = payMatch.index + payMatch[0].length;
    beforeText = fullText.slice(0, headingStart).trimEnd();
    paymentBody = fullText.slice(bodyStart);

    // If another Terms & Condition section appears after Payment Terms, keep it in T&C
    const nextTc = paymentBody.match(/(^|\n)\s*(?:[•\-\u2013\u2014*])?\s*terms?\s*&?\s*condition/i);
    if (nextTc) {
      const cutAt = nextTc.index + (nextTc[1] === '\n' ? 1 : 0);
      beforeText = `${beforeText}\n${paymentBody.slice(cutAt)}`.trim();
      paymentBody = paymentBody.slice(0, cutAt).trim();
    }
  }

  const lines = beforeText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  const sections = [];
  let current = null;

  const isSectionHeader = (line) => {
    const bare = stripBullet(line);
    if (isPaymentHeading(bare)) return false;
    if (isNonPaymentTechnicalLine(bare)) return false;
    if (isPaymentItemLine(bare)) return false;
    if (isBulletLine(line)) return false;
    if (/^terms?\b/i.test(bare) || /condition/i.test(bare)) return true;
    // Short title-only lines (no long sentence after colon)
    if (bare.length <= 70 && !/[.!?]$/.test(bare) && /^[A-Z]/.test(bare)) {
      const afterColon = bare.includes(':') ? bare.split(':').slice(1).join(':').trim() : '';
      if (afterColon.length > 20) return false;
      return true;
    }
    return false;
  };

  for (const line of lines) {
    const bare = stripBullet(line);
    if (isPaymentHeading(bare)) continue;

    if (isSectionHeader(line)) {
      current = { title: sanitizePdfText(bare), items: [], isPayment: false };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { title: 'Terms & Conditions', items: [], isPayment: false };
      sections.push(current);
    }

    // Payment points that appear outside the Payment Terms block still go there later
    if (isPaymentItemLine(bare)) continue;

    current.items.push(sanitizePdfText(bare));
  }

  let paymentItems = buildPaymentItemsFromBlock(paymentBody);

  // Also collect any advance/balance lines left in T&C text (rare)
  lines.forEach((line) => {
    const bare = stripBullet(line);
    if (!isPaymentItemLine(bare)) return;
    const clean = sanitizePdfText(bare);
    if (clean && !paymentItems.includes(clean)) paymentItems.push(clean);
  });

  // Optional dedicated payment field — only when it is real payment terms for this quotation
  if (extraPaymentText && looksLikePaymentTermsContent(extraPaymentText)) {
    buildPaymentItemsFromBlock(extraPaymentText).forEach((item) => {
      if (!paymentItems.includes(item)) paymentItems.push(item);
    });
  }

  const out = sections.filter((s) => (s.items && s.items.length) || s.title);
  if (paymentItems.length) {
    out.push({ title: 'Payment Terms', items: paymentItems, isPayment: true });
  }
  return out;
}

/**
 * Parse Line Description into annexure table blocks.
 * - Lines starting with ANNEXURE ... become the yellow title bar
 * - Following lines become bordered description rows (continuations merge)
 * Multiple ANNEXURE headings => multiple boxed sections (A, B, C...).
 */
export function parseAnnexureBlocks(rawText) {
  const lines = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const isAnnexureTitle = (line) => /^annexure\b/i.test(stripBullet(line));
  const isNewPoint = (line) => {
    const t = String(line || '').trim();
    if (isAnnexureTitle(t)) return false;
    if (/^([•\-\u2013\u2014*]|\d+[.)]|[A-Za-z][.)]|\(?[a-zA-Z0-9]+\)[.\s])\s*/.test(t)) return true;
    const colon = t.indexOf(':');
    if (colon > 2 && colon < 90 && t.slice(colon + 1).trim().length > 0) return true;
    return false;
  };

  const blocks = [];
  let current = null;

  const ensureBlock = () => {
    if (!current) {
      current = { title: '', items: [] };
      blocks.push(current);
    }
  };

  lines.forEach((line) => {
    const bare = stripBullet(line);
    if (isAnnexureTitle(bare)) {
      current = { title: sanitizePdfText(bare), items: [] };
      blocks.push(current);
      return;
    }
    ensureBlock();
    const clean = sanitizePdfText(bare);
    if (!clean) return;
    if (current.items.length && !isNewPoint(line)) {
      current.items[current.items.length - 1] = `${current.items[current.items.length - 1]} ${clean}`.trim();
    } else {
      current.items.push(clean);
    }
  });

  return blocks.filter((b) => b.title || (b.items && b.items.length));
}

/** Split "Title: body" for bold title rendering inside annexure cells. */
function splitAnnexureItemLabel(item) {
  const text = sanitizePdfText(item);
  const colon = text.indexOf(':');
  if (colon > 1 && colon < 100) {
    return {
      label: text.slice(0, colon + 1).trim(),
      body: text.slice(colon + 1).trim(),
    };
  }
  // Letter prefixes like "A. Something" — bold letter+dot
  const letter = text.match(/^([A-Za-z]\.|[A-Za-z]\))\s+(.*)$/);
  if (letter) {
    return { label: letter[1], body: letter[2] };
  }
  return { label: '', body: text };
}

/**
 * Draw annexure blocks like the Indus demo:
 * yellow title bar + bordered Sr.No / Description rows, bold labels.
 */
function drawAnnexureBlocks(doc, blocks, marginLeft, marginRight, contentW, contentTop, footerReserve, yPos, ensureSpace) {
  let srCounter = 0;
  const srColW = 14;
  const descColW = contentW - srColW;
  const pad = 2.4;
  const lineH = 3.9;

  const measureItemHeight = (item) => {
    const { label, body } = splitAnnexureItemLabel(item);
    doc.setFontSize(8);
    if (label && body) {
      doc.setFont('helvetica', 'bold');
      const labelW = doc.getTextWidth(`${label} `);
      doc.setFont('helvetica', 'normal');
      const firstW = Math.max(20, descColW - pad * 2 - labelW);
      const words = body.split(/\s+/).filter(Boolean);
      let lines = 1;
      let cur = '';
      let useFirst = true;
      words.forEach((w) => {
        const cand = cur ? `${cur} ${w}` : w;
        const limit = useFirst ? firstW : descColW - pad * 2;
        if (doc.getTextWidth(cand) > limit && cur) {
          lines += 1;
          cur = w;
          useFirst = false;
        } else {
          cur = cand;
        }
      });
      return Math.max(11, lines * lineH + pad * 2);
    }
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(sanitizePdfText(item), descColW - pad * 2);
    return Math.max(11, wrapped.length * lineH + pad * 2);
  };

  const drawYellowTitle = (title, atY) => {
    const titleLines = doc.splitTextToSize(title, contentW - 6);
    const titleH = Math.max(8, 4 + titleLines.length * 3.5);
    doc.setFillColor(...COLORS.yellow);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.rect(marginLeft, atY, contentW, titleH, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.black);
    let ty = atY + 5;
    titleLines.slice(0, 3).forEach((ln) => {
      doc.text(ln, marginLeft + contentW / 2, ty, { align: 'center' });
      ty += 3.5;
    });
    return atY + titleH;
  };

  blocks.forEach((block) => {
    if (!block.items.length && !block.title) return;

    if (block.title) {
      yPos = ensureSpace(yPos, 16);
      yPos = drawYellowTitle(block.title, yPos);
    }

    const items = block.items.length ? block.items : ['-'];

    items.forEach((item) => {
      srCounter += 1;
      const drawH = measureItemHeight(item);

      // New page when the full box does not fit
      if (yPos + drawH > contentMaxY()) {
        doc.addPage();
        yPos = contentTop;
        if (block.title) {
          yPos = drawYellowTitle(block.title, yPos);
        }
      }

      const boxY = yPos;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.35);
      doc.setFillColor(255, 255, 255);
      doc.rect(marginLeft, boxY, srColW, drawH, 'FD');
      doc.rect(marginLeft + srColW, boxY, descColW, drawH, 'FD');

      // Sr. No.
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.black);
      doc.text(String(srCounter), marginLeft + srColW / 2, boxY + pad + 3.6, { align: 'center' });

      // Description
      const { label, body } = splitAnnexureItemLabel(item);
      let tx = marginLeft + srColW + pad;
      let ty = boxY + pad + 3.4;
      const maxW = descColW - pad * 2;

      if (label && body) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        const labelText = `${label} `;
        const labelW = doc.getTextWidth(labelText);
        doc.text(labelText, tx, ty);

        doc.setFont('helvetica', 'normal');
        const words = body.split(/\s+/).filter(Boolean);
        let line = '';
        let first = true;
        let avail = Math.max(20, maxW - labelW);

        const flush = (isFirst) => {
          if (!line) return;
          doc.text(line, isFirst ? tx + labelW : tx, ty);
          ty += lineH;
          line = '';
          avail = maxW;
        };

        words.forEach((word) => {
          const candidate = line ? `${line} ${word}` : word;
          if (doc.getTextWidth(candidate) > avail && line) {
            flush(first);
            first = false;
            line = word;
          } else {
            line = candidate;
          }
        });
        if (line) flush(first);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.splitTextToSize(sanitizePdfText(item), maxW).forEach((ln) => {
          doc.text(ln, tx, ty);
          ty += lineH;
        });
      }

      yPos = boxY + drawH;
    });

    yPos += 3;
  });

  return yPos;
}


function drawPaymentTermsBlock(doc, items, marginLeft, contentW, yPos, ensureSpace) {
  yPos = ensureSpace(yPos, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.black);
  doc.text('Payment Terms:', marginLeft, yPos);
  yPos += 5.5;

  const bulletX = marginLeft;
  const textX = marginLeft + 4;
  const textW = contentW - 4;

  items.forEach((rawItem) => {
    const item = sanitizePdfText(rawItem);
    if (!item) return;
    yPos = ensureSpace(yPos, 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('-', bulletX, yPos);

    const colonIdx = item.indexOf(':');
    const hasLabel = colonIdx > 0 && colonIdx < 55;
    const label = hasLabel ? item.slice(0, colonIdx + 1).trim() : '';
    const rest = hasLabel ? item.slice(colonIdx + 1).trim() : item;

    if (hasLabel && rest) {
      doc.setFont('helvetica', 'bold');
      const labelText = `${label} `;
      doc.text(labelText, textX, yPos);
      const labelW = doc.getTextWidth(labelText);
      doc.setFont('helvetica', 'normal');

      // First line continues after bold label; remaining lines full width under textX
      const words = rest.split(/\s+/).filter(Boolean);
      let line = '';
      let x = textX + labelW;
      let avail = textW - labelW;

      const flush = (isFirst) => {
        if (!line) return;
        doc.text(line, isFirst ? textX + labelW : textX, yPos);
        yPos += 4.2;
        yPos = ensureSpace(yPos, 5);
        line = '';
        x = textX;
        avail = textW;
      };

      let first = true;
      words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (doc.getTextWidth(candidate) > avail && line) {
          flush(first);
          first = false;
          line = word;
        } else {
          line = candidate;
        }
      });
      if (line) {
        doc.text(line, first ? textX + labelW : textX, yPos);
        yPos += 4.2;
      }
    } else {
      const wrapped = doc.splitTextToSize(item, textW);
      wrapped.forEach((ln, i) => {
        if (i > 0) yPos = ensureSpace(yPos, 5);
        doc.text(ln, textX, yPos);
        yPos += 4.2;
      });
    }
    yPos += 1.8;
  });

  return yPos + 2;
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

  const { termsText, extraPaymentText } = resolveQuotationTermsSources(formData, quotation);
  const allSections = parseTermsSections(termsText, extraPaymentText);
  const paymentSections = allSections.filter((s) => s.isPayment);
  const termSections = allSections.filter((s) => !s.isPayment);

  termSections.forEach((section) => {
    // Remove stray empty "Payment Terms" rows from yellow boxes
    const bodyItems = (section.items || []).filter(
      (item) => !/^payment\s+terms\s*:?\s*$/i.test(String(item || '').trim())
    );
    if (!bodyItems.length && !section.title) return;
    yPos = ensureSpace(yPos, 18);
    const bodyRows = (bodyItems.length ? bodyItems : ['-']).map((item) => [item]);
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

  // --- Payment terms (after all yellow T&C boxes, demo bullet style) ---
  const paymentItems = paymentSections.flatMap((s) => s.items || []);
  if (paymentItems.length) {
    // Prefer a fresh page so Payment Terms sits cleanly like the demo
    yPos = ensureSpace(yPos, 36);
    yPos = drawPaymentTermsBlock(doc, paymentItems, marginLeft, contentW, yPos, ensureSpace);
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
  yPos += 8;

  // --- Annexure tables (only Line Description / Annexure Template data) ---
  const annexureBlocks = parseAnnexureBlocks(
    formData?.annexure_description || quotation?.annexure_description || ''
  );

  if (annexureBlocks.length) {
    yPos = ensureSpace(yPos, 20);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(marginLeft, yPos, PAGE_W - marginRight, yPos);
    yPos += 5;

    yPos = drawAnnexureBlocks(
      doc,
      annexureBlocks,
      marginLeft,
      marginRight,
      contentW,
      contentTop,
      footerReserve,
      yPos,
      ensureSpace
    );
  }

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
