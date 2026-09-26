#!/bin/bash

# Clean workspace script for Ruter Display
# Removes untracked files and .DS_Store files

echo "🧹 Cleaning workspace..."

# Remove .DS_Store files recursively
find . -name ".DS_Store" -type f -delete
echo "✓ Removed .DS_Store files"

# Remove .ds-store files (lowercase)
find . -name ".ds-store" -type f -delete
echo "✓ Removed .ds-store files"

# Remove node_modules subdirectory .DS_Store files
find node_modules -name ".DS_Store" -type f -delete 2>/dev/null
echo "✓ Cleaned node_modules"

# Show git status
echo ""
echo "📊 Git status:"
git status

echo ""
echo "✅ Workspace cleaned and ready to commit!"
