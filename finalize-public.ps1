# Final pre-flip cleanup for the canonical IGL repo.
# Run from C:\Users\admin\Documents\igl. One commit, one push.
$ErrorActionPreference = "Stop"
if (-not (Test-Path ".git")) { throw "Run this from the repo root (C:\Users\admin\Documents\igl)." }

$vault = "..\igl-private-docs"
New-Item -ItemType Directory -Force -Path $vault | Out-Null

# 1. run-vdrpros.js: carries the same matter details as the removed example
#    (firm name, matter number) and is broken twice over (its .igl companion and
#    the v0.2 API it imports are both gone). Out of the public tree.
if (Test-Path "examples\run-vdrpros.js") {
  Move-Item -Force "examples\run-vdrpros.js" "$vault\run-vdrpros.js"
  Write-Host "moved out: examples\run-vdrpros.js"
}
# If the examples folder is now empty, remove it.
if ((Test-Path "examples") -and -not (Get-ChildItem "examples" -Force | Where-Object { $_.Name -ne "." })) {
  Remove-Item "examples" -Force -Recurse
}

# 2. ONBOARDING_ASSESSMENT.md: analyzes an internal document the public cannot
#    see and cites the superseded ADR 0001 authority rule as current. Out.
if (Test-Path "igl-v1\docs\ONBOARDING_ASSESSMENT.md") {
  Move-Item -Force "igl-v1\docs\ONBOARDING_ASSESSMENT.md" "$vault\ONBOARDING_ASSESSMENT.md"
  Write-Host "moved out: igl-v1\docs\ONBOARDING_ASSESSMENT.md"
}

# 3. Release notes into the tree so the tag has a source of truth.
if (Test-Path "RELEASE_NOTES_v1.0.0-ref.md") { Write-Host "release notes present" }

# 4. Any stray zips out of the tree.
Get-ChildItem -Filter "*.zip" -ErrorAction SilentlyContinue | ForEach-Object {
  Move-Item -Force $_.FullName (Join-Path $vault $_.Name); Write-Host "moved out: $($_.Name)"
}

git add -A
git commit -m "Pre-flip cleanup: remove matter-referencing example runner and internal assessment doc, add v1.0.0-ref release notes"
git push
Write-Host ""
Write-Host "Done. Next: run .\github-settings.ps1 (needs GitHub CLI), then counsel, then flip + tag."
