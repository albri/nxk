#!/usr/bin/env node
// Maintainer tool: build the complete filter reference from PersonaGen's
// published package artifact, the same catalogue the live capabilities
// response carries.
// node scripts/generate-catalogue.mjs /path/to/capability.json [--check]
import { readFile, writeFile } from 'node:fs/promises';

const source = process.argv.slice(2).find(arg => !arg.startsWith('--'));
if (!source) throw new Error('Supply the PersonaGen package capability.json path. See references/filters.md.');
const manifest = JSON.parse(await readFile(source, 'utf8'));
const dimensions = manifest.dimensions.filter(d => d.filterEligible && !d.deprecated);
if (!Array.isArray(manifest.groups) || manifest.groups.length === 0) {
  throw new Error('The capability manifest has no filter groups. Rebuild it from the current PersonaGen package.');
}
const knownGroups = new Set(manifest.groups.map(group => group.id));
const ungrouped = dimensions.filter(d => !d.group || !knownGroups.has(d.group));
if (ungrouped.length > 0) throw new Error(`Filterable dimensions without a known group: ${ungrouped.map(d => d.name).join(', ')}.`);
const groups = manifest.groups.map(group => [
  group.label,
  dimensions
    .filter(d => d.group === group.id)
    .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
    .map(d => d.name)
]);
const listed = groups.flatMap(([, names]) => names);
if (new Set(listed).size !== listed.length || listed.length !== dimensions.length) throw new Error('The capability manifest groups do not match its filterable dimensions.');
const lookup = d => d.lookupRequired === true;
const values = a => a.map(x => `\`${x}\``).join(', ');
const lines = [
  '# PersonaGen filters', '',
  `Package/schema contract \`${manifest.personaSchemaVersion}\`; generator \`${manifest.generatorVersion}\`.`,
  `${dimensions.filter(d => d.supportedCountries.includes('uk')).length} UK fields; ${dimensions.filter(d => d.supportedCountries.includes('us')).length} US fields. Read the group relevant to the task.`, '',
  'This catalogue comes from the complete PersonaGen capability manifest.',
  'The live `GET /{country}/capabilities` response carries the same fields in',
  '`filter_catalogue`. If the two disagree, use the response.',
  'Use the values below, then check a small draw when using a new combination.',
  'Occupation titles and codes use the live facet search described in',
  '[persona-generation.md](persona-generation.md#find-the-right-filters).', '',
  'Pass categorical values as arrays of strings, including `has_children: ["true"]`.',
  'Values within a field are OR; fields are AND. `age` takes `{min, max}`.',
  'For dog AND cat ownership use `pet_type_combo: ["dog_and_cat"]`;',
  '`pet_types: ["dog", "cat"]` means either species.', '',
  'These are generated profiles. Financial pressure, shopping style, privacy',
  'posture, employer context and similar fields are inferred context. They do',
  'not establish a real purchase history, company budget or use of a named product.',
  'Personal income and household resources are different; choose the one the',
  'decision depends on. `social_grade` is UK-only.', '',
];
for (const [title, names] of groups) {
  lines.push(`## ${title}`, '', '| Field | Accepted values |', '| --- | --- |');
  for (const name of names) {
    const d = dimensions.find(d => d.name === name);
    let text;
    if (d.range) text = `\`{min, max}\`, ${d.range.min}–${d.range.max}`;
    else if (lookup(d)) text = `Facet lookup: UK ${d.values.uk.length.toLocaleString('en-US')}, US ${d.values.us.length.toLocaleString('en-US')} values`;
    else if (JSON.stringify(d.values.uk) === JSON.stringify(d.values.us)) text = values(d.values.uk);
    else text = `UK: ${values(d.values.uk) || 'unsupported'}<br>US: ${values(d.values.us) || 'unsupported'}`;
    lines.push(`| \`${name}\` | ${text} |`);
  }
  lines.push('');
}
lines.push(
  '## Other profile fields', '',
  'Profiles also include interests, languages, origin, personality, literacy,',
  'numeracy, specific health/dietary context and appearance. These are not',
  'generation-time filters. Use relevant emitted context when evaluating a',
  'person; do not send an arbitrary profile path as a filter.', '',
  'The country field references describe the complete payload:',
  '[UK](https://personagen.dev/docs/uk/persona-structure),',
  '[US](https://personagen.dev/docs/us/persona-structure).', '',
  '## Maintaining this file', '',
  'Generated from `dist/capability.json` in the PersonaGen package, which is built',
  'from `buildPersonaFilterCapabilityManifest()`. This is maintainer tooling;',
  'using nxk does not require the PersonaGen source repo.', '',
  'Run `node scripts/generate-catalogue.mjs /path/to/capability.json`.',
  'Add `--check` to compare without writing. Groups and lookup fields come from',
  'the manifest, so a new field needs no change here. Check API behaviour before',
  'publishing an updated catalogue; a package artifact alone does not prove',
  'deployment.', ''
);
const output = lines.join('\n');
const target = new URL('../references/filters.md', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== output) throw new Error('Catalogue differs from the supplied package manifest.');
  console.log(`Catalogue matches: ${dimensions.length} fields.`);
} else {
  await writeFile(target, output);
  console.log(`Wrote ${dimensions.length} fields to references/filters.md.`);
}
