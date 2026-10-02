/**
 * Unit tests for the parseFunctions helper in ContractSpec.tsx.
 *
 * These tests verify the v17 xdr API property-access chain used when parsing
 * on-chain contract spec entries, without requiring any network access.
 *
 * The test constructs real xdr.ScSpecEntry objects using the installed
 * @stellar/stellar-sdk 17.2.0 — no mocks or fakes are needed because
 * parseFunctions only needs the in-memory discriminated-union graph.
 * 
 * v17 property chain exercised (cross-checked from type definitions):
 *   entry.type === "scSpecEntryFunctionV0"   → TypeScript narrows
 *   entry.value                              → ScSpecFunctionV0
 *   fn.name.toString()                       → function name string
 *   fn.doc.toString().trim()                 → doc string
 *   fn.inputs[i].name.toString()             → param name
 *   fn.inputs[i].type.type                   → ScSpecTypeDefVariantName string
 *   fn.outputs[j].type                       → ScSpecTypeDefVariantName string
 */

import { describe, it, expect } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import { parseFunctions } from "./ContractSpec.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(name: string, typeDef: xdr.ScSpecTypeDef): xdr.ScSpecFunctionInputV0 {
  return new xdr.ScSpecFunctionInputV0({ doc: "", name, type: typeDef });
}

function makeFunctionEntry(
  name: string,
  doc: string,
  inputs: xdr.ScSpecFunctionInputV0[],
  outputs: xdr.ScSpecTypeDef[]
): xdr.ScSpecEntry {
  const fn = new xdr.ScSpecFunctionV0({ doc, name, inputs, outputs });
  return xdr.ScSpecEntry.scSpecEntryFunctionV0(fn);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseFunctions", () => {
  it("returns an empty array for an empty entry list", () => {
    expect(parseFunctions([])).toEqual([]);
  });

  it("ignores non-function entries (struct, enum, etc.)", () => {
    // Build a non-function entry: a struct spec entry
    const structEntry = xdr.ScSpecEntry.scSpecEntryUdtStructV0(
      new xdr.ScSpecUdtStructV0({ doc: "", lib: "", name: "MyStruct", fields: [] })
    );
    expect(parseFunctions([structEntry])).toEqual([]);
  });

  it("parses a zero-arg void function", () => {
    const entry = makeFunctionEntry("initialize", "Initialise the registry.", [], []);
    const result = parseFunctions([entry]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("initialize");
    expect(result[0].doc).toBe("Initialise the registry.");
    expect(result[0].inputs).toEqual([]);
    expect(result[0].outputs).toEqual([]);
  });

  it("parses a function with one u32 input and a bool output", () => {
    const entry = makeFunctionEntry(
      "is_verified",
      "Returns true if the hash is on record.",
      [makeInput("wasm_hash", xdr.ScSpecTypeDef.scSpecTypeU32())],
      [xdr.ScSpecTypeDef.scSpecTypeBool()]
    );
    const result = parseFunctions([entry]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("is_verified");
    expect(result[0].inputs).toEqual([{ name: "wasm_hash", type: "scSpecTypeU32" }]);
    expect(result[0].outputs).toEqual(["scSpecTypeBool"]);
  });

  it("parses a function with multiple inputs of different types", () => {
    const entry = makeFunctionEntry(
      "submit",
      "Submit a verification record.",
      [
        makeInput("submitter", xdr.ScSpecTypeDef.scSpecTypeAddress()),
        makeInput("wasm_hash", xdr.ScSpecTypeDef.scSpecTypeString()),
        makeInput("source_repo", xdr.ScSpecTypeDef.scSpecTypeString()),
        makeInput("source_commit", xdr.ScSpecTypeDef.scSpecTypeString()),
        makeInput("build_args", xdr.ScSpecTypeDef.scSpecTypeString()),
      ],
      [xdr.ScSpecTypeDef.scSpecTypeVoid()]
    );
    const result = parseFunctions([entry]);

    expect(result[0].inputs).toHaveLength(5);
    expect(result[0].inputs[0]).toEqual({ name: "submitter", type: "scSpecTypeAddress" });
    expect(result[0].inputs[1]).toEqual({ name: "wasm_hash", type: "scSpecTypeString" });
    expect(result[0].outputs).toEqual(["scSpecTypeVoid"]);
  });

  it("trims whitespace from doc strings", () => {
    const entry = makeFunctionEntry("count", "  Count all records.  \n", [], []);
    const result = parseFunctions([entry]);
    expect(result[0].doc).toBe("Count all records.");
  });

  it("parses multiple function entries in order", () => {
    const entries: xdr.ScSpecEntry[] = [
      makeFunctionEntry("initialize", "", [], []),
      makeFunctionEntry("submit", "", [], []),
      makeFunctionEntry("is_verified", "", [], []),
      makeFunctionEntry("count", "", [], []),
    ];
    const result = parseFunctions(entries);

    expect(result).toHaveLength(4);
    expect(result.map((f) => f.name)).toEqual(["initialize", "submit", "is_verified", "count"]);
  });

  it("skips non-function entries interspersed with function entries", () => {
    const structEntry = xdr.ScSpecEntry.scSpecEntryUdtStructV0(
      new xdr.ScSpecUdtStructV0({ doc: "", lib: "", name: "VerificationRecord", fields: [] })
    );
    const entries: xdr.ScSpecEntry[] = [
      makeFunctionEntry("submit", "", [], []),
      structEntry,
      makeFunctionEntry("count", "", [], []),
    ];
    const result = parseFunctions(entries);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("submit");
    expect(result[1].name).toBe("count");
  });

  it("correctly reads the .type discriminant from entry (v17 property, not method)", () => {
    const entry = makeFunctionEntry("test", "", [], []);
    // entry.type is a real typed property — not entry.switch().name (v13 style)
    expect(entry.type).toBe("scSpecEntryFunctionV0");
  });

  it("correctly uses .value getter on ScSpecEntryFunctionV0 (v17 getter, not method)", () => {
    const entry = makeFunctionEntry("test_fn", "doc", [], []);
    // .value is a real typed getter — TypeScript narrows after entry.type check
    if (entry.type === "scSpecEntryFunctionV0") {
      expect(entry.value.name.toString()).toBe("test_fn");
    } else {
      throw new Error("Expected scSpecEntryFunctionV0");
    }
  });
});
