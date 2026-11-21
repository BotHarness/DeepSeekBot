export const en = {
  skillSuggestions: 'Skills',
  skillOwnerHost: 'Host',
  skillOption: (name: string, owner: string) => `/${name}, ${owner}`,
  skillChip: (name: string, owner: string) => `Skill /${name} from ${owner}`,
};

export const zh: typeof en = {
  skillSuggestions: 'Skill',
  skillOwnerHost: 'Host',
  skillOption: (name: string, owner: string) => `/${name}，${owner}`,
  skillChip: (name: string, owner: string) => `来自${owner}的 Skill /${name}`,
};
