# Bitos web — no build required. Targets for local development and validation.

PORT ?= 8000

.PHONY: check serve

## Validate ESM syntax and import resolution for every module
check:
	node scripts/check.mjs

## Serve the app over HTTP (module scripts need http, not file://)
serve:
	python3 -m http.server $(PORT)
