#!/usr/bin/env bash
#
# One-click setup for ROMC Data Extractor + RuneAtlas web app.
#
# Usage:
#   ./setup.sh              # run everything
#   ./setup.sh python       # only set up Python
#   ./setup.sh docker       # only start MongoDB
#   ./setup.sh extract      # only extract game data
#   ./setup.sh load         # only load data into MongoDB
#   ./setup.sh web          # only start the web app
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
STEP="${1:-all}"
TAG="${TAG:-$(date +%Y%m%d)}"
ADB_PATH="${ADB_PATH:-adb}"
MONGO_URI="${MONGO_URI:-mongodb://romc:romc@localhost:27017}"
DATABASE="${DATABASE:-romc}"
MODULES="${MODULES:-items monsters skills formulas icons buffs rewards}"

cyan()   { printf "\n\033[36m==> %s\033[0m\n\n" "$1"; }
green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
red()    { printf "\033[31m%s\033[0m\n" "$1"; }

# ---------- 1. Python ----------
setup_python() {
    cyan "Setting up Python virtual environment"

    if [ ! -d "$ROOT/.venv" ]; then
        python3 -m venv "$ROOT/.venv"
    fi

    "$ROOT/.venv/bin/python" -m pip install --upgrade pip -q
    "$ROOT/.venv/bin/python" -m pip install -r "$ROOT/requirements.txt" -q

    green "Python environment ready."
}

# ---------- 2. Docker ----------
setup_docker() {
    cyan "Starting MongoDB with Docker Compose"

    if [ ! -f "$ROOT/.env" ]; then
        cp "$ROOT/.env.example" "$ROOT/.env"
        echo "Created .env from .env.example"
    fi

    docker compose -f "$ROOT/docker-compose.yml" up -d

    printf "Waiting for MongoDB..."
    for _ in $(seq 1 15); do
        if docker exec romc-mongodb mongosh --quiet --eval "db.runCommand({ping:1}).ok" 2>/dev/null | grep -q 1; then
            green " ready!"
            return
        fi
        sleep 2
        printf "."
    done
    yellow " (timeout - check docker logs)"
}

# ---------- 3. Extract ----------
run_extract() {
    cyan "Extracting game data from LDPlayer (tag: $TAG)"

    if ! command -v "$ADB_PATH" &>/dev/null; then
        red "ADB not found at $ADB_PATH"
        yellow "Set ADB_PATH env variable or make sure adb is in PATH."
        yellow "Skipping extraction step."
        return
    fi

    devices=$("$ADB_PATH" devices 2>&1)
    if ! echo "$devices" | grep -q "device$"; then
        red "No ADB device found. Make sure the emulator is running."
        yellow "Skipping extraction step."
        return
    fi

    PYTHONPATH="$ROOT/src" "$ROOT/.venv/bin/python" -m romc_data_extractor.ldplayer_pipeline \
        --adb-path "$ADB_PATH" \
        --tag "$TAG" \
        --modules $MODULES

    green "Extraction complete! Files in exports/mongo/$TAG/"
}

# ---------- 4. Load ----------
run_load() {
    cyan "Loading data into MongoDB (tag: $TAG)"

    dataset_dir="$ROOT/exports/mongo/$TAG"
    if [ ! -d "$dataset_dir" ]; then
        latest=$(ls -1d "$ROOT/exports/mongo/"*/ 2>/dev/null | sort -r | head -1)
        if [ -n "$latest" ]; then
            dataset_dir="$latest"
            yellow "Using latest dataset: $(basename "$latest")"
        else
            red "No dataset found in exports/mongo/. Run extraction first."
            yellow "Skipping load step."
            return
        fi
    fi

    PYTHONPATH="$ROOT/src" "$ROOT/.venv/bin/python" -m romc_data_extractor.mongo_loader \
        --mongo-uri "$MONGO_URI" \
        --database "$DATABASE" \
        --dataset "$dataset_dir" \
        --drop-first

    green "Data loaded into MongoDB!"
}

# ---------- 5. Web ----------
setup_web() {
    cyan "Setting up RuneAtlas web app"

    web_dir="$ROOT/web/runeatlas"

    if [ ! -f "$web_dir/.env" ]; then
        cp "$web_dir/.env.example" "$web_dir/.env"
        echo "Created web/.env from .env.example"
    fi

    cd "$web_dir"
    npm install --silent
    echo ""
    green "Starting dev server at http://localhost:3000"
    yellow "Press Ctrl+C to stop."
    echo ""
    npm run dev
}

# ---------- Run ----------
case "$STEP" in
    python)  setup_python ;;
    docker)  setup_docker ;;
    extract) setup_python; run_extract ;;
    load)    setup_python; setup_docker; run_load ;;
    web)     setup_web ;;
    all)
        setup_python
        setup_docker
        run_extract
        run_load
        setup_web
        ;;
    *)
        echo "Usage: $0 {all|python|docker|extract|load|web}"
        exit 1
        ;;
esac
