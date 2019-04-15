# Lean formatter

This prototype is a python library which renders convert Lean files to
other files, for instance another Lean file of a html file.

## Installation

You need Python 3.7 or later, and Lean. Make sure the python package
manager `pip` is installed.  Clone this repository, go to its root directory
and run `pip install .` (using `sudo -H` if needed). It's also recommended to
install `ipython` for interactive use. Alternatively, if you don't want to mess
up with your global python environment, you can use a dedicated virtual
environment. This is explained in the more complete 
[installation guide](https://github.com/mpedramfar/format_lean/blob/master/INSTALL.md).

## Usage

If you only want to play with my example formatter you can simply run
`format_lean` (which should be in your path if `pip install .` did its
job). The basic usage is:
```bash
format_lean --inpath limits.lean --outdir build --lib-path /usr/lib/lean-mathlib/src
```
if you are in a folder containing `limits.lean`, have mathlib in `/usr/lib/lean-mathlib`, and 
want to render into directory `build`. See `format_lean -- --help` for
more option.

Of course you need to point to your local copy of `mathlib` (unless you
don't need mathlib?!). You can use `--toolchain` if your default `elan`
toolchain isn't appropriate (you do use [elan](https://github.com/Kha/elan), right?). Optional
arguments also include `outpath` if replacing `.lean` by `.html` is not
good enough, and `templates` if you want to point to an alternate
template directory. 

The script source in the `bin` folder of this repository is a good entry
point to understand how to customize more.

If you get addicted to it, and want to render a full Lean project, you
can go to the root of the project (the folder containing `leanpkg.toml`)
and run `format_project`. Optional arguments `--outdir my_dir` and
`--template` as above. There is no need to point out a toolchain or
dependencies since those are indicated in your `leanpkg.toml`.
If you want to exclude files `src/hide_me.lean` and `src/secret.lean`
from the rendering process, you can create a file `format.toml` next to
your `leanpkg.toml` containing `exclude = ['hide_me.lean', 'secret.lean']`.
On the other extreme, if you want to render only `public.lean`, you can
use `only = ['public.lean']`.
In this file you can also put `template = "path"` where path is the
relative path to a folder containing jinja templates to be used instead
of the default ones.

When using `format_project`, you can put a file `format_lang.toml` containing some translations, say:
```
Example = "Exemple"
Lemma = "Lemme"
Theorem = "Théorème"
Proof = "Démonstration"
```

### Interactive webpage
When using `format_project`, you can add the option `--interactive` or add a line `interactive = 1` to the file `format.toml` to get an interactive webpage with a javascript Lean server.

- If you are importing a Lean file, make sure to build the corresponding `.olean` file before running `format_project`. Otherwise, the page will load but the javascript Lean server will raise an import error.
- To make an interactive webpage, the javascript Lean server is downloaded from `https://leanprover.github.io/live/{toolchain}/`.
(Replace `{toolchain}` with the version of Lean that you're working with). For example, if you are using Lean 3.4.2, the Lean formatter will try to download the javascript Lean server from [`https://leanprover.github.io/live/3.4.2/`](https://leanprover.github.io/live/3.4.2/). If this link doesn't work or download fails for any reason, Lean formatter will give up and generate a non-interactive webpage instead.