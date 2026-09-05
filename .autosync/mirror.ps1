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
                    Invoke-Git @('merge', '--abort') | Out-Null

                    <# Unrelated histories cannot be merged, ever - it is not a
                       transient failure and retrying nightly will never clear
                       it. preckon-host is in exactly that state: its history
                       was created independently of this monorepo, so git
                       refuses outright.

                       For that case only, publish the other way round: start
                       FROM the remote tip and lay the subtree's content on top
                       as one ordinary commit. The remote's history is preserved
                       and extended, the push is a fast-forward, and files that
                       exist only on the remote survive because an overlay adds
                       and updates but never deletes.

                       This is safe ONLY while the monorepo is the authority on
                       shared files - an overlay reverts a remote edit to a file
                       the monorepo also has. That is why the host's Next.js
                       version and its capture-shapes hardening were pulled into
                       the monorepo before this path was switched on. If someone
                       edits a shared file on GitHub again, bring it back here
                       first or this will quietly undo it. #>
                    # Ask git directly whether the histories share an ancestor.
                    # The first version of this parsed the words "unrelated
                    # histories" out of a bare `git merge`, which never ran:
                    # $ErrorActionPreference='Stop' turns any native command's
                    # stderr into a terminating error, so the detection threw
                    # before it could decide anything and the whole target was
                    # logged as an unexplained ERROR.
                    $mergeBase = (Invoke-Git @('merge-base', 'HEAD', "$($t.Remote)/main"))
                    $unrelated = ($mergeBase -ne 0)

                    if (-not $unrelated) {
                        # A real content conflict. Stopping is correct: the
                        # alternative is deciding on somebody's behalf which
                        # side of an edit wins, on a timer, with nobody reading.
                        Write-Log 'WARN' "$name : merge conflict with $($t.Remote)/main - NOT pushed. Resolve by hand."
                        $failed++
                        continue
                    }

                    Invoke-Git @('checkout', '-q', '-B', "$branch-overlay", "$($t.Remote)/main") | Out-Null
                    $prefixPath = Join-Path $Repo $t.Prefix
                    # Tracked files only: git archive of the subtree, so no
                    # node_modules, no .next, nothing .gitignore'd.
                    # Via a FILE, not a pipe. PowerShell's pipeline decodes a
                    # native command's output as text, so piping git archive
                    # into tar handed it a mangled stream: tar.exe answered
                    # "Unrecognized archive format", nothing was extracted, the
                    # staged-change check below found nothing, and the run
                    # logged "already current" and STAMPED the target as
                    # published. A green line for work that never happened - and
                    # the stamp meant every later run skipped it too.
                    $tar = Join-Path $env:TEMP "preckon-overlay-$($t.Name).tar"
                    Push-Location $Repo
                    try { $rc = Invoke-Git @('archive', '-o', $tar, "HEAD:$($t.Prefix)") }
                    finally { Pop-Location }
                    if ($rc -ne 0) {
                        Write-Log 'WARN' "$name : git archive failed - NOT pushed, NOT stamped"
                        $failed++
                        continue
                    }
                    & tar -x -f $tar -C $tree
                    $tarRc = $LASTEXITCODE
                    Remove-Item $tar -Force -ErrorAction SilentlyContinue
                    if ($tarRc -ne 0) {
                        Write-Log 'WARN' "$name : tar extract failed - NOT pushed, NOT stamped"
                        $failed++
                        continue
                    }

                    Invoke-Git @('add', '-A') | Out-Null
                    if ((git diff --cached --name-only | Measure-Object -Line).Lines -eq 0) {
                        Write-Log 'OK' "$name : already current (nothing to overlay)"
                        Set-Content -Path $stampFile -Value $localTip -Encoding utf8
                        continue
                    }
                    Invoke-Git @('commit', '-q', '-m',
                                 "Sync $name from the monorepo`n`nHistories are unrelated, so this is an overlay on top of this repository's own history rather than a merge. Files that exist only here are untouched.") | Out-Null
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
