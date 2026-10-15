/**
 * Company letterhead (logo header + address footer) and authorised signature
 * for generated exit documents. Works on an open PizZip of a .docx template.
 */
import signatureUrl from "../assets/annexure-signature.png";

const LETTERHEAD_BASE = "/templates/employee-exit/letterhead";

export const LETTERHEAD_ASSET_URLS = {
  logo: `${LETTERHEAD_BASE}/logo.png`,
  footerAddress: `${LETTERHEAD_BASE}/footer-address.png`,
  redBar: `${LETTERHEAD_BASE}/red-bar.png`,
  rule: `${LETTERHEAD_BASE}/rule.png`,
  signature: signatureUrl,
};

const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const REL_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const REL_HEADER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header";
const REL_FOOTER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer";
const CT_HEADER = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";
const CT_FOOTER = "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";

const EMU_PER_PT = 12700;
const TWIPS_PER_PT = 20;

// Geometry (points) mirrors the company Letterhead.doc.
const LOGO_WIDTH_PT = 140;
const LOGO_TOP_PT = 16;
const LOGO_RIGHT_GAP_PT = 28;
const FOOTER_ADDRESS_WIDTH_PT = 525;
const FOOTER_ADDRESS_HEIGHT_PT = 38.25;
const RED_BAR_HEIGHT_PT = 10.4;
const RED_BAR_BOTTOM_GAP_PT = 4;
const RULE_HEIGHT_PT = 0.75;
const BODY_CLEARANCE_PT = 8;
const SIGNATURE_HEIGHT_PT = 52;

const SIGNATORY_MARKER = "AUTHORIZED SIGNATORY</w:t>";

function pngSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: view.getUint32(16), h: view.getUint32(20) };
}

async function fetchPng(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load letterhead image (${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, ...pngSize(bytes) };
}

let assetsPromise = null;

/** Letterhead + signature images, fetched once per session. */
export function loadLetterheadAssets() {
  if (!assetsPromise) {
    const entries = Object.entries(LETTERHEAD_ASSET_URLS);
    assetsPromise = Promise.all(entries.map(([, url]) => fetchPng(url)))
      .then((images) => Object.fromEntries(entries.map(([key], i) => [key, images[i]])))
      .catch((err) => {
        assetsPromise = null;
        throw err;
      });
  }
  return assetsPromise;
}

/** Page positions (points) of the letterhead images — shared by the Word file and its PDF copy. */
export function letterheadLayout(assets, pageWPt, pageHPt) {
  const logoHPt = (assets.logo.h / assets.logo.w) * LOGO_WIDTH_PT;
  const redBarYPt = pageHPt - RED_BAR_BOTTOM_GAP_PT - RED_BAR_HEIGHT_PT;
  const addressYPt = redBarYPt - 4 - FOOTER_ADDRESS_HEIGHT_PT;
  const ruleYPt = addressYPt - 3;
  return {
    logoHPt,
    ruleYPt,
    logo: { xPt: pageWPt - LOGO_RIGHT_GAP_PT - LOGO_WIDTH_PT, yPt: LOGO_TOP_PT, wPt: LOGO_WIDTH_PT, hPt: logoHPt },
    rule: { xPt: 0, yPt: ruleYPt, wPt: pageWPt, hPt: RULE_HEIGHT_PT },
    footerAddress: {
      xPt: (pageWPt - FOOTER_ADDRESS_WIDTH_PT) / 2,
      yPt: addressYPt,
      wPt: FOOTER_ADDRESS_WIDTH_PT,
      hPt: FOOTER_ADDRESS_HEIGHT_PT,
    },
    redBar: { xPt: 0, yPt: redBarYPt, wPt: pageWPt, hPt: pageHPt - redBarYPt },
  };
}

const emu = (pt) => Math.round(pt * EMU_PER_PT);

function graphicXml({ rId, docPrId, name, wPt, hPt }) {
  return (
    `<wp:docPr id="${docPrId}" name="${name}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${NS_A}" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}"><pic:pic xmlns:pic="${NS_PIC}">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(wPt)}" cy="${emu(hPt)}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>`
  );
}

function anchoredPictureRun({ xPt, yPt, wPt, hPt, ...pic }) {
  return (
    `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${pic.docPrId}" ` +
    `behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(xPt)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(yPt)}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${emu(wPt)}" cy="${emu(hPt)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>` +
    graphicXml({ ...pic, wPt, hPt }) +
    `</wp:anchor></w:drawing></w:r>`
  );
}

function inlinePictureRun({ wPt, hPt, ...pic }) {
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${emu(wPt)}" cy="${emu(hPt)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    graphicXml({ ...pic, wPt, hPt }) +
    `</wp:inline></w:drawing></w:r>`
  );
}

function partXml(rootTag, runs) {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<${rootTag} xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:wp="${NS_WP}">` +
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${runs}</w:p></${rootTag}>`
  );
}

