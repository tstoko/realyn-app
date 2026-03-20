import * as fs from "fs";
import * as path from "path";
import {detectDelimiter, parseDelimitedBuffer} from "../parsers/delimitedUtils";

function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(__dirname, "fixtures", name));
}

describe("delimitedUtils", () => {
  describe("detectDelimiter", () => {
    it("should detect pipe delimiter", () => {
      const text = "A|B|C\n1|2|3\n4|5|6";
      expect(detectDelimiter(text)).toBe("|");
    });

    it("should detect tab delimiter", () => {
      const text = "A\tB\tC\n1\t2\t3\n4\t5\t6";
      expect(detectDelimiter(text)).toBe("\t");
    });

    it("should detect semicolon delimiter", () => {
      const text = "A;B;C\n1;2;3\n4;5;6";
      expect(detectDelimiter(text)).toBe(";");
    });

    it("should fall back to comma for ambiguous input", () => {
      const text = "just some plain text\nwith no clear delimiter\n";
      expect(detectDelimiter(text)).toBe(",");
    });

    it("should detect comma for CSV input", () => {
      const text = "A,B,C\n1,2,3\n4,5,6";
      expect(detectDelimiter(text)).toBe(",");
    });

    it("should handle empty input", () => {
      expect(detectDelimiter("")).toBe(",");
    });
  });

  describe("parseDelimitedBuffer", () => {
    it("should parse pipe-delimited file", () => {
      const buf = fixture("sample-pipe-delimited.txt");
      const {headers, rows} = parseDelimitedBuffer(buf);

      expect(headers[0]).toBe("CONFIRMATION_NO");
      expect(headers).toContain("GUEST_NAME");
      expect(rows).toHaveLength(3);
      expect(rows[0][0]).toBe("600001");
      expect(rows[0][1]).toBe("Smith, John");
    });

    it("should parse tab-delimited file", () => {
      const buf = fixture("sample-tab-delimited.txt");
      const {headers, rows} = parseDelimitedBuffer(buf);

      expect(headers[0]).toBe("CONFIRMATION_NO");
      expect(headers).toContain("GUEST_NAME");
      expect(rows).toHaveLength(2);
      expect(rows[0][0]).toBe("700001");
    });

    it("should normalise headers to uppercase", () => {
      const buf = Buffer.from("name\tage\n Alice \t30");
      const {headers} = parseDelimitedBuffer(buf);
      expect(headers).toEqual(["NAME", "AGE"]);
    });

    it("should handle empty input", () => {
      const {headers, rows} = parseDelimitedBuffer(Buffer.from(""));
      expect(headers).toEqual([]);
      expect(rows).toEqual([]);
    });

    it("should strip BOM", () => {
      const buf = Buffer.from("\uFEFFA|B\n1|2");
      const {headers} = parseDelimitedBuffer(buf);
      expect(headers[0]).toBe("A");
    });
  });
});
