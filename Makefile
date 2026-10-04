# Bitos web — no build required. Targets for local development and validation.

PORT ?= 8000
SRC ?= templates/installable-app

.PHONY: check check-package pack serve

## Validate ESM syntax and import resolution for every module
check:
	node scripts/check.mjs

## Validate package-format fixtures and the package document builder
check-package:
	node scripts/test-package.mjs
	node scripts/test-appdoc.mjs

## Build a .bitos-app from SRC (default templates/installable-app)
pack:
	node scripts/pack.mjs $(SRC) $(if $(OUT),-o $(OUT),)

## Serve the app over HTTP (module scripts need http, not file://)
serve:
	python3 -m http.server $(PORT)
