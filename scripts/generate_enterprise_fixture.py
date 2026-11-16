#!/usr/bin/env python3
"""Reproduce or verify the complete golden Salesforce source fixture.

The earlier generator only recreated the v0.2.x base. This one uses a deterministic
archive of the current, independently curated fixture, so it never discards the
v0.3-v0.5 regression additions.

  python3 scripts/generate_enterprise_fixture.py --verify
  python3 scripts/generate_enterprise_fixture.py --output /tmp/sfdv-fixture-copy
  python3 scripts/generate_enterprise_fixture.py --pack   # maintainers, after reviewing changes
"""
from pathlib import Path, PurePosixPath
import argparse
import gzip
import hashlib
import io
import tarfile

ROOT=Path(__file__).resolve().parents[1]
FIXTURE=ROOT/'fixtures/enterprise'
ARCHIVE=ROOT/'fixtures/enterprise-fixture.tar.gz'

def source_files(base):
    return {file.relative_to(base).as_posix():file.read_bytes() for file in base.rglob('*') if file.is_file() and not file.is_symlink()}

def unpack():
    result={}
    with tarfile.open(ARCHIVE,'r:gz') as tar:
        for member in tar:
            rel=PurePosixPath(member.name)
            if not member.isfile() or rel.is_absolute() or '..' in rel.parts or not rel.parts:
                raise ValueError(f'Unsafe fixture entry: {member.name}')
            if member.name in result:raise ValueError(f'Duplicate fixture entry: {member.name}')
            result[member.name]=tar.extractfile(member).read()
    return result

def pack():
    original=source_files(FIXTURE)
    if not original:raise RuntimeError('No source fixture to pack')
    payload=io.BytesIO()
    with tarfile.open(fileobj=payload,mode='w',format=tarfile.USTAR_FORMAT) as tar:
        for name,contents in sorted(original.items()):
            info=tarfile.TarInfo(name)
            info.size=len(contents);info.mtime=0;info.mode=0o644;info.uid=info.gid=0;info.uname=info.gname=''
            tar.addfile(info,io.BytesIO(contents))
    with ARCHIVE.open('wb') as dest:
        with gzip.GzipFile(fileobj=dest,mode='wb',filename='',mtime=0) as z:
            z.write(payload.getvalue())
    print(f'Packed {len(original)} files to {ARCHIVE.name}')

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    group=ap.add_mutually_exclusive_group(required=True)
    group.add_argument('--verify',action='store_true')
    group.add_argument('--pack',action='store_true')
    group.add_argument('--output',type=Path)
    args=ap.parse_args()
    if args.pack:
        pack();return
    archived=unpack()
    if args.verify:
        actual=source_files(FIXTURE)
        missing=sorted(archived.keys()-actual.keys())
        extra=sorted(actual.keys()-archived.keys())
        changed=sorted(k for k in archived.keys()&actual.keys() if archived[k]!=actual[k])
        if missing or extra or changed:raise SystemExit(f'Fixture mismatch: missing={missing}, extra={extra}, changed={changed}')
        print(f'Fixture verified: {len(archived)} exact files');return
    target=args.output.resolve()
    if target.exists() and any(target.iterdir()):
        raise SystemExit(f'Refusing to overwrite nonempty folder {target}')
    for name,contents in archived.items():
        output=target.joinpath(*PurePosixPath(name).parts)
        output.parent.mkdir(parents=True,exist_ok=True)
        output.write_bytes(contents)
    print(f'Reproduced {len(archived)} fixture files in {target}')

if __name__=='__main__':main()
