{{/*
Chart-wide name and label helpers.
*/}}

{{- define "floor.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "floor.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "floor.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{ include "floor.selectorLabels" . }}
{{- end -}}

{{- define "floor.selectorLabels" -}}
app.kubernetes.io/name: {{ include "floor.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "floor.api.fullname" -}}
{{ include "floor.fullname" . }}-api
{{- end -}}

{{- define "floor.clusterAgent.fullname" -}}
{{ include "floor.fullname" . }}-cluster-agent
{{- end -}}

{{- define "floor.api.selectorLabels" -}}
{{ include "floor.selectorLabels" . }}
app.kubernetes.io/component: api
{{- end -}}

{{- define "floor.clusterAgent.selectorLabels" -}}
{{ include "floor.selectorLabels" . }}
app.kubernetes.io/component: cluster-agent
{{- end -}}

{{/*
The one image both apps ship from, tagged by the one shared .Values.version.
*/}}
{{- define "floor.image" -}}
{{ .Values.image.repository }}:{{ .Values.version }}
{{- end -}}

{{- define "floor.imagePullSecrets" -}}
{{- if .Values.imagePullSecrets }}
imagePullSecrets:
{{- range .Values.imagePullSecrets }}
  - name: {{ .name }}
{{- end }}
{{- end }}
{{- end -}}

{{/*
Postgres: either the caller's own Secret, or the one this chart builds from
postgres.host/port/database/user/password (see templates/postgres-secret.yaml).
*/}}
{{- define "floor.postgres.secretName" -}}
{{- if .Values.postgres.existingSecret -}}
{{ .Values.postgres.existingSecret }}
{{- else -}}
{{ include "floor.fullname" . }}-postgres
{{- end -}}
{{- end -}}

{{- define "floor.postgres.secretKey" -}}
{{- if .Values.postgres.existingSecret -}}
{{ .Values.postgres.secretKey }}
{{- else -}}
connectionString
{{- end -}}
{{- end -}}

{{/*
Where the cluster agent reaches the floor API: its own value, or (when the chart also runs the
api) that Deployment's in-cluster Service address. floor.checks guarantees one of the two holds.
*/}}
{{- define "floor.clusterAgent.floorUrl" -}}
{{- if .Values.clusterAgent.floorUrl -}}
{{ .Values.clusterAgent.floorUrl }}
{{- else -}}
http://{{ include "floor.api.fullname" . }}.{{ .Release.Namespace }}.svc.cluster.local:8080
{{- end -}}
{{- end -}}
