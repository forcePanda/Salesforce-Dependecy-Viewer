#!/usr/bin/env python3
"""Validate that an installed VSIX includes all runtime dependencies and command IDs."""
from pathlib import Path
from zipfile import ZipFile
import json
import sys
import xml.etree.ElementTree as ET

root=Path(__file__).resolve().parents[1]
package=json.loads((root/'package.json').read_text())
source=Path(sys.argv[1]) if len(sys.argv)>1 else root/f"sfdv-{package['version']}.vsix"
with ZipFile(source) as archive:
    bad=archive.testzip()
    assert bad is None, f'Bad ZIP member: {bad}'
    members=set(archive.namelist())
    manifest=ET.fromstring(archive.read('extension.vsixmanifest'))
    ns={'m':'http://schemas.microsoft.com/developer/vsx-schema/2011'}
    identity=manifest.find('.//m:Identity',ns)
    assert identity is not None and identity.attrib['Version']==package['version']
    packaged=json.loads(archive.read('extension/package.json'))
    assert packaged==package, 'Packaged manifest differs from source'
    commands=packaged['contributes']['commands']
    assert len(commands)==3
    assert all(command['command'].startswith('SFDV.') and command['title'].startswith('SFDV: ') for command in commands)
    for dirname in ['src','media','rules']:
        for file in (root/dirname).rglob('*'):
            if file.is_file() and file.suffix in {'.js','.json','.css','.svg'}:
                assert 'extension/'+file.relative_to(root).as_posix() in members, f'Missing runtime file {file}'
    assert not any(m.startswith('extension/test/') or m.startswith('extension/fixtures/') or 'node_modules' in m for m in members)
print(f'Validated {source} ({len(members)} ZIP members, version {package["version"]})')
