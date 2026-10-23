import { describe, expect, it } from "vitest";
import { narrowApps } from "@/lib/agent/tools";

// Real shape of the owner's list: several applications at one company.
const google = [
  { position: "SWE II, AI/ML Catalyst", status: "Applied" },
  { position: "SWE", status: "Applied" },
  { position: "PM", status: "Applied" },
];
const scale = [{ position: "SWE", status: "Applied" }, { position: "SWE", status: "OA Stage" }];

describe("Which application an update means", () => {
  it("narrows by the role the owner named", () => {
    expect(narrowApps(google, "PM", "Rejected").map((a) => a.position)).toEqual(["PM"]);
    expect(narrowApps(google, "ML", "Rejected").map((a) => a.position)).toEqual(["SWE II, AI/ML Catalyst"]);
    expect(narrowApps(google, "the SWE one", "Rejected").map((a) => a.position)).toEqual(["SWE"]);
  });
  it("asks when nothing tells them apart", () => {
    expect(narrowApps(google, null, "Rejected")).toHaveLength(3);
    expect(narrowApps(scale, null, "Rejected")).toHaveLength(2);
  });
  it("prefers ones not already in the new status", () => {
    expect(narrowApps(scale, "SWE", "OA Stage")).toEqual([{ position: "SWE", status: "Applied" }]);
  });
  it("never narrows to nothing", () => {
    expect(narrowApps(google, "quant", null)).toHaveLength(3);
  });
});
