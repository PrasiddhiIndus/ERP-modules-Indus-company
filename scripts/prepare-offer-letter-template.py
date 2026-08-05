"""One-shot: copy sample offer letter and inject {{PLACEHOLDER}} tokens for generation."""
import html
import re
import shutil
import zipfile
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(r"C:\Users\P1\Downloads\Tanmay Nayak FM.docx")
DST = ROOT / "public" / "templates" / "hr-calling" / "offer-of-employment.docx"

DST.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(SRC, DST)

with zipfile.ZipFile(DST, "r") as zin:
    xml = zin.read("word/document.xml").decode("utf-8")
    other = {n: zin.read(n) for n in zin.namelist() if n != "word/document.xml"}

wt_re = re.compile(r"(<w:t(?: xml:space=\"preserve\")?>)([^<]*)(</w:t>)")
matches = list(wt_re.finditer(xml))

replacements = {
    0: "Ref No: {{REF_NO}}",
    **{i: "" for i in range(1, 10)},
    10: "Date: {{OFFER_DATE}}",
    **{i: "" for i in range(11, 15)},
    16: "{{SALUTATION}}",
    18: "{{CANDIDATE_NAME}}",
    19: "S/O. {{FATHER_NAME}}",
    20: "",
    21: "",
    22: "Emp Code: {{EMP_CODE}}",
    **{i: "" for i in range(23, 26)},
    26: "Address: {{ADDRESS_LINE}}",
    **{i: "" for i in range(27, 32)},
    32: "Dist: {{DISTRICT}}, {{STATE}}-{{PINCODE}}",
    **{i: "" for i in range(33, 42)},
    45: "{{SALUTATION}}",
    47: "{{CANDIDATE_NAME}}",
    73: "{{DESIGNATION}}",
    85: "{{JOINING_DATE}}",
    86: "",
    88: "{{SITE_FULL}}",
    **{i: "" for i in range(89, 99)},
    102: "2. Salary and Benefits: Gross salary: Rs. {{SALARY_NUM}}/- (Rs. {{SALARY_WORDS}} Only) per month. ",
    **{i: "" for i in range(103, 115)},
    126: " {{DUTY_DAYS}} days ",
    227: " {{SALUTATION}} ",
    228: "{{CANDIDATE_NAME}}",
}

parts = []
last = 0
for idx, m in enumerate(matches):
    parts.append(xml[last : m.start()])
    if idx in replacements:
        esc = (
            replacements[idx]
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        parts.append(f'<w:t xml:space="preserve">{esc}</w:t>')
    else:
        parts.append(m.group(0))
    last = m.end()
parts.append(xml[last:])
new_xml = "".join(parts)

buf = BytesIO()
with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zout:
    for name, data in other.items():
        zout.writestr(name, data)
    zout.writestr("word/document.xml", new_xml.encode("utf-8"))

DST.write_bytes(buf.getvalue())
print("wrote", DST)

with zipfile.ZipFile(DST) as z:
    x = z.read("word/document.xml").decode("utf-8")

placeholders = [
    "{{REF_NO}}",
    "{{OFFER_DATE}}",
    "{{CANDIDATE_NAME}}",
    "{{FATHER_NAME}}",
    "{{EMP_CODE}}",
    "{{ADDRESS_LINE}}",
    "{{DISTRICT}}",
    "{{STATE}}",
    "{{PINCODE}}",
    "{{DESIGNATION}}",
    "{{JOINING_DATE}}",
    "{{SITE_FULL}}",
    "{{SALARY_NUM}}",
    "{{SALARY_WORDS}}",
    "{{DUTY_DAYS}}",
    "{{SALUTATION}}",
]
for ph in placeholders:
    print(ph, "OK" if ph in x else "MISSING")
