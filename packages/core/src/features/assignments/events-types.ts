import type { AssignmentReportState } from '@botharness/host-protocol/wire';

export interface AssignmentRow {
  session_id: string;
  source_event_id: string;
  bot_slug: string;
  title: string;
  description: string;
  activity: 'working' | 'idle' | 'error';
  stop_state: 'running' | 'requested' | 'stopped';
  latest_report_state: AssignmentReportState | null;
  latest_report_summary: string | null;
  latest_report_at: string | null;
  continuity_key: string | null;
  open_ask_source_event_id: string | null;
  open_ask_summary?: string | null;
  open_ask_at: string | null;
  grant_id: string | null;
  workspace_id: string | null;
  primary_cwd: string | null;
  permission_mode: string | null;
  approval_policy: string | null;
  preset_revision: number | null;
  model_route_json: string | null;
  model_group_id?: string | null;
  model_effort?: string | null;
  agent_preset?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}
