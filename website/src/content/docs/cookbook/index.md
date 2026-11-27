---
title: Cookbook
description: Six assembly lines that each show one pattern, ready to copy.
wordBudget: 80
sidebar:
  order: 0
---

Each recipe is a real file in `examples/cookbook`, checked by `floor-pipeline lint`.

| Pattern | When you want it | Recipe |
| --- | --- | --- |
| Retry a failed step, then stop | An agent may fail and learn from its error | [Retry loop](/floor/cookbook/retry-loop/) |
| Wait for a person | A step needs a human decision | [Human approval](/floor/cookbook/human-approval/) |
| Do one step for each entry of a list | The number of branches is known only at run time | [Fan-out](/floor/cookbook/fan-out/) |
| Start a run on a schedule | Work repeats at fixed times | [Scheduled](/floor/cookbook/scheduled/) |
| React when another run ends | A failed run needs follow-up | [On run settled](/floor/cookbook/on-run-settled/) |
| Revise until a person approves | Work needs a sign-off, and a rejection must reach the agent word for word | [Review loop](/floor/cookbook/review-loop/) |
