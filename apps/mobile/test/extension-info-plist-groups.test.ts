import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

const require = createRequire(new URL('../package.json', import.meta.url));
const configPlugins = createRequire(require.resolve('expo/config-plugins'));
const xcode = createRequire(configPlugins.resolve('@expo/config-plugins'))('xcode');
const { separateSharedGroupFiles } = require('./with-distinct-group-files');
const { addPbxGroup: addWidgetGroup } = require('expo-widgets/plugin/build/ios/xcode/addPbxGroup');
const { addPbxGroup: addShareGroup } = require('expo-sharing/plugin/build/ios/xcode/addPbxGroup');

const emptyProject = `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 54;
	objects = {

/* Begin PBXGroup section */
		83CBB9F61A601CBA00E9B192 = {
			isa = PBXGroup;
			children = (
			);
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXProject section */
		83CBB9F71A601CBA00E9B192 /* Project object */ = {
			isa = PBXProject;
			mainGroup = 83CBB9F61A601CBA00E9B192;
			targets = (
			);
		};
/* End PBXProject section */
	};
	rootObject = 83CBB9F71A601CBA00E9B192 /* Project object */;
}
`;

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

type Child = { value: string };
type Group = { name?: string; path?: string; children?: Child[] };
type Reference = { path: string };

const parsedProject = () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pbxproj-'));
  directories.push(directory);
  const file = path.join(directory, 'project.pbxproj');
  writeFileSync(file, emptyProject);
  const project = xcode.project(file);
  project.parseSync();
  project.hash.project.objects.PBXFileReference = {};
  project.hash.project.objects.PBXBuildFile = {};
  addWidgetGroup(project, {
    targetName: 'ExpoWidgetsTarget',
    widgetFiles: ['index.swift', 'Info.plist', 'ExpoWidgetsLayoutRegistry.config.json'],
  });
  addShareGroup(
    project,
    'expo-sharing-extension',
    { swiftFiles: ['ShareIntoViewController.swift'] },
    directory,
  );
  return project;
};

const infoPlistOwners = (project: ReturnType<typeof parsedProject>) => {
  const groups: Record<string, Group> = project.hash.project.objects.PBXGroup;
  const references: Record<string, Reference> = project.pbxFileReferenceSection();
  return Object.entries(groups)
    .filter(([id, group]) => !id.endsWith('_comment') && group.name)
    .flatMap(([, group]) =>
      (group.children ?? [])
        .filter((child) => references[child.value]?.path.replaceAll('"', '') === 'Info.plist')
        .map((child) => ({ group: group.name, reference: child.value })),
    );
};

it('reproduces expo-widgets and expo-sharing listing one Info.plist reference in two groups', () => {
  const owners = infoPlistOwners(parsedProject());
  expect(owners.map((owner) => owner.group).sort()).toEqual([
    'ExpoWidgetsTarget',
    'expo-sharing-extension',
  ]);
  expect(new Set(owners.map((owner) => owner.reference)).size).toBe(1);
});

it('gives the widget and share extension groups their own Info.plist file reference', () => {
  const project = parsedProject();
  const separated = separateSharedGroupFiles(project);
  const owners = infoPlistOwners(project);
  expect(separated).toHaveLength(1);
  expect(owners).toHaveLength(2);
  expect(new Set(owners.map((owner) => owner.reference)).size).toBe(2);

  const groups: Record<string, Group> = project.hash.project.objects.PBXGroup;
  const membership = new Map<string, number>();
  for (const [id, group] of Object.entries(groups)) {
    if (id.endsWith('_comment')) continue;
    for (const child of group.children ?? []) {
      membership.set(child.value, (membership.get(child.value) ?? 0) + 1);
    }
  }
  expect([...membership.values()].every((count) => count === 1)).toBe(true);

  const reparsed = xcode.project(project.filepath);
  writeFileSync(project.filepath, project.writeSync());
  reparsed.parseSync();
  expect(new Set(infoPlistOwners(reparsed).map((owner) => owner.reference)).size).toBe(2);
  expect(separateSharedGroupFiles(reparsed)).toEqual([]);
});
