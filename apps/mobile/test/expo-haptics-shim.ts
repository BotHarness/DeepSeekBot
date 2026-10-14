export const played: string[] = [];

export const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium', Heavy: 'heavy' } as const;
export const NotificationFeedbackType = {
  Success: 'success',
  Warning: 'warning',
  Error: 'error',
} as const;

export async function impactAsync(style: string): Promise<void> {
  played.push(`impact:${style}`);
}

export async function notificationAsync(type: string): Promise<void> {
  played.push(`notification:${type}`);
}

export async function selectionAsync(): Promise<void> {
  played.push('selection');
}
