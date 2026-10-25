#!/usr/bin/env bash
# Which formal models cover the files this branch changed, from formal/paths.yml.
#
#   .agents/skills/formal-models/scripts/affected.sh [base]    # default base: origin/master
#
# Prints one line per covered file ("Model  path"). Then, for each model whose
# code changed while nothing under formal/ did, prints a "drift:" line; CI turns
# those into warnings. Exit status is always 0: deciding whether the model needs
# an update is a judgment call, written in the PR's "Formal models" section.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../../.." && pwd)"
base="${1:-origin/master}"
cd "$root"
git diff --name-only "$(git merge-base "$base" HEAD)" HEAD | python3 -I -c '
import fnmatch, sys

models, current = {}, None
for line in open("formal/paths.yml"):
    line = line.split("#", 1)[0].rstrip()
    if not line:
        continue
    if not line.startswith(" "):
        current = line.rstrip(":")
        models[current] = []
    else:
        models[current].append(line.strip().lstrip("- ").strip())

changed = [p for p in sys.stdin.read().split() if p]
formal_changed = any(p.startswith("formal/") for p in changed)
touched = set()
for model, globs in models.items():
    if model == "models":
        continue
    for path in changed:
        if any(fnmatch.fnmatch(path, g) for g in globs):
            print(f"{model:15} {path}")
            touched.add(model)
if not formal_changed:
    for model in sorted(touched):
        print(f"drift: {model} covers code this branch changed, but nothing under formal/ changed")
'
