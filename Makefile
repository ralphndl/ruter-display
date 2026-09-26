PORT ?= 3030

.PHONY: install start dev check service update logs

install: ## Install dependencies and create config.json
	npm install --omit=optional
	@[ -f config.json ] || cp config.example.json config.json

start: install ## Start the server
	PORT=$(PORT) node server.js

dev: install ## Start with auto-restart on file changes
	PORT=$(PORT) node --watch server.js

check: ## Test the running server for every configured stop
	node scripts/check.js http://localhost:$(PORT)

service: install ## Install + start the systemd service (Raspberry Pi)
	sed -e "s#^User=.*#User=$$(whoami)#" \
	    -e "s#^WorkingDirectory=.*#WorkingDirectory=$(CURDIR)#" \
	    -e "s#^ExecStart=.*#ExecStart=$$(command -v node) server.js#" \
	    ruter-display.service | sudo tee /etc/systemd/system/ruter-display.service
	sudo systemctl daemon-reload
	sudo systemctl enable --now ruter-display

update: ## Pull latest version and restart the service
	git pull --ff-only
	$(MAKE) install
	sudo systemctl restart ruter-display

logs: ## Follow the service logs
	journalctl -u ruter-display -f
