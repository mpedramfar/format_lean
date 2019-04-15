#!/usr/bin/env python3
import zipfile
import glob, shutil, distutils
import urllib.request
from pathlib import Path


class interactive_server:
    def __init__(self, interactive_path, paths, toolchain, source_lib, outdir, debug = False):
        self.interactive_path = interactive_path
        self.paths = paths
        self.toolchain = toolchain
        self.outdir = outdir
        self.source_lib = source_lib
        self.debug = debug


    def make_library(self):
        output = str(Path(self.outdir) / 'library.zip')
        zf = zipfile.ZipFile(output, 'w')

        already_seen = set()
        for p in self.paths:
            for fn in Path(p).glob('**/*.olean'):
                rel = fn.relative_to(p)
                if '_target' in rel.parts:
                    continue
                elif rel in already_seen:
                    print('duplicate: {0}'.format(fn))
                else:
                    content = open(fn, 'rb').read()
                    zf.writestr(zipfile.ZipInfo(filename=str(rel)), content)
                    already_seen.add(rel)

        if self.debug:
            print('Created {0} with {1} olean files'.format(output, len(already_seen)))
        zf.close()

    def download_server(self):
        base_url='https://leanprover.github.io/live/' + self.toolchain + '/'
        Path(self.interactive_path / self.toolchain).mkdir(exist_ok=True)
        for f in ['lean_js_js.js', 'lean_js_wasm.js', 'lean_js_wasm.wasm']:
            if not Path(self.interactive_path / self.toolchain / f).is_file():
                try:
                    urllib.request.urlretrieve(base_url + f, self.interactive_path / self.toolchain / f)
                    if self.debug:
                        print('Downloaded "{0}"'.format(base_url + f))
                except:
                    print('Could not download "{0}". I will make a non-interactive webpage instead.'.format(base_url + f))
                    return False
        return True


    def copy_server(self):
        if not self.download_server():
            return False

        for f in ['lean_js_js.js', 'lean_js_wasm.js', 'lean_js_wasm.wasm']:
            shutil.copy(self.interactive_path / self.toolchain / f, self.outdir)

        try :
            distutils.dir_util.copy_tree(self.interactive_path / 'vs', str(Path(self.outdir) / 'vs'))

            for js_file in glob.glob( str(self.interactive_path / '*.js') ):
                shutil.copy(js_file, self.outdir)
        except :
            print('There was a problem copying the compiled interactive component. Have you compiled it using the instructions in "INSTALL.md" ?')
            print('I will make a non-interactive webpage instead.')
            return False

        self.make_library()
        
        return True

    def get_jss(self):
        if self.copy_server():
            return ['vs/loader.js', 'vs/editor/editor.main.nls.js', 'vs/editor/editor.main.js', 'interactive.js']
        else:
            return []
