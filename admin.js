const ADMIN_CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbyFz0KgJpdwB60-Rnz3Cr8BuXVuQCuFnOFXknx8dpM6UT7aj9lj40dT2wlRg3i-umCRtA/exec",
};

let adminMatches = [];
let activeStatusFilter = "all";
let activeGameState = null;
let adminPickSummaryByMatch = {};

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
        ? summary.recentPicks.slice(-4).map((pick) => `${pick.playerName}: ${pick.selectedTeam}`).join(", ")
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
          <button type="button" data-settle-match ${settled ? "disabled" : ""}>
            ${settled ? "Settled" : "Save and Settle"}
          </button>
          <p class="admin-match-status" aria-live="polite"></p>
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

async function loadAdminMatches() {
  const status = document.querySelector("#admin-status");

  try {
    status.textContent = "Loading matches...";

    const gameState = await callAdminApi("getGameState");
    const matchesResult = await callAdminApi("getMatches", {
      phase: gameState.activePhaseName,
    });
    const summaryResult = await loadAdminPhasePickSummary(gameState.activePhaseName);

    activeGameState = gameState;
    adminMatches = matchesResult.matches;
    adminPickSummaryByMatch = summaryResult.summaries;
    status.textContent = summaryResult.error
      ? `${gameState.activePhaseName} - ${gameState.gameStatus} - ${matchesResult.count} matches - pick activity unavailable`
      : `${gameState.activePhaseName} - ${gameState.gameStatus} - ${matchesResult.count} matches`;
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
    actionStatus.textContent = `${result.gameStatus} - ${result.activePhase.phase_name}`;
    await loadAdminMatches();
  } catch (error) {
    console.error(error);
    actionStatus.textContent = `Could not update phase: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function handleSettleClick(event) {
  const button = event.target.closest("[data-settle-match]");

  if (!button) {
    return;
  }

  const card = button.closest("[data-match-id]");
  const status = card.querySelector(".admin-match-status");
  const matchId = card.dataset.matchId;
  const teamAGoals = card.querySelector("[data-team-a-goals]").value;
  const teamBGoals = card.querySelector("[data-team-b-goals]").value;

  button.disabled = true;
  status.textContent = "Saving result and settling picks...";

  try {
    const result = await callAdminApi("saveMatchResult", {
      matchId,
      teamAGoals,
      teamBGoals,
      settle: "true",
    });

    status.textContent = `Settled ${result.settledPickCount} picks`;
    await loadAdminMatches();
    await loadSettlementLog();
  } catch (error) {
    console.error(error);
    status.textContent = `Could not settle: ${error.message}`;
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

loadAdminMatches();
