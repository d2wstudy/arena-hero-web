export type Position = [number, number]
export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
export type UnitType = 'WORKER' | 'VANGUARD' | 'RANGER'
export type HarvestSource = 'RESOURCE_NODE' | 'DROPPED_CARGO'
export type UnitActionType = 'MOVE' | 'HARVEST' | 'DEPOSIT' | 'SWEEP' | 'SHOOT' | 'PICKUP_BEACON' | 'DROP_BEACON' | 'SELF_DESTRUCT' | 'HEAL' | 'WAIT'
export type CoreActionType = 'SPAWN' | 'REPAIR_SHIELD' | 'START_MOVE' | 'CANCEL_MOVE' | 'PICKUP_BEACON' | 'DROP_BEACON' | 'SELF_DESTRUCT' | 'HEAL' | 'WAIT'

export interface WorldObject {
  kind: 'OBSTACLE' | 'RESOURCE' | 'CORE' | 'UNIT'
  positions?: Position[]
  id?: string
  controlled?: boolean
  owner_id?: string
  owner_username?: string
  position?: Position
  hp?: number
  shield?: number
  state?: 'NORMAL' | 'MOVING'
  move_direction?: Direction
  move_progress?: number
  move_required_ticks?: number
  destination?: Position
  unit_type?: UnitType
  cargo?: number
  resources?: number
  population?: number
}

export interface GameEvent {
  event_id: string
  tick: number
  event_type: string
  reason_code?: string
  actor_id?: string
  target_id?: string
  position?: Position
  values?: Record<string, unknown> & {
    amount?: number
    available?: number
    destroyed?: number
    capacity?: number
    source?: HarvestSource
  }
  player_id?: string
  player_username?: string
}

export interface ChampionBeaconView {
  position: Position
  status?: 'GROUND' | 'CARRIED'
  carrier_id?: string
}

export interface PlayerState {
  view_mode?: 'FULL' | 'GOD'
  status: 'ACTIVE' | 'RESPAWNING'
  respawn_at_tick?: number
  resources: number
  population: number
  champion_beacon: ChampionBeaconView
  objects: WorldObject[]
  events: GameEvent[]
}

export interface UnitAction {
  type: UnitActionType
  direction?: Direction
  target_id?: string
  expected_cell?: Position
}

export interface CoreAction {
  type: CoreActionType
  direction?: Direction
  unit_type?: UnitType
}

export interface CommandPlan {
  tick: number
  unit_actions: Record<string, UnitAction>
  core_action?: CoreAction
}

export type CommandSource = 'AGENT' | 'MANUAL'

export interface ReceiptMetadata {
  tick: number
  source: CommandSource
  received_at: string
}

export interface ReceivedNotice extends ReceiptMetadata {
  plan: CommandPlan
}

export interface Receipt extends ReceiptMetadata {
  accepted: true
}

export type LocalMatchMode = 'step' | 'timed'

export interface LocalSession {
  csrf_token: string
  username: string
  mode: LocalMatchMode
  match_id: string | null
  god_mode: boolean
}

export interface OfficialAgentSession {
  csrf_token: string
  mode: 'official-agent'
}

export interface CaptureReplaySession {
  id: string
  started_at: string
  ended_at: string | null
  sdk_version: string
  rules_version: string
  api_version: string
  base_url: string
  mode: 'passive' | 'active'
}

export interface CaptureReplayGap {
  from_tick: number
  to_tick: number
  count: number
}

export interface CaptureReplayManifest {
  schema_version: number
  capture: string
  open_session: boolean
  live: boolean
  sessions: CaptureReplaySession[]
  frame_count: number
  ticks: number[]
  first_tick: number | null
  latest_tick: number | null
  gaps: CaptureReplayGap[]
  latest_observed_at: string | null
}

export interface CaptureReplayFrame {
  tick: number
  session_id: string
  observed_at: string
  state: PlayerState
  receipts: Partial<Record<CommandSource, ReceivedNotice>>
}

export interface CaptureReplayFramesResponse {
  frames: CaptureReplayFrame[]
  has_more: boolean
  next_after_tick: number | null
}

export interface LocalBotStatus {
  username: string
  ready: boolean
  error?: string
}

export type LocalParticipantController = 'HUMAN' | 'BOT' | 'AGENT'
export type LocalParticipantStatus = 'PENDING' | 'ACTIVE' | 'RESPAWNING'

export interface LocalParticipant {
  id: string
  username: string
  controller: LocalParticipantController
  status: LocalParticipantStatus
  activation_tick?: number
  token?: string
}

export interface LocalTickLabel {
  match_id: string
  tick: number
  label: string
  updated_at: string
}

export interface LocalMatchStatus {
  mode: LocalMatchMode
  tick: number
  phase: 'IDLE' | 'PREPARING' | 'OPEN' | 'RESOLVING' | 'STOPPED'
  human: string
  bots: LocalBotStatus[]
  match_id: string | null
  root_match_id?: string
  god: LocalGodSettings
  participants: LocalParticipant[]
  label?: LocalTickLabel
}

export interface LocalAdvanceReceipt {
  accepted: true
  tick: number
}

export interface LocalMatchSummary {
  id: string
  label: string
  created_at: string
  updated_at: string
  root_match_id: string
  parent_match_id: string | null
  parent_tick: number | null
  first_tick: number
  latest_tick: number
  active: boolean
}

