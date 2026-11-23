---
title: Glossary
description: Every term floor uses, in one sentence each.
wordBudget: 300
sidebar:
  order: 9
---

| Term | Meaning |
| --- | --- |
| assembly line | A versioned definition of nodes, edges and arguments. See [Assembly line](/floor/concepts/assembly-line/). |
| assembly run | One execution of one version of an assembly line. See [Assembly run](/floor/concepts/assembly-run/). |
| node | One use of a station inside a line. |
| station | One unit of work, defined once and used by many lines. See [Station](/floor/concepts/station/). |
| marker | A node with no station. Its visit reports `success` at once. |
| visit | One execution of one node. |
| bag | The items of a run. See [Bag](/floor/concepts/bag/). |
| item | One named value, file or git checkout in the bag. |
| brief | What goes into a visit: its needs, filled from the bag when the visit opens. |
| report | What comes out of a visit: an outcome, the items produced and an optional error. |
| outcome | The word a visit reports. An edge's `on` picks the next node by it. |
| subject | The argument whose value says what a run is about. One run is open per repository and subject. |
| collection | A folder of lines and agents. See [Collection](/floor/concepts/collection/). |
| cluster agent | The process that claims agent visits and runs each as a pod in one cluster. |
| service token | The token you use to post events and apply definitions. It may touch any visit. |
| visit token | A token scoped to one visit that expires at its deadline. A pod uses it to report. |
