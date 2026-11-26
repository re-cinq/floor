// eslint-disable-next-line re-lint/max-comment-lines -- Published as the Pipeline SDK introduction.
/**
 * Use the Pipeline SDK to move an [assembly line](/floor/concepts/assembly-line/) and the
 * definitions it depends on between a [YAML file](/floor/specs/pipeline-file/) and Floor.
 * Use the CLI to import and export files from a shell. Use the TypeScript library when your
 * program needs to inspect a pipeline or act on the definitions that changed.
 *
 * @packageDocumentation
 */
export { pipelineFileSchema, readPipelineFile, writePipelineFile, type PipelineFile } from "./file.js";
export { agentConfigSchema, type AgentConfig } from "./agent-config-schema.js";
export { FILE_SPELLING, fileOf, pipelineOf, type Pipeline } from "./shape.js";
export { exportPipeline, lineIds } from "./export.js";
export { importPipeline, type Put } from "./import.js";
export { migrate, type Migrated, type MigrationFile } from "./migrate.js";
export type { Floor } from "./floor.js";
export { collectionOverlay, type CollectionFile, type CollectionOverlay, type CollectionOverlayInput, type OverlayAgent, type AgentSource, type ShippedCatalog, type Refusal } from "./collection/collection.js";
export { attempt, type Attempt } from "./collection/refusal.js";
export { lineLayoutOf, type LineFile, type LineLayout } from "./collection/line-layout.js";
export { withoutReplacedFiles } from "./collection/group-precedence.js";
export { applyCollection } from "./collection/apply.js";
export { COLLECTION_SETTINGS_FILE, collectionSettingsIn, collectionSettingsOf, hostKeysIn, type CollectionSettings } from "./collection/collection-settings.js";
export { collectionFilesIn, lintCollectionDirectory, lintCommand, printCollectionLint, readCollectionDirectory, shippedCatalogIn, type LintCommand } from "./collection/lint-directory.js";
export { agentFrontmatterSchema, readAgentFile, floorSettingsOf, type ParsedAgentFile, type AgentFileSettings, type ShippedAgents, type AgentPrompts } from "./collection/agent-file.js";
export { placeholdersIn, withEnvironment, settingsWithEnvironment, type Environment } from "./collection/environment.js";
export { PIPELINE_RULES, pipelineProblems, type PipelineProblem, type PipelineRule } from "./collection/lint-rules.js";
export { agentFileOf, isCollectionFile, isReadPath, lineFolderPathOf, pipelineFolderOf } from "./collection/paths.js";
export { extendedPrompt } from "./collection/agents.js";
