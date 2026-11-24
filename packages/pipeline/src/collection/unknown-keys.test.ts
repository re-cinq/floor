import { describe, expect, it } from "vitest";
import { readPipelineFile } from "../file.js";
import { pipelineOf } from "../shape.js";
import { SOUND } from "./lint.fixtures.js";
import { unknownKeys } from "./unknown-keys.js";

function unknownKeysOf(yamlText: string) {
  return unknownKeys(pipelineOf(readPipelineFile(yamlText)));
}

function unknownKeyOnSound(detail: string) {
  return { line: "sound", rule: "unknown-key", detail };
}

describe("unknownKeys", () => {
  it("reports unknown-key for optional on a produce", () => {
    const withOptional = SOUND.replace(
      "    produces: []\n",
      "    produces:\n      - name: report\n        kind: file\n        path: report.md\n        optional: true\n",
    );

    expect(unknownKeysOf(withOptional)).toEqual([unknownKeyOnSound('stations.work.produces[0]: unknown key "optional"')]);
  });

  it("reports unknown-key for iteration-max on an edge", () => {
    const withIterationMax = SOUND.replace("      on: failed\n", "      on: failed\n      iteration-max: 3\n");

    expect(unknownKeysOf(withIterationMax)).toEqual([unknownKeyOnSound('line.edges[1]: unknown key "iteration-max"')]);
  });

  it("reports nothing for unattended_max on an edge", () => {
    const withUnattendedMax = SOUND.replace("      on: failed\n", "      on: failed\n      unattended_max: 1\n");

    expect(unknownKeysOf(withUnattendedMax)).toEqual([]);
  });

  it("reports unknown-key for temperature in agent settings", () => {
    const withTemperature = `${SOUND}agent_definitions:
  reviewer:
    settings:
      prompt: Review the change.
      image: ghcr.io/example/reviewer:1
      timeout_minutes: 30
      temperature: 0.2
`;

    expect(unknownKeysOf(withTemperature)).toEqual([unknownKeyOnSound('agent_definitions.reviewer.settings: unknown key "temperature"')]);
  });

  it("reports unknown-key for time_zone on a schedule", () => {
    const withTimeZone = `${SOUND}schedules:
  nightly:
    cron: "0 3 * * *"
    time_zone: Europe/Berlin
    payload: {}
`;

    expect(unknownKeysOf(withTimeZone)).toEqual([unknownKeyOnSound('schedules.nightly: unknown key "time_zone"')]);
  });

  it("allows a key the floor does not know inside config", () => {
    const withHostSetting = `${SOUND}agent_definitions:
  reviewer:
    settings:
      prompt: Review the change.
      image: ghcr.io/example/reviewer:1
      timeout_minutes: 30
      config:
        some_host_setting: true
`;

    expect(unknownKeysOf(withHostSetting)).toEqual([]);
  });

  it("writes the station id agentDefinition as given", () => {
    const withCamelCaseStation = `${SOUND}  agentDefinition:
    kind: service
    outcomes:
      - success
    needs: []
    produces: []
    colour: red
`;

    expect(unknownKeysOf(withCamelCaseStation)).toEqual([unknownKeyOnSound('stations.agentDefinition: unknown key "colour"')]);
  });
});
