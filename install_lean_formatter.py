import subprocess

try :
	subprocess.check_output('pip install .', shell=True)
except :
	subprocess.check_output('pip3 install .', shell=True)

import format_lean
from pathlib import Path

p = (Path(format_lean.__file__).parent / 'interactive_interface').resolve()

subprocess.check_output('''
	cd {0} &&
	npm install &&
	./node_modules/.bin/webpack &&
	cp -r dist ../interactive &&
	cd .. &&
	rm -r interactive_interface
	'''.format(str(p)), shell=True)
