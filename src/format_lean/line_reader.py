from typing import List, Dict, Optional, Tuple, TextIO
from pathlib import Path
from io import StringIO

import regex

from format_lean.server import Server

blank_line_regex = regex.compile(r'^\s*$')

def dismiss_line(file_reader, line):
    pass


class FileReader:
    def __init__(self, lean_exec_path, lean_path, readers: List = None):
        self.readers = [reader() for reader in readers]
        self.status = ''
        self.output = []
        self.filename = ''
        self.cur_line_nb = 1
        self.normal_line_handler = dismiss_line
        self.blank_line_handler = dismiss_line
        self.server = Server(lean_exec_path, lean_path)

    def reset(self):
        self.status = ''
        self.normal_line_handler = dismiss_line
        self.blank_line_handler = dismiss_line
        
    def hard_reset(self):
        self.reset()
        self.cur_line_nb = 1
        self.output = []

    def read_file(self, path):
        self.server.sync(path)
        self.filename = path
        with open(str(path), 'r') as f:
            self.raw_text = f.read()
            f.seek(0)
            for line in f:
                if len(self.output) > 0 and self.status != '':
                    self.output[-1].last_line_nb = self.cur_line_nb
                for reader in self.readers:
                    if reader.read(self, line):
                        if len(self.output) > 0 and ('first_line_nb' not in dir(self.output[-1])):
                            self.output[-1].first_line_nb = self.cur_line_nb
                            self.output[-1].last_line_nb = self.cur_line_nb
                        break
                else:
                    if blank_line_regex.match(line):
                        self.blank_line_handler(self, line)
                    else:
                        self.normal_line_handler(self, line)
                
                self.cur_line_nb += 1

class LineReader:
    regex = regex.compile(r'.*')

    def read(self, file_reader, line):
        m = self.regex.match(line)
        if m:
            return self.run(m, file_reader)
        else:
            return False
