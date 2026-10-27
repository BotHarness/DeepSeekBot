export interface CreationTagDraft {
  tags: string;
  tagInput?: string;
}

export type CreationTagEdit =
  | { kind: 'replace'; value: string }
  | { kind: 'input'; value: string }
  | { kind: 'add'; value: string }
  | { kind: 'remove'; value: string };

export function creationTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,，\r\n]/u)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

export function editCreationTags(
  draft: CreationTagDraft,
  action: CreationTagEdit,
): CreationTagDraft {
  switch (action.kind) {
    case 'replace':
      return { ...draft, tags: action.value };
    case 'input':
      return { tags: draft.tags, tagInput: action.value };
    case 'add':
      return { tags: creationTags(`${draft.tags},${action.value}`).join(', '), tagInput: '' };
    case 'remove':
      return {
        tags: creationTags(draft.tags)
          .filter((tag) => tag !== action.value)
          .join(', '),
        tagInput: draft.tagInput ?? '',
      };
  }
}
