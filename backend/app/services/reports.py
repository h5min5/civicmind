"""CSV and a small text PDF built from the rows passed in. Nothing is invented here."""

import csv
import io


def build_csv(rows: list[dict], columns: list[str]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: "" if row.get(column) is None else row.get(column) for column in columns})
    return buffer.getvalue()


def _escape(text: str) -> str:
    cleaned = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return cleaned.encode("latin-1", "replace").decode("latin-1")


def build_pdf(lines: list[str]) -> bytes:
    wrapped: list[str] = []
    for line in lines:
        raw = _escape(line)
        if raw == "":
            wrapped.append("")
            continue
        while len(raw) > 92:
            wrapped.append(raw[:92])
            raw = raw[92:]
        wrapped.append(raw)
    chunks = [wrapped[index : index + 44] for index in range(0, max(len(wrapped), 1), 44)]
    objects: dict[int, bytes] = {3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"}
    next_id = 4
    page_ids: list[int] = []
    for chunk in chunks:
        stream_lines = ["BT /F1 10 Tf 48 800 Td 14 TL"]
        for line in chunk:
            stream_lines.append(f"({line}) Tj T*")
        stream_lines.append("ET")
        stream = "\n".join(stream_lines).encode("latin-1", "replace")
        content_id = next_id
        next_id += 1
        page_id = next_id
        next_id += 1
        objects[content_id] = b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"
        objects[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents {content_id} 0 R "
            f"/Resources << /Font << /F1 3 0 R >> >> >>"
        ).encode()
        page_ids.append(page_id)
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[2] = f"<< /Type /Pages /Count {len(page_ids)} /Kids [{kids}] >>".encode()
    objects[1] = b"<< /Type /Catalog /Pages 2 0 R >>"
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number in range(1, next_id):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode())
        output.extend(objects[number])
        output.extend(b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {next_id}\n".encode())
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(f"trailer << /Size {next_id} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return bytes(output)
