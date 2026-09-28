# The ai-agent-subsystem, vendored

What runs an agent station's visit: the controller that turns an `Agent` resource into a pod, and the three CRDs it reads. Vendored from [re-cinq/ai-agent-subsystem](https://github.com/re-cinq/ai-agent-subsystem) `deploy/` at **v0.11.6**, the release `@re-cinq/agent-contracts` in `apps/cluster-agent` is pinned to. The two move together.

| file | from upstream | changed |
|---|---|---|
| `crds/*.yaml` | `deploy/crds/` | nothing |
| `controller.yaml` | `deploy/controller.yaml`, `deploy/rbac/controller-rbac.yaml` | namespace and images are placeholders; one replica; 1Gi memory limit; the pull secret is named |

Left out on purpose: upstream's `NetworkPolicy` (on minikube the floor is a host process, which is exactly the traffic it would drop) and its `agent-launcher` service account (the cluster agent runs on the host, under your own kubeconfig).

The images are not taken from upstream's `deploy/`: at the v0.11.6 tag it still pins the v0.11.3 digests, which lack the fix that lets a Gemini agent read files beside its clone (#258), the exit code on uploads (#251), and the clone retry (#255). The digests in `scripts/setup-minikube-agents.sh` are the ones the v0.11.6 release published, checked by their image label.

`npm run minikube-setup` installs this, and `npm run minikube-claude-auth` gives its agents a Claude credential. To move to a newer release, copy the new `deploy/crds/`, update the two image digests in the script, and bump `@re-cinq/agent-contracts`.
