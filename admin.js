const ADMIN_CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbynkJi6L9o9bHL8y2Srz3tr2qMgipUFexxrR_bUGf30fodG1CVrL2gfFPR0HdNhC_-yGA/exec",
};

const ADMIN_STORAGE_KEYS = {
  snapshot: "worldCupCashAdminSnapshot",
};

let adminMatches = [];
let activeGameState = null;
let adminPickSummaryByMatch = {};
let adminDashboard = null;
let adminPhases = [];
let adminPlayers = [];

async function callAdminApi(action, params = {}) {
  const url = new URL(ADMIN_CONFIG.appsScriptUrl);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  let result;

  try {
    result = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`API returned non-JSON response for ${action}`);
  }

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
}

async function loadAdminPhasePickSummary(phaseName) {
  try {
    const result = await callAdminApi("getPhasePickSummary", {
      phase: phaseName,
    });

    return { summaries: result.summaries || {}, error: null };
  } catch (error) {
    console.error(error);
    return { summaries: {}, error };
  }
}

function getCachedAdminSnapshot() {
  const saved = localStorage.getItem(ADMIN_STORAGE_KEYS.snapshot);

  if (!saved) {
    return null;
  }

  try {
    return JSON.parse(saved);
  } catch (error) {
    localStorage.removeItem(ADMIN_STORAGE_KEYS.snapshot);
    return null;
  }
}

function saveCachedAdminSnapshot(result) {
  localStorage.setItem(ADMIN_STORAGE_KEYS.snapshot, JSON.stringify({
    savedAt: new Date().toISOString(),
    result,
  }));
}

function clearCachedAdminSnapshot() {
  localStorage.removeItem(ADMIN_STORAGE_KEYS.snapshot);
}

