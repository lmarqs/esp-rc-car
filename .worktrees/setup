#!/bin/sh
# Makes the worktree it runs in ready to run. It runs from the worktree's root, after `git worktree add`, by hand or
# from a runner or hook configured with it, which stops when it exits non-zero. Add the steps a fresh checkout needs:
# installing dependencies and tools, and copying or creating untracked local files.
set -eu

# The main checkout, where untracked files such as .env live:
# main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
# cp "$main/.env" .env
