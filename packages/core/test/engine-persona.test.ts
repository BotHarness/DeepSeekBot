import { describe, expect, it } from 'vitest';
import {
  ENGINE_TOOL_BOUNDARY,
  engineAssignmentInstructions,
  engineInstructions,
} from '../src/engines/engine-persona.js';

describe('engine persona instructions', () => {
  it('tells an engine Orchestrator which jobs need Bot tools instead of its own', () => {
    const text = engineInstructions({ name: 'Ada', replyDelivery: '## Reply delivery' });
    expect(text).toContain(ENGINE_TOOL_BOUNDARY);
    expect(ENGINE_TOOL_BOUNDARY).toContain('bot_schedule_create');
    expect(ENGINE_TOOL_BOUNDARY).toContain('create_assignment');
    expect(ENGINE_TOOL_BOUNDARY).toContain('use them freely');
  });

  it('lets an engine Assignment use its own sub-agents inside the Assignment', () => {
    const text = engineAssignmentInstructions({ name: 'Ada', cwd: '/work', fullAccess: false });
    expect(text).toContain('sub-agents and background tasks are fine');
    expect(text).not.toContain('create_assignment');
    expect(text).toContain('your sub-agents never report');
  });
});
