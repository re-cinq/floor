{{/*
Install-time refusals. Included once, from templates/checks.yaml, so they run on every
lint/template/install/upgrade regardless of which components are enabled.
*/}}
{{- define "floor.checks" -}}

{{- if not .Values.postgres.existingSecret -}}
{{- if or (not .Values.postgres.host) (not .Values.postgres.database) (not .Values.postgres.user) (not .Values.postgres.password) -}}
{{ fail "postgres: set postgres.existingSecret (and postgres.secretKey), or all of postgres.host, postgres.database, postgres.user and postgres.password" }}
{{- end -}}
{{- end -}}

{{- if and .Values.api.enabled (not .Values.api.baseUrl) -}}
{{ fail "api.baseUrl is required when api.enabled is true" }}
{{- end -}}

{{- if and .Values.clusterAgent.enabled (not .Values.api.enabled) (not .Values.clusterAgent.floorUrl) -}}
{{ fail "clusterAgent.floorUrl is required when clusterAgent.enabled is true and api.enabled is false" }}
{{- end -}}

{{- if .Values.subsystem.enabled -}}
{{- if not (has .Values.subsystem.version .Values.subsystem.supportedVersions) -}}
{{ fail (printf "subsystem.version %q is not supported; supported versions: %s" .Values.subsystem.version (join ", " .Values.subsystem.supportedVersions)) }}
{{- end -}}
{{- end -}}

{{- end -}}
