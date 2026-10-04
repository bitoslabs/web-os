# Bitos web — no build required. Targets for local development and validation.

PORT ?= 8000
SRC ?= templates/installable-app

.PHONY: check check-package pack sign-catalog sign-release serve

## Validate ESM syntax and import resolution for every module
check:
	node scripts/check.mjs

## Validate package-format fixtures and the package document builder
check-package:
	node scripts/test-package.mjs
	node scripts/test-appdoc.mjs
	node scripts/test-catalog.mjs
	node scripts/test-release.mjs

## Build a .bitos-app from SRC (default templates/installable-app)
pack:
	node scripts/pack.mjs $(SRC) $(if $(OUT),-o $(OUT),)

## Re-sign the curated catalog snapshot after editing store-catalog.js
sign-catalog:
	node scripts/sign-catalog.mjs

## Sign a packaged release in place (FILE=path.bitos-app)
sign-release:
	node scripts/sign-release.mjs $(FILE)

## Serve the app over HTTP (module scripts need http, not file://)
serve:
	python3 -m http.server $(PORT)
