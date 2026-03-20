param(
  [string]$ChromeDebugUrl = "http://127.0.0.1:9222",
  [string]$CatalogUrl = "http://127.0.0.1:3000/",
  [string]$AidEditorUrl = "https://play.aidungeon.com/scenario/xNJvqef4IPec/testing-oneclick/edit",
  [string]$ExtensionId = "ckacekamajfmlbfcinmmlmibmlifcnlb",
  [string]$PackageId = "demo-script",
  [string]$PackageManifestPath = ".\\apps\\catalog\\data\\packages\\demo-script.json",
  [int]$ReadyTimeoutSeconds = 90,
  [int]$ActionTimeoutSeconds = 120,
  [int]$ReloadSettleSeconds = 5,
  [switch]$SkipTelemetryRetryCheck = $false,
  [string]$ReportPath = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($PackageManifestPath)) {
  $PackageManifestPath = Join-Path $RepoRoot $PackageManifestPath
}

function Get-JsonFromUrl {
  param([string]$Url)

  return @(((Invoke-WebRequest -UseBasicParsing -Uri $Url).Content | ConvertFrom-Json))
}

function Get-DevtoolsTargets {
  return Get-JsonFromUrl "$ChromeDebugUrl/json/list"
}

function Open-DevtoolsPageTarget {
  param([string]$Url)

  $encodedUrl = [System.Uri]::EscapeDataString($Url)
  return @(((Invoke-WebRequest -UseBasicParsing -Method Put -Uri "$ChromeDebugUrl/json/new?$encodedUrl").Content | ConvertFrom-Json))
}

function Get-DevtoolsTarget {
  param(
    [string]$Type,
    [string]$Url
  )

  $targets = Get-DevtoolsTargets
  $target = @($targets | Where-Object { $_.type -eq $Type -and $_.url -eq $Url })[0]

  if (-not $target) {
    throw "Could not find DevTools target: [$Type] $Url"
  }

  return $target
}

function New-CdpClient {
  param([string]$WebSocketUrl)

  $client = [System.Net.WebSockets.ClientWebSocket]::new()
  $cts = [System.Threading.CancellationTokenSource]::new()
  $cts.CancelAfter(10000)

  try {
    $null = $client.ConnectAsync([Uri]$WebSocketUrl, $cts.Token).
      GetAwaiter().GetResult()
  } finally {
    $cts.Dispose()
  }

  return $client
}

function Read-CdpMessage {
  param([System.Net.WebSockets.ClientWebSocket]$Client)

  $buffer = New-Object byte[] 262144
  $segment = [System.ArraySegment[byte]]::new($buffer)
  $builder = [System.Text.StringBuilder]::new()

  do {
    $result = $Client.ReceiveAsync($segment, [Threading.CancellationToken]::None).
      GetAwaiter().GetResult()

    if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
      throw "CDP socket closed unexpectedly."
    }

    [void]$builder.Append([System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count))
  } while (-not $result.EndOfMessage)

  return $builder.ToString()
}

$script:CdpMessageId = 0

function Invoke-CdpCommand {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [string]$Method,
    [hashtable]$Params = @{}
  )

  $script:CdpMessageId += 1
  $messageId = $script:CdpMessageId
  $payload = @{
    id = $messageId
    method = $Method
    params = $Params
  } | ConvertTo-Json -Compress -Depth 50

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [System.ArraySegment[byte]]::new($bytes)
  $null = $Client.SendAsync(
    $segment,
    [System.Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    [Threading.CancellationToken]::None
  ).GetAwaiter().GetResult()

  while ($true) {
    $response = (Read-CdpMessage -Client $Client) | ConvertFrom-Json

    if (-not ($response.PSObject.Properties.Name -contains "id")) {
      continue
    }

    if ($response.id -ne $messageId) {
      continue
    }

    if ($response.error) {
      throw "CDP $Method failed: $($response.error.message)"
    }

    return $response.result
  }
}

function Eval-Cdp {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [string]$Expression,
    [bool]$AwaitPromise = $false
  )

  $result = Invoke-CdpCommand -Client $Client -Method "Runtime.evaluate" -Params @{
    expression = $Expression
    awaitPromise = $AwaitPromise
    returnByValue = $true
  }

  if ($result.exceptionDetails) {
    $message = $result.exceptionDetails.text

    if ($result.result -and $result.result.description) {
      $message = "$message $($result.result.description)".Trim()
    }

    throw "CDP evaluation failed: $message"
  }

  if ($result.result -and ($result.result.PSObject.Properties.Name -contains "value")) {
    return $result.result.value
  }

  if ($result.result -and ($result.result.PSObject.Properties.Name -contains "description")) {
    return $result.result.description
  }

  return $null
}

