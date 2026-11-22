export function countsByRule(inventory, ruleFor = (_, rule) => rule) {
  const counts = new Map();
  for (const [file, rules] of Object.entries(inventory)) {
    for (const [specifier, count] of Object.entries(rules)) {
      const rule = ruleFor(file, specifier);
      if (!counts.has(rule)) counts.set(rule, new Map());
      const files = counts.get(rule);
      files.set(file, (files.get(file) ?? 0) + count);
    }
  }
  return counts;
}

export function compareBaselineCounts(current, previous) {
  const grown = [];
  const shrunk = [];
  const rules = [...new Set([...current.keys(), ...previous.keys()])].sort();
  for (const rule of rules) {
    const before = previous.get(rule) ?? new Map();
    const after = current.get(rule) ?? new Map();
    const allowed = [...before.values()].reduce((sum, count) => sum + count, 0);
    const actual = [...after.values()].reduce((sum, count) => sum + count, 0);
    if (actual > allowed) {
      const files = [...after.keys()].sort().flatMap((file) => {
        const prior = before.get(file) ?? 0;
        const count = after.get(file);
        return count > prior ? [`${file} (${prior} → ${count})`] : [];
      });
      grown.push({
        rule,
        message: `${rule} total grew from ${allowed} to ${actual}; counts rose in ${files.join(', ')}`,
      });
    } else if (actual < allowed) {
      shrunk.push(`${rule} total dropped from ${allowed} to ${actual}`);
    }
  }
  return { grown, shrunk };
}
