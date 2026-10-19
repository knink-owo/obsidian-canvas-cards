import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;

// Read minAppVersion from manifest.json and bump the version to the target
// version supplied by npm (npm version <x.y.z>).
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t'));

// Update versions.json with the target version and minAppVersion from
// manifest.json, but only if the target version is not already recorded.
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
if (!(targetVersion in versions)) {
	versions[targetVersion] = minAppVersion;
	writeFileSync('versions.json', JSON.stringify(versions, null, '\t'));
}
