# GitHub repository settings for SMEPro-Technologies-LLC/igl, scripted.
# One-time setup first:
#   winget install GitHub.cli
#   gh auth login          (browser flow, pick GitHub.com + HTTPS)
# Then run:  .\github-settings.ps1
$ErrorActionPreference = "Continue"
$REPO = "SMEPro-Technologies-LLC/igl"

Write-Host "== Secret scanning + push protection =="
'{ "security_and_analysis": { "secret_scanning": { "status": "enabled" }, "secret_scanning_push_protection": { "status": "enabled" } } }' |
  gh api -X PATCH "repos/$REPO" --input -

Write-Host "== Private vulnerability reporting =="
gh api -X PUT "repos/$REPO/private-vulnerability-reporting"

Write-Host "== Discussions on =="
gh api -X PATCH "repos/$REPO" -F has_discussions=true

Write-Host "== Topics =="
'{ "names": ["governance", "ai", "programming-language", "receipts", "compliance", "identity", "cloudflare-workers", "verifiable-ai"] }' |
  gh api -X PUT "repos/$REPO/topics" --input -

Write-Host "== Branch protection on main: require the CI job, no force pushes =="
# The required check name must match the CI job. The workflow is
# "IGL v1.0 reference CI" and its job id is "test"; confirm the exact check
# name shown on a recent commit's checks if this 422s, and edit "contexts".
'{ "required_status_checks": { "strict": true, "contexts": ["test"] }, "enforce_admins": false, "required_pull_request_reviews": null, "restrictions": null, "allow_force_pushes": false, "allow_deletions": false }' |
  gh api -X PUT "repos/$REPO/branches/main/protection" --input -

Write-Host "== Repo description and homepage =="
gh api -X PATCH "repos/$REPO" -f description="IGL: Identity Governed Logic. A coding language where governance is numeric computation fused with the model's own, with signed verifiable receipts." -f homepage="https://igl.dev"

Write-Host ""
Write-Host "Not scriptable, do once in the browser (Settings > General > Social preview):"
Write-Host "  upload social-preview.png (it is in the repo folder)."
Write-Host ""
Write-Host "AFTER counsel signs off, flip and tag:"
Write-Host "  gh repo edit $REPO --visibility public --accept-visibility-change-consequences"
Write-Host "  cd C:\Users\admin\Documents\igl"
Write-Host "  git tag v1.0.0-ref"
Write-Host "  git push origin v1.0.0-ref"
Write-Host "  gh release create v1.0.0-ref --title 'IGL v1.0.0-ref' --notes-file RELEASE_NOTES_v1.0.0-ref.md"
