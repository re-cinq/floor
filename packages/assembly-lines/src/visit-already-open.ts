import { Refusal } from "./refusal.js";

// A start for a node whose visit is still open: the run is intact and goes on with that visit.
export class VisitAlreadyOpen extends Refusal {}
