#!/usr/bin/env bash
# Thin shim — defers to the shared enclawed-apps/install.sh dispatcher.
# The real install logic lives in enclawed-apps/install.mjs and the per-provider
# modules under enclawed-apps/providers/.  This file exists so the published
# install URL keeps working.
exec bash "$(dirname "$0")/../../install.sh" secretary "$@"
