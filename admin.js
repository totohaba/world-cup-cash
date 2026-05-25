const ADMIN_CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbx9fWzg-ZXQEWOGgM5F3AYD61n5vGllCwKniWSIjaC9CibA6WiREtbTyJnV-X0QANi1Ag/exec",
};

let adminMatches = [];

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

function renderAdminMatches(matches) {
  const list = document.querySelector("#admin-matches-list");

  if (!list) {
    return;
  }

  list.innerHTML = matches
    .map((match) => {
      const settled = match.status === "settled";
      const teamAGoals = match.teamAGoals ?? "";
      const teamBGoals = match.teamBGoals ?? "";

      return `
        <article class="admin-match-card" data-match-id="${match.matchId}">
          <div>
            <strong>${match.teamA.team} vs ${match.teamB.team}</strong>
            <span>${match.matchId} - ${match.status}</span>
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

async function loadAdminMatches() {
  const status = document.querySelector("#admin-status");

  try {
    status.textContent = "Loading matches...";

    const gameState = await callAdminApi("getGameState");
    const matchesResult = await callAdminApi("getMatches", {
      phase: gameState.activePhaseName,
    });

    adminMatches = matchesResult.matches;
    status.textContent = `${gameState.activePhaseName} - ${matchesResult.count} matches`;
    renderAdminMatches(adminMatches);
  } catch (error) {
    console.error(error);
    status.textContent = `Could not load admin data: ${error.message}`;
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
  } catch (error) {
    console.error(error);
    status.textContent = `Could not settle: ${error.message}`;
    button.disabled = false;
  }
}

document.querySelector("#admin-refresh-button")?.addEventListener("click", loadAdminMatches);
document.querySelector("#admin-matches-list")?.addEventListener("click", handleSettleClick);

loadAdminMatches();
