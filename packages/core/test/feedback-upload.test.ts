import { describe, expect, it } from 'vitest';
import { feedbackUploader } from '../src/diagnostics/feedback-upload.js';

describe('feedback destination boundary', () => {
  it.each([
    'https://feedback.botharness.ai/feedback',
    'http://localhost:31981/feedback',
    'http://127.0.0.1:31981/feedback',
  ])('accepts the approved destination %s', (endpoint) => {
    expect(typeof feedbackUploader(endpoint)).toBe('function');
  });
  it.each([
    'https://example.com/feedback',
    'http://feedback.botharness.ai/feedback',
    'https://feedback.botharness.ai.evil.test/feedback',
    'https://feedback.botharness.ai:8443/feedback',
    'https://user:password@feedback.botharness.ai/feedback',
    'https://feedback.botharness.ai/feedback?destination=elsewhere',
    'https://feedback.botharness.ai/other',
    'http://192.168.0.1/feedback',
  ])('refuses unapproved destination %s before upload', (endpoint) => {
    expect(() => feedbackUploader(endpoint)).toThrow();
  });
});
