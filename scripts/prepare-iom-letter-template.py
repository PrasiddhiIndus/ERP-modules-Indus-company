"""Create a minimal IOM Word template with {{PLACEHOLDER}} tokens."""
import zipfile
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DST = ROOT / "public" / "templates" / "hr-calling" / "iom-new-joiner.docx"
DST.parent.mkdir(parents=True, exist_ok=True)

document_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t xml:space="preserve">Ref No: {{IOM_REF_NO}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Date: {{IOM_DATE}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">To: {{DEPARTMENTS}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">INTER-OFFICE MEMO</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Subject: New Employee Joining — {{CANDIDATE_NAME}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">This is to inform all concerned departments that the following candidate has joined IFSPL:</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Employee Name: {{SALUTATION}} {{CANDIDATE_NAME}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Father Name: {{FATHER_NAME}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Employee Code: {{EMP_CODE}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Designation: {{DESIGNATION}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Date of Joining: {{JOINING_DATE}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Site / Location: {{SITE_FULL}}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Offer Reference: {{OFFER_REF_NO}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Departments notified: {{DEPARTMENTS}}</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Please take necessary action for onboarding arrangements as applicable to your department.</w:t></w:r></w:p>
    <w:p><w:r><w:t></w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Authorized Signature (HR)</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>"""

content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

buf = BytesIO()
with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", document_xml)

DST.write_bytes(buf.getvalue())
print("wrote", DST)
