import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(scriptDirectory, "..", "sample-data");
const outputPath = path.join(outputDirectory, "facecheck-dhoni-kohli-demo.xlsx");

const rows = [
  ["externalId", "name", "age", "profession", "faceImageUrl"],
  [
    "MSD-001",
    "MS Dhoni",
    45,
    "Cricketer",
    "https://upload.wikimedia.org/wikipedia/commons/5/5e/MS_Dhoni_2016.jpg",
  ],
  [
    "VK-001",
    "Virat Kohli",
    37,
    "Cricketer",
    "https://upload.wikimedia.org/wikipedia/commons/1/15/Virat_Kohli_portrait.jpg",
  ],
];

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function crc32(buffer) {
  let checksum = 0xffffffff;
  for (const byte of buffer) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = checksum & 1 ? (checksum >>> 1) ^ 0xedb88320 : checksum >>> 1;
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function u16(value) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

/** Creates a small, standards-compliant ZIP archive without adding a package. */
function zipStore(entries) {
  const localFiles = [];
  const centralDirectory = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = (46 << 9) | (10 << 5) | 11; // 2026-10-11

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, "utf8");
    const checksum = crc32(content);
    const flags = 0x0800; // UTF-8 file names
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(flags),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(content.length),
      u32(content.length),
      u16(name.length),
      u16(0),
      name,
    ]);
    const localFile = Buffer.concat([localHeader, content]);
    localFiles.push(localFile);

    centralDirectory.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(flags),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(checksum),
        u32(content.length),
        u32(content.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += localFile.length;
  }

  const directory = Buffer.concat(centralDirectory);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(directory.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...localFiles, directory, end]);
}

function cell(reference, value, style) {
  const styleAttribute = style === undefined ? "" : ` s="${style}"`;
  if (typeof value === "number") return `<c r="${reference}"${styleAttribute}><v>${value}</v></c>`;
  return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

const sheetRows = rows
  .map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((value, columnIndex) => cell(`${columnName(columnIndex)}${rowNumber}`, value, rowIndex === 0 ? 1 : undefined));
    return `<row r="${rowNumber}">${cells.join("")}</row>`;
  })
  .join("");

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Users" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:E3"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>
    <col min="1" max="1" width="16" customWidth="1"/>
    <col min="2" max="2" width="22" customWidth="1"/>
    <col min="3" max="3" width="10" customWidth="1"/>
    <col min="4" max="4" width="22" customWidth="1"/>
    <col min="5" max="5" width="84" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A1:E3"/>
</worksheet>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF075C52"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  outputPath,
  zipStore([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRelationships },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelationships },
    { name: "xl/worksheets/sheet1.xml", content: worksheet },
    { name: "xl/styles.xml", content: styles },
  ]),
);

console.log(`Created ${outputPath}`);
