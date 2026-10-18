# Betrieb auf dem Heimserver. Aufruf aus diesem Ordner: `make <ziel>`.
# Compose-Projektname `dog-territory` steht in docker-compose.yml (nie -p litellm-stack benutzen).
COMPOSE ?= docker compose
# Annahmen ueber server/ (anpassen, falls die Server-Seite anders heisst):
MIGRATE_CMD ?= node dist/ops/migrate.js
CLI_CMD     ?= node dist/ops/cli.js
BUILD_CONTEXT ?= ..

.PHONY: build up down logs device-logs migrate cli backup status
build:   ## Image dog-territory-api:local aus ../server/Dockerfile (nicht zwischen 02:00 und 06:00)
	docker build -f $(BUILD_CONTEXT)/server/Dockerfile -t dog-territory-api:local $(BUILD_CONTEXT)
up:      ## alle Dienste starten
	$(COMPOSE) up -d
down:    ## stoppen (Volumes bleiben; niemals `down -v` ohne Backup)
	$(COMPOSE) down
logs:    ## Logs folgen
	$(COMPOSE) logs -f --tail=100
device-logs: ## Geraete-Logs aus der DB (nicht `logs` = Container-Logs): make device-logs ARGS="--household Zuhause --since 2h --event WALK_%"
	$(COMPOSE) exec api $(CLI_CMD) logs $(ARGS)
migrate: ## DB-Migrationen (einmaliger Container; funktioniert auch, wenn api noch nicht laeuft)
	$(COMPOSE) run --rm api $(MIGRATE_CMD)
cli:     ## Operator-CLI: make cli ARGS="create-household --name Zuhause"
	$(COMPOSE) exec api $(CLI_CMD) $(ARGS)
backup:  ## pg_dump nach ~/dog-territory/backups
	./backup.sh
status:
	ss -tln | grep 700 || true
	$(COMPOSE) ps
	$(COMPOSE) exec tailscale tailscale --socket=/tmp/tailscaled.sock status
