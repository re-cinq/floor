# @floor/github

The floor's GitHub side. Optional: a floor with no GitHub in its lines does not run it. The floor itself holds no provider client; this is where GitHub's is.

One process, six parts. Each runs only when it has what it needs, so a deployment may be any of them alone.

| half | runs when | what it does |
|---|---|---|
| the webhook receiver | `GITHUB_WEBHOOK_SECRET` is set | takes GitHub's webhooks at `POST /webhooks/github` and posts each to the floor as an event |
| the `post-review` station | `GITHUB_TOKEN`, or `GITHUB_APP_ID` with a key, is set | posts the review an agent printed to the pull request |
| the `read-review` station | `GITHUB_TOKEN`, or `GITHUB_APP_ID` with a key, is set | reads a submitted review from GitHub and writes the reply agent's task |
| the `post-reply` station | `GITHUB_TOKEN`, or `GITHUB_APP_ID` with a key, is set | posts the reply agent's answer as a comment on the pull request |
| the review router | `GITHUB_REVIEW_ROUTER=1` | chooses, for a push to a pull request, the full review or the recheck |
| the git credential provider | `GITHUB_GIT_CREDENTIALS=1`, with `GITHUB_APP_ID` and a key | mints a token for one repository when the floor asks at `POST /git-credentials` |

```
FLOOR_API_URL=http://localhost:8180 FLOOR_SERVICE_TOKEN=floor-dev-token \
  GITHUB_WEBHOOK_SECRET=... GITHUB_APP_ID=... GITHUB_APP_PRIVATE_KEY_FILE=app.pem \
  npm start -w @floor/github
```

`PORT` is the receiver's and the provider's, 8280 when unset. `GITHUB_API_URL` is GitHub's API, for a GitHub Enterprise server.

## The receiver

It checks `X-Hub-Signature-256` against the hook's secret before it reads a word of the body, and refuses what was not signed with it.

An event is named `github.<event>.<action>`, as a line's `start.on` and a node's `reports` name it. The floor's templates read top-level text, numbers and booleans, so what a line may want is lifted out of GitHub's nesting:

| field | from |
|---|---|
| `repository`, `repo` | `github.com/<full_name>` |
| `sender`, `action` | as GitHub names them |
| `sender_type` | `User` or `Bot`, so a line may refuse to be started by what the floor itself posted |
| `pull_request_url`, `number`, `title`, `draft`, `merged`, `head_ref`, `head_sha`, `base_ref` | a `pull_request` event |
| the pull request's fields, and `review_id`, `review_state`, `review_url` | a `pull_request_review` event |
| `pull_request_url`, `number`, `comment_id`, `comment_body`, `comment_url` | an `issue_comment` on a pull request |
| `subjectKey` | `pr_url:<pull request url>`, so an event about a pull request finds the run already open on it |

GitHub's delivery id is the event's dedupe key: a webhook delivered again is the same event. The receiver holds nothing. A delivery it could not hand to the floor is answered 502, and GitHub delivers it again.

## The post-review station

What lore's floor did in a hook, `postReviewFromNode`. It needs `review_output`, a file, and `pr_url`.

It reads the last fenced `REVIEW_FINDINGS` block the agent printed, which is lore's format. A finding with a path and a line is a comment on that line, written as a Conventional Comment with its suggestion; one without is said in the review's body. What it posts is always a comment, never an approval or a request for changes, whatever the verdict: suggestion-only, as lore's is.

When GitHub refuses the review for where a comment is placed, most often a line the pull request does not touch, it is posted again with every finding in the body.

## The read-review station

What lore's floor did before it started the `code-review-reply` line. It needs `pr_url`, `review_id` and `intent`. It reads the review's body and its inline comments from GitHub, and the pull request's branch, then writes the reply agent's task: what was said, and whether to implement a fix or only answer.

## The post-reply station

What lore's floor did in a hook, `postReplyFromNode`. It needs `reply_output`, a file, and `pr_url`. It reads the last fenced `REVIEW_REPLY` block the agent printed and posts it as a plain comment on the pull request, never on a review thread: no thread replies and no thread resolving, lore's path for those is switched off here. The comment leads with a marker naming the visit, so a visit already replied to posts nothing again.

## The review router

A push to a pull request is reviewed in full if it never was, and rechecked if it was. That is a choice about what has happened, and a line's `when` reads only the event in front of it. So the push starts a line of one node, `review-router`, whose station asks the floor whether a full review of this pull request ran to its end and went well, and then posts `review.full.requested` or `review.recheck.requested`. The lines start on those.

The router puts its own station and line to the floor when it starts. The choice it made is in its run's bag, `routed_to`.

## The git credential provider

The floor asks it, with the floor's service token, for `{ repoUrl, access }`, and gets `{ username, password }`: what git's credential helper reads. The floor has already decided that the visit may have it. Point the floor here with `FLOOR_GIT_CREDENTIAL_URL=http://<this app>/git-credentials`.

The token is minted each time, for that one repository, with `contents: read` or `contents: write` and nothing else the app may do. It is never the token the post-review station works with.

It runs only as a GitHub App. With `GITHUB_TOKEN` and no app it refuses to start: a token given outright belongs to a person and cannot be narrowed, so it is never handed to a pod.

## Who it is, to GitHub

A token given outright, `GITHUB_TOKEN`, wins. Otherwise it is a GitHub App: it signs a claim with the app's key, good for nine minutes, and trades it for a token for the installation on that one repository, kept until a minute before it expires.

## Testing

Against a stand-in for GitHub's API over real HTTP, `fake-github.ts`: it checks an app's claim against the app's public key as GitHub does, so a claim signed with another key is refused by it and not by a stub. The signature check is tested against the example in GitHub's own documentation.

`scripts/walk-git.sh` walks a run whose station writes to a repository through a real pod, with a stand-in for this provider: git in the pod asks the floor, and the floor asks the provider.

`scripts/walk-code-review.sh` sends a signed webhook through the receiver and walks the run it starts, then a push, which the router sends to the recheck.

The app's authentication has been run against GitHub itself, with a read-only call. Nothing here has posted to a real pull request.