function Close-CdpClient {
  param([System.Net.WebSockets.ClientWebSocket]$Client)

  if (-not $Client) {
    return
  }

  try {
    if ($Client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
      $null = $Client.CloseAsync(
        [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
        "done",
        [Threading.CancellationToken]::None
      ).GetAwaiter().GetResult()
    }
  } catch {
  }

  $Client.Dispose()
}

function Wait-Until {
  param(
    [string]$Label,
    [int]$TimeoutSeconds,
    [scriptblock]$Predicate,
    [int]$PollMilliseconds = 500
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $value = & $Predicate
      if ($value) {
        return $value
      }
    } catch {
    }

    Start-Sleep -Milliseconds $PollMilliseconds
  }

  throw "Timed out waiting for $Label."
}

function Reload-PageAndWait {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [int]$SettleSeconds = 0
  )

  Invoke-CdpCommand -Client $Client -Method "Page.reload" | Out-Null
  Wait-Until -Label "page load" -TimeoutSeconds 60 -Predicate {
    (Eval-Cdp -Client $Client -Expression "document.readyState") -eq "complete"
  } | Out-Null

  if ($SettleSeconds -gt 0) {
    Start-Sleep -Seconds $SettleSeconds
  }
}

function Test-ButtonReady {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [string]$Selector
  )

  $expression = @"
(() => {
  const button = document.querySelector('$Selector');
  return !!button && !button.disabled && !button.hidden;
})()
"@

  return [bool](Eval-Cdp -Client $Client -Expression $expression)
}

function Click-Button {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [string]$Selector
  )

  $expression = @"
(() => {
  const button = document.querySelector('$Selector');
  if (!button) {
    throw new Error("Button not found.");
  }

  setTimeout(() => {
    button.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true
    }));
  }, 0);
  return true;
})()
"@

  return Eval-Cdp -Client $Client -Expression $expression
}

function Get-InstallModalState {
  param([System.Net.WebSockets.ClientWebSocket]$Client)

  $expression = @"
(() => {
  const modal = document.querySelector('[data-oneclick-install-modal]');
  if (!modal || modal.hidden) {
    return null;
  }

  const checkboxes = Array.from(modal.querySelectorAll('[data-oneclick-target-checkbox]'));
  const confirm = modal.querySelector('[data-oneclick-install-confirm]');
  return {
    totalTargets: checkboxes.length,
    checkedTargets: checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.dataset.targetShortId),
    confirmEnabled: !!confirm && !confirm.disabled
  };
})()
"@

  return Eval-Cdp -Client $Client -Expression $expression -AwaitPromise $true
}

function Invoke-ExtensionAction {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [string]$MessageType,
    [string]$PackageId = ""
  )

  $packageClause = ""
  if ($PackageId) {
    $packageClause = ", packageId: '$PackageId'"
  }

  $expression = @"
(async () => {
  const response = await chrome.runtime.sendMessage({
    type: "$MessageType"$packageClause
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Extension action failed.");
  }

  return response;
})()
"@

  return Eval-Cdp -Client $Client -Expression $expression -AwaitPromise $true
}

function Open-ExtensionPageTab {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [string]$RelativePath
  )

  $expression = @"
(async () => {
  const tab = await chrome.tabs.create({
    url: chrome.runtime.getURL("$RelativePath"),
    active: false
  });

  return {
    id: tab.id,
    url: tab.url
  };
})()
"@

  return Eval-Cdp -Client $Client -Expression $expression -AwaitPromise $true
}

function Get-ServiceWorkerState {
  param([System.Net.WebSockets.ClientWebSocket]$Client)

  $expression = @"
(async () => {
  const response = await chrome.runtime.sendMessage({
    type: "GET_STATUS"
  });

  if (!response?.ok) {
    throw new Error(response?.error || "GET_STATUS failed.");
  }

  return {
    authState: response.authState,
    scenarioState: response.scenarioState,
    installState: response.installState
  };
})()
"@

  return Eval-Cdp -Client $Client -Expression $expression -AwaitPromise $true
}

function Get-TelemetryStatus {
  param([System.Net.WebSockets.ClientWebSocket]$Client)

  $expression = @"
(async () => {
  const response = await chrome.runtime.sendMessage({
    type: "GET_TELEMETRY_STATUS"
  });

  if (!response?.ok) {
    throw new Error(response?.error || "GET_TELEMETRY_STATUS failed.");
  }

  return response.telemetry;
})()
"@

  return Eval-Cdp -Client $Client -Expression $expression -AwaitPromise $true
}

