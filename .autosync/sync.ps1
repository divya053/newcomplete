# Auto-sync C:\Users\IKIO\Downloads\New -> github.com/divya053/newcomplete
#
# Runs on a schedule. Commits and pushes any changes, but ABORTS the push if a
# credential-shaped string appears in the staged diff. The repo is PUBLIC, so a
# blocked run is the correct outcome, not a failure -- read the log and fix the
# file (or add it to .gitignore) before the next run can proceed.

$ErrorActionPreference = 'Stop'
$Repo    = 'C:\Users\IKIO\Downloads\New'
$LogFile = Join-Path $Repo '.autosync\sync.log'
$Branch  = 'main'

function Write-Log($Level, $Message) {
    $line = '{0}  {1,-5} {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

# Credential patterns. These match key VALUES, not variable names, so a
# placeholder like ANTHROPIC_API_KEY=your-key-here does not trip the guard.
$SecretPatterns = @(
    @{ Name = 'Anthropic API key';  Pattern = 'sk-ant-[A-Za-z0-9_\-]{24,}' },
    @{ Name = 'OpenAI API key';     Pattern = 'sk-(proj-)?[A-Za-z0-9]{32,}' },
    @{ Name = 'AWS access key ID';  Pattern = 'AKIA[0-9A-Z]{16}' },
    @{ Name = 'GitHub token';       Pattern = 'gh[pousr]_[A-Za-z0-9]{36,}' },
    @{ Name = 'Google API key';     Pattern = 'AIza[0-9A-Za-z_\-]{35}' },
    @{ Name = 'Slack token';        Pattern = 'xox[baprs]-[0-9A-Za-z\-]{10,}' },
    @{ Name = 'Stripe secret key';  Pattern = 'sk_live_[0-9A-Za-z]{24,}' },
    @{ Name = 'Private key block';  Pattern = '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
    @{ Name = 'JWT';                Pattern = 'eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}' }
)

Set-Location $Repo

# Trim the log so it cannot grow without bound.
if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 512KB)) {
    $tail = Get-Content $LogFile -Tail 400
    Set-Content -Path $LogFile -Value $tail -Encoding utf8
}

try {
    $dirty  = git status --porcelain
    $unpush = git rev-list --count "origin/$Branch..$Branch" 2>$null

    if (-not $dirty -and $unpush -eq '0') {
        # Nothing to do. Stay silent so the log only records real activity.
        exit 0
    }

    if ($dirty) {
        git add -A
        if ($LASTEXITCODE -ne 0) { Write-Log 'ERROR' 'git add failed'; exit 1 }

        # Scan only ADDED lines in the staged diff -- that is what would be published.
        $added = (git diff --cached -U0 --diff-filter=ACM) |
                 Where-Object { $_ -like '+*' -and $_ -notlike '+++*' }

        $hits = @()
        foreach ($p in $SecretPatterns) {
            if ($added | Select-String -Pattern $p.Pattern -Quiet) { $hits += $p.Name }
        }

        if ($hits.Count -gt 0) {
            # Unstage so a later manual `git add` is a deliberate act.
            git reset -q
            $files = (git status --porcelain | ForEach-Object { $_.Substring(3) }) -join ', '
            Write-Log 'BLOCK' ("PUSH ABORTED - {0} detected in staged changes. Files touched: {1}" -f ($hits -join ' + '), $files)
            Write-Log 'BLOCK' 'Nothing was committed or pushed. Remove the secret or .gitignore the file, then the next run will proceed.'
            exit 2
        }

        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
        $count = (git diff --cached --name-only | Measure-Object -Line).Lines
        git commit -q -m "autosync $stamp ($count file(s))"
        if ($LASTEXITCODE -ne 0) { Write-Log 'ERROR' 'git commit failed'; exit 1 }
        Write-Log 'OK' "committed $count file(s)"
    }

    git push origin $Branch --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Log 'WARN' 'push failed (offline or auth?) - commit is safe locally, will retry next run'
        exit 1
    }
    Write-Log 'OK' "pushed to origin/$Branch"

    # ── Mirror the published subtree to the organisation repository ───────────
    #
    # origin is the working monorepo. techsmeinc/preckon-tenant is the artefact
    # the org reviews and the server deploys from, and it holds preckon-tenant/
    # at its ROOT — so it cannot be a plain push, it needs a subtree split.
    #
    # Deliberately fail-soft. A mirror that cannot reach GitHub must never cost
    # the local commit that already succeeded above; the next run picks it up.
    #
    # Off unless asked for, because the split walks the whole history and that is
    # not something to run every few minutes without meaning to:
    #   setx PRECKON_MIRROR 1
    if ($env:PRECKON_MIRROR -eq '1') {
        $remote = 'techsme-tenant'
        $url    = 'https://github.com/techsmeinc/preckon-tenant.git'

        if (-not (git remote | Select-String -SimpleMatch $remote -Quiet)) {
            git remote add $remote $url
            Write-Log 'OK' "added remote $remote"
        }

        git branch -D preckon-tenant-export --quiet 2>$null
        git subtree split -P Preckon-system/preckon-tenant -b preckon-tenant-export --quiet 2>$null

        if ($LASTEXITCODE -ne 0) {
            Write-Log 'WARN' 'subtree split failed - mirror skipped, origin is still up to date'
        }
        else {
            # --force-with-lease against the CURRENT remote tip: the histories are
            # unrelated by construction, so this is always a force, but it must
            # still refuse if somebody else moved the branch since we looked.
            $lease = (git ls-remote $remote refs/heads/main | ForEach-Object { ($_ -split "`t")[0] })
            if ($lease) {
                git push --force-with-lease=refs/heads/main:$lease $remote preckon-tenant-export:main --quiet 2>$null
            } else {
                git push $remote preckon-tenant-export:main --quiet 2>$null
            }

            if ($LASTEXITCODE -ne 0) {
                # The commonest cause by a distance: the stored token has no
                # `workflow` scope, so any push carrying .github/workflows is
                # refused outright. Say so rather than leaving a bare failure.
                Write-Log 'WARN' "mirror to $remote failed - if it mentions 'workflow scope', grant that scope to the PAT; origin is unaffected"
            }
            else {
                Write-Log 'OK' "mirrored preckon-tenant to $remote/main"
            }
        }
    }
}
catch {
    Write-Log 'ERROR' $_.Exception.Message
    exit 1
}
