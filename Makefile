# Optional one-off overrides; normal settings live in config.json.
export PORT ET_CLIENT_NAME
.DEFAULT_GOAL := help

.PHONY: help install uninstall start stop dev check service unservice update logs

help: ## Show available commands
	@awk 'BEGIN { FS = ":.*## " } /^##@/ { printf "\n%s\n", substr($$0, 5) } /^[a-z-]+:.*## / { printf "  make %-12s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

##@ Installation
install: ## Install dependencies and create config.json if missing
	npm install --omit=optional
	@[ -f config.json ] || cp config.example.json config.json

uninstall: ## Stop the local server and remove dependencies; keep config.json
	@if [ -f /etc/systemd/system/ruter-display.service ]; then \
		echo "Run 'make unservice' before uninstalling dependencies."; exit 1; \
	fi
	$(MAKE) stop
	rm -rf node_modules

##@ Local server
start: ## Start in the background using config.json
	@sh scripts/local-server.sh start

stop: ## Stop the server started by make start
	@sh scripts/local-server.sh stop

dev: ## Run in the foreground with auto-reload; stop with Ctrl+C
	node --watch server.js

check: ## Test the running server for every configured stop
	node scripts/check.js

##@ systemd service (Raspberry Pi / Linux)
service: install ## Install + start the systemd service (Raspberry Pi)
	$(MAKE) stop
	sed -e "s#^User=.*#User=$$(whoami)#" \
	    -e "s#^WorkingDirectory=.*#WorkingDirectory=$(CURDIR)#" \
	    -e "s#^ExecStart=.*#ExecStart=$$(command -v node) server.js#" \
	    ruter-display.service | sudo tee /etc/systemd/system/ruter-display.service
	sudo systemctl daemon-reload
	sudo systemctl enable --now ruter-display

unservice: ## Stop, disable and remove the systemd service
	sudo systemctl disable --now ruter-display
	sudo rm -f /etc/systemd/system/ruter-display.service
	sudo systemctl daemon-reload

logs: ## Follow the systemd service logs
	journalctl -u ruter-display -f

##@ Maintenance
update: ## Pull latest version and restart the service
	git pull --ff-only
	$(MAKE) service
	sudo systemctl restart ruter-display