function relsXml(relationships) {
  const items = relationships
    .map(({ id, type, target }) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`
  );
}

function addRelationships(zip, relsPath, relationships) {
  const existing = zip.file(relsPath)?.asText();
  if (!existing) {
    zip.file(relsPath, relsXml(relationships));
    return;
  }
  const items = relationships
    .map(({ id, type, target }) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`)
    .join("");
  zip.file(relsPath, existing.replace("</Relationships>", `${items}</Relationships>`));
}

function registerContentTypes(zip, overrides) {
  let xml = zip.file("[Content_Types].xml").asText();
  if (!/<Default\s+Extension="png"/i.test(xml)) {
    xml = xml.replace("<Default ", `<Default Extension="png" ContentType="image/png"/><Default `);
  }
  for (const { partName, contentType } of overrides) {
    if (!xml.includes(`PartName="${partName}"`)) {
      xml = xml.replace("</Types>", `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`);
    }
  }
  zip.file("[Content_Types].xml", xml);
}

function readTwipsAttr(tag, attr) {
  const m = new RegExp(`w:${attr}="(-?\\d+)"`).exec(tag);
  return m ? Number(m[1]) : null;
}

function setTwipsAttr(tag, attr, value) {
  const re = new RegExp(`w:${attr}="-?\\d+"`);
  return re.test(tag) ? tag.replace(re, `w:${attr}="${value}"`) : tag.replace(/\/>$/, ` w:${attr}="${value}"/>`);
}

/** Puts the signature image in the blank space above "AUTHORIZED SIGNATORY". */
function insertSignature(documentXml, rId, signature) {
  const markerAt = documentXml.indexOf(SIGNATORY_MARKER);
  if (markerAt < 0) return documentXml;
  const paraStart = Math.max(documentXml.lastIndexOf("<w:p ", markerAt), documentXml.lastIndexOf("<w:p>", markerAt));
  if (paraStart < 0) return documentXml;

  // Drop the empty spacer paragraphs left for a wet signature; the image takes their place.
  let before = documentXml.slice(0, paraStart);
  const emptyParagraphAtEnd = /<w:p\b[^>]*>(?:(?!<w:p\b|<w:r\b)[\s\S])*<\/w:p>$/;
  for (let match = emptyParagraphAtEnd.exec(before); match; match = emptyParagraphAtEnd.exec(before)) {
    before = before.slice(0, match.index);
  }

  const wPt = (signature.w / signature.h) * SIGNATURE_HEIGHT_PT;
  const signatureParagraph =
    `<w:p><w:pPr><w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/></w:pPr>` +
    inlinePictureRun({ rId, docPrId: 9101, name: "Authorised signature", wPt, hPt: SIGNATURE_HEIGHT_PT }) +
    `</w:p>`;
  return before + signatureParagraph + documentXml.slice(paraStart);
}

/**
 * Adds the letterhead to every page and, when `sign` is true, the authorised signature.
 * @param {import("pizzip")} zip
 * @param {Awaited<ReturnType<typeof loadLetterheadAssets>>} assets
 */
