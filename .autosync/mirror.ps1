# Publish the monorepo's subtrees to the three TechSME repositories.
#
#   powershell -ExecutionPolicy Bypass -File C:\Users\IKIO\Downloads\New\.autosync\mirror.ps1
#
# ── WHY THIS IS SEPARATE FROM sync.ps1 ───────────────────────────────────────
#
# sync.ps1 runs every ten minutes and pushes the whole monorepo to `origin`. A
# subtree split walks the entire history of a prefix, so running one on that
# cadence is minutes of CPU to publish nothing new. This runs DAILY instead.
#
# ── WHY IT MERGES INSTEAD OF FORCE-PUSHING ───────────────────────────────────
#
# The obvious mirror is `split && push --force`: the monorepo is the source of
# truth and the org repos are artefacts. That is wrong here, and we found out
# the expensive way.
#
# Two directories had been deleted directly on GitHub. Those deletions existed
# ONLY on the remote. A force-push of a fresh split would have resurrected 14
# files somebody had deliberately removed, silently, on a schedule, forever.
#
# So each target fetches the remote and MERGES it into the split before pushing.
# Deletions and edits made on GitHub survive; everything from the monorepo lands
# on top. The push is then an ordinary fast-forward and needs no force at all -
# which also means a genuine conflict stops the run instead of overwriting
# someone.
#
# ── FAIL-SOFT, PER TARGET ────────────────────────────────────────────────────
#
# One repository being unreachable, or refusing a push for want of a token
# scope, must not stop the other two. Every target is independent and every
# outcome is logged.

$ErrorActionPreference = 'Stop'
$Repo    = 'C:\Users\IKIO\Downloads\New'
$LogFile = Join-Path $Repo '.autosync\mirror.log'
$Work    = Join-Path $env:TEMP 'preckon-mirror'

function Write-Log($Level, $Message) {
    $line = '{0}  {1,-5} {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Add-Content -Path $LogFile -Value $line -Encoding utf8
    Write-Host $line
}

# Native git writes progress to stderr, which $ErrorActionPreference='Stop'
# turns into a terminating error. Exit codes are what actually indicate failure.
function Invoke-Git {
    param([string[]]$GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & git @GitArgs 2>&1 | Out-Null; return $LASTEXITCODE }
    finally { $ErrorActionPreference = $prev }
}

$Targets = @(
    @{ Name = 'preckon-system'
       Prefix = 'Preckon-system'
       Remote = 'techsme'
       Url    = 'https://github.com/techsmeinc/preckon-system.git' },
    @{ Name = 'preckon-tenant'
       Prefix = 'Preckon-system/preckon-tenant'
       Remote = 'techsme-tenant'
       Url    = 'https://github.com/techsmeinc/preckon-tenant.git' },
    @{ Name = 'preckon-host'
       Prefix = 'Preckon-system/preckon-host'
       Remote = 'techsme-host'
       Url    = 'https://github.com/techsmeinc/preckon-host.git' }
)

Set-Location $Repo

if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 512KB)) {
    Set-Content -Path $LogFile -Value (Get-Content $LogFile -Tail 400) -Encoding utf8
}

$failed = 0

foreach ($t in $Targets) {
    $name   = $t.Name
    $branch = "mirror-$name"
    $tree   = Join-Path $Work $name

    try {
        if (-not (git remote | Select-String -SimpleMatch $t.Remote -Quiet)) {
            git remote add $t.Remote $t.Url
            Write-Log 'OK' "added remote $($t.Remote)"
        }

        if ((Invoke-Git @('fetch', $t.Remote, '--quiet')) -ne 0) {
            Write-Log 'WARN' "$name : cannot reach $($t.Remote) - skipped, will retry tomorrow"
            $failed++
            continue
        }

        # Nothing new to publish? Say nothing and cost nothing.
        $localTip = (git rev-parse HEAD).Trim()
        $stampFile = Join-Path $Repo ".autosync\.last-$name"
        if ((Test-Path $stampFile) -and ((Get-Content $stampFile -Raw).Trim() -eq $localTip)) {
            continue
        }

        # Clean slate: a split branch or worktree left by an interrupted run
        # would otherwise be silently reused.
        if (Test-Path $tree) { Invoke-Git @('worktree', 'remove', $tree, '--force') | Out-Null }
        Invoke-Git @('worktree', 'prune') | Out-Null
        Invoke-Git @('branch', '-D', $branch) | Out-Null

        if ((Invoke-Git @('subtree', 'split', '-P', $t.Prefix, '-b', $branch, '--quiet')) -ne 0) {
            Write-Log 'WARN' "$name : subtree split failed - skipped"
            $failed++
            continue
        }

        if ((Invoke-Git @('worktree', 'add', $tree, $branch, '--quiet')) -ne 0) {
            Write-Log 'WARN' "$name : could not create a worktree - skipped"
            $failed++
            continue
        }

        Push-Location $tree
        try {
            # Does the remote have a main to merge? A brand-new repository has none.
            $hasMain = (git ls-remote --heads $t.Remote main | Measure-Object).Count -gt 0

            if ($hasMain) {
                $merge = Invoke-Git @('merge', "$($t.Remote)/main", '--no-edit',
                                      '-m', "Merge $($t.Remote)/main, so changes made on GitHub survive this mirror")
                if ($merge -ne 0) {
                    # A real conflict. Stopping is correct: the alternative is
                    # deciding on somebody's behalf which side of an edit wins.
                    Invoke-Git @('merge', '--abort') | Out-Null
                    Write-Log 'WARN' "$name : merge conflict with $($t.Remote)/main - NOT pushed. Resolve by hand."
                    $failed++
                    continue
                }
            }

            if ((Invoke-Git @('push', $t.Remote, 'HEAD:main', '--quiet')) -ne 0) {
                # By far the commonest cause: the stored PAT has no `workflow`
                # scope, so any push carrying .github/workflows is refused.
                Write-Log 'WARN' "$name : push rejected - if it mentions 'workflow scope', grant that scope to the PAT"
                $failed++
                continue
            }

            Set-Content -Path $stampFile -Value $localTip -Encoding utf8
            Write-Log 'OK' "mirrored $name to $($t.Remote)/main"
        }
        finally {
            Pop-Location
            Invoke-Git @('worktree', 'remove', $tree, '--force') | Out-Null
            Invoke-Git @('branch', '-D', $branch) | Out-Null
        }
    }
    catch {
        Write-Log 'ERROR' "$name : $($_.Exception.Message)"
        $failed++
    }
}

if ($failed -gt 0) { exit 1 }
exit 0
