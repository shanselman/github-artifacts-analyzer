#!/bin/bash

# GitHub Artifact Cleanup Script for HanselminutesAdmin
# This script will help you clean up artifacts to save storage space

echo "🧹 GitHub Artifact Cleanup for HanselminutesAdmin"
echo "================================================="
echo

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Please install it from: https://cli.github.com/"
    echo "Or run: sudo apt install gh"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ You need to authenticate with GitHub CLI first:"
    echo "Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI is ready"
echo

# Expired artifacts to delete (saves 853.66 MB)
echo "🗑️  EXPIRED ARTIFACTS (5 artifacts = 853.66 MB)"
echo "These are safe to delete and will free up space immediately:"
echo

EXPIRED_ARTIFACTS=(
    "3359599331:179.04 MB:June 19"
    "3359544758:179.03 MB:June 19" 
    "3359376995:179.03 MB:June 19"
    "3359363156:179.03 MB:June 19"
    "3359239140:179.00 MB:June 18"
)

for artifact in "${EXPIRED_ARTIFACTS[@]}"; do
    IFS=':' read -r id size date <<< "$artifact"
    echo "  🔸 Artifact ID: $id ($size, created $date, 2025)"
done

echo
read -p "❓ Delete ALL expired artifacts? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️ Deleting expired artifacts..."
    for artifact in "${EXPIRED_ARTIFACTS[@]}"; do
        IFS=':' read -r id size date <<< "$artifact"
        echo "  Deleting $id ($size)..."
        gh api -X DELETE "/repos/shanselman/HanselminutesAdmin/actions/artifacts/$id" || echo "  ⚠️ Failed to delete $id"
    done
    echo "✅ Expired artifacts cleanup complete!"
    echo
else
    echo "⏭️ Skipped expired artifacts cleanup"
    echo
fi

# Old active artifacts (saves additional ~1.5 GB)
echo "📅 OLD ACTIVE ARTIFACTS (Keep only recent ones)"
echo "You have 14 active artifacts. Consider keeping only the latest 2-3:"
echo

OLD_ACTIVE_ARTIFACTS=(
    "3508097584:182.39 MB:July 10"
    "3504821936:182.39 MB:July 09"
    "3492095015:182.39 MB:July 04"
    "3492094946:182.39 MB:July 04"
    "3490854635:182.39 MB:July 03"
    "3490854524:182.39 MB:July 03"
    "3490854490:182.39 MB:July 03"
    "3490854473:182.39 MB:July 03"
    "3490854456:182.39 MB:July 03"
    "3490764659:182.39 MB:July 03"
)

echo "Consider deleting these older artifacts (keep latest 3-4):"
for artifact in "${OLD_ACTIVE_ARTIFACTS[@]}"; do
    IFS=':' read -r id size date <<< "$artifact"
    echo "  🟡 Artifact ID: $id ($size, created $date, 2025)"
done

echo
echo "RECENT ARTIFACTS TO KEEP:"
echo "  🟢 4119746698 (182.39 MB, September 26, 2025) ← KEEP"
echo "  🟢 3706959150 (182.39 MB, August 07, 2025) ← KEEP"
echo "  🟢 3567481871 (182.41 MB, July 18, 2025) ← KEEP"
echo

read -p "❓ Delete old active artifacts (July 3-10)? This saves ~1.5GB (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️ Deleting old active artifacts..."
    for artifact in "${OLD_ACTIVE_ARTIFACTS[@]}"; do
        IFS=':' read -r id size date <<< "$artifact"
        echo "  Deleting $id ($size)..."
        gh api -X DELETE "/repos/shanselman/HanselminutesAdmin/actions/artifacts/$id" || echo "  ⚠️ Failed to delete $id"
    done
    echo "✅ Old active artifacts cleanup complete!"
    echo
else
    echo "⏭️ Skipped old active artifacts cleanup"
    echo
fi

echo "🎉 Cleanup script complete!"
echo
echo "💡 RECOMMENDATIONS FOR THE FUTURE:"
echo "1. Set shorter artifact retention periods in your workflow"
echo "2. Only keep 2-3 recent builds"
echo "3. Consider using smaller build outputs (current: ~174MB per build)"
echo
echo "Add this to your workflow to set retention to 7 days:"
echo "  uses: actions/upload-artifact@v4"
echo "  with:"
echo "    retention-days: 7"
echo

# Show current status
echo "📊 Run this to see current artifact usage:"
echo "npm run start -- repo shanselman HanselminutesAdmin"