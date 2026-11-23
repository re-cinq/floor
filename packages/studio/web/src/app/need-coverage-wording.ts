// How the Station panel words each need's coverage; adding a kind's sentence is one entry in `WORDINGS`.
import type { NodeNeed } from "@protocol";

type NeedCoverage = NodeNeed["coverage"];
type CoverageKind = NeedCoverage["kind"];
type CoverageOf<Kind extends CoverageKind> = Extract<NeedCoverage, { kind: Kind }>;
type Wording<Kind extends CoverageKind> = (coverage: CoverageOf<Kind>) => string;

const filledBy: Wording<"filled"> = ({ producedBy }) => `filled by ${producedBy.join(", ")}`;

const sometimesEmpty: Wording<"sometimes-empty"> = (coverage) =>
  `${filledBy({ ...coverage, kind: "filled" })}, but empty on the path ${coverage.pathWithout.join(" > ")}`;

const neverFilled: Wording<"never-filled"> = () => "never filled: nothing before this node produces it";

const ownStart: Wording<"own-start"> = () => "must be given when this node is started on its own";

const gitUnseeded: Wording<"git-unseeded"> = () => "a git checkout no line argument provides";

const floorFilled: Wording<"floor-filled"> = () => "filled by floor on a retry or fan-out";

const WORDINGS: { [Kind in CoverageKind]: Wording<Kind> } = {
  filled: filledBy,
  seeded: () => "given when the run starts",
  "sometimes-empty": sometimesEmpty,
  "never-filled": neverFilled,
  "own-start": ownStart,
  "git-unseeded": gitUnseeded,
  optional: () => "optional",
  "floor-filled": floorFilled,
  collected: () => "collected from the fan-out branches",
};

/** The sentence telling how a need is filled. */
export function coverageSentence<Kind extends CoverageKind>(coverage: CoverageOf<Kind>): string {
  const wording: Wording<Kind> = WORDINGS[coverage.kind];

  return wording(coverage);
}
