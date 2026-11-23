// tsc leaves `import styles from "./x.module.css"` as it is, so the stylesheets go to dist for the consumer's bundler to resolve.
import { cpSync, readdirSync } from "node:fs";

readdirSync("src")
  .filter((file) => file.endsWith(".css"))
  .forEach((file) => cpSync(`src/${file}`, `dist/${file}`));
