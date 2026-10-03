# Optional one-off overrides; normal settings live in config.json.
export PORT
.DEFAULT_GOAL := help

.PHONY: help install uninstall start stop restart status dev check service unservice update logs

help: ## Show available commands
	@awk 'BEGIN { FS = ":.*## " } /^##@/ { printf "\n%s\n", substr($$0, 5) } /^[a-z-]+:.*## / { printf "  make %-12s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

##@ Installation
install: ## Install dependencies and create config.json if missing
	npm install --omit=optional
	@[ -f config.json ] || cp config.example.json config.json

uninstall: ## Stop the local server and remove dependencies; keep config.json
	@sh scripts/systemd-service.sh check-uninstalled
	$(MAKE) stop
	rm -rf node_modules

##@ Local server
start: ## Start in the background using config.json
	@node scripts/local-server.js start

stop: ## Stop local project servers and their child processes
	@node scripts/local-server.js stop

restart: ## Stop old project processes and start the current server
	@node scripts/local-server.js restart

status: ## Show whether the current local server is ready
	@node scripts/local-server.js status

dev: ## Run in the foreground with auto-reload; stop with Ctrl+C
	node --watch server.js

check: ## Test the running server for every configured stop
	node scripts/check.js

##@ systemd service (Raspberry Pi / Linux)
service: install ## Install + start the systemd service (Raspberry Pi)
	@if ! systemctl is-active --quiet departino.service 2>/dev/null; then $(MAKE) stop; fi
	@sh scripts/systemd-service.sh install

unservice: ## Stop, disable and remove the systemd service
	@sh scripts/systemd-service.sh uninstall

logs: ## Follow the systemd service logs
	journalctl -u departino -f

##@ Maintenance
update: ## Pull latest version and restart the service
	git pull --ff-only
	$(MAKE) service
