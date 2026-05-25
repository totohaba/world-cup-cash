const ADMIN_CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbzBeannr4cyKT886sZ_DlvwumOfcWhr3myeVwj-cpjXkdSd_-jMegT7bU3APybGZpCBvQ/exec",
};

let adminMatches = [];
let activeStatusFilter = "all";
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

  const filteredMatches = matches.filter((match) => {
    if (activeStatusFilter === "all") {
      return true;
    }

    if (activeStatusFilter === "future") {
      return match.status !== "settled";
    }

    return match.status === activeStatusFilter;
  });

  if (!filteredMatches.length) {
    list.innerHTML = `<p class="empty-state">No matches in this filter.</p>`;
    return;
  }

  list.innerHTML = filteredMatches
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
          </div>
        </article>
      `;
    })
    .join("");
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

async function loadAdminSnapshot() {
  try {
    const result = await callAdminApi("getAdminSnapshot");
    return { result, error: null };
  } catch (error) {
    console.error(error);
    return { result: null, error };
  }
}

async function loadAdminMatches() {
  const status = document.querySelector("#admin-status");

  try {
    status.textContent = "Loading matches...";

    const snapshot = await loadAdminSnapshot();

    if (snapshot.result) {
      const result = snapshot.result;

      activeGameState = result.gameState;
      adminMatches = result.matches.matches;
      adminPickSummaryByMatch = result.pickSummary?.summaries || {};
      adminDashboard = result.dashboard;
      adminPhases = result.phases?.phases || [];
      adminPlayers = result.players?.players || [];
      status.textContent = result.pickSummary?.error
        ? `${result.gameState.activePhaseName} - ${result.gameState.gameStatus} - ${result.matches.count} matches - pick activity unavailable`
        : `${result.gameState.activePhaseName} - ${result.gameState.gameStatus} - ${result.matches.count} matches`;
      renderAdminDashboard();
      renderAdminPhases(adminPhases);
      renderAdminPlayers(adminPlayers);
      renderAdminMatches(adminMatches);
      renderSettlementLog(result.settlementLog?.logs || []);
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
    status.textContent = summaryResult.error
      ? `${gameState.activePhaseName} - ${gameState.gameStatus} - ${matchesResult.count} matches - pick activity unavailable`
      : `${gameState.activePhaseName} - ${gameState.gameStatus} - ${matchesResult.count} matches`;
    renderAdminDashboard();
    renderAdminPhases(adminPhases);
    renderAdminPlayers(adminPlayers);
    renderAdminMatches(adminMatches);
    loadSettlementLog();
  } catch (error) {
    console.error(error);
    status.textContent = `Could not load admin data: ${error.message}`;
  }
}

async function handleAdminActionClick(event) {
  const button = event.target.closest("[data-admin-action]");

  if (!button) {
    return;
  }

  const actionStatus = document.querySelector("#phase-action-status");
  const action = button.dataset.adminAction;
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "Working...";
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
    button.textContent = originalText;
  }
}

async function handlePhaseManagerClick(event) {
  const setActiveButton = event.target.closest("[data-set-active-phase]");
  const settleFinalButton = event.target.closest("[data-settle-final-matches]");

  if (!setActiveButton && !settleFinalButton) {
    return;
  }

  const actionStatus = document.querySelector("#phase-action-status");
  const button = setActiveButton || settleFinalButton;
  const originalText = button.textContent;

  if (settleFinalButton && !confirm("Settle every final match in the active phase?")) {
    return;
  }

  button.disabled = true;
  button.textContent = "Working...";
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
      actionStatus.textContent = `Settled ${result.settledCount} of ${result.attemptedCount} final matches`;
    }

    await loadAdminMatches();
  } catch (error) {
    console.error(error);
    actionStatus.textContent = `Could not complete action: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
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
  status.textContent = shouldSettle ? "Saving result and settling picks..." : "Saving score...";

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

function handleFilterClick(event) {
  const button = event.target.closest("[data-status-filter]");

  if (!button) {
    return;
  }

  activeStatusFilter = button.dataset.statusFilter;
  document.querySelectorAll("[data-status-filter]").forEach((item) => {
    item.classList.toggle("active", item === button);
  });
  renderAdminMatches(adminMatches);
}

document.querySelector("#admin-refresh-button")?.addEventListener("click", loadAdminMatches);
document.querySelector("#log-refresh-button")?.addEventListener("click", loadSettlementLog);
document.querySelector("#admin-matches-list")?.addEventListener("click", handleSettleClick);
document.querySelector(".filter-tabs")?.addEventListener("click", handleFilterClick);
document.querySelector(".phase-actions")?.addEventListener("click", handleAdminActionClick);
document.querySelector(".phase-actions")?.addEventListener("click", handlePhaseManagerClick);
document.querySelector("#admin-phase-list")?.addEventListener("click", handlePhaseManagerClick);

loadAdminMatches();
