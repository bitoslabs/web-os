# Bitos web — no build required. Targets for local development and validation.

PORT ?= 8000
SRC ?= templates/installable-app

.PHONY: check check-package pack sign-catalog sign-release list-release serve

## Validate ESM syntax and import resolution for every module
check:
	node scripts/check.mjs

## Validate package-format fixtures and the package document builder
check-package:
	node scripts/test-package.mjs
	node scripts/test-appdoc.mjs
	node scripts/test-catalog.mjs
	node scripts/test-release.mjs
	node scripts/test-nostr.mjs
	node scripts/test-relay.mjs
	node scripts/test-schnorr.mjs
	node scripts/test-trust.mjs
	node scripts/test-crypt.mjs
	node scripts/test-cloudfile.mjs
	node scripts/test-registry.mjs
	node scripts/test-office.mjs
	node scripts/test-filesync.mjs

## Build a .bitos-app from SRC (default templates/installable-app)
pack:
	node scripts/pack.mjs $(SRC) $(if $(OUT),-o $(OUT),)

## Re-sign the curated catalog snapshot after editing store-catalog.js
sign-catalog:
	node scripts/sign-catalog.mjs

## Sign a packaged release in place (FILE=path.bitos-app [PUB=<hex publisher>])
sign-release:
	node scripts/sign-release.mjs $(FILE) $(PUB)

## Publish a signed release as a listing event (FILE=path.bitos-app KEY=<64-hex>)
list-release:
	node scripts/list-release.mjs $(FILE) --key $(KEY) $(if $(OUT),--out $(OUT),)

## Serve the app over HTTP (module scripts need http, not file://)
serve:
	python3 -m http.server $(PORT)
