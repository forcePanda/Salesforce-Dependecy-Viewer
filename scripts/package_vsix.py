#!/usr/bin/env python3
"""Package the self-contained VS Code extension with an automatically discovered runtime file set.

The build intentionally includes only approved runtime directories; tests, fixtures,
cache files, personal data and temporary artifacts are never bundled.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json
import sys
import xml.sax.saxutils as xml

root = Path(__file__).resolve().parents[1]
package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / f"{package['name']}-{package['version']}.vsix"

allowed = {'.js', '.json', '.css', '.svg'}
files = [Path(name) for name in ('package.json', 'README.md', 'LICENSE')]
for dirname in ('src', 'media', 'rules'):
    for file in sorted((root / dirname).rglob('*')):
        if not file.is_file() or file.is_symlink():
            continue
        if file.suffix not in allowed:
            raise ValueError(f'Unexpected runtime artifact {file.relative_to(root)}')
        files.append(file.relative_to(root))
for file in files:
    if not (root / file).is_file():
        raise FileNotFoundError(file)

content_types = '''<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="json" ContentType="application/json"/>
<Default Extension="js" ContentType="application/javascript"/>
<Default Extension="css" ContentType="text/css"/>
<Default Extension="svg" ContentType="image/svg+xml"/>
<Default Extension="md" ContentType="text/markdown"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="txt" ContentType="text/plain"/>
<Default Extension="vsixmanifest" ContentType="text/xml"/>
<Override PartName="/extension/LICENSE" ContentType="text/plain"/>
</Types>'''
manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata>
<Identity Id="{xml.escape(package['name'])}" Version="{xml.escape(package['version'])}" Language="en-US" Publisher="{xml.escape(package['publisher'])}"/>
<DisplayName>{xml.escape(package['displayName'])}</DisplayName>
<Description xml:space="preserve">{xml.escape(package['description'])}</Description>
<Tags>salesforce,metadata,dependencies,dependency graph</Tags>
<Categories>Other</Categories>
</Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
<Dependencies/>
<Assets>
<Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
<Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
</Assets>
</PackageManifest>'''
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=9) as z:
    z.writestr('[Content_Types].xml', content_types)
    z.writestr('extension.vsixmanifest', manifest)
    for file in files:
        z.write(root / file, 'extension/' + file.as_posix())
print(f'Created {output} ({output.stat().st_size:,} bytes, {len(files)} extension files)')
