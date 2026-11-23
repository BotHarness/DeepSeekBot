const { IOSConfig, withFinalizedMod } = require('expo/config-plugins');
const { writeFile } = require('node:fs/promises');

const separateSharedGroupFiles = (project) => {
  const groups = project.hash.project.objects.PBXGroup ?? {};
  const references = project.pbxFileReferenceSection();
  const owned = new Set();
  const separated = [];
  for (const [groupId, group] of Object.entries(groups)) {
    if (groupId.endsWith('_comment') || !Array.isArray(group.children)) continue;
    group.children = group.children.map((child) => {
      if (!references[child.value]) return child;
      if (!owned.has(child.value)) {
        owned.add(child.value);
        return child;
      }
      const id = project.generateUuid();
      references[id] = { ...references[child.value] };
      references[`${id}_comment`] = references[`${child.value}_comment`];
      separated.push({ group: groupId, from: child.value, to: id });
      return { value: id, comment: child.comment };
    });
  }
  return separated;
};

const withDistinctGroupFiles = (config) =>
  withFinalizedMod(config, [
    'ios',
    async (mod) => {
      const project = IOSConfig.XcodeUtils.getPbxproj(mod.modRequest.projectRoot);
      if (separateSharedGroupFiles(project).length > 0) {
        await writeFile(project.filepath, project.writeSync());
      }
      return mod;
    },
  ]);

module.exports = withDistinctGroupFiles;
module.exports.separateSharedGroupFiles = separateSharedGroupFiles;
