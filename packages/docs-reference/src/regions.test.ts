import { describe, expect, it } from "vitest";
import { fillRegions } from "./regions.js";

const made = (name: string): string => `made for ${name}`;

describe("fillRegions", () => {
  it("writes what is made for a region between its two marks", () => {
    const page = "# Edge\n\n<!-- generated:fields:edge -->\nold table\n<!-- /generated -->\n\nAfter.";

    expect(fillRegions(page, made)).toEqual("# Edge\n\n<!-- generated:fields:edge -->\n\nmade for fields:edge\n\n<!-- /generated -->\n\nAfter.");
  });

  it("fills a region that is still empty", () => {
    expect(fillRegions("<!-- generated:example:starter/pipeline.yaml -->\n<!-- /generated -->", made)).toEqual("<!-- generated:example:starter/pipeline.yaml -->\n\nmade for example:starter/pipeline.yaml\n\n<!-- /generated -->");
  });

  it("fills each of two regions with its own", () => {
    const page = "<!-- generated:fields:a -->\n<!-- /generated -->\ntext\n<!-- generated:fields:b -->\n<!-- /generated -->";

    expect(fillRegions(page, made)).toEqual("<!-- generated:fields:a -->\n\nmade for fields:a\n\n<!-- /generated -->\ntext\n<!-- generated:fields:b -->\n\nmade for fields:b\n\n<!-- /generated -->");
  });

  it("leaves a page with no region as it is", () => {
    expect(fillRegions("# Plain\n\nText.", made)).toEqual("# Plain\n\nText.");
  });

  it("is the same page when filled twice", () => {
    const once = fillRegions("<!-- generated:fields:edge -->\n<!-- /generated -->", made);

    expect(fillRegions(once, made)).toEqual(once);
  });
});
