import {normalizeHeader, buildColumnMap, getCell, parseCSVBuffer} from "../csvUtils";

describe("csvUtils", () => {
  // =========================================================================
  // normalizeHeader
  // =========================================================================

  describe("normalizeHeader", () => {
    it("should trim whitespace", () => {
      expect(normalizeHeader("  HEADER  ")).toBe("HEADER");
    });

    it("should convert to uppercase", () => {
      expect(normalizeHeader("guest_name")).toBe("GUEST_NAME");
    });

    it("should replace spaces with underscores", () => {
      expect(normalizeHeader("Guest Name")).toBe("GUEST_NAME");
    });

    it("should collapse multiple spaces into one underscore", () => {
      expect(normalizeHeader("Guest   Name")).toBe("GUEST_NAME");
    });

    it("should strip UTF-8 BOM", () => {
      expect(normalizeHeader("\uFEFFCONFIRMATION_NO")).toBe("CONFIRMATION_NO");
    });

    it("should handle empty string", () => {
      expect(normalizeHeader("")).toBe("");
    });

    it("should handle header with leading/trailing spaces and BOM", () => {
      expect(normalizeHeader("\uFEFF  confirmation no  ")).toBe("CONFIRMATION_NO");
    });
  });

  // =========================================================================
  // buildColumnMap
  // =========================================================================

  describe("buildColumnMap", () => {
    it("should map column names to indices", () => {
      const map = buildColumnMap(["A", "B", "C"]);
      expect(map.get("A")).toBe(0);
      expect(map.get("B")).toBe(1);
      expect(map.get("C")).toBe(2);
    });

    it("should handle duplicate column names (last wins)", () => {
      const map = buildColumnMap(["A", "B", "A"]);
      expect(map.get("A")).toBe(2);
    });

    it("should handle empty array", () => {
      const map = buildColumnMap([]);
      expect(map.size).toBe(0);
    });

    it("should handle single column", () => {
      const map = buildColumnMap(["ONLY"]);
      expect(map.get("ONLY")).toBe(0);
    });
  });

  // =========================================================================
  // getCell
  // =========================================================================

  describe("getCell", () => {
    const colMap = new Map([["A", 0], ["B", 1], ["C", 2]]);

    it("should retrieve cell value by column name", () => {
      expect(getCell(["hello", "world", "test"], colMap, "A")).toBe("hello");
      expect(getCell(["hello", "world", "test"], colMap, "B")).toBe("world");
    });

    it("should return undefined for missing column name", () => {
      expect(getCell(["hello", "world"], colMap, "MISSING")).toBeUndefined();
    });

    it("should return undefined for out-of-bounds index", () => {
      expect(getCell(["hello"], colMap, "C")).toBeUndefined();
    });

    it("should return undefined for empty string values", () => {
      expect(getCell(["", "world"], colMap, "A")).toBeUndefined();
    });

    it("should trim whitespace from values", () => {
      expect(getCell(["  hello  ", "world"], colMap, "A")).toBe("hello");
    });

    it("should return undefined for whitespace-only values", () => {
      expect(getCell(["   ", "world"], colMap, "A")).toBeUndefined();
    });
  });

  // =========================================================================
  // parseCSVBuffer
  // =========================================================================

  describe("parseCSVBuffer", () => {
    it("should parse simple CSV", () => {
      const buf = Buffer.from("A,B,C\n1,2,3\n4,5,6");
      const {headers, rows} = parseCSVBuffer(buf);
      expect(headers).toEqual(["A", "B", "C"]);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(["1", "2", "3"]);
      expect(rows[1]).toEqual(["4", "5", "6"]);
    });

    it("should handle empty buffer", () => {
      const {headers, rows} = parseCSVBuffer(Buffer.from(""));
      expect(headers).toEqual([]);
      expect(rows).toEqual([]);
    });

    it("should strip UTF-8 BOM", () => {
      const buf = Buffer.from("\uFEFFA,B\n1,2");
      const {headers} = parseCSVBuffer(buf);
      expect(headers[0]).toBe("A");
    });

    it("should handle quoted fields with commas", () => {
      const buf = Buffer.from('NAME,VALUE\n"Smith, John",100');
      const {headers, rows} = parseCSVBuffer(buf);
      expect(headers).toEqual(["NAME", "VALUE"]);
      expect(rows[0][0]).toBe("Smith, John");
      expect(rows[0][1]).toBe("100");
    });

    it("should handle quoted fields with newlines", () => {
      const buf = Buffer.from('NAME,DESC\n"Smith","Line 1\nLine 2"');
      const result = parseCSVBuffer(buf);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][1]).toBe("Line 1\nLine 2");
    });

    it("should handle relaxed column count (fewer columns than header)", () => {
      const buf = Buffer.from("A,B,C\n1,2\n4,5,6");
      const {rows} = parseCSVBuffer(buf);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(["1", "2"]);
      expect(rows[1]).toEqual(["4", "5", "6"]);
    });

    it("should handle relaxed column count (more columns than header)", () => {
      const buf = Buffer.from("A,B\n1,2,3\n4,5");
      const result = parseCSVBuffer(buf);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(["1", "2", "3"]);
    });

    it("should normalise headers to uppercase", () => {
      const buf = Buffer.from("name,age\nAlice,30");
      const {headers} = parseCSVBuffer(buf);
      expect(headers).toEqual(["NAME", "AGE"]);
    });

    it("should handle header-only CSV (no data rows)", () => {
      const buf = Buffer.from("A,B,C");
      const {headers, rows} = parseCSVBuffer(buf);
      expect(headers).toEqual(["A", "B", "C"]);
      expect(rows).toEqual([]);
    });

    it("should skip empty lines", () => {
      const buf = Buffer.from("A,B\n\n1,2\n\n3,4\n");
      const {rows} = parseCSVBuffer(buf);
      expect(rows).toHaveLength(2);
    });

    it("should handle UTF-8 encoded content", () => {
      const buf = Buffer.from("NAME,CITY\nMüller,München\nDubois,Zürich");
      const {rows} = parseCSVBuffer(buf);
      expect(rows[0][0]).toBe("Müller");
      expect(rows[0][1]).toBe("München");
    });
  });
});