function getJoinLink() {
  const url = new URL("index.html", window.location.href);
  url.searchParams.set("invite", "1");
  return url.toString();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function getAdminTeamNameForSlug(match, slug) {
  if (slug === match.teamASlug) {
    return match.teamA.team;
  }

  if (slug === match.teamBSlug) {
    return match.teamB.team;
  }

  return slug;
}

function renderAdminMatches(matches) {
  const list = document.querySelector("#admin-matches-list");

  if (!list) {
    return;
  }

  if (!matches.length) {
    list.innerHTML = `<p class="empty-state">No matches found for the active phase.</p>`;
    return;
  }

  list.innerHTML = matches
    .map((match) => {
      const settled = match.status === "settled";
      const teamAGoals = match.teamAGoals ?? "";
      const teamBGoals = match.teamBGoals ?? "";
      const summary = adminPickSummaryByMatch[match.matchId];
      const teamACount = summary?.selections?.[match.teamASlug] || 0;
      const teamBCount = summary?.selections?.[match.teamBSlug] || 0;
      const activityText = summary?.totalPickCount
        ? `${summary.totalPickCount} picks - ${match.teamA.team}: ${teamACount} - ${match.teamB.team}: ${teamBCount}`
        : "No picks yet";
      const moneyText = summary?.totalPickCount
        ? `Total bet ${formatAdminMoney(summary.totalBetAmount)} - pending ${formatAdminMoney(summary.totalPlayerCashStake)}`
        : "";
      const recentPicks = summary?.recentPicks?.length
        ? summary.recentPicks.slice(-4).map((pick) => `${pick.playerName}: ${getAdminTeamNameForSlug(match, pick.selectedTeam)}`).join(", ")
        : "";

      return `
        <article class="admin-match-card" data-match-id="${match.matchId}">
          <div>
            <strong>${match.teamA.team} vs ${match.teamB.team}</strong>
            <span>${match.matchId} - ${match.status}</span>
          </div>
          <div class="pick-activity">
            <strong>${activityText}</strong>
            ${moneyText ? `<span>${moneyText}</span>` : ""}
            ${recentPicks ? `<span>${recentPicks}</span>` : ""}
          </div>
          <div class="score-grid">
            <label>
              ${match.teamA.team}
              <input type="number" min="0" step="1" value="${teamAGoals}" data-team-a-goals ${settled ? "disabled" : ""} />
            </label>
            <label>
              ${match.teamB.team}
              <input type="number" min="0" step="1" value="${teamBGoals}" data-team-b-goals ${settled ? "disabled" : ""} />
            </label>
          </div>
          <div class="admin-match-actions">
            <button type="button" data-save-score ${settled ? "disabled" : ""}>Save Score</button>
            <button type="button" data-settle-match ${settled ? "disabled" : ""}>
              ${settled ? "Settled" : "Save and Settle"}
            </button>
          </div>
          <p class="admin-match-status" aria-live="polite"></p>
        </article>
      `;
    })
    .join("");
}

function renderAdminDashboard() {
  const stats = document.querySelector("#admin-dashboard-stats");
  const phaseName = document.querySelector("#admin-current-phase-name");
  const phaseStatus = document.querySelector("#admin-current-phase-status");
  const phaseLock = document.querySelector("#admin-current-phase-lock");

  if (!stats || !activeGameState) {
    return;
  }

  const summaries = Object.values(adminPickSummaryByMatch);
  const activePickCount = summaries.reduce((total, summary) => total + (Number(summary.activePickCount) || 0), 0);
  const pendingCash = summaries.reduce((total, summary) => total + (Number(summary.totalPlayerCashStake) || 0), 0);
  const potentialPayout = summaries.reduce((total, summary) => total + (Number(summary.potentialPayout) || 0), 0);
  const settledCount = adminMatches.filter((match) => match.status === "settled").length;
  const openCount = adminMatches.length - settledCount;
  const playerCount = adminDashboard?.playerCount ?? activeGameState.playerCount ?? 0;
  const activePhase = adminPhases.find((phase) => phase.isActive);

  if (phaseName) {
    phaseName.textContent = activeGameState.activePhaseName || "Current phase";
  }

  if (phaseStatus) {
    phaseStatus.textContent = `Status: ${activeGameState.gameStatus || "unknown"}`;
  }

  if (phaseLock) {
    phaseLock.textContent = activePhase?.lockTime
      ? `Locks: ${activePhase.lockTime}`
      : "Locked in: No";
  }

  stats.innerHTML = [
    ["Players", playerCount],
    ["Open Matches", openCount],
    ["Active Picks", activePickCount],
    ["Pending Cash", formatAdminMoney(pendingCash)],
    ["Potential", formatAdminMoney(potentialPayout, { cents: true })],
    ["Settled", settledCount],
  ]
    .map(([label, value]) => {
      return `
        <div class="mini-stat">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `;
    })
    .join("");
}

function renderAdminPhases(phases = adminPhases) {
  const list = document.querySelector("#admin-phase-list");

  if (!list) {
    return;
  }

  if (!phases.length) {
    list.innerHTML = `<p class="empty-state">No phases found.</p>`;
    return;
  }

  list.innerHTML = phases
    .map((phase) => {
      const activeClass = phase.isActive ? "active" : "";
      return `
        <article class="phase-row ${activeClass}">
          <div>
            <strong>${phase.phaseName}</strong>
            <span>${phase.status}${phase.lockTime ? ` - locks ${phase.lockTime}` : ""}</span>
          </div>
          <button type="button" data-set-active-phase="${phase.phaseName}" ${phase.isActive ? "disabled" : ""}>
            ${phase.isActive ? "Active" : "Make Active"}
          </button>
        </article>
      `;
    })
    .join("");
}

function renderAdminPlayers(players = adminPlayers) {
  const list = document.querySelector("#admin-player-list");

  if (!list) {
    return;
  }

  if (!players.length) {
    list.innerHTML = `<p class="empty-state">No players yet.</p>`;
    return;
  }

  list.innerHTML = players
    .map((player) => {
      return `
        <article class="player-roster-row">
          <div>
            <strong>${player.displayName}</strong>
            <span>${player.wins}W-${player.losses}L-${player.draws}D - ${player.activePickCount} active picks</span>
          </div>
          <div>
            <strong>${formatAdminMoney(player.currentBalance, { cents: true })}</strong>
            <span>Pending ${formatAdminMoney(player.pendingBets)} - Available ${formatAdminMoney(player.availableToBet)}</span>
            <button type="button" class="recovery-link-button" data-generate-recovery="${player.playerId}">
              Generate Recovery Link
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function handleRecoveryLinkClick(event) {
  const button = event.target.closest("[data-generate-recovery]");

  if (!button) {
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Generating...";

  try {
    const result = await callAdminApi("generateRecoveryToken", {
      playerId: button.dataset.generateRecovery,
    });
    const recoveryUrl = new URL("index.html", window.location.href);
    recoveryUrl.searchParams.set("recover", result.token);
    await copyText(recoveryUrl.toString());
    button.textContent = "Link Copied";
  } catch (error) {
    console.error(error);
    button.textContent = `Error: ${error.message}`;
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
    }, 2500);
  }
}

function renderHealthCheck(result) {
  const list = document.querySelector("#health-check-results");

  if (!list) {
    return;
  }

  const missingSheets = result.sheetStatus.filter((sheet) => !sheet.found);
  const active = result.activePhase;

  list.innerHTML = `
    <div class="health-summary ${result.ok ? "ok" : "bad"}">
      <strong>${result.ok ? "Healthy" : "Needs attention"}</strong>
      <span>${result.checkedAt}</span>
    </div>
    <div class="mini-stat-row">
      <div class="mini-stat"><span>Active Picks</span><strong>${active.activePickCount}</strong></div>
      <div class="mini-stat"><span>Missing Scores</span><strong>${active.missingScoreCount}</strong></div>
      <div class="mini-stat"><span>Final Unsettled</span><strong>${active.finalUnsettledCount}</strong></div>
      <div class="mini-stat"><span>Settled</span><strong>${active.settledCount}</strong></div>
    </div>
    <p class="admin-match-status">
      ${missingSheets.length ? `Missing sheets: ${missingSheets.map((sheet) => sheet.sheetName).join(", ")}` : "All required sheets found."}
    </p>
  `;
}

function getOddsCheckResult() {
  const missing = adminMatches.filter((match) => {
    const needsDraw = String(match.phase || activeGameState?.activePhaseName || "").toLowerCase().includes("group");
    const missingTeamOdds = !Number(match.teamADecimalOdds) || !Number(match.teamBDecimalOdds);
    const missingDrawOdds = needsDraw && !Number(match.drawDecimalOdds);

    return missingTeamOdds || missingDrawOdds || match.teamASlug === "tbd" || match.teamBSlug === "tbd";
  });

  return {
    checkedAt: new Date().toISOString(),
    ok: missing.length === 0,
    missing,
  };
}

function renderOddsCheck(result) {
  const list = document.querySelector("#health-check-results");

  if (!list) {
    return;
  }

  const missingList = result.missing.slice(0, 6).map((match) => {
    return `<li>${match.matchId}: ${match.teamA.team} vs ${match.teamB.team}</li>`;
  }).join("");

  list.innerHTML = `
    <div class="health-summary ${result.ok ? "ok" : "bad"}">
      <strong>${result.ok ? "Odds ready" : "Odds need attention"}</strong>
      <span>${result.checkedAt}</span>
    </div>
    <p class="admin-match-status">
      ${result.ok
        ? "Every active-phase match has the required odds data."
        : `${result.missing.length} active-phase match(es) are missing required odds or teams.`}
    </p>
    ${missingList ? `<ul class="admin-check-list">${missingList}</ul>` : ""}
  `;
}

function formatAdminMoney(value, options = {}) {
  const numberValue = Number(value) || 0;

  return numberValue.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: options.cents ? 2 : 0,
    maximumFractionDigits: options.cents ? 2 : 0,
  });
}

function downloadTextFile(fileName, text, mimeType = "text/csv") {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderSettlementLog(logs) {
  const list = document.querySelector("#settlement-log-list");

  if (!list) {
    return;
  }

  if (!logs.length) {
    list.innerHTML = `<p class="empty-state">No settlements yet.</p>`;
    return;
  }

  list.innerHTML = logs
    .map((log) => {
      return `
        <article class="settlement-log-row">
          <div>
            <strong>${log.playerName}</strong>
            <span>${log.matchLabel} - ${log.settlementType}</span>
          </div>
          <div>
            <strong>${formatAdminMoney(log.endingBalance, { cents: true })}</strong>
            <span>Payout ${formatAdminMoney(log.totalPayout, { cents: true })}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadSettlementLog() {
  try {
    const result = await callAdminApi("getSettlementLog", {
      limit: 20,
    });

    renderSettlementLog(result.logs);
  } catch (error) {
    console.error(error);
    document.querySelector("#settlement-log-list").innerHTML = `<p class="empty-state">Could not load settlement log: ${error.message}</p>`;
  }
}

function setAdminLoadStatus(message) {
  const phaseStatus = document.querySelector("#admin-current-phase-status");

  if (phaseStatus) {
    phaseStatus.textContent = message;
  }
}

async function loadAdminSnapshot() {
  try {
    const result = await callAdminApi("getAdminSnapshot");
    return { result, error: null };
  } catch (error) {
    console.error(error);
    return { result: null, error };
  }
}

function applyAdminSnapshot(result, options = {}) {
  activeGameState = result.gameState;
  adminMatches = result.matches.matches;
  adminPickSummaryByMatch = result.pickSummary?.summaries || {};
  adminDashboard = result.dashboard;
  adminPhases = result.phases?.phases || [];
  adminPlayers = result.players?.players || [];
  setAdminLoadStatus(options.cached
    ? `Showing saved admin data - refreshing live data...`
    : result.pickSummary?.error
      ? `${result.gameState.activePhaseName} - ${result.gameState.gameStatus} - ${result.matches.count} matches - pick activity unavailable`
      : `${result.gameState.activePhaseName} - ${result.gameState.gameStatus} - ${result.matches.count} matches`);
  renderAdminDashboard();
  renderAdminPhases(adminPhases);
  renderAdminPlayers(adminPlayers);
  renderAdminMatches(adminMatches);
  renderSettlementLog(result.settlementLog?.logs || []);
}

async function loadAdminMatches() {
  try {
    const cached = getCachedAdminSnapshot();

    if (cached?.result) {
      applyAdminSnapshot(cached.result, { cached: true });
    } else {
      setAdminLoadStatus("Loading matches...");
    }

    const snapshot = await loadAdminSnapshot();

    if (snapshot.result) {
      saveCachedAdminSnapshot(snapshot.result);
      applyAdminSnapshot(snapshot.result);
      return;
    }

    const gameState = await callAdminApi("getGameState");
    const matchesResult = await callAdminApi("getMatches", {
      phase: gameState.activePhaseName,
    });
    const summaryResult = await loadAdminPhasePickSummary(gameState.activePhaseName);

    activeGameState = gameState;
    adminMatches = matchesResult.matches;
    adminPickSummaryByMatch = summaryResult.summaries;
    adminDashboard = null;
    adminPhases = [];
    adminPlayers = [];
    setAdminLoadStatus(summaryResult.error
      ? `${gameState.activePhaseName} - ${gameState.gameStatus} - ${matchesResult.count} matches - pick activity unavailable`
      : `${gameState.activePhaseName} - ${gameState.gameStatus} - ${matchesResult.count} matches`);
    renderAdminDashboard();
    renderAdminPhases(adminPhases);
    renderAdminPlayers(adminPlayers);
    renderAdminMatches(adminMatches);
    loadSettlementLog();
  } catch (error) {
    console.error(error);
    setAdminLoadStatus(`Could not load admin data: ${error.message}`);
  }
}

async function handleExportClick() {
  const button = document.querySelector("#download-matches-button");
  const status = document.querySelector("#admin-control-status");
  const originalHtml = button.innerHTML;

  button.disabled = true;
  button.innerHTML = `<strong>Downloading...</strong>`;
  status.textContent = "";

  try {
    const result = await callAdminApi("getCsvExport");
    const matchesFile = result.files.find((file) => file.sheetName === "Matches");

    if (!matchesFile) {
      throw new Error("Matches CSV was not included in the export.");
    }

    downloadTextFile(matchesFile.fileName, matchesFile.csv);
    status.textContent = `Downloaded ${matchesFile.fileName}`;
  } catch (error) {
    console.error(error);
    status.textContent = `Could not download matches CSV: ${error.message}`;
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

async function handleHealthCheckClick() {
  const button = document.querySelector("#odds-check-button");
  const status = document.querySelector("#admin-control-status");
  const originalHtml = button.innerHTML;

  button.disabled = true;
  button.innerHTML = `<strong>Checking...</strong>`;
  status.textContent = "";

  try {
    renderOddsCheck(getOddsCheckResult());
    status.textContent = "Odds check complete";
  } catch (error) {
    console.error(error);
    status.textContent = `Odds check failed: ${error.message}`;
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

async function handleGenerateJoinLinkClick() {
  const button = document.querySelector("#generate-join-link-button");
  const status = document.querySelector("#admin-control-status");
  const originalHtml = button.innerHTML;
  const link = getJoinLink();

  button.disabled = true;
  button.innerHTML = `<strong>Copying...</strong>`;

  try {
    await copyText(link);
    status.innerHTML = `Join link copied: <a href="${link}">${link}</a>`;
  } catch (error) {
    console.error(error);
    status.innerHTML = `Join link: <a href="${link}">${link}</a>`;
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

async function handleResetGameClick() {
  const button = document.querySelector("#reset-game-button");
  const status = document.querySelector("#admin-control-status");
  const originalHtml = button.innerHTML;
  const confirmation = window.prompt("This clears players, picks, settlement logs, and test results. Type RESET GAME to continue.");

  if (confirmation !== "RESET GAME") {
    status.textContent = "Reset canceled.";
    return;
  }

  button.disabled = true;
  button.innerHTML = `<strong>Resetting...</strong>`;
  status.textContent = "Resetting game...";

  try {
    const result = await callAdminApi("resetGame", {
      confirmText: confirmation,
    });

    clearCachedAdminSnapshot();
    status.textContent = `Game reset. Active phase: ${result.activePhaseName}`;
    await loadAdminMatches();
  } catch (error) {
    console.error(error);
    status.textContent = `Could not reset game: ${error.message}`;
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

async function handleAdminActionClick(event) {
  const button = event.target.closest("[data-admin-action]");

  if (!button) {
    return;
  }

  const actionStatus = document.querySelector("#admin-control-status");
  const action = button.dataset.adminAction;
  const originalHtml = button.innerHTML;

  button.disabled = true;
  button.innerHTML = `<strong>Working...</strong>`;
  actionStatus.textContent = "";

  try {
    const result = await callAdminApi(action);
    const phaseName = result.activePhase?.phaseName || result.activePhase?.phase_name || activeGameState?.activePhaseName || "";
    actionStatus.textContent = `${result.gameStatus} - ${phaseName}`;
    await loadAdminMatches();
  } catch (error) {
    console.error(error);
    actionStatus.textContent = `Could not update phase: ${error.message}`;
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

async function handlePhaseManagerClick(event) {
  const setActiveButton = event.target.closest("[data-set-active-phase]");
  const settleFinalButton = event.target.closest("[data-settle-final-matches]");

  if (!setActiveButton && !settleFinalButton) {
    return;
  }

  const actionStatus = document.querySelector("#admin-control-status");
  const button = setActiveButton || settleFinalButton;
  const originalHtml = button.innerHTML;

  if (settleFinalButton && !confirm("Settle every final match in the active phase?")) {
    return;
  }

  button.disabled = true;
  button.innerHTML = `<strong>Working...</strong>`;
  actionStatus.textContent = "";

  try {
    if (setActiveButton) {
      const result = await callAdminApi("setActivePhase", {
        phaseName: setActiveButton.dataset.setActivePhase,
      });
      actionStatus.textContent = `${result.gameStatus} - ${result.activePhase.phaseName}`;
    } else {
      const result = await callAdminApi("settleFinalMatches", {
        phase: activeGameState?.activePhaseName,
      });
      actionStatus.textContent = result.errorCount
        ? `Settled ${result.settledCount} of ${result.attemptedCount}; ${result.errorCount} failed`
        : `Settled ${result.settledCount} of ${result.attemptedCount} final matches`;
    }

    await loadAdminMatches();
  } catch (error) {
    console.error(error);
    actionStatus.textContent = `Could not complete action: ${error.message}`;
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

function handleUnavailableAdminTool(event) {
  const button = event.target.closest("[data-admin-tool]");

  if (!button) {
    return;
  }

  const status = document.querySelector("#admin-control-status");
  const tool = button.dataset.adminTool;
  const messages = {
    uploadTeams: "Upload Teams CSV is in the spec, but this static page still needs the Apps Script upload endpoint.",
    uploadMatches: "Upload Matches CSV is in the spec, but this static page still needs the Apps Script upload endpoint.",
  };

  status.textContent = messages[tool] || "This admin action is not implemented yet.";
}

async function handleSettleClick(event) {
  const button = event.target.closest("[data-settle-match], [data-save-score]");

  if (!button) {
    return;
  }

  const shouldSettle = button.hasAttribute("data-settle-match");
  const card = button.closest("[data-match-id]");
  const status = card.querySelector(".admin-match-status");
  const matchId = card.dataset.matchId;
  const teamAGoals = card.querySelector("[data-team-a-goals]").value;
  const teamBGoals = card.querySelector("[data-team-b-goals]").value;

  if (shouldSettle && !confirm("Save this score and settle all active picks for this match?")) {
    return;
  }

  button.disabled = true;
  status.textContent = shouldSettle
      ? "Saving result and settling picks..."
      : "Saving score...";

  try {
    const result = await callAdminApi("saveMatchResult", {
          matchId,
          teamAGoals,
          teamBGoals,
          settle: shouldSettle ? "true" : "false",
        });

    status.textContent = shouldSettle
      ? `Settled ${result.settledPickCount} picks`
        : "Score saved";
    await loadAdminMatches();
  } catch (error) {
    console.error(error);
    status.textContent = shouldSettle
      ? `Could not settle: ${error.message}`
      : `Could not save score: ${error.message}`;
    button.disabled = false;
  }
}

document.querySelector("#admin-refresh-button")?.addEventListener("click", loadAdminMatches);
document.querySelector("#log-refresh-button")?.addEventListener("click", loadSettlementLog);
document.querySelector("#download-matches-button")?.addEventListener("click", handleExportClick);
document.querySelector("#odds-check-button")?.addEventListener("click", handleHealthCheckClick);
document.querySelector("#generate-join-link-button")?.addEventListener("click", handleGenerateJoinLinkClick);
document.querySelector("#reset-game-button")?.addEventListener("click", handleResetGameClick);
document.querySelector("#admin-matches-list")?.addEventListener("click", handleSettleClick);
document.querySelector(".admin-control-grid")?.addEventListener("click", handleAdminActionClick);
document.querySelector(".admin-control-grid")?.addEventListener("click", handlePhaseManagerClick);
document.querySelector(".admin-control-grid")?.addEventListener("click", handleUnavailableAdminTool);
document.querySelector("#admin-phase-list")?.addEventListener("click", handlePhaseManagerClick);
document.querySelector("#admin-player-list")?.addEventListener("click", handleRecoveryLinkClick);

loadAdminMatches();
