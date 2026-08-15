# Go-public preparation for the canonical IGL repo.
# Run from C:\Users\admin\Documents\igl AFTER extracting the go-public delta.
# Two explicit steps. Review between them. Nothing here touches GitHub settings;
# those toggles are listed in docs/RELEASE_CHECKLIST.md.

param([Parameter(Mandatory=$true)][ValidateSet("CLEAN","SQUASH")] [string]$Step)
$ErrorActionPreference = "Stop"
if (-not (Test-Path ".git")) { throw "Run this from the repo root (C:\Users\admin\Documents\igl)." }

if ($Step -eq "CLEAN") {
  # Remove documents that must not be public. They remain on your machine in
  # ..\igl-private-docs, they just leave the repository tree.
  $vault = "..\igl-private-docs"
  New-Item -ItemType Directory -Force -Path $vault | Out-Null
  $remove = @(
    "docs\spec\IGL_Coding_SMEPro_Confidential.pdf",   # marked confidential
    "docs\spec\vdrpros-product-onepager.pdf",         # other-product marketing
    "docs\spec\igl-zuckerberg-synergy (2).docx",      # op-ed draft, not spec
    "docs\spec\IGLMASTER_ONBOARD.docx",               # internal onboarding
    "docs\spec\IGL Runtime Architecture (1).docx",    # duplicate
    "docs\spec\IGL Runtime Architecture (1) (1).docx",# duplicate
    "examples\vdrpros-ussh.igl"                       # litigation-shaped example
  )
  foreach ($f in $remove) {
    if (Test-Path $f) { Move-Item -Force $f (Join-Path $vault (Split-Path $f -Leaf)); Write-Host "moved out: $f" }
  }
  # Also remove any leftover delta zips from the tree
  Get-ChildItem -Filter "*.zip" | ForEach-Object { Move-Item -Force $_.FullName (Join-Path $vault $_.Name); Write-Host "moved out: $($_.Name)" }
  git add -A
  git commit -m "Public release preparation: Apache-2.0 with NOTICE and trademark policy, community files, authority law ADR 0002, remove non-public documents"
  Write-Host ""
  Write-Host "CLEAN done. Review 'git show --stat HEAD', run 'cd igl-v1; npm test', then run: .\go-public.ps1 -Step SQUASH"
  exit 0
}

if ($Step -eq "SQUASH") {
  # The first commit contains the proprietary LICENSE and a confidential PDF.
  # Public visibility exposes every commit, so collapse history to one clean
  # commit of the current tree. Local branch is backed up first.
  git branch backup-pre-squash | Out-Null
  git checkout --orphan public-main
  git add -A
  git commit -m "IGL v1.0 reference: canonical public release (Apache-2.0). History begins here; see docs/adr for the decision record."
  git branch -D main
  git branch -m main
  git push -u origin main --force
  Write-Host ""
  Write-Host "SQUASH done and pushed. Verify CI is green on GitHub, complete the settings"
  Write-Host "toggles in docs/RELEASE_CHECKLIST.md, have counsel confirm, then flip"
  Write-Host "visibility and tag: git tag v1.0.0-ref ; git push origin v1.0.0-ref"
  Write-Host "Local pre-squash history remains in branch 'backup-pre-squash' (never push it)."
}
