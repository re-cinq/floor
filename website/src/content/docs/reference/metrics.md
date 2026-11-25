---
title: Metrics
description: The Prometheus metrics the api serves, their labels, and how to read them.
wordBudget: 450
sidebar:
  order: 6
---

The api serves its metrics at `GET /metrics` in the Prometheus text format (`text/plain; version=0.0.4`). The route needs no token, like the health routes. With the Prometheus operator in your cluster, set `api.serviceMonitor.enabled` to `true` and the chart adds a ServiceMonitor that scrapes it.

## Runs

| Metric | Labels | What it counts |
| --- | --- | --- |
| `floor_runs_open` | | Runs not finished yet |
| `floor_runs_settled_total` | `outcome` | Settled runs |
| `floor_runs_started_total` | `line_id`, `repo` | Every run ever started |
| `floor_runs_settled_by_line_total` | `line_id`, `outcome` | Settled runs per assembly line |
| `floor_run_duration_seconds` | `line_id`, `outcome` | Histogram of `finished_at - created_at` over settled runs |

## Visits

| Metric | Labels | What it counts |
| --- | --- | --- |
| `floor_visits_open` | | Visits with no report yet |
| `floor_visits_overdue` | | Open visits past their deadline |
| `floor_visits_started_total` | `line_id`, `node_id`, `kind`, `repo` | Visits ever opened. `kind` is `agent`, `service`, `human`, or `none` for a marker node |
| `floor_visits_total` | `line_id`, `node_id`, `outcome`, `kind`, `repo` | Finished visits |
| `floor_visit_duration_seconds` | `line_id`, `node_id`, `outcome` | Histogram of `finished_at - opened_at` |
| `floor_visit_retries_total` | `line_id`, `node_id` | Visits with an iteration above 1 |

## Cost

| Metric | Labels | What it counts |
| --- | --- | --- |
| `floor_cost_usd_total` | `line_id`, `node_id`, `model`, `repo` | Model spend in US dollars, the same rollup as `GET /costs` |
| `floor_tokens_total` | `line_id`, `node_id`, `model`, `repo`, `kind` | Tokens. `kind` is `in`, `cache_read` for the part of `in` read from the cache, or `out` |
| `floor_visits_missing_cost` | `line_id` | Agent visits that called a model and stated no price |

## Events and the loop

| Metric | Labels | What it counts |
| --- | --- | --- |
| `floor_events_queue_depth` | | Events not yet acked, dead or dropped |
| `floor_events_dead_total` | | Dead events |
| `floor_events_claim_latency_seconds` | | Histogram of `claimed_at - not_before` over acked events |
| `floor_loop_holds_lease` | | 1 if this replica runs the floor's loop, else 0 |

## Reading the numbers

Every number is a fresh query against the database at scrape time, so each api replica answers the same. A metric ending in `_total` is a gauge that counts the rows still stored, not a counter. When old runs are pruned it goes down, and Prometheus reads that as a reset. The histograms are counted from the same rows on each scrape and behave the same way.

## Missing a metric?

[Open an issue](https://github.com/re-cinq/floor/issues/new?title=Metric%3A%20) with the number you want to watch and the question it answers.