export function applyLetterhead(zip, assets, { sign = false } = {}) {
  let documentXml = zip.file("word/document.xml").asText();
  const sectMatch = /<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/.exec(documentXml);
  if (!sectMatch) throw new Error("Invalid Word template.");
  let sectPr = sectMatch[0];

  const pgSz = /<w:pgSz\b[^>]*\/>/.exec(sectPr)?.[0] || "";
  const pageWPt = (readTwipsAttr(pgSz, "w") || 12240) / TWIPS_PER_PT;
  const pageHPt = (readTwipsAttr(pgSz, "h") || 15840) / TWIPS_PER_PT;

  const layout = letterheadLayout(assets, pageWPt, pageHPt);
  const { logoHPt, ruleYPt } = layout;

  zip.file("word/media/letterhead-logo.png", assets.logo.bytes);
  zip.file("word/media/letterhead-footer.png", assets.footerAddress.bytes);
  zip.file("word/media/letterhead-red-bar.png", assets.redBar.bytes);
  zip.file("word/media/letterhead-rule.png", assets.rule.bytes);

  zip.file(
    "word/letterheadHeader.xml",
    partXml(
      "w:hdr",
      anchoredPictureRun({
        rId: "rIdLhLogo",
        docPrId: 9001,
        name: "Letterhead logo",
        ...layout.logo,
      })
    )
  );
  zip.file(
    "word/_rels/letterheadHeader.xml.rels",
    relsXml([{ id: "rIdLhLogo", type: REL_IMAGE, target: "media/letterhead-logo.png" }])
  );

  zip.file(
    "word/letterheadFooter.xml",
    partXml(
      "w:ftr",
      anchoredPictureRun({
        rId: "rIdLhRule",
        docPrId: 9002,
        name: "Letterhead rule",
        ...layout.rule,
      }) +
        anchoredPictureRun({
          rId: "rIdLhAddress",
          docPrId: 9003,
          name: "Letterhead address",
          ...layout.footerAddress,
        }) +
        anchoredPictureRun({
          rId: "rIdLhRedBar",
          docPrId: 9004,
          name: "Letterhead band",
          ...layout.redBar,
        })
    )
  );
  zip.file(
    "word/_rels/letterheadFooter.xml.rels",
    relsXml([
      { id: "rIdLhRule", type: REL_IMAGE, target: "media/letterhead-rule.png" },
      { id: "rIdLhAddress", type: REL_IMAGE, target: "media/letterhead-footer.png" },
      { id: "rIdLhRedBar", type: REL_IMAGE, target: "media/letterhead-red-bar.png" },
    ])
  );

  const documentRels = [
    { id: "rIdLhHeader", type: REL_HEADER, target: "letterheadHeader.xml" },
    { id: "rIdLhFooter", type: REL_FOOTER, target: "letterheadFooter.xml" },
  ];

  if (sign) {
    zip.file("word/media/authorised-signature.png", assets.signature.bytes);
    documentRels.push({ id: "rIdLhSignature", type: REL_IMAGE, target: "media/authorised-signature.png" });
  }
  addRelationships(zip, "word/_rels/document.xml.rels", documentRels);

  registerContentTypes(zip, [
    { partName: "/word/letterheadHeader.xml", contentType: CT_HEADER },
    { partName: "/word/letterheadFooter.xml", contentType: CT_FOOTER },
  ]);

  // Body text must clear the address strip; templates that open with blank spacer
  // paragraphs already leave room for the logo, so only push down ones that don't.
  const firstParagraph = /<w:body>\s*(<w:p\b[\s\S]*?<\/w:p>)/.exec(documentXml)?.[1] || "";
  const opensWithText = /<w:t\b[^>]*>[^<]*\S/.test(firstParagraph);
  const minTopTwips = opensWithText ? Math.ceil((LOGO_TOP_PT + logoHPt + BODY_CLEARANCE_PT) * TWIPS_PER_PT) : 0;
  const minBottomTwips = Math.ceil((pageHPt - ruleYPt + BODY_CLEARANCE_PT) * TWIPS_PER_PT);
  sectPr = sectPr
    .replace(/<w:headerReference\b[^>]*\/>|<w:footerReference\b[^>]*\/>|<w:titlePg\b[^>]*\/>/g, "")
    .replace(
      /^<w:sectPr\b[^>]*>/,
      (open) =>
        `${open}<w:headerReference w:type="default" r:id="rIdLhHeader"/><w:footerReference w:type="default" r:id="rIdLhFooter"/>`
    )
    .replace(/<w:pgMar\b[^>]*\/>/, (pgMar) => {
      const top = Math.max(readTwipsAttr(pgMar, "top") || 0, minTopTwips);
      const bottom = Math.max(readTwipsAttr(pgMar, "bottom") || 0, minBottomTwips);
      return setTwipsAttr(setTwipsAttr(pgMar, "top", top), "bottom", bottom);
    });

  documentXml =
    documentXml.slice(0, sectMatch.index) + sectPr + documentXml.slice(sectMatch.index + sectMatch[0].length);

  if (sign) documentXml = insertSignature(documentXml, "rIdLhSignature", assets.signature);

  zip.file("word/document.xml", documentXml);
}
