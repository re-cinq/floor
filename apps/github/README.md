# @floor/github

The floor's GitHub side. Optional: a floor with no GitHub in its lines does not run it. The floor itself holds no provider client; this is where GitHub's is.

One process, two halves. Each runs only when it has what it needs, so a deployment may be the receiver alone, the station alone, or both.

| half | runs when | what it does |
|---|---|---|
| the webhook receiver | `GITHUB_WEBHOOK_SECRET` is set | takes GitHub's webhooks at `POST /webhooks/github` and posts each to the floor as an event |
| the `post-review` station | `GITHUB_TOKEN`, or `GITHUB_APP_ID` with a key, is set | posts the review an agent printed to the pull request |

```
FLOOR_API_URL=http://localhost:8180 FLOOR_SERVICE_TOKEN=floor-dev-token \
  GITHUB_WEBHOOK_SECRET=... GITHUB_APP_ID=... GITHUB_APP_PRIVATE_KEY_FILE=app.pem \
  npm start -w @floor/github
```

`PORT` is the receiver's, 8280 when unset. `GITHUB_API_URL` is GitHub's API, for a GitHub Enterprise server.

## The receiver

It checks `X-Hub-Signature-256` against the hook's secret before it reads a word of the body, and refuses what was not signed with it.

An event is named `github.<event>.<action>`, as a line's `start.on` and a node's `reports` name it. The floor's templates read top-level text, numbers and booleans, so what a line may want is lifted out of GitHub's nesting:

| field | from |
|---|---|
| `repository`, `repo` | `github.com/<full_name>` |
| `sender`, `action` | as GitHub names them |
| `pull_request_url`, `number`, `title`, `draft`, `merged`, `head_ref`, `head_sha`, `base_ref` | a `pull_request` event |
| `pull_request_url`, `number`, `comment_id`, `comment_body`, `comment_url` | an `issue_comment` on a pull request |
| `subjectKey` | `pr_url:<pull request url>`, so an event about a pull request finds the run already open on it |

GitHub's delivery id is the event's dedupe key: a webhook delivered again is the same event. The receiver holds nothing. A delivery it could not hand to the floor is answered 502, and GitHub delivers it again.

## The post-review station

What lore's floor did in a hook, `postReviewFromNode`. It needs `review_output`, a file, and `pr_url`.

It reads the last fenced `REVIEW_FINDINGS` block the agent printed, which is lore's format. A finding with a path and a line is a comment on that line, written as a Conventional Comment with its suggestion; one without is said in the review's body. What it posts is always a comment, never an approval or a request for changes, whatever the verdict: suggestion-only, as lore's is.

When GitHub refuses the review for where a comment is placed, most often a line the pull request does not touch, it is posted again with every finding in the body.

## Who it is, to GitHub

A token given outright, `GITHUB_TOKEN`, wins. Otherwise it is a GitHub App: it signs a claim with the app's key, good for nine minutes, and trades it for a token for the installation on that one repository, kept until a minute before it expires.

## Testing

Against a stand-in for GitHub's API over real HTTP, `fake-github.ts`: it checks an app's claim against the app's public key as GitHub does, so a claim signed with another key is refused by it and not by a stub. The signature check is tested against the example in GitHub's own documentation.

`scripts/walk-code-review.sh` sends a signed webhook through the receiver and walks the run it starts. Nothing here has posted to a real pull request.
