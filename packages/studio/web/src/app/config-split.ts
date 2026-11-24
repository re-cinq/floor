import { z } from "zod";
import { agentConfigSchema } from "@re-cinq/floor-pipeline/agent-config";

type Config = Record<string, unknown>;

const formKeys = Object.keys(z.toJSONSchema(agentConfigSchema).properties ?? {});

/** The config entries the generated form has no field for. */
export function unknownConfigOf(config: Config): Config {
  return Object.fromEntries(Object.entries(config).filter(([key]) => !formKeys.includes(key)));
}

/** The config with its unknown entries replaced by the given ones, the form's entries untouched. */
export function withUnknownConfig(config: Config, unknown: Config): Config {
  const known = Object.fromEntries(Object.entries(config).filter(([key]) => formKeys.includes(key)));

  return { ...known, ...unknown };
}
