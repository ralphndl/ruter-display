#!/bin/bash
set -e

echo "🚀 Disen Display Setup für Raspberry Pi"

# Node.js und npm prüfen
if ! command -v node &> /dev/null; then
    echo "📦 Installiere Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "✅ Node.js $(node -v) gefunden"

# Dependencies installieren
echo "📦 Installiere Dependencies..."
npm install

# PM2 installieren (global)
echo "📦 Installiere PM2..."
sudo npm install -g pm2

# App mit PM2 starten
echo "🚀 Starte Disen Display..."
pm2 start server.js --name "disen-display"

# PM2 beim Boot starten
echo "⚙️ Konfiguriere Auto-Start..."
pm2 startup | grep sudo | bash || true
pm2 save

echo ""
echo "✅ Fertig! Disen Display läuft nun auf:"
echo "   http://localhost:3030"
echo ""
echo "PM2 Befehle:"
echo "   pm2 list              – Zeige Status"
echo "   pm2 logs disen-display – Zeige Logs"
echo "   pm2 stop disen-display – App stoppen"
echo "   pm2 restart disen-display – Neustart"