function Set-TelemetryTestMode {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [string]$Mode
  )

  $expression = @"
(async () => {
  const response = await chrome.runtime.sendMessage({
    type: "SET_TELEMETRY_TEST_MODE",
    mode: "$Mode"
  });

  if (!response?.ok) {
    throw new Error(response?.error || "SET_TELEMETRY_TEST_MODE failed.");
  }

  return response.telemetry;
})()
"@

  return Eval-Cdp -Client $Client -Expression $expression -AwaitPromise $true
}

function Flush-TelemetryQueue {
  param([System.Net.WebSockets.ClientWebSocket]$Client)

  $expression = @"
(async () => {
  const response = await chrome.runtime.sendMessage({
    type: "FLUSH_TELEMETRY_QUEUE"
  });

  if (!response?.ok) {
    throw new Error(response?.error || "FLUSH_TELEMETRY_QUEUE failed.");
  }

  return {
    flushResult: response.flushResult,
    telemetry: response.telemetry
  };
})()
"@

  return Eval-Cdp -Client $Client -Expression $expression -AwaitPromise $true
}

function Get-ScenarioSnapshot {
  param([System.Net.WebSockets.ClientWebSocket]$Client)

  $expression = @'
(async () => {
  const { authState, scenarioState } = await chrome.storage.session.get([
    "authState",
    "scenarioState"
  ]);

  if (!authState?.hasToken || !authState?.token) {
    throw new Error("Auth token unavailable in extension session storage.");
  }

  if (scenarioState?.status !== "ready") {
    throw new Error(`Scenario state is not ready: ${scenarioState?.status || "unknown"}`);
  }

  const targets = [];
  const seen = new Set();
  const addTarget = (shortId, title) => {
    if (!shortId || seen.has(shortId)) {
      return;
    }

    seen.add(shortId);
    targets.push({ shortId, title: title || "Untitled" });
  };

  addTarget(scenarioState.rootShortId, scenarioState.rootTitle);
  for (const leaf of scenarioState.leaves || []) {
    addTarget(leaf.shortId, leaf.title);
  }

  const apiHostMap = {
    "play.aidungeon.com": "api.aidungeon.com",
    "beta.aidungeon.com": "api-beta.aidungeon.com",
    "alpha.aidungeon.com": "api-alpha.aidungeon.com"
  };

  const apiHost = apiHostMap[scenarioState.origin] || "api.aidungeon.com";
  const url = `https://${apiHost}/graphql`;
  const query = `
    query GetScenarioInstallState($shortId: String!, $viewPublished: Boolean) {
      scenario(shortId: $shortId, viewPublished: $viewPublished) {
        shortId
        title
        scriptsEnabled
        state(viewPublished: $viewPublished) {
          scripts {
            sharedLibrary
            onInput
            onModelContext
            onOutput
          }
        }
      }
    }
  `;

  const snapshots = [];
  for (const target of targets) {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `firebase ${authState.token}`
      },
      body: JSON.stringify({
        operationName: "GetScenarioInstallState",
        query,
        variables: {
          shortId: target.shortId,
          viewPublished: false
        }
      })
    });

    if (!response.ok) {
      throw new Error(`GraphQL HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message).join("; "));
    }

    const scripts = payload.data.scenario.state?.scripts || {};
    snapshots.push({
      shortId: payload.data.scenario.shortId,
      title: payload.data.scenario.title || target.title || "Untitled",
      scriptsEnabled: !!payload.data.scenario.scriptsEnabled,
      scripts: {
        sharedLibrary: scripts.sharedLibrary || "",
        onInput: scripts.onInput || "",
        onModelContext: scripts.onModelContext || "",
        onOutput: scripts.onOutput || ""
      }
    });
  }

  return {
    rootShortId: scenarioState.rootShortId,
    rootTitle: scenarioState.rootTitle,
    leafCount: scenarioState.leafCount,
    targetCount: targets.length,
    targets: snapshots
  };
})()
'@

  return Eval-Cdp -Client $Client -Expression $expression -AwaitPromise $true
}

function Get-CurrentScenarioRootState {
  param([System.Net.WebSockets.ClientWebSocket]$Client)

  $expression = @'
(async () => {
  const { authState, scenarioState } = await chrome.storage.session.get([
    "authState",
    "scenarioState"
  ]);

  if (!authState?.hasToken || !authState?.token) {
    throw new Error("Auth token unavailable in extension session storage.");
  }

  if (scenarioState?.status !== "ready" || !scenarioState?.rootShortId) {
    throw new Error("Scenario root is not ready.");
  }

  const apiHostMap = {
    "play.aidungeon.com": "api.aidungeon.com",
    "beta.aidungeon.com": "api-beta.aidungeon.com",
    "alpha.aidungeon.com": "api-alpha.aidungeon.com"
  };

  const apiHost = apiHostMap[scenarioState.origin] || "api.aidungeon.com";
  const url = `https://${apiHost}/graphql`;
  const query = `
    query GetScenarioInstallState($shortId: String!, $viewPublished: Boolean) {
      scenario(shortId: $shortId, viewPublished: $viewPublished) {
        shortId
        title
        scriptsEnabled
        state(viewPublished: $viewPublished) {
          scripts {
            sharedLibrary
            onInput
            onModelContext
            onOutput
          }
        }
      }
    }
  `;

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `firebase ${authState.token}`
    },
    body: JSON.stringify({
      operationName: "GetScenarioInstallState",
      query,
      variables: {
        shortId: scenarioState.rootShortId,
        viewPublished: false
      }
    })
  });

  if (!response.ok) {
    throw new Error(`GraphQL HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  const scripts = payload.data.scenario.state?.scripts || {};
  return {
    shortId: payload.data.scenario.shortId,
    title: payload.data.scenario.title || "Untitled",
    scriptsEnabled: !!payload.data.scenario.scriptsEnabled,
    scripts: {
      sharedLibrary: scripts.sharedLibrary || "",
      onInput: scripts.onInput || "",
      onModelContext: scripts.onModelContext || "",
      onOutput: scripts.onOutput || ""
    }
  };
})()
'@

  return Eval-Cdp -Client $Client -Expression $expression -AwaitPromise $true
}

function Compare-SnapshotToPackage {
  param(
    $Snapshot,
    $Package
  )

  $mismatches = [System.Collections.Generic.List[string]]::new()

  foreach ($target in $Snapshot.targets) {
    if (-not $target.scriptsEnabled) {
      $mismatches.Add("$($target.shortId): scriptsEnabled was false.")
    }

    foreach ($field in @("sharedLibrary", "onInput", "onModelContext", "onOutput")) {
      if ([string]$target.scripts.$field -ne [string]$Package.$field) {
        $mismatches.Add("$($target.shortId): $field mismatch.")
      }
    }
  }

  return @($mismatches)
}

function Compare-Snapshots {
  param(
    $Expected,
    $Actual
  )

  $mismatches = [System.Collections.Generic.List[string]]::new()

  foreach ($expectedTarget in $Expected.targets) {
    $actualTarget = @($Actual.targets | Where-Object {
        $_.shortId -eq $expectedTarget.shortId
      })[0]

    if (-not $actualTarget) {
      $mismatches.Add("$($expectedTarget.shortId): target missing.")
      continue
    }

    if ([bool]$actualTarget.scriptsEnabled -ne [bool]$expectedTarget.scriptsEnabled) {
      $mismatches.Add("$($expectedTarget.shortId): scriptsEnabled mismatch.")
    }

    foreach ($field in @("sharedLibrary", "onInput", "onModelContext", "onOutput")) {
      if ([string]$actualTarget.scripts.$field -ne [string]$expectedTarget.scripts.$field) {
        $mismatches.Add("$($expectedTarget.shortId): $field mismatch.")
      }
    }
  }

  return @($mismatches)
}

function Wait-ForInstallTransition {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [string]$PackageId,
    $PreviousState
  )

  return Wait-Until -Label "install completion" -TimeoutSeconds $ActionTimeoutSeconds -Predicate {
    $state = Get-ServiceWorkerState -Client $Client
    $installState = $state.installState

    if (
      $installState.status -eq "ready" -and
      $installState.packageId -eq $PackageId -and
      $installState.updatedAt -ne $PreviousState.updatedAt
    ) {
      return $state
    }

    return $null
  }
}

function Wait-ForRollbackTransition {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    $PreviousState
  )

  return Wait-Until -Label "rollback completion" -TimeoutSeconds $ActionTimeoutSeconds -Predicate {
    $state = Get-ServiceWorkerState -Client $Client
    $installState = $state.installState

    if (
      $installState.status -eq "rolled_back" -and
      $installState.updatedAt -ne $PreviousState.updatedAt
    ) {
      return $state
    }

    return $null
  }
}

function Wait-ForTelemetryPendingCount {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [int]$PendingCount,
    [ValidateSet("eq", "ge")] [string]$Operator = "eq"
  )

  return Wait-Until -Label "telemetry pending count $Operator $PendingCount" -TimeoutSeconds $ActionTimeoutSeconds -Predicate {
    $telemetry = Get-TelemetryStatus -Client $Client

    if ($Operator -eq "eq" -and $telemetry.pendingCount -eq $PendingCount) {
      return $telemetry
    }

    if ($Operator -eq "ge" -and $telemetry.pendingCount -ge $PendingCount) {
      return $telemetry
    }

    return $null
  }
}

function Wait-ForSnapshot {
  param(
    [System.Net.WebSockets.ClientWebSocket]$ServiceWorkerClient,
    [System.Net.WebSockets.ClientWebSocket]$AidClient,
    [scriptblock]$MatchesExpected,
    [string]$Label
  )

  return Wait-Until -Label $Label -TimeoutSeconds $ActionTimeoutSeconds -Predicate {
    Reload-PageAndWait -Client $AidClient -SettleSeconds $ReloadSettleSeconds
    $snapshot = Get-ScenarioSnapshot -Client $ServiceWorkerClient
    if (& $MatchesExpected $snapshot) {
      return $snapshot
    }

    return $null
  } -PollMilliseconds 1500
}

function Convert-TitleToSlug {
  param([string]$Title)

  $value = ""
  if ($null -ne $Title) {
    $value = [string]$Title
  }

  $slug = $value.ToLowerInvariant()
  $slug = [regex]::Replace($slug, "[^a-z0-9]+", "-")
  $slug = $slug.Trim("-")

  if ([string]::IsNullOrWhiteSpace($slug)) {
    return "scenario"
  }

  return $slug
}

function Get-AidOrigin {
  $uri = [Uri]$AidEditorUrl
  return "$($uri.Scheme)://$($uri.Host)"
}

function Get-ScenarioEditUrl {
  param($Target)

  $slug = Convert-TitleToSlug -Title $Target.title
  return "$(Get-AidOrigin)/scenario/$($Target.shortId)/$slug/edit"
}

function Wait-ForScenarioRoot {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Client,
    [string]$ShortId
  )

  return Wait-Until -Label "scenario root $ShortId" -TimeoutSeconds $ReadyTimeoutSeconds -Predicate {
    $state = Get-ServiceWorkerState -Client $Client
    if ($state.scenarioState.status -eq "ready" -and $state.scenarioState.rootShortId -eq $ShortId) {
      return $state
    }

    return $null
  }
}

function Navigate-ToScenarioTarget {
  param(
    [System.Net.WebSockets.ClientWebSocket]$AidClient,
    [System.Net.WebSockets.ClientWebSocket]$ServiceWorkerClient,
    $Target
  )

  $url = Get-ScenarioEditUrl -Target $Target
  Write-Step "Navigating AI page to $($Target.shortId)."
  Invoke-CdpCommand -Client $AidClient -Method "Page.navigate" -Params @{ url = $url } | Out-Null
  Wait-Until -Label "AI page navigation" -TimeoutSeconds 60 -Predicate {
    (Eval-Cdp -Client $AidClient -Expression "document.readyState") -eq "complete"
  } | Out-Null

  if ($ReloadSettleSeconds -gt 0) {
    Start-Sleep -Seconds $ReloadSettleSeconds
  }

  Wait-ForScenarioRoot -Client $ServiceWorkerClient -ShortId $Target.shortId | Out-Null
}

function Compare-TargetToPackage {
  param(
    $Target,
    $Package
  )

  $mismatches = [System.Collections.Generic.List[string]]::new()

  if (-not $Target.scriptsEnabled) {
    $mismatches.Add("$($Target.shortId): scriptsEnabled was false.")
  }

  foreach ($field in @("sharedLibrary", "onInput", "onModelContext", "onOutput")) {
    if ([string]$Target.scripts.$field -ne [string]$Package.$field) {
      $mismatches.Add("$($Target.shortId): $field mismatch.")
    }
  }

  return @($mismatches)
}

function Compare-Targets {
  param(
    $Expected,
    $Actual
  )

  $mismatches = [System.Collections.Generic.List[string]]::new()

  if ([bool]$Actual.scriptsEnabled -ne [bool]$Expected.scriptsEnabled) {
    $mismatches.Add("$($Expected.shortId): scriptsEnabled mismatch.")
  }

  foreach ($field in @("sharedLibrary", "onInput", "onModelContext", "onOutput")) {
    if ([string]$Actual.scripts.$field -ne [string]$Expected.scripts.$field) {
      $mismatches.Add("$($Expected.shortId): $field mismatch.")
    }
  }

  return @($mismatches)
}

function Verify-TargetsByNavigation {
  param(
    [System.Net.WebSockets.ClientWebSocket]$AidClient,
    [System.Net.WebSockets.ClientWebSocket]$ServiceWorkerClient,
    $Targets,
    [ValidateSet("package", "snapshot")] [string]$Mode,
    $Package = $null,
    $ExpectedTargets = $null
  )

  $results = [System.Collections.Generic.List[object]]::new()

  foreach ($target in $Targets) {
    Navigate-ToScenarioTarget -AidClient $AidClient -ServiceWorkerClient $ServiceWorkerClient -Target $target
    $actual = Get-CurrentScenarioRootState -Client $ServiceWorkerClient

    if ($Mode -eq "package") {
      $mismatches = Compare-TargetToPackage -Target $actual -Package $Package
    } else {
      $expected = @($ExpectedTargets | Where-Object { $_.shortId -eq $target.shortId })[0]
      if (-not $expected) {
        throw "Expected target snapshot missing for $($target.shortId)."
      }

      $mismatches = Compare-Targets -Expected $expected -Actual $actual
    }

    if (@($mismatches).Count -gt 0) {
      throw (@($mismatches) -join " ")
    }

    $results.Add($actual)
  }

  return @($results)
}

function Get-TargetSummary {
  param($Snapshot)

  $summary = foreach ($target in $Snapshot.targets) {
    [ordered]@{
      shortId = $target.shortId
      title = $target.title
      scriptsEnabled = $target.scriptsEnabled
      sharedLibraryLength = $target.scripts.sharedLibrary.Length
      onInputLength = $target.scripts.onInput.Length
      onModelContextLength = $target.scripts.onModelContext.Length
      onOutputLength = $target.scripts.onOutput.Length
    }
  }

  return @($summary)
}

function Write-Report {
  param($Report)

  $json = $Report | ConvertTo-Json -Depth 50
  if ($ReportPath) {
    Set-Content -Path $ReportPath -Value $json
  }

  Write-Output $json
}

function Write-Step {
  param([string]$Message)

  Write-Host "[e2e] $Message"
}

function Connect-TargetClient {
  param(
    [string]$Type,
    [string]$Url,
    [string]$Label
  )

  return Wait-Until -Label "$Label target connection" -TimeoutSeconds $ReadyTimeoutSeconds -Predicate {
    $target = Get-DevtoolsTarget -Type $Type -Url $Url
    $client = $null

    try {
      $client = New-CdpClient -WebSocketUrl $target.webSocketDebuggerUrl
      return $client
    } catch {
      if ($client) {
        Close-CdpClient -Client $client
      }

      return $null
    }
  } -PollMilliseconds 1000
}

function Connect-OrOpenPageClient {
  param(
    [string]$Url,
    [string]$Label
  )

  try {
    return Connect-TargetClient -Type "page" -Url $Url -Label $Label
  } catch {
    Write-Step "Opening $Label because no existing target matched $Url."
    [void](Open-DevtoolsPageTarget -Url $Url)
    return Connect-TargetClient -Type "page" -Url $Url -Label $Label
  }
}

$reloadExtensionExpr = @"
(() => {
  const item = document.querySelector('extensions-manager')
    ?.shadowRoot?.querySelector('extensions-item-list')
    ?.shadowRoot?.querySelector('extensions-item[id="$ExtensionId"]');
  const button = item?.shadowRoot?.getElementById('dev-reload-button');
  if (!button) {
    return false;
  }
  button.click();
  return true;
})()
"@

$installSelector = "[data-oneclick-install][data-package-id=""$PackageId""]"
$rollbackSelector = "[data-oneclick-rollback][data-package-id=""$PackageId""]"

$packageManifest = Get-Content -Path $PackageManifestPath | ConvertFrom-Json
$extensionPageUrl = "chrome://extensions/"

$extensionsClient = $null
$catalogClient = $null
$aidClient = $null
$serviceWorkerClient = $null
$popupClient = $null

try {
  Write-Step "Connecting to extension management page."
  $extensionsTarget = Get-DevtoolsTarget -Type "page" -Url $extensionPageUrl
  $extensionsClient = New-CdpClient -WebSocketUrl $extensionsTarget.webSocketDebuggerUrl
  $reloadInvoked = Eval-Cdp -Client $extensionsClient -Expression $reloadExtensionExpr
  if ($reloadInvoked) {
    Start-Sleep -Seconds 3
  } else {
    Write-Step "Extension reload control not found on chrome://extensions/. Continuing without forced reload."
  }

  Write-Step "Connecting to catalog, AI Dungeon, and extension service worker targets."
  $catalogClient = Connect-OrOpenPageClient -Url $CatalogUrl -Label "catalog page"
  Write-Step "Connected to catalog page."
  $aidClient = Connect-OrOpenPageClient -Url $AidEditorUrl -Label "AI Dungeon page"
  Write-Step "Connected to AI Dungeon page."
  Write-Step "Opening popup page for extension message actions."
  [void](Open-DevtoolsPageTarget -Url "chrome-extension://$ExtensionId/src/popup/popup.html")
  $popupClient = Connect-TargetClient -Type "page" -Url "chrome-extension://$ExtensionId/src/popup/popup.html" -Label "extension popup page"
  Write-Step "Connected to extension popup page."
  $serviceWorkerClient = $popupClient
  Write-Step "Using extension popup page as the extension control surface."

  Write-Step "Reloading catalog and AI Dungeon pages."
  Reload-PageAndWait -Client $catalogClient
  Reload-PageAndWait -Client $aidClient -SettleSeconds $ReloadSettleSeconds

  Write-Step "Waiting for extension auth and scenario readiness."
  $readyState = Wait-Until -Label "extension readiness" -TimeoutSeconds $ReadyTimeoutSeconds -Predicate {
    $state = Get-ServiceWorkerState -Client $serviceWorkerClient
    if ($state.authState.hasToken -and $state.scenarioState.status -eq "ready") {
      return $state
    }

    return $null
  }

  $initialTelemetry = $null
  $telemetryAfterFailure = $null
  $telemetryFlushResponse = $null
  $telemetryAfterRecovery = $null

  if (-not $SkipTelemetryRetryCheck) {
    Write-Step "Resetting telemetry test mode and draining any pending telemetry."
    [void](Set-TelemetryTestMode -Client $popupClient -Mode "normal")
    $telemetryFlushResponse = Flush-TelemetryQueue -Client $popupClient
    $initialTelemetry = Wait-ForTelemetryPendingCount -Client $serviceWorkerClient -PendingCount 0

    Write-Step "Enabling telemetry failure injection for the next delivery attempt."
    [void](Set-TelemetryTestMode -Client $popupClient -Mode "fail_next")
  }

  Write-Step "Capturing pre-install snapshot."
  $preInstallSnapshot = Get-ScenarioSnapshot -Client $serviceWorkerClient
  $preInstallState = $readyState.installState
  $verificationTargets = @($preInstallSnapshot.targets)

  Write-Step "Waiting for install button readiness."
  Wait-Until -Label "install button readiness" -TimeoutSeconds $ReadyTimeoutSeconds -Predicate {
    if (Test-ButtonReady -Client $catalogClient -Selector $installSelector) {
      return $true
    }

    return $null
  } | Out-Null

  Write-Step "Opening the install selection modal from the catalog page."
  Click-Button -Client $catalogClient -Selector $installSelector | Out-Null
  $installModalState = Wait-Until -Label "install modal readiness" -TimeoutSeconds $ReadyTimeoutSeconds -Predicate {
    $modalState = Get-InstallModalState -Client $catalogClient
    if (
      $modalState -and
      $modalState.confirmEnabled -and
      $modalState.totalTargets -eq $preInstallSnapshot.targetCount -and
      @($modalState.checkedTargets).Count -eq $preInstallSnapshot.targetCount
    ) {
      return $modalState
    }

    return $null
  }

  $installResponse = [ordered]@{
    ok = $true
    source = "catalog-modal"
    modalSelection = $installModalState
  }

  Write-Step "Confirming install target selection from the catalog modal."
  Click-Button -Client $catalogClient -Selector "[data-oneclick-install-confirm]" | Out-Null
  Write-Step "Waiting for a fresh install-state transition."
  $installCompletionState = Wait-ForInstallTransition -Client $serviceWorkerClient -PackageId $PackageId -PreviousState $preInstallState

  if ($installCompletionState.installState.appliedCount -ne $verificationTargets.Count) {
    throw "Install appliedCount mismatch. Expected $($verificationTargets.Count) but got $($installCompletionState.installState.appliedCount)."
  }

  if (-not $SkipTelemetryRetryCheck) {
    Write-Step "Waiting for the telemetry queue to retain the failed install event."
    $telemetryAfterFailure = Wait-Until -Label "telemetry retry queue fill" -TimeoutSeconds $ActionTimeoutSeconds -Predicate {
      $telemetry = Get-TelemetryStatus -Client $serviceWorkerClient
      if ($telemetry.pendingCount -ge 1) {
        return $telemetry
      }

      return $null
    }

    Write-Step "Flushing the queued telemetry event after failure injection reset."
    $telemetryFlushResponse = Flush-TelemetryQueue -Client $popupClient
    $telemetryAfterRecovery = Wait-ForTelemetryPendingCount -Client $serviceWorkerClient -PendingCount 0
  }

  Write-Step "Verifying installed scripts across all selected scenario targets."
  $postInstallSnapshot = Wait-ForSnapshot -ServiceWorkerClient $serviceWorkerClient -AidClient $aidClient -MatchesExpected {
    param($snapshot)
    @((Compare-SnapshotToPackage -Snapshot $snapshot -Package $packageManifest)).Count -eq 0
  } -Label "post-install snapshot verification"

  $preRollbackState = $installCompletionState.installState

  [void](Eval-Cdp -Client $catalogClient -Expression "window.confirm = () => true; true;")
  Write-Step "Waiting for rollback button readiness."
  Wait-Until -Label "rollback button readiness" -TimeoutSeconds $ReadyTimeoutSeconds -Predicate {
    if (Test-ButtonReady -Client $catalogClient -Selector $rollbackSelector) {
      return $true
    }

    return $null
  } | Out-Null

  Write-Step "Triggering rollback through the extension message layer."
  $rollbackResponse = Invoke-ExtensionAction -Client $popupClient -MessageType "ROLLBACK_LATEST"
  Write-Step "Waiting for a fresh rollback-state transition."
  $rollbackCompletionState = Wait-ForRollbackTransition -Client $serviceWorkerClient -PreviousState $preRollbackState

  if ($rollbackCompletionState.installState.appliedCount -ne $verificationTargets.Count) {
    throw "Rollback appliedCount mismatch. Expected $($verificationTargets.Count) but got $($rollbackCompletionState.installState.appliedCount)."
  }

  Write-Step "Verifying rollback across all selected scenario targets."
  $postRollbackSnapshot = Wait-ForSnapshot -ServiceWorkerClient $serviceWorkerClient -AidClient $aidClient -MatchesExpected {
    param($snapshot)
    @((Compare-Snapshots -Expected $preInstallSnapshot -Actual $snapshot)).Count -eq 0
  } -Label "post-rollback snapshot verification"

  Navigate-ToScenarioTarget -AidClient $aidClient -ServiceWorkerClient $serviceWorkerClient -Target @{
    shortId = $preInstallSnapshot.rootShortId
    title = $preInstallSnapshot.rootTitle
  }

  $report = [ordered]@{
    ok = $true
    readyState = $readyState
    preInstall = [ordered]@{
      rootShortId = $preInstallSnapshot.rootShortId
      rootTitle = $preInstallSnapshot.rootTitle
      leafCount = $preInstallSnapshot.leafCount
      targetCount = $preInstallSnapshot.targetCount
      targets = Get-TargetSummary -Snapshot $preInstallSnapshot
      verifiedTargets = @($verificationTargets | ForEach-Object { $_.shortId })
    }
    telemetry = [ordered]@{
      verified = (-not $SkipTelemetryRetryCheck)
      initial = $initialTelemetry
      afterFailure = $telemetryAfterFailure
      flush = $telemetryFlushResponse
      afterRecovery = $telemetryAfterRecovery
    }
    install = [ordered]@{
      response = $installResponse
      installState = $installCompletionState.installState
      targets = Get-TargetSummary -Snapshot $postInstallSnapshot
    }
    rollback = [ordered]@{
      response = $rollbackResponse
      installState = $rollbackCompletionState.installState
      targets = Get-TargetSummary -Snapshot $postRollbackSnapshot
    }
    testedAt = (Get-Date).ToString("o")
  }

  Write-Report -Report $report
}
catch {
  $report = [ordered]@{
    ok = $false
    error = $_.Exception.Message
    testedAt = (Get-Date).ToString("o")
  }

  Write-Report -Report $report
  throw
}
finally {
  if ($popupClient) {
    try {
      [void](Set-TelemetryTestMode -Client $popupClient -Mode "normal")
    } catch {
    }
  }

  if ($serviceWorkerClient -and $popupClient -and [object]::ReferenceEquals($serviceWorkerClient, $popupClient)) {
    Close-CdpClient -Client $popupClient
    $serviceWorkerClient = $null
    $popupClient = $null
  }

  Close-CdpClient -Client $serviceWorkerClient
  Close-CdpClient -Client $popupClient
  Close-CdpClient -Client $aidClient
  Close-CdpClient -Client $catalogClient
  Close-CdpClient -Client $extensionsClient
}





