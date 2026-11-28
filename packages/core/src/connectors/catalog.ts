export interface ConnectorCatalogEntry {
  service: string;
  name: string;
  summary: string;
  keywords: readonly string[];
}

export const CONNECTOR_CATALOG: readonly ConnectorCatalogEntry[] = [
  {
    service: 'gmail',
    name: 'Gmail',
    summary: 'Read, search, draft and send email',
    keywords: ['email', 'mail', '邮件', '邮箱'],
  },
  {
    service: 'googlecalendar',
    name: 'Google Calendar',
    summary: 'Read and create events',
    keywords: ['calendar', 'meeting', 'schedule', '日历', '日程', '会议'],
  },
  {
    service: 'googledrive',
    name: 'Google Drive',
    summary: 'Browse and manage files',
    keywords: ['drive', 'files', '文件', '云盘'],
  },
  {
    service: 'googledocs',
    name: 'Google Docs',
    summary: 'Read and write documents',
    keywords: ['docs', 'document', '文档'],
  },
  {
    service: 'googlesheets',
    name: 'Google Sheets',
    summary: 'Read and update spreadsheets',
    keywords: ['sheets', 'spreadsheet', '表格'],
  },
  {
    service: 'outlook',
    name: 'Outlook',
    summary: 'Microsoft mail and calendar',
    keywords: ['outlook', 'email', 'calendar', '邮件', '日历'],
  },
  {
    service: 'notion',
    name: 'Notion',
    summary: 'Pages and databases',
    keywords: ['notion', 'notes', 'wiki', '笔记'],
  },
  {
    service: 'slack',
    name: 'Slack',
    summary: 'Read channels and post updates',
    keywords: ['slack', 'chat'],
  },
  {
    service: 'github',
    name: 'GitHub',
    summary: 'Issues, pull requests and code',
    keywords: ['github', 'code', 'issue', 'pr'],
  },
  {
    service: 'linear',
    name: 'Linear',
    summary: 'Issues and projects',
    keywords: ['linear', 'issue', 'task', '任务'],
  },
  {
    service: 'jira',
    name: 'Jira',
    summary: 'Issues and sprints',
    keywords: ['jira', 'issue', 'sprint'],
  },
  {
    service: 'asana',
    name: 'Asana',
    summary: 'Tasks and projects',
    keywords: ['asana', 'task', '任务'],
  },
  {
    service: 'trello',
    name: 'Trello',
    summary: 'Boards and cards',
    keywords: ['trello', 'board', 'task'],
  },
  {
    service: 'airtable',
    name: 'Airtable',
    summary: 'Bases and records',
    keywords: ['airtable', 'database', 'table'],
  },
  {
    service: 'dropbox',
    name: 'Dropbox',
    summary: 'Files and folders',
    keywords: ['dropbox', 'files', '文件'],
  },
  {
    service: 'figma',
    name: 'Figma',
    summary: 'Files and comments',
    keywords: ['figma', 'design', '设计'],
  },
  {
    service: 'hubspot',
    name: 'HubSpot',
    summary: 'CRM search and updates',
    keywords: ['hubspot', 'crm', 'sales'],
  },
  {
    service: 'discord',
    name: 'Discord',
    summary: 'Messages and channels',
    keywords: ['discord'],
  },
  {
    service: 'twitter',
    name: 'X (Twitter)',
    summary: 'Post and read on X',
    keywords: ['twitter', 'x', 'tweet'],
  },
  {
    service: 'reddit',
    name: 'Reddit',
    summary: 'Browse and post',
    keywords: ['reddit'],
  },
];

export function catalogEntry(service: string): ConnectorCatalogEntry | undefined {
  return CONNECTOR_CATALOG.find((entry) => entry.service === service);
}

export function matchesCatalog(entry: ConnectorCatalogEntry, query: string | undefined): boolean {
  if (query === undefined || query.trim() === '') return true;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [entry.service, entry.name, entry.summary, ...entry.keywords]
    .join(' ')
    .toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

export function isConnectorService(service: unknown): service is string {
  return typeof service === 'string' && /^[a-z0-9_]{2,40}$/.test(service);
}
export type ConnectorCapability = `connector.${string}.${'read' | 'write' | 'grant'}`;

export function connectorCapabilities(accountId: string) {
  return {
    read: `connector.${accountId}.read`,
    write: `connector.${accountId}.write`,
    grant: `connector.${accountId}.grant`,
  } as const satisfies Record<string, ConnectorCapability>;
}
