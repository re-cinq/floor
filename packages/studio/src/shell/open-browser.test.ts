import { describe, expect, it } from "vitest";
import { openerOf } from "./open-browser.js";

const URL_WITH_FRAGMENT = "http://127.0.0.1:5000/#socket=ws%3A%2F%2F127.0.0.1%3A4000&token=abc";

describe("openerOf", () => {
  it("opens with xdg-open on linux", () => {
    expect(openerOf("linux", URL_WITH_FRAGMENT)).toEqual({ command: "xdg-open", args: [URL_WITH_FRAGMENT] });
  });

  it("opens with open on darwin", () => {
    expect(openerOf("darwin", URL_WITH_FRAGMENT)).toEqual({ command: "open", args: [URL_WITH_FRAGMENT] });
  });

  it("opens with cmd's start on win32, the & of the fragment escaped for cmd", () => {
    expect(openerOf("win32", URL_WITH_FRAGMENT)).toEqual({ command: "cmd", args: ["/c", "start", "", URL_WITH_FRAGMENT.replace("&", "^&")] });
  });
});