export interface LocalHistory {
  active_match_id: string
  selected_match_id: string
  matches: LocalMatchSummary[]
  labels: LocalTickLabel[]
}

export interface LocalExploredCell {
  position: Position
  kind: 'EMPTY' | 'OBSTACLE' | 'RESOURCE'
}

export type LocalObservationMode = 'HUMAN' | 'PLAYER' | 'GLOBAL'

export type LocalViewSelection =
  | { mode: 'HUMAN' }
  | { mode: 'GLOBAL' }
  | { mode: 'PLAYER'; playerId: string }

export interface LocalObservationView {
  mode: LocalObservationMode
  player_id?: string
  username?: string
}

export interface LocalCompactExploration {
  ranges: Array<[y: number, startX: number, endX: number]>
  obstacles: Position[]
  resources: Position[]
}

export interface LocalChunkViewport {
  min_chunk_x: number
  max_chunk_x: number
  min_chunk_y: number
  max_chunk_y: number
}

export interface LocalObservationWorld {
  mode: 'MATERIALIZED'
  chunk_size: number
  total_materialized_chunks: number
  chunks: Position[]
  viewport: LocalChunkViewport | null
  unmaterialized_omitted: true
}

export interface LocalObservation {
  match_id: string | null
  tick: number
  live: boolean
  view: LocalObservationView
  state: PlayerState
  exploration: LocalCompactExploration
  world?: LocalObservationWorld
}

export interface LocalReplay {
  match_id: string
  tick: number
  live: boolean
  state: PlayerState
  receipts: Partial<Record<CommandSource, ReceivedNotice>>
  explored: LocalExploredCell[]
  god: LocalGodSettings
  label?: LocalTickLabel
}

export interface LocalGodSettings {
  human_full_vision: boolean
}

export interface LocalFullVisionOperation {
  seq: number
  match_id: string | null
  tick: number
  applied_at: string
  operation: 'SET_HUMAN_FULL_VISION'
  payload: { enabled: boolean }
}

export interface LocalParticipantOperation {
  seq: number
  match_id: string | null
  tick: number
  applied_at: string
  operation: 'ADD_PARTICIPANT'
  payload: {
    controller: 'AGENT' | 'BOT'
    player_id: string
    username: string
  }
}

export type LocalGodOperation = LocalFullVisionOperation | LocalParticipantOperation

export interface LocalGodPlayer {
  id: string
  username: string
  status: 'ACTIVE' | 'RESPAWNING'
  respawn_at_tick?: number | null
  resources: number
  population: number
  core_id: string | null
  unit_ids: string[]
  events: GameEvent[]
  stats: Record<string, number>
}

export interface LocalGodPlan {
  player_id: string
  player_username: string
  source: CommandSource
  received_at?: string
  plan: CommandPlan
}

export interface LocalGodResourceCell {
  position: Position
  source: 'NATURAL' | 'DROPPED_CARGO'
  amount?: number
}

export interface LocalGodSnapshot {
  match_id: string | null
  tick: number
  live: boolean
  contract: {
    api: string
    rules: string
    generator: string
    resources: string
    spawn: string
  }
  world_sha256: string
  settings: LocalGodSettings
  operations: LocalGodOperation[]
  participants: LocalParticipant[]
  state: PlayerState
  players: LocalGodPlayer[]
  tracked_chunks: Position[]
  resource_cells: LocalGodResourceCell[]
  plans: LocalGodPlan[]
  explored: LocalExploredCell[]
  label?: LocalTickLabel
}

export interface LocalGodOperationReceipt {
  accepted: true
  tick: number
  operation: 'SET_HUMAN_FULL_VISION'
  changed: boolean
  settings: LocalGodSettings
  record?: LocalGodOperation
}

export interface LocalParticipantAdmissionReceipt {
  accepted: true
  tick: number
  operation: 'ADD_PARTICIPANT'
  participant: LocalParticipant
  record: LocalParticipantOperation
}

export interface LocalTickLabelReceipt {
  accepted: true
  match_id: string
  tick: number
  cleared: boolean
  label: LocalTickLabel | null
  labels: LocalTickLabel[]
}

export interface LocalBranchReceipt {
  accepted: true
  match_id: string
  tick: number
  parent_match_id: string
  parent_tick: number
}

export interface User {
  email: string
  username: string
  auth_source: 'MANUAL'
  oauth_providers: Array<'github' | 'linux_do'>
}

export interface Session {
  csrf_token: string
  expires_at: string
  username: string
}

export interface AuthOptions {
  email_registration_enabled: boolean
}

export interface PlayerStats {
  damage_dealt: number
  damage_received: number
  unit_destruction_participations: number
  core_destruction_participations: number
  resources_harvested: number
  resources_deposited: number
  beacon_pickups: number
  beacon_ticks_held: number
  beacon_bonus_resources_harvested: number
  units_spawned: number
  units_lost: number
  unit_hp_recovered: number
  core_hp_recovered: number
  core_survival_ticks: number
  respawn_count: number
}

export interface LeaderboardEntry {
  rank: number
  username: string
  score: number
}

export interface Leaderboard {
  beacon_ticks_held: LeaderboardEntry[]
  damage_dealt: LeaderboardEntry[]
  core_destruction_participations: LeaderboardEntry[]
}

export interface APIKeyView {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at?: string
  revoked_at?: string
  key?: string
}

export type StreamPhase = 'connecting' | 'syncing' | 'open' | 'settling' | 'offline' | 'replay'
